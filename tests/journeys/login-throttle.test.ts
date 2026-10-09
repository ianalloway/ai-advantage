import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real auth handler against an in-memory Netlify Blobs boundary, so throttling
// state lives where production keeps it: in the shared auth store.
vi.mock("@netlify/blobs", async () => (await import("../helpers/blobsMock")).blobsModule);

import { resetBlobs } from "../helpers/blobsMock";

const blobs = Buffer.from(JSON.stringify({ url: "https://blob.invalid", url_uncached: "https://blob.invalid" })).toString("base64");
const owner = { email: "owner@example.test", username: "owner", password: "correct-horse-battery" };

async function loadAuth() {
  return (await import("../../netlify/functions/auth")).handler;
}

function login(handler: Awaited<ReturnType<typeof loadAuth>>, body: { login: string; password: string }, ip = "203.0.113.7") {
  return handler({
    blobs, path: "/api/auth/login", httpMethod: "POST", body: JSON.stringify(body),
    headers: { host: "example.test", "x-forwarded-proto": "https", "x-nf-client-connection-ip": ip },
  });
}

beforeEach(async () => {
  resetBlobs();
  vi.resetModules();
  vi.stubEnv("AUTH_SECRET", "ephemeral-auth-secret-for-tests-only");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  const handler = await loadAuth();
  const signup = await handler({
    blobs, path: "/api/auth/signup", httpMethod: "POST", body: JSON.stringify(owner),
    headers: { host: "example.test", "x-forwarded-proto": "https" },
  });
  expect(signup.statusCode).toBe(200);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("login throttling", () => {
  it("locks an account after repeated failures, even for the right password, and survives a cold start", async () => {
    const { LOGIN_LIMITS } = await import("../../netlify/functions/auth");
    let handler = await loadAuth();
    for (let attempt = 0; attempt < LOGIN_LIMITS.account.attempts; attempt += 1) {
      const failed = await login(handler, { login: owner.email, password: `wrong-${attempt}` }, `198.51.100.${attempt}`);
      expect(failed.statusCode).toBe(401);
    }

    // A fresh module instance (new function container) reads the same store.
    vi.resetModules();
    handler = await loadAuth();
    const locked = await login(handler, { login: owner.username, password: owner.password }, "198.51.100.200");
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers["Retry-After"])).toBeGreaterThan(0);
    expect(locked.headers["Set-Cookie"]).toBeUndefined();

    vi.setSystemTime(new Date(Date.now() + LOGIN_LIMITS.account.windowSeconds * 1000 + 1000));
    const recovered = await login(handler, { login: owner.email, password: owner.password });
    expect(recovered.statusCode).toBe(200);
    // Success clears the account counter: one more typo does not lock again.
    expect((await login(handler, { login: owner.email, password: "typo" })).statusCode).toBe(401);
    expect((await login(handler, { login: owner.email, password: owner.password })).statusCode).toBe(200);
  });

  // The limit used to be checked before hashing and counted afterwards with a
  // read-then-write, so a burst of parallel guesses all passed the check.
  it("lets only the allowed number of a parallel burst reach password verification", async () => {
    const { LOGIN_LIMITS } = await import("../../netlify/functions/auth");
    const handler = await loadAuth();
    const burst = await Promise.all(
      Array.from({ length: 15 }, (_, i) => login(handler, { login: owner.email, password: `guess-${i}` }, `198.51.100.${i}`)),
    );
    const verified = burst.filter((result) => result.statusCode === 401);
    const throttledCount = burst.filter((result) => result.statusCode === 429);
    expect(verified).toHaveLength(LOGIN_LIMITS.account.attempts);
    expect(throttledCount).toHaveLength(15 - LOGIN_LIMITS.account.attempts);
  });

  it("gives unknown accounts and wrong passwords the same generic answer", async () => {
    const handler = await loadAuth();
    const unknown = await login(handler, { login: "nobody@example.test", password: "whatever-password" });
    const wrong = await login(handler, { login: owner.email, password: "whatever-password" });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(JSON.parse(unknown.body).message).toBe(JSON.parse(wrong.body).message);
  });

  it("limits one IP spraying many accounts without blocking other IPs", async () => {
    const { LOGIN_LIMITS } = await import("../../netlify/functions/auth");
    const handler = await loadAuth();
    for (let attempt = 0; attempt < LOGIN_LIMITS.ip.attempts; attempt += 1) {
      await login(handler, { login: `victim${attempt}@example.test`, password: "guess" }, "192.0.2.1");
    }
    const sprayer = await login(handler, { login: owner.email, password: owner.password }, "192.0.2.1");
    expect(sprayer.statusCode).toBe(429);
    const elsewhere = await login(handler, { login: owner.email, password: owner.password }, "192.0.2.99");
    expect(elsewhere.statusCode).toBe(200);
  });
});
