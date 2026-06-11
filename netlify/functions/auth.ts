import { randomBytes, pbkdf2 as pbkdf2Callback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { Redis } from "@upstash/redis";

type NetlifyEvent = {
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

const pbkdf2 = promisify(pbkdf2Callback);
const COOKIE_NAME = "ai_advantage_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const ACCOUNT_PREFIX = "ai-advantage:auth";
const PASSWORD_ITERATIONS = 150_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

let redisClient: Redis | null | undefined;

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

function getRedis() {
  if (redisClient !== undefined) return redisClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = null;
    return redisClient;
  }

  redisClient = Redis.fromEnv();
  return redisClient;
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

function setSessionCookie(token: string) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (process.env.NODE_ENV !== "development") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
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

async function getCurrentUser(redis: Redis, event: NetlifyEvent) {
  const token = getCookie(event.headers, COOKIE_NAME);
  if (!token) return null;

  const userId = await redis.get<string>(sessionKey(token));
  if (!userId) return null;

  const user = await redis.get<StoredSiteUser>(userKey(userId));
  return user ? sanitizeUser(user) : null;
}

async function createSession(redis: Redis, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await redis.set(sessionKey(token), userId, { ex: SESSION_TTL_SECONDS });
  return token;
}

export const handler = async (event: NetlifyEvent) => {
  const redis = getRedis();
  if (!redis) {
    return response(503, {
      success: false,
      message: "Account backend is not configured. Add Upstash Redis env vars on Netlify.",
    });
  }

  const route = getRoute(event);

  if (event.httpMethod === "GET" && route === "me") {
    const user = await getCurrentUser(redis, event);
    return response(200, { user });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { success: false, message: "Method not allowed." });
  }

  if (route === "logout") {
    const token = getCookie(event.headers, COOKIE_NAME);
    if (token) {
      await redis.del(sessionKey(token));
    }

    return response(200, { success: true, message: "Logged out." }, { "Set-Cookie": clearSessionCookie() });
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
      redis.get<string>(emailKey(email)),
      redis.get<string>(usernameKey(username)),
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
      redis.set(userKey(user.id), user),
      redis.set(emailKey(email), user.id),
      redis.set(usernameKey(username), user.id),
    ]);

    const token = await createSession(redis, user.id);
    return response(
      200,
      { success: true, message: "Account created. You are now logged in.", user: sanitizeUser(user) },
      { "Set-Cookie": setSessionCookie(token) },
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
    const userId =
      (await redis.get<string>(emailKey(normalizedEmail))) ??
      (await redis.get<string>(usernameKey(normalizedUsername)));

    if (!userId) {
      return response(404, { success: false, message: "We could not find an account with that email or username." });
    }

    const user = await redis.get<StoredSiteUser>(userKey(userId));
    if (!user || !(await verifyPassword(password, user))) {
      return response(401, { success: false, message: "That password does not match this account." });
    }

    const token = await createSession(redis, user.id);
    return response(
      200,
      { success: true, message: "Logged in successfully.", user: sanitizeUser(user) },
      { "Set-Cookie": setSessionCookie(token) },
    );
  }

  return response(404, { success: false, message: "Unknown auth route." });
};
