import { describe, expect, it } from "vitest";
import { buildCalibrationReport, type CalibrationSample } from "./calibration";
import { calibrationGapFor, sizeWithCalibration } from "./calibratedSizing";

function samples(predictedProb: number, count: number, winRate: number): CalibrationSample[] {
  const wins = Math.round(count * winRate);
  return Array.from({ length: count }, (_, index) => ({ predictedProb, won: index < wins }));
}

// A model that says 65% in the 60–80% band but only wins 50% there.
const hotReport = buildCalibrationReport(samples(0.65, 60, 0.5));
// A model whose probabilities have held up.
const honestReport = buildCalibrationReport(samples(0.65, 60, 0.65));

describe("calibrationGapFor", () => {
  it("uses the gap measured in the probability's own band", () => {
    const { gapPts, confidence } = calibrationGapFor(0.65, hotReport);

    expect(confidence).toBe("measured");
    expect(gapPts).toBeCloseTo(15, 0);
  });

  it("falls back to the overall bias for a thinly-sampled band", () => {
    const { gapPts, confidence } = calibrationGapFor(0.95, hotReport);

    expect(confidence).toBe("provisional");
    expect(gapPts).toBeCloseTo(hotReport.biasPts, 6);
  });

  it("applies no correction until enough bets have settled", () => {
    const thin = buildCalibrationReport(samples(0.7, 4, 0.25));
    const { gapPts, confidence } = calibrationGapFor(0.7, thin);

    expect(confidence).toBe("unmeasured");
    expect(gapPts).toBe(0);
  });

  it("applies no correction when there is no report at all", () => {
    expect(calibrationGapFor(0.6, null).confidence).toBe("unmeasured");
    expect(calibrationGapFor(0.6, undefined).gapPts).toBe(0);
  });
});

describe("sizeWithCalibration", () => {
  const base = { americanOdds: -110, bankroll: 1000, kellyFraction: 0.25 };

  it("cuts the stake when the model has been running hot", () => {
    // A long enough price that the bet survives the correction and can still be sized.
    const sizing = sizeWithCalibration({ ...base, americanOdds: 200, modelProb: 0.65, calibration: hotReport });

    expect(sizing.calibratedProb).toBeLessThan(sizing.rawProb);
    expect(sizing.shrinkPts).toBeCloseTo(15, 0);
    expect(sizing.calibratedStake).toBeLessThan(sizing.rawStake);
    expect(sizing.stakeDeltaPct).toBeLessThan(0);
    expect(sizing.note).toContain("running hot");
  });

  it("kills the bet when the edge does not survive the correction", () => {
    const sizing = sizeWithCalibration({ ...base, modelProb: 0.65, calibration: hotReport });

    // 65% corrected to 50% no longer clears a -110 price.
    expect(sizing.stillPositive).toBe(false);
    expect(sizing.calibratedKellyPct).toBe(0);
    expect(sizing.calibratedStake).toBe(0);
    expect(sizing.note).toContain("confidence, not proven skill");
  });

  it("leaves a well-calibrated model's stake alone", () => {
    const sizing = sizeWithCalibration({ ...base, modelProb: 0.65, calibration: honestReport });

    expect(sizing.shrinkPts).toBeCloseTo(0, 1);
    expect(sizing.calibratedStake).toBeCloseTo(sizing.rawStake, 2);
    expect(sizing.stillPositive).toBe(true);
  });

  it("raises the stake for a model that has been running cold", () => {
    const coldReport = buildCalibrationReport(samples(0.55, 60, 0.7));
    const sizing = sizeWithCalibration({ ...base, modelProb: 0.55, calibration: coldReport });

    expect(sizing.calibratedProb).toBeGreaterThan(sizing.rawProb);
    expect(sizing.shrinkPts).toBeLessThan(0);
    expect(sizing.calibratedStake).toBeGreaterThan(sizing.rawStake);
    expect(sizing.note).toContain("running cold");
  });

  it("sizes off the raw number when calibration is unmeasured", () => {
    const sizing = sizeWithCalibration({ ...base, modelProb: 0.6, calibration: null });

    expect(sizing.confidence).toBe("unmeasured");
    expect(sizing.calibratedStake).toBeCloseTo(sizing.rawStake, 6);
    expect(sizing.note).toContain("Not enough settled bets");
  });

  it("returns zeroed sizing rather than NaN for an unusable price", () => {
    const sizing = sizeWithCalibration({ ...base, americanOdds: 0, modelProb: 0.6, calibration: hotReport });

    expect(sizing.rawStake).toBe(0);
    expect(sizing.calibratedStake).toBe(0);
    expect(sizing.stakeDeltaPct).toBe(0);
    expect(sizing.stillPositive).toBe(false);
  });

  it("scales the stake with the bankroll", () => {
    const small = sizeWithCalibration({ ...base, modelProb: 0.6, bankroll: 1000, calibration: honestReport });
    const large = sizeWithCalibration({ ...base, modelProb: 0.6, bankroll: 5000, calibration: honestReport });

    expect(large.calibratedStake).toBeCloseTo(small.calibratedStake * 5, 1);
  });
});
