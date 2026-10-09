import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@netlify/blobs", async () => (await import("../helpers/blobsMock")).blobsModule);

import { resetBlobs } from "../helpers/blobsMock";
import { handler as auth } from "../../netlify/functions/auth";
import { handler as entitlements } from "../../netlify/functions/entitlements";
import { handler as admin } from "../../netlify/functions/admin-entitlements";
import { getEntitlementStore, upsertStripeCheckoutSessionEntitlement } from "../../netlify/functions/_lib/entitlements";

const blobs = Buffer.from(JSON.stringify({ url: "https://blob.invalid", url_uncached: "https://blob.invalid" })).toString("base64");
const ADMIN_TOKEN = "a".repeat(40);
const HOUR = 60 * 60 * 1000;

async function signup(email: string, username: string) {
  const result = await auth({
    blobs, path: "/api/auth/signup", httpMethod: "POST", headers: { host: "example.test" },
    body: JSON.stringify({ email, username, password: "legacy-test-password" }),
  });
  return { id: JSON.parse(result.body).user.id as string, cookie: (result.headers["Set-Cookie"] as string).split(";")[0] };
}

async function guestPurchase(email: string, n: number) {
  const store = getEntitlementStore({ blobs, headers: {} })!;
  return upsertStripeCheckoutSessionEntitlement(store, {
    id: `cs_${n}`, mode: "subscription", subscription: `sub_${n}`, customer: `cus_${n}`,
    status: "complete", payment_status: "paid", customer_details: { email },
  });
}

async function tier(cookie: string) {
  const result = await entitlements({ blobs, httpMethod: "GET", headers: { host: "example.test", cookie } });
  return JSON.parse(result.body).access.tier as string;
}

async function call(body: unknown, token = ADMIN_TOKEN) {
  const result = await admin({
    blobs, httpMethod: "POST", body: JSON.stringify(body),
    headers: { host: "example.test", "content-type": "application/json", authorization: `Bearer ${token}` },
  });
  return { status: result.statusCode, body: JSON.parse(result.body) };
}

beforeEach(() => {
  resetBlobs();
  vi.stubEnv("AUTH_SECRET", "ephemeral-auth-secret-for-tests-only");
  vi.stubEnv("ADMIN_API_TOKEN", ADMIN_TOKEN);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("legacy email binding migration", () => {
  it("binds exactly the account/purchase pairs that email lookup granted before the cutoff", async () => {
    const legacy = await signup("legacy@example.test", "legacy");
    await guestPurchase("legacy@example.test", 1);
    const ownedPurchase = await guestPurchase("owned@example.test", 2);
    const store = getEntitlementStore({ blobs, headers: {} })!;
    await store.set(`ai-advantage:entitlements:record:${ownedPurchase.id}`, { ...ownedPurchase, userId: "someone-else" });

    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    const cutoff = new Date().toISOString(); // the deploy
    vi.setSystemTime(new Date(Date.now() + HOUR));
    // After the cutoff: a new account squatting an unbound buyer's email, and a
    // new purchase for the legacy account's email.
    await guestPurchase("victim@example.test", 3);
    vi.setSystemTime(new Date(Date.now() - 2 * 24 * HOUR)); // purchase 3 predates the cutoff
    await guestPurchase("victim@example.test", 4);
    vi.setSystemTime(new Date("2026-10-09T14:00:00Z"));
    const squatter = await signup("victim@example.test", "squatter");
    await signup("owned@example.test", "owned");

    expect(await tier(legacy.cookie)).toBe("free");

    const plan = await call({ action: "plan-legacy-email", cutoff });
    expect(plan.status).toBe(200);
    expect(plan.body.plan).toEqual([
      expect.objectContaining({ userId: legacy.id, entitlementId: "stripe:subscription:sub_1" }),
    ]);
    // A dry run changes nothing.
    expect(await tier(legacy.cookie)).toBe("free");

    const applied = await call({ action: "apply-legacy-email", cutoff });
    expect(applied.body.count).toBe(1);
    expect(await tier(legacy.cookie)).toBe("premium");
    expect(await tier(squatter.cookie)).toBe("free");

    // Idempotent.
    expect((await call({ action: "apply-legacy-email", cutoff })).body.count).toBe(0);
  });

  it("lets the operator exclude reviewed pairs and bind a purchase by id", async () => {
    const account = await signup("legacy@example.test", "legacy");
    await guestPurchase("legacy@example.test", 1);
    vi.setSystemTime(new Date(Date.now() + HOUR));
    const cutoff = new Date().toISOString();

    const skipped = await call({ action: "apply-legacy-email", cutoff, exclude: ["stripe:subscription:sub_1"] });
    expect(skipped.body.count).toBe(0);
    expect(await tier(account.cookie)).toBe("free");

    const bound = await call({ action: "bind", userId: account.id, entitlementId: "stripe:subscription:sub_1" });
    expect(bound.status).toBe(200);
    expect(await tier(account.cookie)).toBe("premium");
    // Never moves a purchase that is already bound to someone else.
    expect((await call({ action: "bind", userId: "another", entitlementId: "stripe:subscription:sub_1" })).status).toBe(409);
  });

  it("fails closed without the admin token", async () => {
    expect((await call({ action: "plan-legacy-email", cutoff: new Date().toISOString() }, "wrong")).status).toBe(401);
    vi.stubEnv("ADMIN_API_TOKEN", "");
    expect((await call({ action: "plan-legacy-email", cutoff: new Date().toISOString() }, "")).status).toBe(401);
    vi.stubEnv("ADMIN_API_TOKEN", "short");
    expect((await call({ action: "plan-legacy-email", cutoff: new Date().toISOString() }, "short")).status).toBe(401);
  });
});
