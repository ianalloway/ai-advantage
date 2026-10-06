import { describe, expect, it } from "vitest";
import { probToSpread } from "./spreadTranslation";
import { probToAmericanOdds } from "./devig";
import {
  ALIGNED_TOLERANCE_PTS,
  checkMarketConsistency,
  formatConsistencyVerdict,
} from "./marketConsistency";

/** A fair two-way moneyline for a given home probability, with a symmetric hold. */
function moneylineFor(homeProb: number, holdPct = 0.045) {
  const inflate = 1 + holdPct;
  return {
    homeMoneyline: probToAmericanOdds(Math.min(homeProb * inflate, 0.98)),
    awayMoneyline: probToAmericanOdds(Math.min((1 - homeProb) * inflate, 0.98)),
  };
}

describe("checkMarketConsistency", () => {
  it("calls a market aligned when the spread matches the moneyline", () => {
    const homeProb = 0.65;
    // The spread a book would post for this probability.
    const homeSpread = -probToSpread(homeProb, "nba");

    const result = checkMarketConsistency({ sport: "nba", ...moneylineFor(homeProb), homeSpread });

    expect(result.applicable).toBe(true);
    expect(Math.abs(result.gapPts)).toBeLessThanOrEqual(ALIGNED_TOLERANCE_PTS);
    expect(result.verdict).toBe("aligned");
  });

  it("flags the moneyline as the cheaper number when the spread is more bullish", () => {
    const homeProb = 0.55;
    // The spread makes them a 3-point favourite; the moneyline only 55%.
    const result = checkMarketConsistency({ sport: "nba", ...moneylineFor(homeProb), homeSpread: -3 });

    expect(result.gapPts).toBeLessThan(0);
    expect(result.verdict).toBe("moneyline-longer");
    expect(result.note).toContain("home moneyline is the cheaper");
  });

  it("flags the spread as the cheaper number when the moneyline is more bullish", () => {
    const homeProb = 0.68;
    const result = checkMarketConsistency({ sport: "nba", ...moneylineFor(homeProb), homeSpread: -3 });

    expect(result.gapPts).toBeGreaterThan(0);
    expect(result.verdict).toBe("spread-longer");
    expect(result.note).toContain("spread is the cheaper");
  });

  it("calls a wild disagreement stale data rather than an edge", () => {
    const result = checkMarketConsistency({ sport: "nba", ...moneylineFor(0.75), homeSpread: 7 });

    expect(result.verdict).toBe("contradictory");
    expect(result.note).toContain("stale");
  });

  it("reports the spread the moneyline is really quoting", () => {
    const homeProb = 0.65;
    const result = checkMarketConsistency({ sport: "nba", ...moneylineFor(homeProb), homeSpread: -4.5 });

    // Posted in book convention: negative when the home side lays points.
    expect(result.moneylineImpliedSpread).toBeLessThan(0);
    expect(result.moneylineImpliedSpread).toBeGreaterThan(-8);
  });

  it("uses the sport's own scoring scale", () => {
    const homeProb = 0.6;
    const nba = checkMarketConsistency({ sport: "nba", ...moneylineFor(homeProb), homeSpread: -3 });
    const mlb = checkMarketConsistency({ sport: "mlb", ...moneylineFor(homeProb), homeSpread: -3 });

    // Three runs is a far bigger edge than three points, so the same spread
    // against the same moneyline reads very differently.
    expect(mlb.spreadHomeProb).toBeGreaterThan(nba.spreadHomeProb);
  });

  it("declines a three-way market", () => {
    const result = checkMarketConsistency({ sport: "wc", homeMoneyline: 120, awayMoneyline: 240, homeSpread: -0.5 });

    expect(result.applicable).toBe(false);
    expect(result.note).toContain("three-way");
  });

  it("declines without both moneyline sides or a spread", () => {
    expect(checkMarketConsistency({ sport: "nba", homeMoneyline: -150, awayMoneyline: 0, homeSpread: -3 }).applicable).toBe(false);
    expect(checkMarketConsistency({ sport: "nba", homeMoneyline: -150, awayMoneyline: 130 }).applicable).toBe(false);
    expect(
      checkMarketConsistency({ sport: "nba", homeMoneyline: -150, awayMoneyline: 130, homeSpread: Number.NaN }).applicable,
    ).toBe(false);
  });

  it("strips the vig before comparing, so hold alone never looks like disagreement", () => {
    const homeProb = 0.6;
    const homeSpread = -probToSpread(homeProb, "nfl");

    const thin = checkMarketConsistency({ sport: "nfl", ...moneylineFor(homeProb, 0.02), homeSpread });
    const fat = checkMarketConsistency({ sport: "nfl", ...moneylineFor(homeProb, 0.09), homeSpread });

    expect(thin.verdict).toBe("aligned");
    expect(fat.verdict).toBe("aligned");
    expect(Math.abs(thin.gapPts - fat.gapPts)).toBeLessThan(1);
  });
});

describe("formatConsistencyVerdict", () => {
  it("labels each verdict", () => {
    expect(formatConsistencyVerdict("aligned")).toBe("Markets agree");
    expect(formatConsistencyVerdict("moneyline-longer")).toBe("ML is cheaper");
    expect(formatConsistencyVerdict("spread-longer")).toBe("Spread is cheaper");
    expect(formatConsistencyVerdict("contradictory")).toBe("Numbers disagree");
    expect(formatConsistencyVerdict("unavailable")).toBe("Not comparable");
  });
});
