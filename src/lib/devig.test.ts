import { describe, expect, it } from "vitest";
import {
  decomposeEdge,
  devigMarket,
  expectedValuePerDollar,
  findFairOutcome,
  noVigEdge,
  probToAmericanOdds,
} from "./devig";

describe("probToAmericanOdds", () => {
  it("round-trips a fair coin flip to -100", () => {
    expect(probToAmericanOdds(0.5)).toBe(-100);
  });

  it("returns a plus price for underdogs and a minus price for favourites", () => {
    expect(probToAmericanOdds(0.25)).toBe(300);
    expect(probToAmericanOdds(0.8)).toBe(-400);
  });
});

describe("devigMarket", () => {
  it("removes the margin so fair probabilities sum to one", () => {
    const result = devigMarket([
      { label: "Home", americanOdds: -110 },
      { label: "Away", americanOdds: -110 },
    ]);

    const total = result.outcomes.reduce((sum, outcome) => sum + outcome.fairProb, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(result.outcomes[0].fairProb).toBeCloseTo(0.5, 10);
  });

  it("reports overround, vig, and hold on a standard -110/-110 market", () => {
    const result = devigMarket([
      { label: "Home", americanOdds: -110 },
      { label: "Away", americanOdds: -110 },
    ]);

    expect(result.overround).toBeCloseTo(1.0476, 4);
    expect(result.vigPct).toBeCloseTo(4.76, 2);
    expect(result.holdPct).toBeCloseTo(4.55, 2);
  });

  it("prices the fair line longer than the posted line", () => {
    const result = devigMarket([
      { label: "Home", americanOdds: -150 },
      { label: "Away", americanOdds: 130 },
    ]);

    const home = findFairOutcome(result, "Home");
    expect(home).toBeDefined();
    expect(home!.fairProb).toBeLessThan(home!.impliedProb);
    expect(home!.vigPts).toBeGreaterThan(0);
  });

  it("handles a three-way soccer market", () => {
    const result = devigMarket([
      { label: "Home", americanOdds: 120 },
      { label: "Draw", americanOdds: 240 },
      { label: "Away", americanOdds: 260 },
    ]);

    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes.reduce((sum, o) => sum + o.fairProb, 0)).toBeCloseTo(1, 10);
    expect(result.holdPct).toBeGreaterThan(0);
  });

  it("power de-vigging also normalises, and shades differently to multiplicative", () => {
    const prices = [
      { label: "Home", americanOdds: -300 },
      { label: "Away", americanOdds: 240 },
    ];
    const power = devigMarket(prices, "power");
    const multiplicative = devigMarket(prices, "multiplicative");

    expect(power.outcomes.reduce((sum, o) => sum + o.fairProb, 0)).toBeCloseTo(1, 8);
    expect(power.outcomes[0].fairProb).not.toBeCloseTo(multiplicative.outcomes[0].fairProb, 4);
  });

  /**
   * The two assertions above both pass while the exponent solver is broken:
   * fairProb is normalised by dividing through the sum whatever k comes out, so
   * it always totals 1, and a collapse to a uniform 1/n "shades differently"
   * from multiplicative too. The property that actually pins k down is the one
   * the solver is defined by — sum(impliedProb ^ k) === 1 — so assert that
   * directly, plus the ordering it has to preserve.
   */
  it.each([
    { name: "2-way with a heavy favourite", prices: [
      { label: "Home", americanOdds: -300 },
      { label: "Away", americanOdds: 250 },
    ] },
    { name: "2-way near pick'em", prices: [
      { label: "Home", americanOdds: -110 },
      { label: "Away", americanOdds: -110 },
    ] },
    { name: "3-way soccer", prices: [
      { label: "Home", americanOdds: -125 },
      { label: "Draw", americanOdds: 240 },
      { label: "Away", americanOdds: 260 },
    ] },
    { name: "long-odds longshot", prices: [
      { label: "Home", americanOdds: -2000 },
      { label: "Away", americanOdds: 1200 },
    ] },
  ])("power de-vigging solves sum(p^k) = 1 for a $name", ({ prices }) => {
    const result = devigMarket(prices, "power");
    expect(result.outcomes).toHaveLength(prices.length);

    // Recover k from any one outcome: fairProb = p^k / sum(p^k) and sum(p^k) = 1,
    // so k = ln(fairProb) / ln(impliedProb).
    const first = result.outcomes[0];
    const k = Math.log(first.fairProb) / Math.log(first.impliedProb);
    expect(k).toBeGreaterThanOrEqual(1);

    const sumAtK = result.outcomes.reduce((sum, o) => sum + Math.pow(o.impliedProb, k), 0);
    expect(sumAtK).toBeCloseTo(1, 6);

    // A de-vig strips margin; it must not reorder the book or invent probability.
    const impliedOrder = [...result.outcomes].sort((a, b) => b.impliedProb - a.impliedProb).map((o) => o.label);
    const fairOrder = [...result.outcomes].sort((a, b) => b.fairProb - a.fairProb).map((o) => o.label);
    expect(fairOrder).toEqual(impliedOrder);
    for (const outcome of result.outcomes) {
      expect(outcome.fairProb).toBeGreaterThan(0);
      expect(outcome.fairProb).toBeLessThan(1);
    }
  });

  it("does not flatten a lopsided market toward a uniform guess", () => {
    // The broken solver returned k ~ 0.0001, which drives every p^k to 1 and
    // hands back 1/n per outcome: a -300 favourite priced at 50%.
    const power = devigMarket(
      [
        { label: "Home", americanOdds: -300 },
        { label: "Away", americanOdds: 250 },
      ],
      "power",
    );
    const favourite = findFairOutcome(power, "Home");

    expect(favourite?.fairProb).toBeGreaterThan(0.7);
    expect(favourite?.fairProb).not.toBeCloseTo(0.5, 2);
  });

  it("returns an empty result when the market is incomplete or junk", () => {
    expect(devigMarket([{ label: "Home", americanOdds: -110 }]).outcomes).toHaveLength(0);
    expect(
      devigMarket([
        { label: "Home", americanOdds: 0 },
        { label: "Away", americanOdds: Number.NaN },
      ]).outcomes,
    ).toHaveLength(0);
  });
});

