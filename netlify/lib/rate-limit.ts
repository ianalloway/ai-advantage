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

/** Thrown when a store cannot provide an atomic, strongly consistent counter. */
export class CounterUnavailableError extends Error {
  constructor(reason: string) {
    super(`Rate-limit counter unavailable: ${reason}`);
    this.name = "CounterUnavailableError";
  }
}

/**
 * For stores whose reads may be stale (Netlify Blobs without the uncached edge
 * URL): a compare-and-swap loop there can spin on an old ETag forever, so these
 * stores do not offer counters at all and callers apply their own policy.
 */
export const unavailableIncrement: IncrementFn = async () => {
  throw new CounterUnavailableError("store is not strongly consistent");
};

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
    throw new CounterUnavailableError(`counter ${key} is too contended to update`);
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

const FALLBACK_TAG = "[rate-limit:in-process-fallback]";
const FALLBACK_MAX_KEYS = 10_000;
const fallbackCounters = new Map<string, StoredCounter>();

/** Clear one fallback counter, mirroring a delete of the shared counter. */
export function clearInProcessFallback(key: string) {
  fallbackCounters.delete(key);
}

/** Test hook: forget the in-process fallback counters. */
export function resetInProcessFallback() {
  fallbackCounters.clear();
}

/**
 * Best-effort fallback for the shared counter. When the strongly consistent
 * counter is unavailable (no uncached Blobs edge, or unresolved contention),
 * count in this function instance's memory with the same thresholds instead
 * of refusing everyone, and log a warning with a stable tag so the
 * degradation is visible in function logs. Limits then hold per warm instance
 * only, not across instances or cold starts.
 */
export function withInProcessFallback(primary: IncrementFn, scope: string): IncrementFn {
  return async (key, delta, windowSeconds) => {
    try {
      return await primary(key, delta, windowSeconds);
    } catch (error) {
      if (!(error instanceof CounterUnavailableError)) throw error;
      console.warn(`${FALLBACK_TAG} ${scope}: ${error.message}`);
      if (fallbackCounters.size > FALLBACK_MAX_KEYS) {
        const now = Date.now();
        for (const [entryKey, entry] of fallbackCounters) {
          if (entry.resetAt <= now) fallbackCounters.delete(entryKey);
        }
        if (fallbackCounters.size > FALLBACK_MAX_KEYS) fallbackCounters.clear();
      }
      return memoryIncrement(
        (entryKey) => fallbackCounters.get(entryKey),
        (entryKey, value) => fallbackCounters.set(entryKey, value as StoredCounter),
      )(key, delta, windowSeconds);
    }
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

/**
 * Count one hit against `limit` per window. `ok` is false once the limit is
 * exceeded. When the counter cannot be updated (no strongly consistent store,
 * or unresolved contention) the caller's policy decides: "deny" for anything
 * guarding credentials or paid access, "allow" for best-effort telemetry. It
 * never throws.
 */
export async function consumeRateLimit(
  increment: IncrementFn,
  key: string,
  limit: number,
  windowSeconds: number,
  onUnavailable: "deny" | "allow" = "deny",
) {
  try {
    const { count, resetAt } = await increment(key, 1, windowSeconds);
    return {
      ok: count <= limit,
      count,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    };
  } catch (error) {
    console.warn("[rate-limit]", error instanceof Error ? error.message : error);
    return { ok: onUnavailable === "allow", count: Number.NaN, retryAfterSeconds: 60 };
  }
}
