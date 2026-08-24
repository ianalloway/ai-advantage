/**
 * Production smoke: Stripe readiness + auth/entitlements endpoints.
 * Run: npm run test:smoke
 */
import { describe, expect, it } from "vitest";

/**
 * Retry a fetch against production a few times before giving up. The scheduled
 * smoke runs hit the live site from GitHub runners, and 18 of the last 30 runs
 * failed on a single connect-timeout to /api/billing-status while the site was
 * healthy — transient network blips between runner and host, not outages.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

const BASE_URL = (process.env.SMOKE_BASE_URL || "https://aiadvantagesports.com").replace(/\/$/, "");

describe("production billing + auth smoke", () => {
  it("exposes billing-status with a coherent checkout readiness shape", async () => {
    const response = await fetchWithRetry(`${BASE_URL}/api/billing-status`);
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