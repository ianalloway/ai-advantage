/**
 * Model calibration over settled results.
 *
 * Accuracy and ROI say whether the desk won; calibration says whether the
 * *probabilities* were honest. A model that says 60% should win 60% of the time —
 * when it wins 48%, every Kelly stake downstream was too big.
 */

export interface CalibrationSample {
  /** Model probability assigned to the side that was actually bet (0–1). */
  predictedProb: number;
  won: boolean;
}

export interface CalibrationBucket {
  /** Inclusive lower bound of the probability band. */
  lower: number;
  /** Exclusive upper bound (inclusive for the final band). */
  upper: number;
  label: string;
  count: number;
  /** Mean probability the model assigned inside this band. */
  avgPredicted: number;
  /** Share of those bets that actually won. */
  actualRate: number;
  /** avgPredicted - actualRate, in probability points. Positive = overconfident. */
  gapPts: number;
}

export type CalibrationVerdict = "calibrated" | "overconfident" | "underconfident" | "insufficient";

export interface CalibrationReport {
  sample: number;
  /** Samples dropped for being pending, a push, or an out-of-range probability. */
  skipped: number;
  /** Mean squared error of the probabilities. Lower is better; 0.25 is a coin flip. */
  brierScore: number;
  /** Brier skill score against always predicting the base rate. Above 0 beats the base rate. */
  brierSkillScore: number;
  logLoss: number;
  /** Sample-weighted mean bucket gap, in probability points. */
  expectedCalibrationError: number;
  avgPredicted: number;
  actualRate: number;
  /** avgPredicted - actualRate in points. Positive = the model talks bigger than it delivers. */
  biasPts: number;
  verdict: CalibrationVerdict;
  headline: string;
  buckets: CalibrationBucket[];
}

export interface CalibrationOptions {
  /** Number of equal-width probability bands. Default 5. */
  buckets?: number;
  /** Below this many settled bets the verdict stays "insufficient". Default 20. */
  minSample?: number;
  /** Bias in points beyond which the model is called mis-calibrated. Default 3. */
  tolerancePts?: number;
}

const EPSILON = 1e-9;