describe("noVigEdge", () => {
  it("measures disagreement with the fair line, which runs ahead of edge over the posted price", () => {
    const result = devigMarket([
      { label: "Home", americanOdds: -110 },
      { label: "Away", americanOdds: -110 },
    ]);
    const home = findFairOutcome(result, "Home")!;
    const modelProb = 0.56;

    const edgeOverPostedPrice = (modelProb - home.impliedProb) * 100;
    const disagreement = noVigEdge(modelProb, home.fairProb);

    expect(disagreement).toBeGreaterThan(edgeOverPostedPrice);
    expect(disagreement).toBeCloseTo(6, 6);
  });
});

describe("decomposeEdge", () => {
  it("splits disagreement into vig and the edge that actually survives it", () => {
    const result = devigMarket([
      { label: "Home", americanOdds: -110 },
      { label: "Away", americanOdds: -110 },
    ]);
    const home = findFairOutcome(result, "Home")!;
    const decomposition = decomposeEdge(0.56, home);

    expect(decomposition.disagreementPts).toBeCloseTo(6, 6);
    expect(decomposition.vigPts).toBeCloseTo(2.38, 2);
    // Net edge is exactly edge against the posted price.
    expect(decomposition.netEdgePts).toBeCloseTo((0.56 - home.impliedProb) * 100, 8);
    expect(decomposition.clearsVig).toBe(true);
  });

  it("flags a disagreement too small to pay for the hold", () => {
    const result = devigMarket([
      { label: "Home", americanOdds: -110 },
      { label: "Away", americanOdds: -110 },
    ]);
    const home = findFairOutcome(result, "Home")!;
    const decomposition = decomposeEdge(0.515, home);

    expect(decomposition.disagreementPts).toBeGreaterThan(0);
    expect(decomposition.netEdgePts).toBeLessThan(0);
    expect(decomposition.clearsVig).toBe(false);
  });
});

describe("expectedValuePerDollar", () => {
  it("is zero at a fair price", () => {
    expect(expectedValuePerDollar(0.5, 100)).toBeCloseTo(0, 10);
  });

  it("is negative when the model agrees with a vigged price", () => {
    expect(expectedValuePerDollar(0.5, -110)).toBeLessThan(0);
  });

  it("is zero for an unusable price", () => {
    expect(expectedValuePerDollar(0.6, 0)).toBe(0);
  });
});
