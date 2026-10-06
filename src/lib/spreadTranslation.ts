/**
 * Probabilities, in points.
 *
 * "62% to win" and "the model makes this -4.5" are the same claim, but only one
 * of them is a number a bettor can argue with. This translates model and market
 * probabilities into the scoring margin each implies, and answers the question
 * behind every stake: how wrong can the model be and still be right to bet?
 *
 * The translation assumes a scoring margin distributed normally about the
 * spread, with a sport-specific spread of outcomes. That holds well enough for
 * two-way markets; it does not hold for a market with a draw in it, and this
 * says so rather than quietly returning a number.
 */

import { americanToImpliedProb, isThreeWaySport, type Sport } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { inverseNormalCdf } from "@/lib/slateSimulation";

/**
 * Standard deviation of the final margin, in each sport's own scoring unit.
 * These are the widely used approximations — points for basketball and
 * football, runs for baseball — not values fitted in this repo.
 */
export const SPORT_MARGIN_SD: Record<Sport, number> = {
  nba: 11.5,
  nfl: 13.5,
  mlb: 4.0,
  wc: 1.4,
};

export const SPORT_MARGIN_UNIT: Record<Sport, string> = {
  nba: "pts",
  nfl: "pts",
  mlb: "runs",
  wc: "goals",
};

export interface EdgeInPoints {
  /** False for three-way markets, where a margin model cannot price the draw. */
  applicable: boolean;
  /** Margin the model's probability implies, positive when favoured. */
  modelPoints: number;
  /** Margin the posted price implies once its break-even is taken at face value. */
  breakevenPoints: number;
  /** Margin the market's vig-free probability implies, when a fair price is known. */
  marketPoints?: number;
  /** Model against the fair market line — the disagreement being bet on. */
  disagreementPoints?: number;
  /**
   * How far the model can be wrong, in points, before the bet stops being +EV.
   * This is the number that decides whether an edge is worth acting on.
   */
  marginOfSafetyPoints: number;
  unit: string;
  note: string;
}

const NOT_APPLICABLE = (unit: string, note: string): EdgeInPoints => ({
  applicable: false,
  modelPoints: 0,
  breakevenPoints: 0,
  marginOfSafetyPoints: 0,
  unit,
  note,
});

function round(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 error function,
 * accurate to about 1.5e-7 — far past what a line translation needs.
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);

  return 0.5 * (1 + sign * erf);
}

/** Points a team is favoured by, given its win probability. */
export function probToSpread(prob: number, sport: Sport): number {
  const clamped = Math.min(Math.max(prob, 0.001), 0.999);
  return SPORT_MARGIN_SD[sport] * inverseNormalCdf(clamped);
}

/** Win probability implied by being favoured by this many points. */
export function spreadToProb(points: number, sport: Sport): number {
  return normalCdf(points / SPORT_MARGIN_SD[sport]);
}

export function translateEdgeToPoints({
  modelProb,
  americanOdds,
  sport,
  fairProb,
}: {
  modelProb: number;
  americanOdds: number;
  sport: Sport;
  /** The market's vig-free probability for this side, when it has been de-vigged. */
  fairProb?: number;
}): EdgeInPoints {
  const unit = SPORT_MARGIN_UNIT[sport];

  if (isThreeWaySport(sport)) {
    return NOT_APPLICABLE(
      unit,
      "This market has a draw in it, so a win probability does not translate into a margin. No line shown.",
    );
  }
  if (!isValidMoneyline(americanOdds) || !Number.isFinite(modelProb) || modelProb <= 0 || modelProb >= 1) {
    return NOT_APPLICABLE(unit, "Needs a usable price and a model probability to translate.");
  }

  const modelPoints = probToSpread(modelProb, sport);
  const breakevenPoints = probToSpread(americanToImpliedProb(americanOdds), sport);
  const marketPoints = fairProb !== undefined ? probToSpread(fairProb, sport) : undefined;
  const marginOfSafety = modelPoints - breakevenPoints;

  return {
    applicable: true,
    modelPoints: round(modelPoints),
    breakevenPoints: round(breakevenPoints),
    marketPoints: marketPoints === undefined ? undefined : round(marketPoints),
    disagreementPoints: marketPoints === undefined ? undefined : round(modelPoints - marketPoints),
    marginOfSafetyPoints: round(marginOfSafety),
    unit,
    note: describeMarginOfSafety(marginOfSafety, unit),
  };
}

export function describeMarginOfSafety(marginOfSafetyPoints: number, unit: string): string {
  if (marginOfSafetyPoints <= 0) {
    return `The price already needs more than the model gives it. There is no room for the model to be wrong here.`;
  }
  if (marginOfSafetyPoints < 0.5) {
    return `The model can be wrong by ${marginOfSafetyPoints.toFixed(1)} ${unit} before this stops being +EV — thin enough that a single injury erases it.`;
  }
  return `The model can be wrong by ${marginOfSafetyPoints.toFixed(1)} ${unit} and this is still +EV.`;
}

/** Signed line as a book would print it: negative for the favourite. */
export function formatLine(points: number): string {
  if (Math.abs(points) < 0.05) return "PK";
  return points > 0 ? `-${points.toFixed(1)}` : `+${Math.abs(points).toFixed(1)}`;
}
