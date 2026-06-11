import { randomBytes, pbkdf2 as pbkdf2Callback, timingSafeEqual, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { connectLambda, getStore } from "@netlify/blobs";
import { Redis } from "@upstash/redis";

type NetlifyEvent = {
  blobs?: string;
  body: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
  path: string;
};

interface StoredSiteUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
}

type SiteUser = Omit<StoredSiteUser, "passwordHash" | "passwordSalt">;

interface SessionRecord {
  userId: string;
  expiresAt: string;
}

interface AuthStore {
  delete: (key: string) => Promise<void>;
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, options?: { ex?: number }) => Promise<void>;
}

const pbkdf2 = promisify(pbkdf2Callback);
const COOKIE_NAME = "ai_advantage_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const ACCOUNT_PREFIX = "ai-advantage:auth";
const PASSWORD_ITERATIONS = 150_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const STORE_READ_ATTEMPTS = 13;
const STORE_READ_RETRY_MS = 500;

let redisClient: Redis | null | undefined;
let localAuthData: Record<string, unknown> | null = null;
let localAuthLoad: Promise<Record<string, unknown>> | null = null;
let localAuthWrite: Promise<void> = Promise.resolve();

function response(statusCode: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRedis() {
  if (redisClient !== undefined) return redisClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = null;
    return redisClient;
  }

  redisClient = Redis.fromEnv();
  return redisClient;
}

function normalizeLambdaHeaders(headers: NetlifyEvent["headers"]) {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => (typeof value === "string" ? [[key.toLowerCase(), value]] : [])),
  );
}

function canUseLocalAuthStore() {
  return process.env.NETLIFY_DEV === "true" || process.env.NETLIFY_LOCAL === "true" || process.env.NODE_ENV !== "production";
}

function getLocalAuthPath() {
  return join(process.cwd(), ".netlify", "state", "ai-advantage-auth.json");
}

async function readLocalAuthData() {
  if (localAuthData) return localAuthData;
  if (!localAuthLoad) {
    localAuthLoad = readFile(getLocalAuthPath(), "utf8")
      .then((contents) => {
        const parsed = JSON.parse(contents) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
      })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return {};
        throw error;
      });
  }

  localAuthData = await localAuthLoad;
  return localAuthData;
}

async function writeLocalAuthData() {
  const filePath = getLocalAuthPath();
  const data = await readLocalAuthData();
  localAuthWrite = localAuthWrite.then(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2));
  });
  return localAuthWrite;
}

function getLocalAuthStore(): AuthStore {
  return {
    async get<T>(key: string) {
      const data = await readLocalAuthData();
      return (data[key] as T | undefined) ?? null;
    },
    async set(key: string, value: unknown) {
      const data = await readLocalAuthData();
      data[key] = value;
      await writeLocalAuthData();
    },
    async delete(key: string) {
      const data = await readLocalAuthData();
      delete data[key];
      await writeLocalAuthData();
    },
  };
}

function getAuthStore(event: NetlifyEvent): AuthStore | null {
  if (event.blobs) {
    try {
      connectLambda({
        blobs: event.blobs,
        headers: normalizeLambdaHeaders(event.headers),
      });

      const store = getStore("ai-advantage-auth");
      return {
        async get<T>(key: string) {
          return (await store.get(key, { type: "json" })) as T | null;
        },
        async set(key: string, value: unknown) {
          await store.setJSON(key, value);
        },
        async delete(key: string) {
          await store.delete(key);
        },
      };
    } catch (error) {
      console.warn("Netlify Blobs auth store is unavailable; checking fallback store.", error);
    }
  }

  const redis = getRedis();
  if (!redis) {
    return canUseLocalAuthStore() ? getLocalAuthStore() : null;
  }

  return {
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null;
    },
    async set(key: string, value: unknown, options?: { ex?: number }) {
      if (options?.ex) {
        await redis.set(key, value, { ex: options.ex });
      } else {
        await redis.set(key, value);
      }
    },
    async delete(key: string) {
      await redis.del(key);
    },
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function sanitizeUser(user: StoredSiteUser): SiteUser {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...safeUser } = user;
  return safeUser;
}

