import { describe, expect, it } from "vitest";
import {
  buildCalibrationReport,
  calibrationSamplesFromLedger,
  type CalibrationSample,
} from "./calibration";

function repeat(predictedProb: number, count: number, winRate: number): CalibrationSample[] {
  const wins = Math.round(count * winRate);
  return Array.from({ length: count }, (_, index) => ({ predictedProb, won: index < wins }));
}

describe("buildCalibrationReport", () => {
  it("calls a model calibrated when predicted and realised rates agree", () => {
    const report = buildCalibrationReport([...repeat(0.6, 50, 0.6), ...repeat(0.4, 50, 0.4)]);

    expect(report.sample).toBe(100);
    expect(report.verdict).toBe("calibrated");
    expect(Math.abs(report.biasPts)).toBeLessThan(3);
  });

  it("flags an overconfident model", () => {
    const report = buildCalibrationReport(repeat(0.7, 60, 0.5));

    expect(report.verdict).toBe("overconfident");
    expect(report.biasPts).toBeCloseTo(20, 0);
    expect(report.headline).toContain("hot");
  });

  it("flags an underconfident model", () => {
    const report = buildCalibrationReport(repeat(0.5, 60, 0.7));

    expect(report.verdict).toBe("underconfident");
    expect(report.biasPts).toBeCloseTo(-20, 0);
    expect(report.headline).toContain("cold");
  });

  it("withholds a verdict below the minimum sample", () => {
    const report = buildCalibrationReport(repeat(0.9, 5, 0.2));

    expect(report.verdict).toBe("insufficient");
    expect(report.headline).toContain("5 settled bets");
  });

  it("scores a perfect forecaster at Brier 0 and an inverted one at 1", () => {
    const perfect = buildCalibrationReport([
      { predictedProb: 1, won: true },
      { predictedProb: 0, won: false },
    ]);
    const inverted = buildCalibrationReport([
      { predictedProb: 0, won: true },
      { predictedProb: 1, won: false },
    ]);

    expect(perfect.brierScore).toBe(0);
    expect(inverted.brierScore).toBe(1);
  });

  it("scores a coin flip at Brier 0.25", () => {
    const report = buildCalibrationReport(repeat(0.5, 100, 0.5));
    expect(report.brierScore).toBeCloseTo(0.25, 6);
    expect(report.brierSkillScore).toBeCloseTo(0, 6);
  });

  it("keeps log loss finite on a confidently wrong call", () => {
    const report = buildCalibrationReport([{ predictedProb: 1, won: false }]);
    expect(Number.isFinite(report.logLoss)).toBe(true);
    expect(report.logLoss).toBeGreaterThan(0);
  });

  it("buckets predictions and reports the gap per band", () => {
    const report = buildCalibrationReport([...repeat(0.65, 40, 0.5), ...repeat(0.85, 40, 0.9)], {
      buckets: 5,
    });

    const midBucket = report.buckets.find((bucket) => bucket.label === "60–80%");
    const highBucket = report.buckets.find((bucket) => bucket.label === "80–100%");

    expect(midBucket?.count).toBe(40);
    expect(midBucket?.gapPts).toBeCloseTo(15, 0);
    expect(highBucket?.count).toBe(40);
    expect(highBucket?.gapPts).toBeCloseTo(-5, 0);
    expect(report.expectedCalibrationError).toBeCloseTo(10, 0);
  });

  it("puts a probability of exactly 1 in the top bucket", () => {
    const report = buildCalibrationReport([{ predictedProb: 1, won: true }], { buckets: 4 });
    expect(report.buckets[3].count).toBe(1);
  });

  it("drops out-of-range probabilities and counts them as skipped", () => {
    const report = buildCalibrationReport([
      { predictedProb: 0.6, won: true },
      { predictedProb: Number.NaN, won: false },
      { predictedProb: 1.4, won: true },
    ]);

    expect(report.sample).toBe(1);
    expect(report.skipped).toBe(2);
  });

  it("returns an empty report rather than NaN when there is nothing settled", () => {
    const report = buildCalibrationReport([]);

    expect(report.sample).toBe(0);
    expect(report.verdict).toBe("insufficient");
    expect(report.brierScore).toBe(0);
    expect(report.buckets).toHaveLength(5);
  });
});

describe("calibrationSamplesFromLedger", () => {
  it("keeps graded rows and drops pending bets and pushes", () => {
    const samples = calibrationSamplesFromLedger([
      { modelProb: 0.62, ledgerOutcome: "won" },
      { modelProb: 0.55, ledgerOutcome: "lost" },
      { modelProb: 0.51, ledgerOutcome: "push" },
      { modelProb: 0.7, ledgerOutcome: "pending" },
    ]);

    expect(samples).toEqual([
      { predictedProb: 0.62, won: true },
      { predictedProb: 0.55, won: false },
    ]);
  });
});
