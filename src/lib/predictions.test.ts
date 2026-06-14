import { describe, it, expect } from "vitest";
import {
  americanToDecimal,
  americanToImpliedProb,
  kellyCriterion,
  calculateEdge,
  calculateExecutionAdjustedEdge,
  predictSoccer,
  getWorldCupRating,
} from "./predictions";

describe("odds conversions", () => {
  it("converts american odds to decimal", () => {
    expect(americanToDecimal(100)).toBeCloseTo(2.0, 10);
    expect(americanToDecimal(-110)).toBeCloseTo(1.9090909, 6);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 10);
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 10);
  });

  it("derives implied probability (the -110 ≈ 52.38% benchmark)", () => {
    expect(americanToImpliedProb(-110) * 100).toBeCloseTo(52.38, 2);
    expect(americanToImpliedProb(100)).toBeCloseTo(0.5, 10);
    expect(americanToImpliedProb(200)).toBeCloseTo(1 / 3, 6);
    expect(americanToImpliedProb(-200)).toBeCloseTo(2 / 3, 6);
  });

  it("round-trips a fair coin flip to ~50%", () => {
    expect(americanToImpliedProb(americanToDecimal(100) > 0 ? 100 : 100)).toBeCloseTo(0.5, 10);
  });
});

describe("kellyCriterion", () => {
  it("matches the closed-form edge/odds formula", () => {
    // p=0.55, decimal 2.0 (b=1): (b*p - q)/b = 0.10 at full Kelly
    expect(kellyCriterion(0.55, 2.0, 1)).toBeCloseTo(0.1, 10);
  });

  it("scales linearly with the fraction, so quarter-Kelly ≤ full Kelly", () => {
    const full = kellyCriterion(0.6, 2.0, 1);
    const quarter = kellyCriterion(0.6, 2.0, 0.25);
    expect(quarter).toBeCloseTo(full * 0.25, 10);
    expect(quarter).toBeLessThanOrEqual(full);
  });

  it("never recommends a negative stake when there is no edge", () => {
    expect(kellyCriterion(0.5, 2.0)).toBe(0); // exactly fair
    expect(kellyCriterion(0.4, 2.0)).toBe(0); // model below the line
  });

  it("clamps the stake to at most the full bankroll", () => {
    expect(kellyCriterion(0.999, 100, 1)).toBeLessThanOrEqual(1);
  });
});

describe("calculateEdge", () => {
  it("is the model-minus-implied gap in percentage points", () => {
    expect(calculateEdge(0.6, 0.5238)).toBeCloseTo(7.62, 2);
    expect(calculateEdge(0.5, 0.5)).toBe(0);
    expect(calculateEdge(0.45, 0.55)).toBeCloseTo(-10, 6);
  });
});

describe("calculateExecutionAdjustedEdge", () => {
  it("keeps the adjusted edge inside the ±25 clamp even for absurd raw edges", () => {
    const hot = calculateExecutionAdjustedEdge({ sport: "nba", modelProb: 0.7, rawEdge: 100, currentOdds: -110 });
    expect(hot.adjustedEdge).toBeLessThanOrEqual(25);
    const cold = calculateExecutionAdjustedEdge({ sport: "nba", modelProb: 0.2, rawEdge: -100, currentOdds: 200 });
    expect(cold.adjustedEdge).toBeGreaterThanOrEqual(-25);
  });

  it("returns the execution factor breakdown", () => {
    const { factors } = calculateExecutionAdjustedEdge({ sport: "nfl", modelProb: 0.6, rawEdge: 5, currentOdds: -120 });
    expect(factors.executionWindow).toBeTypeOf("string");
    expect(Number.isFinite(factors.calibrationFactor)).toBe(true);
  });
});

describe("predictSoccer (World Cup 3-way model)", () => {
  it("returns a proper probability distribution that sums to 1", () => {
    const m = predictSoccer(getWorldCupRating("Brazil"), getWorldCupRating("Morocco"));
    expect(m.homeProb + m.drawProb + m.awayProb).toBeCloseTo(1, 9);
    for (const p of [m.homeProb, m.drawProb, m.awayProb]) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("favors the stronger side and respects home advantage at equal ratings", () => {
    const strong = predictSoccer(getWorldCupRating("Argentina"), getWorldCupRating("Haiti"));
    expect(strong.homeProb).toBeGreaterThan(strong.awayProb);
    expect(strong.homeProb).toBeGreaterThan(0.5);

    const even = predictSoccer(1800, 1800);
    expect(even.homeProb).toBeGreaterThan(even.awayProb); // home edge
  });

  it("falls back to the default rating for unknown nations (no fabricated gap)", () => {
    const m = predictSoccer(getWorldCupRating("Wakanda"), getWorldCupRating("Atlantis"));
    // Two unknowns ⇒ only the home-advantage tilt separates them.
    expect(Math.abs(m.homeProb - m.awayProb)).toBeLessThan(0.15);
  });
});
