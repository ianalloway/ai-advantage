/**
 * No-vig (fair) pricing.
 *
 * Every edge on the desk is measured against a posted price, and a posted price
 * carries the book's margin. `homeImpliedProb + awayImpliedProb` is always > 1,
 * so raw edge quietly flatters the model by whatever the hold happens to be.
 * De-vigging strips the margin back out so "edge" means edge over a fair line.
 */

import { americanToDecimal, americanToImpliedProb } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";

export type DevigMethod = "multiplicative" | "power";

export interface MarketPrice {
  /** Outcome label, e.g. a team name or "Draw". */
  label: string;
  americanOdds: number;
}

export interface FairOutcome {
  label: string;
  americanOdds: number;
  /** Raw implied probability from the posted price (includes vig). */
  impliedProb: number;
  /** Vig-free probability after normalisation. */
  fairProb: number;
  /** The same fair probability expressed as an American price. */
  fairOdds: number;
  /** Margin carried by this outcome, in probability points. */
  vigPts: number;
}

export interface DevigResult {
  method: DevigMethod;
  /** Sum of raw implied probabilities (1.0 = no margin). */
  overround: number;
  /** Book margin over a fair book, in percent: (overround - 1) * 100. */
  vigPct: number;
  /** Theoretical hold — the share of handle the book keeps: (1 - 1/overround) * 100. */
  holdPct: number;
  outcomes: FairOutcome[];
}

const EMPTY_RESULT = (method: DevigMethod): DevigResult => ({
  method,
  overround: 0,
  vigPct: 0,
  holdPct: 0,
  outcomes: [],
});

/** Fair American price for a probability. Mirrors `americanToImpliedProb` in reverse. */
export function probToAmericanOdds(prob: number): number {
  const p = Math.min(Math.max(prob, 0.0001), 0.9999);
  const odds = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100;
  return Number(odds.toFixed(0));
}

/**
 * Solve for the exponent k where `sum(impliedProb_i ^ k) === 1`.
 * Power de-vigging spreads the margin toward favourites rather than evenly,
 * which matches how books actually shade long prices.
 */
function solvePowerExponent(implied: number[]): number {
  const sumAt = (k: number) => implied.reduce((sum, p) => sum + Math.pow(p, k), 0);

  let low = 0.0001;
  let high = 1;
  // sum at k=1 is the overround (>1); sum falls as k falls, so bisection is safe.
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (sumAt(mid) > 1) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return (low + high) / 2;
}

/**
 * Strip the book margin out of a complete market (2-way moneyline, 3-way soccer,
 * or any other exhaustive set of outcomes).
 */
export function devigMarket(prices: MarketPrice[], method: DevigMethod = "multiplicative"): DevigResult {
  const valid = prices.filter((price) => isValidMoneyline(price.americanOdds));
  if (valid.length < 2) return EMPTY_RESULT(method);

  const implied = valid.map((price) => americanToImpliedProb(price.americanOdds));
  const overround = implied.reduce((sum, p) => sum + p, 0);
  if (!Number.isFinite(overround) || overround <= 0) return EMPTY_RESULT(method);

  const exponent = method === "power" ? solvePowerExponent(implied) : 1;
  const raised = implied.map((p) => Math.pow(p, exponent));
  const raisedSum = raised.reduce((sum, p) => sum + p, 0);

  const outcomes: FairOutcome[] = valid.map((price, index) => {
    const fairProb = raised[index] / raisedSum;
    return {
      label: price.label,
      americanOdds: price.americanOdds,
      impliedProb: implied[index],
      fairProb,
      fairOdds: probToAmericanOdds(fairProb),
      vigPts: (implied[index] - fairProb) * 100,
    };
  });

  return {
    method,
    overround,
    vigPct: (overround - 1) * 100,
    holdPct: (1 - 1 / overround) * 100,
    outcomes,
  };
}

/** Pick one outcome out of a de-vigged market by label. */
export function findFairOutcome(result: DevigResult, label: string): FairOutcome | undefined {
  return result.outcomes.find((outcome) => outcome.label === label);
}

/**
 * How far the model disagrees with the market's *fair* estimate, in probability
 * points. This is a different question from "is the posted price +EV": the vig
 * sits between the two, so disagreement always reads larger than net edge.
 */
export function noVigEdge(modelProb: number, fairProb: number): number {
  return (modelProb - fairProb) * 100;
}

/** Expected value per $1 staked at a posted price, given the model's probability. */
export function expectedValuePerDollar(modelProb: number, americanOdds: number): number {
  if (!isValidMoneyline(americanOdds)) return 0;
  const decimal = americanToDecimal(americanOdds);
  return modelProb * (decimal - 1) - (1 - modelProb);
}

export interface EdgeDecomposition {
  /** Model probability minus the market's fair probability, in points. */
  disagreementPts: number;
  /** Margin the book charges on this outcome, in points. */
  vigPts: number;
  /** What survives the margin — the edge over the price you actually get. */
  netEdgePts: number;
  /** True when the disagreement is big enough to clear the hold. */
  clearsVig: boolean;
}

/**
 * Split edge into its two honest halves: how much the model disagrees with the
 * fair market, and how much of that the book takes before it reaches you.
 * `netEdgePts` is the +EV test and equals edge against the posted price.
 */
export function decomposeEdge(modelProb: number, outcome: FairOutcome): EdgeDecomposition {
  const disagreementPts = (modelProb - outcome.fairProb) * 100;
  const vigPts = outcome.vigPts;
  const netEdgePts = disagreementPts - vigPts;
  return {
    disagreementPts,
    vigPts,
    netEdgePts,
    clearsVig: netEdgePts > 0,
  };
}

export function formatHold(holdPct: number): string {
  return `${holdPct.toFixed(2)}% hold`;
}
