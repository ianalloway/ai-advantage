import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@netlify/blobs", async () => (await import("../helpers/blobsMock")).blobsModule);

import { resetBlobs } from "../helpers/blobsMock";
import { handler as auth } from "../../netlify/functions/auth";
import { handler as entitlements } from "../../netlify/functions/entitlements";
import { handler as recover } from "../../netlify/functions/recover-purchase";
import { getEntitlementStore, upsertStripeCheckoutSessionEntitlement } from "../../netlify/functions/_lib/entitlements";

const blobs = Buffer.from(JSON.stringify({ url: "https://blob.invalid", url_uncached: "https://blob.invalid" })).toString("base64");
const BUYER = "buyer@example.test";
let cookie = "";
let sentEmails: Array<{ to: string[]; html: string; text: string }> = [];

const headers = (extra: Record<string, string> = {}) => ({
  host: "example.test", "x-forwarded-proto": "https", "content-type": "application/json", cookie, ...extra,
});

function takeCookie(value: string | undefined) {
  if (!value) return;
  const pair = value.split(";")[0];
  const name = pair.split("=")[0];
  cookie = [...cookie.split("; ").filter((part) => part && !part.startsWith(`${name}=`)), pair].join("; ");
}

async function post(body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  const result = await recover({ blobs, httpMethod: "POST", headers: headers(extraHeaders), body: JSON.stringify(body) });
  return { ...result, json: JSON.parse(result.body) as Record<string, unknown> };
}

async function requestLink(email: string, extraHeaders: Record<string, string> = {}) {
  const result = await post({ email }, extraHeaders);
  takeCookie(result.headers["Set-Cookie"]);
  return result;
}