function parseBody(event: NetlifyEvent) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getRoute(event: NetlifyEvent) {
  const path = event.path.split("?")[0];
  const marker = "/auth/";
  if (path.includes(marker)) {
    return path.slice(path.indexOf(marker) + marker.length);
  }

  return path.endsWith("/auth") ? "me" : "";
}

function getCookie(headers: NetlifyEvent["headers"], name: string) {
  const cookieHeader = headers.cookie ?? headers.Cookie ?? "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const target = cookies.find((part) => part.startsWith(`${name}=`));
  return target ? decodeURIComponent(target.slice(name.length + 1)) : null;
}

function getHeader(headers: NetlifyEvent["headers"], name: string) {
  const lowerName = name.toLowerCase();
  const match = Object.entries(headers).find(([key, value]) => key.toLowerCase() === lowerName && value);
  return match?.[1] ?? null;
}

function sessionKey(token: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  return `${ACCOUNT_PREFIX}:session:${hash}`;
}

function userKey(id: string) {
  return `${ACCOUNT_PREFIX}:user:${id}`;
}

function emailKey(email: string) {
  return `${ACCOUNT_PREFIX}:email:${email}`;
}

function usernameKey(username: string) {
  return `${ACCOUNT_PREFIX}:username:${username}`;
}

function shouldUseSecureCookie(event: NetlifyEvent) {
  const host = getHeader(event.headers, "host") ?? "";
  const forwardedProto = getHeader(event.headers, "x-forwarded-proto") ?? "";
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(:|$)/.test(host)) {
    return false;
  }

  return forwardedProto === "https" || process.env.NODE_ENV !== "development";
}

