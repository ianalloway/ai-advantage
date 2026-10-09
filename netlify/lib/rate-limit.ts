import type { Redis } from "@upstash/redis";

/**
 * Atomic windowed counters shared by every store backend.
 *
 * `increment` adds `delta` to the counter at `key` and returns the new count.
 * The window starts on the first increment and is not extended by later ones;
 * an expired counter starts over. Each backend makes the read-modify-write
 * atomic, so concurrent requests cannot all observe the same count.
 */
export interface CounterResult {
  count: number;
  resetAt: number;
}

export type IncrementFn = (key: string, delta: number, windowSeconds: number) => Promise<CounterResult>;

interface StoredCounter {
  count: number;
  resetAt: number;
}

type HeaderMap = Record<string, string | string[] | undefined>;

const MAX_CAS_ATTEMPTS = 10;

function isLive(value: unknown, now: number): value is StoredCounter {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as StoredCounter).count === "number" &&
      typeof (value as StoredCounter).resetAt === "number" &&
      (value as StoredCounter).resetAt > now,
  );
}

function nextCounter(previous: unknown, delta: number, windowSeconds: number): StoredCounter {
  const now = Date.now();
  return isLive(previous, now)
    ? { count: previous.count + delta, resetAt: previous.resetAt }
    : { count: delta, resetAt: now + windowSeconds * 1000 };
}

interface BlobsCasStore {
  getWithMetadata: (key: string, options: { type: "json" }) => Promise<{ data: unknown; etag?: string } | null>;
  setJSON: (
    key: string,
    value: unknown,
    options: { onlyIfNew: true } | { onlyIfMatch: string },
  ) => Promise<{ modified: boolean } | void>;
}

/** Compare-and-swap on the blob's ETag, retried under contention. Fails closed. */
export function blobsIncrement(store: BlobsCasStore): IncrementFn {
  return async (key, delta, windowSeconds) => {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const current = await store.getWithMetadata(key, { type: "json" });
      const next = nextCounter(current?.data, delta, windowSeconds);
      const result =
        current?.etag !== undefined && current !== null
          ? await store.setJSON(key, next, { onlyIfMatch: current.etag })
          : await store.setJSON(key, next, { onlyIfNew: true });
      if (result && result.modified) return next;
      await new Promise((resolve) => setTimeout(resolve, 5 + Math.random() * 20 * (attempt + 1)));
    }
    throw new Error(`Counter ${key} is too contended to update.`);
  };
}

/** INCRBY with the window's expiry set only when the key is created. */
export function redisIncrement(redis: Redis): IncrementFn {
  return async (key, delta, windowSeconds) => {
    const [count, , ttlMs] = (await redis
      .multi()
      .incrby(key, delta)
      .expire(key, windowSeconds, "NX")
      .pttl(key)
      .exec()) as [number, unknown, number];
    return { count, resetAt: Date.now() + Math.max(ttlMs, 0) };
  };
}

/** For single-process stores: the read and write happen in one synchronous step. */
export function memoryIncrement(read: (key: string) => unknown, write: (key: string, value: unknown) => void): IncrementFn {
  return async (key, delta, windowSeconds) => {
    const next = nextCounter(read(key), delta, windowSeconds);
    write(key, next);
    return next;
  };
}

/** Client IP as seen by Netlify's edge; x-nf-client-connection-ip cannot be set by the client. */
export function getClientIp(headers: HeaderMap | undefined) {
  const read = (name: string) => {
    const entry = Object.entries(headers ?? {}).find(([key, value]) => key.toLowerCase() === name && value);
    const value = entry?.[1];
    return Array.isArray(value) ? value[0] : value;
  };
  const direct = read("x-nf-client-connection-ip") ?? read("client-ip");
  if (direct) return direct.trim();
  return read("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Count one hit against `limit` per window. `ok` is false once the limit is exceeded. */
export async function consumeRateLimit(
  increment: IncrementFn,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const { count, resetAt } = await increment(key, 1, windowSeconds);
  return {
    ok: count <= limit,
    count,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}
