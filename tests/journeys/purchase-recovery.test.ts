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
  host: "example.test", "x-forwarded-proto": "https", cookie, ...extra,
});

function takeCookie(value: string | undefined) {
  if (!value) return;
  const pair = value.split(";")[0];
  const name = pair.split("=")[0];
  cookie = [...cookie.split("; ").filter((part) => part && !part.startsWith(`${name}=`)), pair].join("; ");
}

async function requestLink(email: string, extraHeaders: Record<string, string> = {}) {
  return recover({
    blobs, httpMethod: "POST", headers: headers({ "content-type": "application/json", ...extraHeaders }),
    body: JSON.stringify({ email }),
  });
}

function lastToken() {
  const match = sentEmails.at(-1)?.text.match(/token=([A-Za-z0-9_-]{43})/);
  return match?.[1] ?? "";
}

async function redeem(token: string) {
  return recover({
    blobs, httpMethod: "POST", headers: headers({ "content-type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ token }).toString(),
  });
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
  it("restores a guest purchase into the signed-in account after the emailed link is used", async () => {
    // The buyer has an account under a different address; email alone grants nothing.
    const signup = await auth({
      blobs, path: "/api/auth/signup", httpMethod: "POST", headers: headers(),
      body: JSON.stringify({ email: "work@example.test", username: "buyer", password: "buyer-test-password" }),
    });
    takeCookie(signup.headers["Set-Cookie"] as string);
    expect(await tier()).toBe("free");

    const requested = await requestLink(BUYER);
    expect(requested.statusCode).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toEqual([BUYER]);
    expect(sentEmails[0].text).toContain("https://app.example.test/api/recover-purchase?token=");

    // Opening the link (or a mail scanner prefetching it) does not consume it.
    const opened = await recover({
      blobs, httpMethod: "GET", headers: headers(), body: null, queryStringParameters: { token: lastToken() },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.body).toContain('method="post"');

    const redeemed = await redeem(lastToken());
    expect(redeemed.statusCode).toBe(303);
    expect(redeemed.headers.Location).toBe("https://app.example.test/profile?restore=restored");
    takeCookie(redeemed.headers["Set-Cookie"]);
    expect(await tier()).toBe("premium");

    // Bound to the account: a fresh browser with only the login cookie keeps it.
    cookie = cookie.split("; ").filter((part) => part.startsWith("ai_advantage_session=")).join("; ");
    expect(await tier()).toBe("premium");
  });

  it("works once, and not after it expires", async () => {
    await requestLink(BUYER);
    const token = lastToken();
    expect((await redeem(token)).headers.Location).toContain("restore=restored");
    expect((await redeem(token)).headers.Location).toContain("restore=invalid");

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await requestLink(BUYER);
      vi.setSystemTime(new Date(Date.now() + 31 * 60 * 1000));
      const late = await redeem(lastToken());
      expect(late.headers.Location).toContain("restore=invalid");
      expect(late.headers["Set-Cookie"]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers the same for unknown emails and never builds links from the Host header", async () => {
    const unknown = await requestLink("nobody@example.test");
    const known = await requestLink(BUYER, { host: "evil.example", "x-forwarded-host": "evil.example" });
    expect(JSON.parse(unknown.body)).toEqual(JSON.parse(known.body));
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].text).not.toContain("evil.example");
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
