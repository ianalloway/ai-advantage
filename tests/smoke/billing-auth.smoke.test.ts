/**
 * Production smoke: Stripe readiness + auth/entitlements endpoints.
 * Run: npm run test:smoke
 */
import { describe, expect, it } from "vitest";

const BASE_URL = (process.env.SMOKE_BASE_URL || "https://aiadvantagesports.com").replace(/\/$/, "");

describe("production billing + auth smoke", () => {
  it("exposes billing-status with a coherent checkout readiness shape", async () => {
    const response = await fetch(`${BASE_URL}/api/billing-status`, {
      signal: AbortSignal.timeout(15000),
    });
    expect(response.status).toBe(200);
    const status = (await response.json()) as Record<string, unknown>;

    for (const key of [
      "stripeSecretConfigured",
      "stripeWebhookConfigured",
      "entitlementStoreConfigured",
      "premiumPriceConfigured",
      "oneTimePriceConfigured",
      "premiumCheckoutReady",
      "oneTimeCheckoutReady",
    ]) {
      expect(typeof status[key]).toBe("boolean");
    }

    // Entitlement store should be live even if Stripe keys are still unset.
    expect(status.entitlementStoreConfigured).toBe(true);

    // If Checkout claims ready, secret + price must also be true.
    if (status.premiumCheckoutReady) {
      expect(status.stripeSecretConfigured).toBe(true);
      expect(status.premiumPriceConfigured).toBe(true);
    }
    if (status.oneTimeCheckoutReady) {
      expect(status.stripeSecretConfigured).toBe(true);
      expect(status.oneTimePriceConfigured).toBe(true);
    }
  }, 20000);

  it("keeps auth and entitlements endpoints healthy for anonymous visitors", async () => {
    const me = await fetch(`${BASE_URL}/api/auth/me`, { signal: AbortSignal.timeout(15000) });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user: unknown };
    expect(meBody.user).toBeNull();

    const entitlements = await fetch(`${BASE_URL}/api/entitlements/me`, {
      signal: AbortSignal.timeout(15000),
    });
    expect(entitlements.status).toBe(200);
    const entBody = (await entitlements.json()) as {
      configured: boolean;
      access: { tier: string };
    };
    expect(entBody.configured).toBe(true);
    expect(entBody.access.tier).toBe("free");
  }, 20000);

  it("rejects unconfigured checkout with an actionable error (not a crash)", async () => {
    const response = await fetch(`${BASE_URL}/api/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "premium" }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await response.json()) as { success?: boolean; code?: string; url?: string };

    if (response.ok) {
      expect(body.url).toMatch(/^https:\/\//);
      return;
    }

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(body.success).toBe(false);
    expect(["stripe_secret_missing", "stripe_price_missing", "stripe_checkout_error"]).toContain(body.code);
  }, 20000);
});
