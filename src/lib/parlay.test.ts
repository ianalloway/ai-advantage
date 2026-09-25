import { describe, expect, it } from "vitest";
import {
  formatParlayVerdict,
  jointProbability,
  kellyGrowthRate,
  legCorrelation,
  priceParlay,
  type ParlayLeg,
} from "./parlay";

const leg = (overrides: Partial<ParlayLeg> & { id: string }): ParlayLeg => ({
  label: overrides.id,
  americanOdds: -110,
  modelProb: 0.55,
  gameId: `game-${overrides.id}`,
  sport: "nba",
  ...overrides,
});

describe("legCorrelation", () => {
  it("treats legs from the same game as strongly dependent", () => {
    const a = leg({ id: "a", gameId: "g1" });
    const b = leg({ id: "b", gameId: "g1" });
    expect(legCorrelation(a, b)).toBe(0.6);
  });

  it("gives same-sport legs on the same narrative a small correlation", () => {
    const a = leg({ id: "a", gameId: "g1", americanOdds: -150 });
    const b = leg({ id: "b", gameId: "g2", americanOdds: -130 });
    expect(legCorrelation(a, b)).toBe(0.08);
  });

  it("treats different sports as independent", () => {
    const a = leg({ id: "a", gameId: "g1", sport: "nba" });
    const b = leg({ id: "b", gameId: "g2", sport: "nfl" });
    expect(legCorrelation(a, b)).toBe(0);
  });
});

describe("jointProbability", () => {
  it("multiplies independent legs", () => {
    const joint = jointProbability([
      leg({ id: "a", sport: "nba", modelProb: 0.6 }),
      leg({ id: "b", sport: "nfl", modelProb: 0.5 }),
    ]);
    expect(joint).toBeCloseTo(0.3, 10);
  });

  it("lifts correlated same-game legs above the independent product", () => {
    const correlated = jointProbability([
      leg({ id: "a", gameId: "g1", modelProb: 0.6 }),
      leg({ id: "b", gameId: "g1", modelProb: 0.5 }),
    ]);
    expect(correlated).toBeGreaterThan(0.3);
    // Never above the weakest leg — a parlay cannot be likelier than its worst leg.
    expect(correlated).toBeLessThanOrEqual(0.5);
  });

  it("never exceeds the weakest leg across many legs", () => {
    const joint = jointProbability([
      leg({ id: "a", gameId: "g1", modelProb: 0.9 }),
      leg({ id: "b", gameId: "g1", modelProb: 0.8 }),
      leg({ id: "c", gameId: "g1", modelProb: 0.4 }),
    ]);
    expect(joint).toBeLessThanOrEqual(0.4);
  });
});