function clampProb(value: number): number {
  return Math.min(Math.max(value, EPSILON), 1 - EPSILON);
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function bucketLabel(lower: number, upper: number): string {
  return `${Math.round(lower * 100)}–${Math.round(upper * 100)}%`;
}

function emptyReport(buckets: CalibrationBucket[], skipped: number): CalibrationReport {
  return {
    sample: 0,
    skipped,
    brierScore: 0,
    brierSkillScore: 0,
    logLoss: 0,
    expectedCalibrationError: 0,
    avgPredicted: 0,
    actualRate: 0,
    biasPts: 0,
    verdict: "insufficient",
    headline: "No settled bets yet — calibration needs graded results.",
    buckets,
  };
}

function buildBuckets(count: number): Array<CalibrationBucket & { predictedSum: number; wins: number }> {
  return Array.from({ length: count }, (_, index) => {
    const lower = index / count;
    const upper = (index + 1) / count;
    return {
      lower,
      upper,
      label: bucketLabel(lower, upper),
      count: 0,
      avgPredicted: 0,
      actualRate: 0,
      gapPts: 0,
      predictedSum: 0,
      wins: 0,
    };
  });
}

export function buildCalibrationReport(
  samples: CalibrationSample[],
  options: CalibrationOptions = {},
): CalibrationReport {
  const bucketCount = Math.max(2, Math.min(options.buckets ?? 5, 20));
  const minSample = options.minSample ?? 20;
  const tolerancePts = options.tolerancePts ?? 3;

  const working = buildBuckets(bucketCount);
  const usable = samples.filter(
    (sample) =>
      typeof sample.predictedProb === "number" &&
      Number.isFinite(sample.predictedProb) &&
      sample.predictedProb >= 0 &&
      sample.predictedProb <= 1,
  );
  const skipped = samples.length - usable.length;

  if (usable.length === 0) {
    return emptyReport(
      working.map(({ predictedSum: _predictedSum, wins: _wins, ...bucket }) => bucket),
      skipped,
    );
  }

  let brierSum = 0;
  let logLossSum = 0;
  let predictedSum = 0;
  let wins = 0;

  for (const sample of usable) {
    const p = sample.predictedProb;
    const outcome = sample.won ? 1 : 0;

    brierSum += (p - outcome) ** 2;
    logLossSum += -(outcome * Math.log(clampProb(p)) + (1 - outcome) * Math.log(1 - clampProb(p)));
    predictedSum += p;
    wins += outcome;

    const index = Math.min(Math.floor(p * bucketCount), bucketCount - 1);
    const bucket = working[index];
    bucket.count += 1;
    bucket.predictedSum += p;
    bucket.wins += outcome;
  }

  const sample = usable.length;
  const actualRate = wins / sample;
  const avgPredicted = predictedSum / sample;
  const brierScore = brierSum / sample;
  // Reference forecaster: always predict the observed base rate.
  const referenceBrier = actualRate * (1 - actualRate);
  const brierSkillScore = referenceBrier > 0 ? 1 - brierScore / referenceBrier : 0;

  const buckets: CalibrationBucket[] = working.map((bucket) => {
    const bucketAvgPredicted = bucket.count ? bucket.predictedSum / bucket.count : 0;
    const bucketActualRate = bucket.count ? bucket.wins / bucket.count : 0;
    return {
      lower: bucket.lower,
      upper: bucket.upper,
      label: bucket.label,
      count: bucket.count,
      avgPredicted: round(bucketAvgPredicted),
      actualRate: round(bucketActualRate),
      gapPts: bucket.count ? round((bucketAvgPredicted - bucketActualRate) * 100, 2) : 0,
    };
  });

  const expectedCalibrationError =
    buckets.reduce((sum, bucket) => sum + (bucket.count / sample) * Math.abs(bucket.gapPts), 0);

  const biasPts = (avgPredicted - actualRate) * 100;
  let verdict: CalibrationVerdict;
  if (sample < minSample) {
    verdict = "insufficient";
  } else if (biasPts > tolerancePts) {
    verdict = "overconfident";
  } else if (biasPts < -tolerancePts) {
    verdict = "underconfident";
  } else {
    verdict = "calibrated";
  }

  return {
    sample,
    skipped,
    brierScore: round(brierScore),
    brierSkillScore: round(brierSkillScore),
    logLoss: round(logLossSum / sample),
    expectedCalibrationError: round(expectedCalibrationError, 2),
    avgPredicted: round(avgPredicted),
    actualRate: round(actualRate),
    biasPts: round(biasPts, 2),
    verdict,
    headline: describeCalibration(verdict, biasPts, sample, minSample),
    buckets,
  };
}

export function describeCalibration(
  verdict: CalibrationVerdict,
  biasPts: number,
  sample: number,
  minSample = 20,
): string {
  if (verdict === "insufficient") {
    return `Only ${sample} settled bet${sample === 1 ? "" : "s"} — ${minSample} needed before the verdict means anything.`;
  }
  if (verdict === "overconfident") {
    return `Model probabilities run ${biasPts.toFixed(1)} points hot. Stakes sized off them are too big.`;
  }
  if (verdict === "underconfident") {
    return `Model probabilities run ${Math.abs(biasPts).toFixed(1)} points cold. Real edges are being left on the table.`;
  }
  return `Predicted and realised win rates agree within ${Math.abs(biasPts).toFixed(1)} points.`;
}

/**
 * Turn graded ledger rows into calibration samples. Pending rows and pushes
 * carry no information about the probability, so they are dropped.
 */
export function calibrationSamplesFromLedger(
  entries: Array<{ modelProb: number; ledgerOutcome: string }>,
): CalibrationSample[] {
  return entries
    .filter((entry) => entry.ledgerOutcome === "won" || entry.ledgerOutcome === "lost")
    .map((entry) => ({ predictedProb: entry.modelProb, won: entry.ledgerOutcome === "won" }));
}
