// Single source of truth for advertised prices.
//
// These numbers used to be retyped in three places — the pricing cards here, the
// WebApplication JSON-LD in index.html, and the prerendered marketing block in
// scripts/prerender.mjs. They drifted: crawlers and no-JS viewers were told Pro
// Monthly cost $19 while checkout charged $15. Everything now reads pricing.json,
// and pricing.test.ts fails the build if a copy falls out of sync again.
import pricingData from "@/data/pricing.json";

export type PlanId = "free" | "premium" | "one-time";

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  cadence: string;
  badge: string;
  seoBlurb: string;
}

export const CURRENCY: string = pricingData.currency;
export const TRIAL_DAYS: number = pricingData.trialDays;
export const PLANS = pricingData.plans as Plan[];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Whole-dollar display price, e.g. `$15`. Prices are advertised in round dollars. */
export function formatPlanPrice(plan: Plan): string {
  return `$${plan.price}`;
}