function setSessionCookie(event: NetlifyEvent, token: string) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (shouldUseSecureCookie(event)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearSessionCookie(event: NetlifyEvent) {
  const parts = [`${COOKIE_NAME}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (shouldUseSecureCookie(event)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function validationError(input: { email: string; username: string; password: string }) {
  if (!input.email.includes("@")) return "Enter a valid email address.";
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(input.username)) {
    return "Username must be 3-20 characters using letters, numbers, underscores, or hyphens.";
  }
  if (input.password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

function getAuthSecret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "ai-advantage-local-development-auth-secret"
  );
}

async function hashPassword(password: string, salt: string) {
  const derived = await pbkdf2(
    `${password}:${getAuthSecret()}`,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  );
  return derived.toString("hex");
}

async function verifyPassword(password: string, user: StoredSiteUser) {
  const nextHash = await hashPassword(password, user.passwordSalt);
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(nextHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function getEventually<T>(store: AuthStore, key: string) {
  for (let attempt = 0; attempt < STORE_READ_ATTEMPTS; attempt += 1) {
    const value = await store.get<T>(key);
    if (value !== null) return value;
    if (attempt < STORE_READ_ATTEMPTS - 1) {
      await wait(STORE_READ_RETRY_MS);
    }
  }

  return null;
}

async function getFirstEventually<T>(store: AuthStore, keys: string[]) {
  for (let attempt = 0; attempt < STORE_READ_ATTEMPTS; attempt += 1) {
    const values = await Promise.all(keys.map((key) => store.get<T>(key)));
    const value = values.find((candidate): candidate is T => candidate !== null);
    if (value !== undefined) return value;
    if (attempt < STORE_READ_ATTEMPTS - 1) {
      await wait(STORE_READ_RETRY_MS);
    }
  }

  return null;
}

async function getCurrentUser(store: AuthStore, event: NetlifyEvent) {
  const token = getCookie(event.headers, COOKIE_NAME);
  if (!token) return null;

  const session = await getEventually<string | SessionRecord>(store, sessionKey(token));
  const userId = typeof session === "string" ? session : session?.userId;
  if (!userId) return null;
  if (typeof session === "object" && new Date(session.expiresAt).getTime() <= Date.now()) {
    await store.delete(sessionKey(token));
    return null;
  }

  const user = await getEventually<StoredSiteUser>(store, userKey(userId));
  return user ? sanitizeUser(user) : null;
}

async function createSession(store: AuthStore, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await store.set(
    sessionKey(token),
    {
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    } satisfies SessionRecord,
    { ex: SESSION_TTL_SECONDS },
  );
  await getEventually<string | SessionRecord>(store, sessionKey(token));
  return token;
}

export const handler = async (event: NetlifyEvent) => {
  const route = getRoute(event);
  const store = getAuthStore(event);

  if (!store) {
    if (event.httpMethod === "GET" && route === "me") {
      return response(200, { user: null });
    }

    return response(503, {
      success: false,
      message: "Account backend is not configured. Add Netlify Blobs or Upstash Redis env support.",
    });
  }

  if (event.httpMethod === "GET" && route === "me") {
    const user = await getCurrentUser(store, event);
    return response(200, { user });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { success: false, message: "Method not allowed." });
  }

  if (route === "logout") {
    const token = getCookie(event.headers, COOKIE_NAME);
    if (token) {
      await store.delete(sessionKey(token));
    }

    return response(200, { success: true, message: "Logged out." }, { "Set-Cookie": clearSessionCookie(event) });
  }

  const body = parseBody(event);

  if (route === "signup") {
    const email = normalizeEmail(String(body.email ?? ""));
    const username = normalizeUsername(String(body.username ?? ""));
    const displayName = String(body.displayName ?? "").trim() || username;
    const password = String(body.password ?? "").trim();
    const invalid = validationError({ email, username, password });
    if (invalid) return response(400, { success: false, message: invalid });

    const [existingEmail, existingUsername] = await Promise.all([
      store.get<string>(emailKey(email)),
      store.get<string>(usernameKey(username)),
    ]);
    if (existingEmail) {
      return response(409, { success: false, message: "That email already has an account. Log in instead." });
    }
    if (existingUsername) {
      return response(409, { success: false, message: "That username is taken. Pick another one." });
    }

    const now = new Date().toISOString();
    const salt = randomBytes(16).toString("hex");
    const user: StoredSiteUser = {
      id: randomBytes(16).toString("hex"),
      email,
      username,
      displayName,
      passwordSalt: salt,
      passwordHash: await hashPassword(password, salt),
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      store.set(userKey(user.id), user),
      store.set(emailKey(email), user.id),
      store.set(usernameKey(username), user.id),
    ]);
    await Promise.all([
      getEventually<StoredSiteUser>(store, userKey(user.id)),
      getEventually<string>(store, emailKey(email)),
      getEventually<string>(store, usernameKey(username)),
    ]);

    const token = await createSession(store, user.id);
    return response(
      200,
      { success: true, message: "Account created. You are now logged in.", user: sanitizeUser(user) },
      { "Set-Cookie": setSessionCookie(event, token) },
    );
  }

  if (route === "login") {
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "").trim();
    if (!login || !password) {
      return response(400, { success: false, message: "Enter both your login and password." });
    }

    const normalizedEmail = normalizeEmail(login);
    const normalizedUsername = normalizeUsername(login);
    const userId = await getFirstEventually<string>(store, [emailKey(normalizedEmail), usernameKey(normalizedUsername)]);

    if (!userId) {
      return response(404, { success: false, message: "We could not find an account with that email or username." });
    }

    const user = await getEventually<StoredSiteUser>(store, userKey(userId));
    if (!user || !(await verifyPassword(password, user))) {
      return response(401, { success: false, message: "That password does not match this account." });
    }

    const token = await createSession(store, user.id);
    return response(
      200,
      { success: true, message: "Logged in successfully.", user: sanitizeUser(user) },
      { "Set-Cookie": setSessionCookie(event, token) },
    );
  }

  return response(404, { success: false, message: "Unknown auth route." });
};
