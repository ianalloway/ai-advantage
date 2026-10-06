/**
 * Where the number is going, fitted on the desk's own archive.
 *
 * The steam lens says which way a line has already moved. The question that
 * actually decides a bet is the next one: does that move keep going into the
 * close, or give itself back? That is not a thing to assert from a rule of
 * thumb — the ledger already stores open, taken and closing prices for every
 * graded row, so this fits the relationship on those rows and refuses to
 * project anything when the archive does not support it.
 */

import { americanToImpliedProb } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { probToAmericanOdds } from "@/lib/devig";

export interface DriftSample {
  openOdds: number;
  nowOdds: number;
  closeOdds: number;
}

export interface DriftFit {
  sample: number;
  /** Points of further move expected per point already moved. Above 0 is momentum. */
  slope: number;
  /** Drift that happens regardless of the move so far, in points. */
  interceptPts: number;
  rSquared: number;
  /** Spread of the fit's errors — the honest width of any projection. */
  residualSdPts: number;
  /** False when the archive is too thin or too noisy to project from. */
  usable: boolean;
  note: string;
}

export type CloseRecommendation = "take-now" | "can-wait" | "no-signal";

export interface CloseProjection {
  /** Points the line is projected to move between now and the close. */
  projectedMovePts: number;
  projectedCloseOdds?: number;
  /** Expected close-line value from taking the price now, in points. */
  expectedClvPts: number;
  lowPts: number;
  highPts: number;
  recommendation: CloseRecommendation;
  rationale: string;
}

export interface DriftFitOptions {
  /** Graded rows with a full open/now/close path needed before fitting. Default 30. */
  minSample?: number;
  /** Fit quality floor. Default 0.05 — low, but not zero. */
  minRSquared?: number;
}

const UNUSABLE = (sample: number, note: string): DriftFit => ({
  sample,
  slope: 0,
  interceptPts: 0,
  rSquared: 0,
  residualSdPts: 0,
  usable: false,
  note,
});

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function pts(odds: number): number {
  return americanToImpliedProb(odds) * 100;
}

/**
 * Least squares of "how much further it moved" on "how much it had already
 * moved", both in implied-probability points.
 */
export function fitCloseDrift(samples: DriftSample[], options: DriftFitOptions = {}): DriftFit {
  const minSample = options.minSample ?? 30;
  const minRSquared = options.minRSquared ?? 0.05;

  const usable = samples.filter(
    (sample) =>
      isValidMoneyline(sample.openOdds) &&
      isValidMoneyline(sample.nowOdds) &&
      isValidMoneyline(sample.closeOdds),
  );

  if (usable.length < minSample) {
    return UNUSABLE(
      usable.length,
      `Only ${usable.length} graded rows carry a full open-to-close path; ${minSample} are needed before a drift fit means anything.`,
    );
  }

  const xs = usable.map((sample) => pts(sample.nowOdds) - pts(sample.openOdds));
  const ys = usable.map((sample) => pts(sample.closeOdds) - pts(sample.nowOdds));
  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  for (let i = 0; i < n; i++) {
    covariance += (xs[i] - meanX) * (ys[i] - meanY);
    varianceX += (xs[i] - meanX) ** 2;
  }

  if (varianceX <= 1e-9) {
    return UNUSABLE(n, "Every archived line moved by the same amount, so there is nothing to fit against.");
  }

  const slope = covariance / varianceX;
  const intercept = meanY - slope * meanX;

  let residualSumSquares = 0;
  let totalSumSquares = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i];
    residualSumSquares += (ys[i] - predicted) ** 2;
    totalSumSquares += (ys[i] - meanY) ** 2;
  }

  const rSquared = totalSumSquares <= 1e-12 ? 0 : 1 - residualSumSquares / totalSumSquares;
  const residualSd = Math.sqrt(residualSumSquares / Math.max(1, n - 2));

  if (rSquared < minRSquared) {
    return {
      sample: n,
      slope: round(slope),
      interceptPts: round(intercept),
      rSquared: round(Math.max(rSquared, 0)),
      residualSdPts: round(residualSd),
      usable: false,
      note: `Fitted over ${n} rows, but the archive explains almost none of the move to the close. Treat the number in front of you as the number.`,
    };
  }

  return {
    sample: n,
    slope: round(slope),
    interceptPts: round(intercept),
    rSquared: round(rSquared),
    residualSdPts: round(residualSd),
    usable: true,
    note:
      slope > 0
        ? `Fitted over ${n} rows: moves have carried on into the close, about ${slope.toFixed(2)} further points per point already moved.`
        : `Fitted over ${n} rows: moves have given back about ${Math.abs(slope).toFixed(2)} points per point moved by the close.`,
  };
}

export function projectClose(
  fit: DriftFit,
  line: { openOdds?: number; nowOdds: number },
): CloseProjection {
  if (!fit.usable || !isValidMoneyline(line.nowOdds) || line.openOdds === undefined || !isValidMoneyline(line.openOdds)) {
    return {
      projectedMovePts: 0,
      expectedClvPts: 0,
      lowPts: 0,
      highPts: 0,
      recommendation: "no-signal",
      rationale: fit.usable
        ? "No opening price on this market, so there is no move to project from."
        : fit.note,
    };
  }

  const movedSoFar = pts(line.nowOdds) - pts(line.openOdds);
  const projectedMove = fit.interceptPts + fit.slope * movedSoFar;
  const nowProbPts = pts(line.nowOdds);
  const projectedCloseProb = Math.min(Math.max((nowProbPts + projectedMove) / 100, 0.001), 0.999);

  // Taking the price now beats the close by however much the line is projected
  // to shorten — the same convention the CLV columns use.
  const expectedClv = projectedMove;
  const threshold = 0.25;

  let recommendation: CloseRecommendation;
  let rationale: string;
  if (Math.abs(expectedClv) < threshold) {
    recommendation = "no-signal";
    rationale = "The fit projects the close within a quarter point of this number. Nothing to gain by waiting.";
  } else if (expectedClv > 0) {
    recommendation = "take-now";
    rationale = `The archive says this move keeps going: the close projects about ${expectedClv.toFixed(1)} points shorter than the number on offer.`;
  } else {
    recommendation = "can-wait";
    rationale = `The archive says this move gives back: the close projects about ${Math.abs(expectedClv).toFixed(1)} points longer. Waiting has positive expected CLV — and the risk that it does not.`;
  }

  return {
    projectedMovePts: round(projectedMove, 2),
    projectedCloseOdds: probToAmericanOdds(projectedCloseProb),
    expectedClvPts: round(expectedClv, 2),
    lowPts: round(projectedMove - fit.residualSdPts, 2),
    highPts: round(projectedMove + fit.residualSdPts, 2),
    recommendation,
    rationale,
  };
}

export function formatCloseRecommendation(recommendation: CloseRecommendation): string {
  if (recommendation === "take-now") return "Take the number";
  if (recommendation === "can-wait") return "Can wait";
  return "No drift signal";
}

/** Archive rows carrying a complete open → taken → close path. */
export function driftSamplesFromLedger(
  entries: Array<{ openOdds?: number; entryOdds: number; closeOdds?: number }>,
): DriftSample[] {
  return entries.flatMap((entry) =>
    entry.openOdds !== undefined && entry.closeOdds !== undefined
      ? [{ openOdds: entry.openOdds, nowOdds: entry.entryOdds, closeOdds: entry.closeOdds }]
      : [],
  );
}
