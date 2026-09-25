import { describe, expect, it } from "vitest";
import type { RiskPosition } from "./portfolioRisk";
import { correlationLoadings, inverseNormalCdf, simulateSlate } from "./slateSimulation";

const position = (overrides: Partial<RiskPosition> & { id: string }): RiskPosition => ({
  gameId: `game-${overrides.id}`,
  sport: "nba",
  sportLabel: "NBA",
  team: `Team ${overrides.id}`,
  opponent: `Opp ${overrides.id}`,
  side: "Home",
  stake: 20,
  modelProb: 0.55,
  americanOdds: 100,
  ...overrides,
});

describe("inverseNormalCdf", () => {
  it("maps the median to zero and is symmetric", () => {
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 6);
    expect(inverseNormalCdf(0.75)).toBeCloseTo(-inverseNormalCdf(0.25), 6);
  });

  it("matches known normal quantiles", () => {
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.959964, 4);
    expect(inverseNormalCdf(0.95)).toBeCloseTo(1.644854, 4);
    expect(inverseNormalCdf(0.005)).toBeCloseTo(-2.575829, 4);
  });

  it("stays finite at the extremes", () => {
    expect(Number.isFinite(inverseNormalCdf(0))).toBe(true);
    expect(Number.isFinite(inverseNormalCdf(1))).toBe(true);
  });
});

describe("correlationLoadings", () => {
  it("is zero for a single position", () => {
    expect(correlationLoadings([position({ id: "a" })])).toEqual([0]);
  });

  it("loads same-game positions far higher than unrelated sports", () => {
    const sameGame = correlationLoadings([
      position({ id: "a", gameId: "g1" }),
      position({ id: "b", gameId: "g1" }),
    ]);
    const crossSport = correlationLoadings([
      position({ id: "a", gameId: "g1", sport: "nba", sportLabel: "NBA" }),
      position({ id: "b", gameId: "g2", sport: "nfl", sportLabel: "NFL" }),
    ]);

    expect(sameGame[0]).toBeGreaterThan(crossSport[0]);
  });
});

describe("simulateSlate", () => {
  const slate = [
    position({ id: "a", gameId: "g1", sport: "nba", sportLabel: "NBA" }),
    position({ id: "b", gameId: "g2", sport: "nfl", sportLabel: "NFL" }),
    position({ id: "c", gameId: "g3", sport: "mlb", sportLabel: "MLB" }),
  ];

  it("is deterministic for a given seed", () => {
    const first = simulateSlate({ positions: slate, bankroll: 1000, days: 20, paths: 500, seed: 7 });
    const second = simulateSlate({ positions: slate, bankroll: 1000, days: 20, paths: 500, seed: 7 });

    expect(first.p50).toBe(second.p50);
    expect(first.probProfitPct).toBe(second.probProfitPct);
    expect(first.riskOfRuinPct).toBe(second.riskOfRuinPct);
  });

  it("orders the quantiles and centres them near the mean", () => {
    const result = simulateSlate({ positions: slate, bankroll: 1000, days: 20, paths: 1000, seed: 11 });

    expect(result.p5).toBeLessThanOrEqual(result.p25);
    expect(result.p25).toBeLessThanOrEqual(result.p50);
    expect(result.p50).toBeLessThanOrEqual(result.p75);
    expect(result.p75).toBeLessThanOrEqual(result.p95);
    expect(result.meanEnding).toBeGreaterThan(result.p5);
    expect(result.meanEnding).toBeLessThan(result.p95);
  });

  it("grows a +EV slate and shrinks a -EV one", () => {
    const good = simulateSlate({ positions: slate, bankroll: 1000, days: 40, paths: 1500, seed: 3 });
    const bad = simulateSlate({
      positions: slate.map((entry) => ({ ...entry, modelProb: 0.4 })),
      bankroll: 1000,
      days: 40,
      paths: 1500,
      seed: 3,
    });

    expect(good.dailyEv).toBeGreaterThan(0);
    expect(bad.dailyEv).toBeLessThan(0);
    expect(good.p50).toBeGreaterThan(bad.p50);
    expect(good.probProfitPct).toBeGreaterThan(bad.probProfitPct);
  });

  it("widens the distribution when the slate is correlated", () => {
    const independent = simulateSlate({
      positions: [
        position({ id: "a", gameId: "g1", sport: "nba", sportLabel: "NBA" }),
        position({ id: "b", gameId: "g2", sport: "nfl", sportLabel: "NFL" }),
        position({ id: "c", gameId: "g3", sport: "mlb", sportLabel: "MLB" }),
      ],
      bankroll: 1000,
      days: 30,
      paths: 3000,
      seed: 21,
    });
    const correlated = simulateSlate({
      positions: [
        position({ id: "a", gameId: "g1" }),
        position({ id: "b", gameId: "g1" }),
        position({ id: "c", gameId: "g1" }),
      ],
      bankroll: 1000,
      days: 30,
      paths: 3000,
      seed: 21,
    });

    expect(correlated.avgCorrelation).toBeGreaterThan(independent.avgCorrelation);
    // Bets that lose together produce a wider spread of outcomes.
    expect(correlated.p95 - correlated.p5).toBeGreaterThan(independent.p95 - independent.p5);
    expect(correlated.medianMaxDrawdownPct).toBeGreaterThan(independent.medianMaxDrawdownPct);
  });

  it("flags ruin when the stakes are far too big for the bankroll", () => {
    const oversized = slate.map((entry) => ({ ...entry, stake: 300, modelProb: 0.45 }));
    const result = simulateSlate({ positions: oversized, bankroll: 1000, days: 60, paths: 800, seed: 5 });

    expect(result.riskOfRuinPct).toBeGreaterThan(1);
    expect(result.headline).toContain("wiped out");
  });

  it("reports the nightly stake and expected value", () => {
    const result = simulateSlate({ positions: slate, bankroll: 1000, days: 10, paths: 300, seed: 9 });

    expect(result.dailyStake).toBeCloseTo(60, 6);
    // Three $20 bets at 55% on even money.
    expect(result.dailyEv).toBeCloseTo(6, 6);
    expect(result.positions).toBe(3);
  });

  it("reports the same rounded numbers in the headline and the fields", () => {
    const result = simulateSlate({ positions: slate, bankroll: 1000, days: 25, paths: 1000, seed: 42 });

    // The badge renders probProfitPct.toFixed(0); the headline must not round
    // a second time off a different value and disagree with it.
    expect(result.headline).toContain(`${result.probProfitPct.toFixed(0)}% of paths finish ahead`);
    expect(result.headline).toContain(`${result.medianMaxDrawdownPct.toFixed(0)}%`);
  });

  it("returns an empty result rather than NaN with nothing to simulate", () => {
    expect(simulateSlate({ positions: [], bankroll: 1000 }).paths).toBe(0);
    expect(simulateSlate({ positions: slate, bankroll: 0 }).headline).toContain("No sized positions");
    expect(simulateSlate({ positions: slate.map((p) => ({ ...p, stake: 0 })), bankroll: 1000 }).paths).toBe(0);
  });
});
