import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPlan, PLANS, TRIAL_DAYS } from "./pricing";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("pricing source of truth", () => {
  it("exposes the three advertised plans", () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(["free", "premium", "one-time"]);
  });

  it("keeps the free tier free", () => {
    expect(getPlan("free").price).toBe(0);
  });

  // Regression guard: index.html once advertised Pro Monthly at $19 in JSON-LD
  // while checkout charged $15. Google surfaced the stale number in rich results.
  it("matches the prices in the index.html JSON-LD offers", () => {
    const html = readFileSync(join(repoRoot, "index.html"), "utf8");
    const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    expect(match, "index.html should contain a JSON-LD block").toBeTruthy();

    const structuredData = JSON.parse(match![1]);
    const offersByName = new Map<string, string>(
      structuredData.offers.map((offer: { name: string; price: string }) => [offer.name, offer.price]),
    );

    for (const plan of PLANS) {
      expect(offersByName.get(plan.name), `JSON-LD offer for "${plan.name}"`).toBe(String(plan.price));
    }
  });

  it("advertises a trial length the checkout copy can reuse", () => {
    expect(TRIAL_DAYS).toBeGreaterThan(0);
    expect(getPlan("premium").cadence).toContain(`${TRIAL_DAYS}-day`);
  });
});