function lastToken() {
  const match = sentEmails.at(-1)?.text.match(/#restore=([A-Za-z0-9_-]{43})/);
  return match?.[1] ?? "";
}

async function redeem(token: string) {
  const result = await post({ action: "redeem", token });
  takeCookie(result.headers["Set-Cookie"]);
  return result;
}

async function signup(email: string, username: string) {
  const result = await auth({
    blobs, path: "/api/auth/signup", httpMethod: "POST", headers: headers(),
    body: JSON.stringify({ email, username, password: `${username}-test-password` }),
  });
  takeCookie(result.headers["Set-Cookie"] as string);
  return JSON.parse(result.body).user as { id: string };
}

async function tier() {
  return JSON.parse((await entitlements({ blobs, headers: headers(), httpMethod: "GET" })).body).access.tier as string;
}

beforeEach(async () => {
  resetBlobs();
  cookie = "";
  sentEmails = [];
  vi.stubEnv("AUTH_SECRET", "ephemeral-auth-secret-for-tests-only");
  vi.stubEnv("PUBLIC_APP_URL", "https://app.example.test");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "AI Advantage <noreply@example.test>");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
    if (!String(url).startsWith("https://api.resend.com/")) throw new Error(`Unexpected fetch ${url}`);
    sentEmails.push(JSON.parse(init.body));
    return { ok: true, status: 200 };
  }));
  // A guest subscription, bought with BUYER's email and not bound to any account.
  const store = getEntitlementStore({ blobs, headers: {} })!;
  await upsertStripeCheckoutSessionEntitlement(store, {
    id: "cs_guest", mode: "subscription", subscription: "sub_guest", customer: "cus_guest",
    status: "complete", payment_status: "paid", customer_details: { email: BUYER },
  });
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("purchase recovery by email ownership", () => {
  it("binds the purchase to the account that asked for the link, after confirmation", async () => {
    // The buyer has an account under a different address; email alone grants nothing.
    await signup("work@example.test", "buyer");
    expect(await tier()).toBe("free");

    expect((await requestLink(BUYER)).statusCode).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toEqual([BUYER]);
    // The token travels in the fragment, never in a query string a server sees.
    expect(sentEmails[0].text).toContain("https://app.example.test/profile#restore=");
    expect(sentEmails[0].text).not.toContain("?token=");

    // Preview does not consume the link and names the account it will join.
    const preview = await post({ action: "preview", token: lastToken() });
    expect(preview.json).toEqual({ valid: true, account: "w***@example.test" });

    const redeemed = await redeem(lastToken());
    expect(redeemed.json).toMatchObject({ success: true, account: "w***@example.test" });
    expect(await tier()).toBe("premium");

    // Bound to the account: a fresh browser with only the login cookie keeps it.
    cookie = cookie.split("; ").filter((part) => part.startsWith("ai_advantage_session=")).join("; ");
    expect(await tier()).toBe("premium");
  });

  // Signing the victim's browser into an attacker's account before the victim
  // confirms must not move the victim's purchase into the attacker's account.
  it("does not bind to an account other than the one that requested the link", async () => {
    await signup("victim@example.test", "victim");
    await requestLink(BUYER);
    const token = lastToken();

    // The browser is now signed in to a different account (swapped session).
    const attacker = await signup("attacker@example.test", "attacker");
    const preview = await post({ action: "preview", token });
    expect(preview.json).toEqual({ valid: true, account: null });
    const redeemed = await redeem(token);
    expect(redeemed.json).toMatchObject({ success: true, account: null });

    const store = getEntitlementStore({ blobs, headers: {} })!;
    const record = await store.get<{ userId?: string }>("ai-advantage:entitlements:record:stripe:subscription:sub_guest");
    expect(record?.userId).toBeUndefined();
    expect(record?.userId).not.toBe(attacker.id);
    // The browser that confirmed still gets the purchase cookie.
    expect(await tier()).toBe("premium");
  });

  it("does not bind when confirmed from a browser without the request's nonce", async () => {
    await signup("work@example.test", "buyer");
    await requestLink(BUYER);
    const token = lastToken();
    cookie = cookie.split("; ").filter((part) => !part.startsWith("ai_advantage_restore_nonce=")).join("; ");
    expect((await redeem(token)).json).toMatchObject({ success: true, account: null });
  });

  it("works once, and not after it expires", async () => {
    await requestLink(BUYER);
    const token = lastToken();
    expect((await redeem(token)).json).toMatchObject({ success: true });
    expect((await redeem(token)).statusCode).toBe(410);

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await requestLink(BUYER);
      vi.setSystemTime(new Date(Date.now() + 31 * 60 * 1000));
      const late = await redeem(lastToken());
      expect(late.statusCode).toBe(410);
      expect(late.headers["Set-Cookie"]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers the same for unknown emails and never builds links from the Host header", async () => {
    const unknown = await requestLink("nobody@example.test");
    const known = await requestLink(BUYER, { host: "evil.example", "x-forwarded-host": "evil.example" });
    expect(unknown.json).toEqual(known.json);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].text).not.toContain("evil.example");
  });

  it("refuses cross-site and non-JSON requests", async () => {
    expect((await post({ email: BUYER }, { "sec-fetch-site": "cross-site" })).statusCode).toBe(403);
    expect((await post({ email: BUYER }, { origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await post({ email: BUYER }, { "content-type": "application/x-www-form-urlencoded" })).statusCode).toBe(415);
    expect((await post({ email: BUYER }, { origin: "https://app.example.test", "sec-fetch-site": "same-origin" })).statusCode).toBe(200);
  });

  it("rate-limits link requests per email", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await requestLink(BUYER, { "x-nf-client-connection-ip": `198.51.100.${i}` })).statusCode).toBe(200);
    }
    expect((await requestLink(BUYER, { "x-nf-client-connection-ip": "198.51.100.9" })).statusCode).toBe(429);
    expect(sentEmails).toHaveLength(3);
  });

  it("fails closed when no app origin is configured", async () => {
    vi.stubEnv("PUBLIC_APP_URL", "");
    vi.stubEnv("URL", "");
    expect((await requestLink(BUYER)).statusCode).toBe(503);
    expect(sentEmails).toHaveLength(0);
  });
});

describe("login CSRF", () => {
  it("refuses cross-site and form-encoded auth POSTs", async () => {
    const attempt = (extra: Record<string, string>) =>
      auth({
        blobs, path: "/api/auth/login", httpMethod: "POST", headers: headers(extra),
        body: JSON.stringify({ login: "attacker@example.test", password: "attacker-test-password" }),
      });
    expect((await attempt({ "sec-fetch-site": "cross-site" })).statusCode).toBe(403);
    expect((await attempt({ origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await attempt({ "content-type": "text/plain" })).statusCode).toBe(415);
  });
});