describe("priceParlay", () => {
  const twoWayLeg = (id: string, sport: string): ParlayLeg => ({
    id,
    label: id,
    americanOdds: -110,
    modelProb: 0.55,
    fairProb: 0.5,
    gameId: `game-${id}`,
    sport,
  });

  it("multiplies the posted prices into the ticket payout", () => {
    const pricing = priceParlay([twoWayLeg("a", "nba"), twoWayLeg("b", "nfl")]);
    // 1.909... squared
    expect(pricing.decimalOdds).toBeCloseTo(3.6446, 3);
    expect(pricing.legs).toBe(2);
  });

  it("compounds the hold across legs", () => {
    const two = priceParlay([twoWayLeg("a", "nba"), twoWayLeg("b", "nfl")]);
    const three = priceParlay([twoWayLeg("a", "nba"), twoWayLeg("b", "nfl"), twoWayLeg("c", "mlb")]);

    expect(two.holdPct).toBeCloseTo(8.89, 1);
    expect(three.holdPct).toBeCloseTo(13.0, 1);
    expect(three.holdPct!).toBeGreaterThan(two.holdPct!);
    // Per-leg hold stays at the single-market number however many legs are added.
    expect(three.legHoldPct).toBeCloseTo(4.55, 1);
    expect(two.legHoldPct).toBeCloseTo(4.55, 1);
  });

  it("carries more expected value per dollar than the legs do separately, and still loses on growth", () => {
    const pricing = priceParlay([twoWayLeg("a", "nba"), twoWayLeg("b", "nfl")]);

    // A parlay of independent +EV legs multiplies the edge: EV per dollar goes UP.
    expect(pricing.evPerDollar).toBeGreaterThan(pricing.straightEvPerDollar);
    // Growth is the number that decides, and splitting the stake wins on growth.
    expect(pricing.straightGrowthRate).toBeGreaterThan(pricing.parlayGrowthRate);
    expect(pricing.verdict).toBe("singles-better");
    expect(pricing.rationale).toContain("variance");
  });

  it("says skip when one -EV leg drags the ticket under water", () => {
    const pricing = priceParlay([
      twoWayLeg("a", "nba"),
      twoWayLeg("b", "nfl"),
      { id: "c", label: "c", americanOdds: -110, modelProb: 0.42, fairProb: 0.5, gameId: "game-c", sport: "mlb" },
    ]);

    expect(pricing.evPerDollar).toBeLessThan(0);
    expect(pricing.verdict).toBe("skip");
    expect(pricing.rationale).toContain("compounded hold");
  });

  it("calls a correlated same-game ticket playable when it beats splitting on growth", () => {
    const pricing = priceParlay([
      { id: "a", label: "a", americanOdds: 200, modelProb: 0.6, gameId: "g1", sport: "nba" },
      { id: "b", label: "b", americanOdds: 200, modelProb: 0.6, gameId: "g1", sport: "nba" },
    ]);

    expect(pricing.correlationLiftPts).toBeGreaterThan(0);
    expect(pricing.parlayGrowthRate).toBeGreaterThan(pricing.straightGrowthRate);
    expect(pricing.verdict).toBe("playable");
  });

  it("reports the correlation lift over the independent product", () => {
    const sameGame = priceParlay([
      { id: "a", label: "a", americanOdds: 120, modelProb: 0.55, gameId: "g1", sport: "nba" },
      { id: "b", label: "b", americanOdds: 140, modelProb: 0.5, gameId: "g1", sport: "nba" },
    ]);

    expect(sameGame.correlationLiftPts).toBeGreaterThan(0);
    expect(sameGame.modelProb).toBeGreaterThan(sameGame.independentModelProb);
  });

  it("sizes the stake with fractional Kelly off the correlated probability", () => {
    const pricing = priceParlay(
      [
        { id: "a", label: "a", americanOdds: 200, modelProb: 0.6, gameId: "g1", sport: "nba" },
        { id: "b", label: "b", americanOdds: 200, modelProb: 0.6, gameId: "g2", sport: "nfl" },
      ],
      { bankroll: 2000, kellyFraction: 0.25 },
    );

    expect(pricing.kellyPct).toBeGreaterThan(0);
    expect(pricing.suggestedStake).toBeCloseTo(pricing.kellyPct * 2000, 1);
  });

  it("leaves hold undefined when a leg has no fair price", () => {
    const pricing = priceParlay([
      twoWayLeg("a", "nba"),
      { id: "b", label: "b", americanOdds: -110, modelProb: 0.55, gameId: "g2", sport: "nfl" },
    ]);

    expect(pricing.holdPct).toBeUndefined();
    expect(pricing.fairProb).toBeUndefined();
    expect(pricing.evPerDollar).not.toBe(0);
  });

  it("refuses a ticket with fewer than two usable legs", () => {
    expect(priceParlay([]).verdict).toBe("unavailable");
    expect(priceParlay([twoWayLeg("a", "nba")]).verdict).toBe("unavailable");
    expect(
      priceParlay([twoWayLeg("a", "nba"), { id: "b", label: "b", americanOdds: 0, modelProb: 0.5 }]).verdict,
    ).toBe("unavailable");
  });
});

describe("kellyGrowthRate", () => {
  it("is positive for a +EV price and zero once the edge is gone", () => {
    expect(kellyGrowthRate(0.55, 1.9091, 0.25)).toBeGreaterThan(0);
    expect(kellyGrowthRate(0.5, 1.9091, 0.25)).toBe(0);
    expect(kellyGrowthRate(0.4, 1.9091, 0.25)).toBe(0);
  });

  it("returns zero rather than NaN for an unusable price", () => {
    expect(kellyGrowthRate(0.6, 1, 0.25)).toBe(0);
  });
});

describe("formatParlayVerdict", () => {
  it("labels each verdict", () => {
    expect(formatParlayVerdict("playable")).toBe("Playable");
    expect(formatParlayVerdict("singles-better")).toBe("Singles better");
    expect(formatParlayVerdict("skip")).toBe("Skip");
    expect(formatParlayVerdict("unavailable")).toBe("Add legs");
  });
});
