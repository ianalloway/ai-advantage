/**
 * How much to trust the model against the price.
 *
 * The market is not a rival forecast to beat, it is a strong baseline that
 * already contains everything the public knows. The usual answer to "whose
 * number is right" is neither — it is a blend. This finds the blend that would
 * actually have forecast the desk's own graded results best, and checks it on a
 * slice of history the weight was never fitted to.
 *
 * Calibration (elsewhere in the desk) fixes a model that is systematically hot
 * or cold. This is a different question: how much weight the model's view
 * deserves at all, against the number the market is quoting.
 */

export interface BlendSample {
  modelProb: number;
  /**
   * The break-even probability the posted price demands. It carries the book's
   * margin, so a fitted weight of zero means "defer to the price as posted",
   * not "defer to a vig-free market".
   */
  marketProb: number;
  won: boolean;
}

export interface BlendFit {
  sample: number;
  /** Weight on the model: 0 defers to the price, 1 ignores it. */
  weight: number;
  modelBrier: number;
  marketBrier: number;
  blendBrier: number;
  /** The same three scores on the tail the weight was not fitted on. */
  holdoutSample: number;
  holdoutBlendBrier?: number;
  holdoutModelBrier?: number;
  holdoutMarketBrier?: number;
  /** True only when the blend beat both pure views on unseen rows. */
  improvedOutOfSample: boolean;
  usable: boolean;
  note: string;
}

export interface BlendOptions {
  /** Graded rows needed before a weight is fitted at all. Default 40. */
  minSample?: number;
  /** Share of the history held back to test the fitted weight. Default 0.3. */
  holdoutFraction?: number;
}

const UNUSABLE = (sample: number, note: string): BlendFit => ({
  sample,
  weight: 0,
  modelBrier: 0,
  marketBrier: 0,
  blendBrier: 0,
  holdoutSample: 0,
  improvedOutOfSample: false,
  usable: false,
  note,
});

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function clampProb(value: number): number {
  return Math.min(Math.max(value, 0.001), 0.999);
}

export function blendProbability(modelProb: number, marketProb: number, weight: number): number {
  const w = Math.min(Math.max(weight, 0), 1);
  return clampProb(w * modelProb + (1 - w) * marketProb);
}

/** Mean squared error of a blended forecast against what actually happened. */
export function brierAtWeight(samples: BlendSample[], weight: number): number {
  if (samples.length === 0) return 0;
  const total = samples.reduce((sum, sample) => {
    const forecast = blendProbability(sample.modelProb, sample.marketProb, weight);
    const outcome = sample.won ? 1 : 0;
    return sum + (forecast - outcome) ** 2;
  }, 0);
  return total / samples.length;
}

/**
 * Grid search the weight that forecasts best, then score that weight on rows it
 * never saw. A weight chosen and judged on the same rows always looks good.
 */
export function fitBlendWeight(samples: BlendSample[], options: BlendOptions = {}): BlendFit {
  const minSample = options.minSample ?? 40;
  const holdoutFraction = Math.min(Math.max(options.holdoutFraction ?? 0.3, 0), 0.5);

  const usable = samples.filter(
    (sample) =>
      Number.isFinite(sample.modelProb) &&
      Number.isFinite(sample.marketProb) &&
      sample.modelProb > 0 &&
      sample.modelProb < 1 &&
      sample.marketProb > 0 &&
      sample.marketProb < 1,
  );

  if (usable.length < minSample) {
    return UNUSABLE(
      usable.length,
      `${usable.length} graded rows — ${minSample} are needed before a blend weight means anything. Until then the desk uses the model as it stands.`,
    );
  }

  const holdoutSize = Math.floor(usable.length * holdoutFraction);
  const trainEnd = usable.length - holdoutSize;
  const train = usable.slice(0, trainEnd);
  const holdout = usable.slice(trainEnd);

  let bestWeight = 0;
  let bestBrier = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 100; step++) {
    const weight = step / 100;
    const brier = brierAtWeight(train, weight);
    if (brier < bestBrier) {
      bestBrier = brier;
      bestWeight = weight;
    }
  }

  const holdoutBlend = holdout.length ? brierAtWeight(holdout, bestWeight) : undefined;
  const holdoutModel = holdout.length ? brierAtWeight(holdout, 1) : undefined;
  const holdoutMarket = holdout.length ? brierAtWeight(holdout, 0) : undefined;
  const improvedOutOfSample =
    holdoutBlend !== undefined &&
    holdoutModel !== undefined &&
    holdoutMarket !== undefined &&
    holdoutBlend < holdoutModel &&
    holdoutBlend < holdoutMarket;

  return {
    sample: usable.length,
    weight: bestWeight,
    modelBrier: round(brierAtWeight(usable, 1)),
    marketBrier: round(brierAtWeight(usable, 0)),
    blendBrier: round(brierAtWeight(usable, bestWeight)),
    holdoutSample: holdout.length,
    holdoutBlendBrier: holdoutBlend === undefined ? undefined : round(holdoutBlend),
    holdoutModelBrier: holdoutModel === undefined ? undefined : round(holdoutModel),
    holdoutMarketBrier: holdoutMarket === undefined ? undefined : round(holdoutMarket),
    improvedOutOfSample,
    usable: true,
    note: describeBlend(bestWeight, improvedOutOfSample, holdout.length),
  };
}

export function describeBlend(weight: number, improvedOutOfSample: boolean, holdoutSample: number): string {
  const share = `${Math.round(weight * 100)}% model, ${Math.round((1 - weight) * 100)}% price`;
  if (!improvedOutOfSample) {
    return `Best fit on past rows was ${share}, but it did not beat either view on the ${holdoutSample} rows held back. Treat the weight as unproven.`;
  }
  if (weight >= 0.85) {
    return `${share}: on unseen rows the model carried the forecast almost on its own.`;
  }
  if (weight <= 0.15) {
    return `${share}: on unseen rows the posted price forecast better than the model did. That is worth knowing before sizing anything off the model.`;
  }
  return `${share} forecast better than either view alone on rows the weight never saw.`;
}

/** Ledger rows as blend samples, oldest first so the holdout is a real future. */
export function blendSamplesFromLedger(
  entries: Array<{ modelProb: number; impliedProb: number; ledgerOutcome: string; commenceTime?: string }>,
): BlendSample[] {
  return entries
    .filter((entry) => entry.ledgerOutcome === "won" || entry.ledgerOutcome === "lost")
    .slice()
    .sort((a, b) => new Date(a.commenceTime ?? 0).getTime() - new Date(b.commenceTime ?? 0).getTime())
    .map((entry) => ({
      modelProb: entry.modelProb,
      marketProb: entry.impliedProb,
      won: entry.ledgerOutcome === "won",
    }));
}
