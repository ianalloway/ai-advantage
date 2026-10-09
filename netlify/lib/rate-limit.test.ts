import { describe, expect, it } from "vitest";
import { blobsModule, resetBlobs } from "../../tests/helpers/blobsMock";
import {
  CounterUnavailableError,
  blobsIncrement,
  consumeRateLimit,
  getClientIp,
  memoryIncrement,
  unavailableIncrement,
} from "./rate-limit";

describe("blobsIncrement", () => {
  // A plain read-then-write counter lets parallel requests all read the same
  // count, which is how attempt limits get bypassed.
  it("never loses an update under concurrency", async () => {
    resetBlobs();
    const increment = blobsIncrement(blobsModule.getStore("counters"));
    const results = await Promise.all(Array.from({ length: 25 }, () => increment("k", 1, 60)));
    expect(results.map((result) => result.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
  });
});

describe("memoryIncrement", () => {
  it("starts a fresh window once the previous one has expired", async () => {
    const data = new Map<string, unknown>();
    const increment = memoryIncrement((k) => data.get(k), (k, v) => data.set(k, v));
    expect((await increment("k", 1, 60)).count).toBe(1);
    expect((await increment("k", 1, 60)).count).toBe(2);
    data.set("k", { count: 99, resetAt: Date.now() - 1 });
    expect((await increment("k", 1, 60)).count).toBe(1);
  });
});

describe("consumeRateLimit", () => {
  it("allows up to the limit and reports when to retry", async () => {
    const data = new Map<string, unknown>();
    const increment = memoryIncrement((k) => data.get(k), (k, v) => data.set(k, v));
    const hits = [];
    for (let i = 0; i < 4; i += 1) hits.push(await consumeRateLimit(increment, "k", 3, 60));
    expect(hits.map((hit) => hit.ok)).toEqual([true, true, true, false]);
    expect(hits[3].retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("getClientIp", () => {
  it("prefers Netlify's own client IP header over spoofable forwarding headers", () => {
    expect(getClientIp({ "x-forwarded-for": "1.1.1.1", "x-nf-client-connection-ip": "2.2.2.2" })).toBe("2.2.2.2");
    expect(getClientIp({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" })).toBe("3.3.3.3");
    expect(getClientIp({})).toBe("unknown");
  });
});

describe("counter failure policy", () => {
  const broken = async () => {
    throw new Error("store down");
  };

  it("never throws, denying or allowing per the caller's policy", async () => {
    await expect(consumeRateLimit(broken, "k", 5, 60, "deny")).resolves.toMatchObject({ ok: false });
    await expect(consumeRateLimit(broken, "k", 5, 60, "allow")).resolves.toMatchObject({ ok: true });
  });

  it("turns endless compare-and-swap contention into an unavailable counter, not a crash", async () => {
    const neverWins = {
      getWithMetadata: async () => ({ data: { count: 1, resetAt: Date.now() + 60_000 }, etag: '"stale"' }),
      setJSON: async () => ({ modified: false }),
    };
    const increment = blobsIncrement(neverWins);
    await expect(increment("k", 1, 60)).rejects.toBeInstanceOf(CounterUnavailableError);
    await expect(consumeRateLimit(increment, "k", 5, 60, "deny")).resolves.toMatchObject({ ok: false });
  });

  it("refuses to count on a store without strong reads", async () => {
    await expect(unavailableIncrement("k", 1, 60)).rejects.toBeInstanceOf(CounterUnavailableError);
  });
});
