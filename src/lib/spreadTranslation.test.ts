import { describe, expect, it } from "vitest";
import {
  formatLine,
  normalCdf,
  probToSpread,
  spreadToProb,
  translateEdgeToPoints,
  SPORT_MARGIN_SD,
} from "./spreadTranslation";

describe("normalCdf", () => {
  it("matches known values of the standard normal", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 4);
    expect(normalCdf(1)).toBeCloseTo(0.841345, 4);
  });

  it("is symmetric about zero", () => {
    expect(normalCdf(0.7) + normalCdf(-0.7)).toBeCloseTo(1, 6);
  });
});

describe("probToSpread / spreadToProb", () => {
  it("round-trips a probability through the margin and back", () => {
    for (const prob of [0.35, 0.5, 0.62, 0.8]) {
      expect(spreadToProb(probToSpread(prob, "nba"), "nba")).toBeCloseTo(prob, 4);
    }
  });

  it("puts a coin flip at a pick-em", () => {
    expect(probToSpread(0.5, "nfl")).toBeCloseTo(0, 6);
  });

  it("gives the same probability a bigger margin in a higher-scoring sport", () => {
    // 62% is worth more points in the NFL than runs in baseball.
    expect(probToSpread(0.62, "nfl")).toBeGreaterThan(probToSpread(0.62, "mlb"));
    expect(SPORT_MARGIN_SD.nfl).toBeGreaterThan(SPORT_MARGIN_SD.mlb);
  });

  it("produces a recognisable NBA line", () => {
    // A 65% favourite is roughly a 4 to 5 point favourite in the NBA.
    const points = probToSpread(0.65, "nba");
    expect(points).toBeGreaterThan(3.5);
    expect(points).toBeLessThan(5.5);
  });

  it("stays finite at the extremes", () => {
    expect(Number.isFinite(probToSpread(0, "nba"))).toBe(true);
    expect(Number.isFinite(probToSpread(1, "nba"))).toBe(true);
  });
});

describe("translateEdgeToPoints", () => {
  it("shows the model's line beside the price's break-even line", () => {
    const result = translateEdgeToPoints({ modelProb: 0.62, americanOdds: -130, sport: "nba" });

    expect(result.applicable).toBe(true);
    expect(result.modelPoints).toBeGreaterThan(result.breakevenPoints);
    expect(result.marginOfSafetyPoints).toBeCloseTo(result.modelPoints - result.breakevenPoints, 1);
    expect(result.unit).toBe("pts");
  });

  it("measures disagreement against the fair line when one is known", () => {
    const result = translateEdgeToPoints({
      modelProb: 0.62,
      americanOdds: -130,
      sport: "nba",
      fairProb: 0.55,
    });

    expect(result.marketPoints).toBeDefined();
    expect(result.disagreementPoints!).toBeGreaterThan(0);
    // Disagreement against the fair line exceeds the margin of safety, because
    // the vig sits between the fair line and the price on offer.
    expect(result.disagreementPoints!).toBeGreaterThan(result.marginOfSafetyPoints);
  });

  it("reports no room when the price asks for more than the model gives", () => {
    const result = translateEdgeToPoints({ modelProb: 0.52, americanOdds: -200, sport: "nfl" });

    expect(result.marginOfSafetyPoints).toBeLessThan(0);
    expect(result.note).toContain("no room for the model to be wrong");
  });

  it("warns when the margin of safety is razor thin", () => {
    const result = translateEdgeToPoints({ modelProb: 0.53, americanOdds: -110, sport: "nba" });

    expect(result.marginOfSafetyPoints).toBeGreaterThan(0);
    expect(result.marginOfSafetyPoints).toBeLessThan(0.5);
    expect(result.note).toContain("single injury erases it");
  });

  it("refuses to translate a three-way market", () => {
    const result = translateEdgeToPoints({ modelProb: 0.45, americanOdds: 130, sport: "wc" });

    expect(result.applicable).toBe(false);
    expect(result.note).toContain("draw");
  });

  it("refuses an unusable price or probability", () => {
    expect(translateEdgeToPoints({ modelProb: 0.6, americanOdds: 0, sport: "nba" }).applicable).toBe(false);
    expect(translateEdgeToPoints({ modelProb: 0, americanOdds: -110, sport: "nba" }).applicable).toBe(false);
    expect(translateEdgeToPoints({ modelProb: 1, americanOdds: -110, sport: "nba" }).applicable).toBe(false);
  });

  it("uses the sport's own scoring unit", () => {
    expect(translateEdgeToPoints({ modelProb: 0.6, americanOdds: -120, sport: "mlb" }).unit).toBe("runs");
  });
});

describe("formatLine", () => {
  it("prints a favourite as a negative number and a dog as positive", () => {
    expect(formatLine(4.5)).toBe("-4.5");
    expect(formatLine(-3.2)).toBe("+3.2");
  });

  it("prints a pick-em", () => {
    expect(formatLine(0)).toBe("PK");
    expect(formatLine(0.01)).toBe("PK");
  });
});
