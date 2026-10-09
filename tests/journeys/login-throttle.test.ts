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
    headers: { host: "example.test", "x-forwarded-proto": "https", "x-nf-client-connection-ip": ip, "content-type": "application/json" },
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
    headers: { host: "example.test", "x-forwarded-proto": "https", "content-type": "application/json" },
  });
  expect(signup.statusCode).toBe(200);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("login throttling", () => {
  it("locks a guessing IP out of an account, even with the right password, across a cold start", async () => {
    const { LOGIN_LIMITS } = await import("../../netlify/functions/auth");
    let handler = await loadAuth();
    const attacker = "198.51.100.66";
    for (let attempt = 0; attempt < LOGIN_LIMITS.pair.attempts; attempt += 1) {
      expect((await login(handler, { login: owner.email, password: `wrong-${attempt}` }, attacker)).statusCode).toBe(401);
    }

    // A fresh module instance (new function container) reads the same store.
    vi.resetModules();
    handler = await loadAuth();
    const locked = await login(handler, { login: owner.username, password: owner.password }, attacker);
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers["Retry-After"])).toBeGreaterThan(0);
    expect(locked.headers["Set-Cookie"]).toBeUndefined();

    vi.setSystemTime(new Date(Date.now() + LOGIN_LIMITS.pair.windowSeconds * 1000 + 1000));
    expect((await login(handler, { login: owner.email, password: owner.password }, attacker)).statusCode).toBe(200);
  });

  // One attacker used to be able to lock the owner out from everywhere.
  it("does not let one guessing IP lock the owner out from another IP", async () => {
    const { LOGIN_LIMITS } = await import("../../netlify/functions/auth");
    const handler = await loadAuth();
    for (let attempt = 0; attempt < LOGIN_LIMITS.pair.attempts + 3; attempt += 1) {
      await login(handler, { login: owner.email, password: "wrong" }, "198.51.100.66");
    }
    expect((await login(handler, { login: owner.email, password: owner.password }, "203.0.113.200")).statusCode).toBe(200);
  });

  it("still bounds distributed guessing per account, except from IPs the owner has used", async () => {
    const { LOGIN_LIMITS } = await import("../../netlify/functions/auth");
    const handler = await loadAuth();
    const home = "203.0.113.50";
    expect((await login(handler, { login: owner.email, password: owner.password }, home)).statusCode).toBe(200);

    const botnet = Math.ceil(LOGIN_LIMITS.account.attempts / LOGIN_LIMITS.pair.attempts);
    for (let bot = 0; bot < botnet; bot += 1) {
      await Promise.all(
        Array.from({ length: LOGIN_LIMITS.pair.attempts }, () =>
          login(handler, { login: owner.email, password: "guess" }, `10.0.${bot}.1`),
        ),
      );
    }
    // A brand-new IP is refused even with the right password: guessing is bounded.
    expect((await login(handler, { login: owner.email, password: owner.password }, "192.0.2.77")).statusCode).toBe(429);
    // The owner's known IP still gets in.
    expect((await login(handler, { login: owner.email, password: owner.password }, home)).statusCode).toBe(200);
  });

  // The limit used to be checked before hashing and counted afterwards with a
  // read-then-write, so a burst of parallel guesses all passed the check.
  it("lets only the allowed number of a parallel burst reach password verification", async () => {
    const { LOGIN_LIMITS } = await import("../../netlify/functions/auth");
    const handler = await loadAuth();
    const burst = await Promise.all(
      Array.from({ length: 15 }, (_, i) => login(handler, { login: owner.email, password: `guess-${i}` }, "198.51.100.1")),
    );
    const verified = burst.filter((result) => result.statusCode === 401);
    const throttledCount = burst.filter((result) => result.statusCode === 429);
    expect(verified).toHaveLength(LOGIN_LIMITS.pair.attempts);
    expect(throttledCount).toHaveLength(15 - LOGIN_LIMITS.pair.attempts);
  });

  it("fails closed with 429, not 500, when Blobs has no strongly consistent reads", async () => {
    const handler = await loadAuth();
    const eventual = Buffer.from(JSON.stringify({ url: "https://blob.invalid" })).toString("base64");
    const result = await handler({
      blobs: eventual, path: "/api/auth/login", httpMethod: "POST",
      body: JSON.stringify({ login: owner.email, password: owner.password }),
      headers: { host: "example.test", "x-forwarded-proto": "https", "content-type": "application/json" },
    });
    expect(result.statusCode).toBe(429);
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
