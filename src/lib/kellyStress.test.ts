import { describe, expect, it } from "vitest";
import { stressKellyStake } from "./kellyStress";

describe("stressKellyStake", () => {
  it("returns deterministic percentiles for a seeded run", () => {
    const a = stressKellyStake({
      winProb: 0.55,
      americanOdds: -110,
      stakeFraction: 0.02,
      bankroll: 1000,
      paths: 1000,
      seed: 42,
    });
    const b = stressKellyStake({
      winProb: 0.55,
      americanOdds: -110,
      stakeFraction: 0.02,
      bankroll: 1000,
      paths: 1000,
      seed: 42,
    });
    expect(a.p50Bankroll).toBe(b.p50Bankroll);
    expect(a.p10Bankroll).toBeLessThanOrEqual(a.p50Bankroll);
    expect(a.p90Bankroll).toBeGreaterThanOrEqual(a.p50Bankroll);
    expect(a.maxDrawdownPct).toBeGreaterThanOrEqual(0);
  });
});
