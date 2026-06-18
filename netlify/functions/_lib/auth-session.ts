import { createHash } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";
import { Redis } from "@upstash/redis";
import { getCookie, getHeader, type EventLike } from "./entitlements";

export interface SiteUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSiteUser extends SiteUser {
  passwordHash: string;
  passwordSalt: string;
}

interface SessionRecord {
  userId: string;
  expiresAt: string;
}

interface AuthStore {
  get: <T>(key: string) => Promise<T | null>;
}

const COOKIE_NAME = "ai_advantage_session";
const ACCOUNT_PREFIX = "ai-advantage:auth";

let redisClient: Redis | null | undefined;

function getRedis() {
  if (redisClient !== undefined) return redisClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = null;
    return redisClient;
  }

  redisClient = Redis.fromEnv();
  return redisClient;
}

function normalizeLambdaHeaders(headers: EventLike["headers"]) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).flatMap(([key, value]) => {
      const normalized = Array.isArray(value) ? value[0] : value;
      return typeof normalized === "string" ? [[key.toLowerCase(), normalized]] : [];
    }),
  );
}

function getAuthStore(event: EventLike): AuthStore | null {
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
      };
    } catch (error) {
      console.warn("Netlify Blobs auth lookup is unavailable; checking fallback store.", error);
    }
  }

  const redis = getRedis();
  if (!redis) return null;
  return {
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null;
    },
  };
}

function sessionKey(token: string) {
  return `${ACCOUNT_PREFIX}:session:${createHash("sha256").update(token).digest("hex")}`;
}

function userKey(id: string) {
  return `${ACCOUNT_PREFIX}:user:${id}`;
}

function sanitizeUser(user: StoredSiteUser): SiteUser {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...safeUser } = user;
  return safeUser;
}

export async function getCurrentSiteUserFromEvent(event: EventLike): Promise<SiteUser | null> {
  const store = getAuthStore(event);
  if (!store) return null;

  const token = getCookie(event.headers, COOKIE_NAME);
  if (!token) return null;

  const session = await store.get<string | SessionRecord>(sessionKey(token));
  const userId = typeof session === "string" ? session : session?.userId;
  if (!userId) return null;
  if (typeof session === "object" && session !== null && new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const user = await store.get<StoredSiteUser>(userKey(userId));
  return user ? sanitizeUser(user) : null;
}

export function getRequestOrigin(event: EventLike) {
  const configuredOrigin = process.env.PUBLIC_APP_URL || process.env.URL;
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, "");

  const host = getHeader(event.headers, "x-forwarded-host") || getHeader(event.headers, "host");
  const protocol = getHeader(event.headers, "x-forwarded-proto") || "https";
  return host ? `${protocol}://${host}`.replace(/\/$/, "") : "http://localhost:5173";
}
