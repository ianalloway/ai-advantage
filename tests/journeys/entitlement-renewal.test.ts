import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@netlify/blobs", async () => (await import("../helpers/blobsMock")).blobsModule);

import { resetBlobs } from "../helpers/blobsMock";
import { handler as entitlements } from "../../netlify/functions/entitlements";
import {
  createEntitlementSession,
  entitlementSessionCookie,
  getEntitlementStore,
  upsertEntitlement,
  upsertStripeSubscriptionEntitlement,
} from "../../netlify/functions/_lib/entitlements";

const blobs = Buffer.from(JSON.stringify({ url: "https://blob.invalid" })).toString("base64");
const DAY = 24 * 60 * 60 * 1000;
let cookie = "";

async function me() {
  const result = await entitlements({ blobs, httpMethod: "GET", headers: { host: "example.test", cookie } });
  const setCookie = result.headers["Set-Cookie"];
  if (typeof setCookie === "string" && !setCookie.includes("Max-Age=0")) cookie = setCookie.split(";")[0];
  return { tier: JSON.parse(result.body).access.tier as string, setCookie };
}

async function guestSubscriber() {
  const store = getEntitlementStore({ blobs, headers: {} })!;
  const record = await upsertStripeSubscriptionEntitlement(store, { id: "sub_guest", status: "active", customer: "cus_guest" });
  const session = await createEntitlementSession(store, record);
  cookie = entitlementSessionCookie({ host: "example.test" }, session.token, session.maxAge).split(";")[0];
  return store;
}

beforeEach(() => {
  resetBlobs();
  cookie = "";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("entitlement session renewal", () => {
  // The cookie is the only link to a guest purchase, and it used to expire
  // after 30 days no matter how long the subscription kept being paid.
  it("keeps a paying guest subscriber signed in past the original 30 days", async () => {
    await guestSubscriber();
    for (let day = 0; day < 90; day += 20) {
      vi.setSystemTime(new Date(Date.now() + 20 * DAY));
      const { tier, setCookie } = await me();
      expect(tier).toBe("premium");
      expect(setCookie).toMatch(/Max-Age=25\d{5}/);
    }
  });

  it("renews at most once a day", async () => {
    await guestSubscriber();
    vi.setSystemTime(new Date(Date.now() + 2 * DAY));
    expect((await me()).setCookie).toContain("Max-Age=");
    vi.setSystemTime(new Date(Date.now() + 60 * 60 * 1000));
    expect((await me()).setCookie).toBeUndefined();
  });

  it("does not extend a session past the entitlement's own expiry or once access has ended", async () => {
    const store = getEntitlementStore({ blobs, headers: {} })!;
    const pass = await upsertEntitlement(store, {
      id: "pass", tier: "event", source: "stripe", label: "Pass", status: "active",
      activatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3 * DAY).toISOString(),
    });
    const session = await createEntitlementSession(store, pass);
    cookie = entitlementSessionCookie({ host: "example.test" }, session.token, session.maxAge).split(";")[0];
    vi.setSystemTime(new Date(Date.now() + DAY));
    expect((await me()).setCookie).toBeUndefined();

    const sub = await guestSubscriber();
    await upsertStripeSubscriptionEntitlement(sub, { id: "sub_guest", status: "canceled" });
    vi.setSystemTime(new Date(Date.now() + 2 * DAY));
    const after = await me();
    expect(after.tier).toBe("free");
    expect(after.setCookie ?? "").not.toMatch(/Max-Age=[1-9]/);
  });
});
