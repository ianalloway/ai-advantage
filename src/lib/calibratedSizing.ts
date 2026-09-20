/**
 * Calibration-aware stake sizing.
 *
 * Kelly is only as honest as the probability fed into it. A model that runs six
 * points hot does not lose six points of accuracy — it loses money, because every
 * stake sized off those probabilities is too big. This takes the calibration
 * measured over the graded ledger and corrects the probability *before* sizing,
 * so the desk stakes what it has actually proven rather than what it claims.
 */

import { americanToDecimal, americanToImpliedProb, kellyCriterion } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import type { CalibrationReport } from "@/lib/calibration";

/** How the correction was derived — and therefore how much to trust it. */
export type SizingConfidence = "measured" | "provisional" | "unmeasured";

export interface CalibratedSizingInput {
  modelProb: number;
  americanOdds: number;
  bankroll: number;
  kellyFraction: number;
  calibration?: CalibrationReport | null;
  /** Settled bets needed in the matching band before its own gap is trusted. */
  minBucketSample?: number;
}

export interface CalibratedSizing {
  rawProb: number;
  calibratedProb: number;
  /** Probability points removed (positive) or added (negative) by the correction. */
  shrinkPts: number;
  rawKellyPct: number;
  calibratedKellyPct: number;
  rawStake: number;
  calibratedStake: number;
  /** Change in stake, in percent of the raw stake. */
  stakeDeltaPct: number;
  /** Edge over the posted price after correction, in points. */
  calibratedEdgePts: number;
  /** False when the edge was confidence rather than proven skill. */
  stillPositive: boolean;
  confidence: SizingConfidence;
  note: string;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function clampProb(value: number): number {
  return Math.min(Math.max(value, 0.01), 0.99);
}

/**
 * The correction for one probability: prefer the gap measured in its own band,
 * fall back to the model's overall bias, and apply nothing at all until enough
 * bets have settled to mean something.
 */
export function calibrationGapFor(
  modelProb: number,
  calibration: CalibrationReport | null | undefined,
  minBucketSample = 10,
): { gapPts: number; confidence: SizingConfidence } {
  if (!calibration || calibration.verdict === "insufficient") {
    return { gapPts: 0, confidence: "unmeasured" };
  }

  const bucket = calibration.buckets.find(
    (candidate) =>
      modelProb >= candidate.lower && (modelProb < candidate.upper || candidate.upper >= 1),
  );

  if (bucket && bucket.count >= minBucketSample) {
    return { gapPts: bucket.gapPts, confidence: "measured" };
  }
  return { gapPts: calibration.biasPts, confidence: "provisional" };
}

export function sizeWithCalibration(input: CalibratedSizingInput): CalibratedSizing {
  const rawProb = clampProb(input.modelProb);
  const usablePrice = isValidMoneyline(input.americanOdds);
  const decimal = usablePrice ? americanToDecimal(input.americanOdds) : 0;
  const impliedProb = usablePrice ? americanToImpliedProb(input.americanOdds) : 0;

  const { gapPts, confidence } = calibrationGapFor(rawProb, input.calibration, input.minBucketSample);
  const calibratedProb = clampProb(rawProb - gapPts / 100);

  const rawKellyPct = usablePrice ? kellyCriterion(rawProb, decimal, input.kellyFraction) : 0;
  const calibratedKellyPct = usablePrice ? kellyCriterion(calibratedProb, decimal, input.kellyFraction) : 0;
  const rawStake = rawKellyPct * input.bankroll;
  const calibratedStake = calibratedKellyPct * input.bankroll;
  const calibratedEdgePts = usablePrice ? (calibratedProb - impliedProb) * 100 : 0;

  return {
    rawProb: round(rawProb),
    calibratedProb: round(calibratedProb),
    shrinkPts: round((rawProb - calibratedProb) * 100, 2),
    rawKellyPct: round(rawKellyPct),
    calibratedKellyPct: round(calibratedKellyPct),
    rawStake: round(rawStake, 2),
    calibratedStake: round(calibratedStake, 2),
    stakeDeltaPct: rawStake > 0 ? round(((calibratedStake - rawStake) / rawStake) * 100, 2) : 0,
    calibratedEdgePts: round(calibratedEdgePts, 2),
    stillPositive: calibratedEdgePts > 0,
    confidence,
    note: describeSizing(confidence, gapPts, calibratedEdgePts),
  };
}

export function describeSizing(
  confidence: SizingConfidence,
  gapPts: number,
  calibratedEdgePts: number,
): string {
  if (confidence === "unmeasured") {
    return "Not enough settled bets to correct this probability yet — the stake is sized off the raw model number.";
  }
  if (calibratedEdgePts <= 0) {
    return "Corrected for the model's measured bias, the edge is gone. This was confidence, not proven skill.";
  }
  if (Math.abs(gapPts) < 0.5) {
    return "The model has been honest in this probability band. The stake stands.";
  }
  const band = confidence === "measured" ? "in this probability band" : "across the graded ledger";
  return gapPts > 0
    ? `Trimmed ${gapPts.toFixed(1)} points ${band}, where the model has been running hot.`
    : `Added ${Math.abs(gapPts).toFixed(1)} points ${band}, where the model has been running cold.`;
}
