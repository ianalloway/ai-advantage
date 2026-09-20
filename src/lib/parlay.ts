/**
 * Parlay pricing.
 *
 * A parlay is the most profitable product on a sportsbook's shelf, and the
 * arithmetic is why: the book multiplies *vigged* leg prices together, so the
 * hold compounds while the payout does not. Three legs at a 4.5% hold each is a
 * ~13% hold on the ticket. This module prices a ticket honestly — fair price,
 * compounded hold, correlation between legs, and a straight comparison against
 * simply betting the same legs separately.
 */

import { americanToDecimal, americanToImpliedProb, kellyCriterion } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { probToAmericanOdds } from "@/lib/devig";

export interface ParlayLeg {
  id: string;
  label: string;
  americanOdds: number;
  /** Model probability this leg wins (0–1). */
  modelProb: number;
  /** Market's no-vig probability for the leg, when the market has been de-vigged. */
  fairProb?: number;
  /** Legs from one game are not independent outcomes. */
  gameId?: string;
  sport?: string;
}

export type ParlayVerdict = "playable" | "singles-better" | "skip" | "unavailable";

export interface ParlayPricing {
  legs: number;
  /** What the book pays: the product of the posted decimal prices. */
  decimalOdds: number;
  americanOdds: number;
  /** Product of leg model probabilities, treating every leg as independent. */
  independentModelProb: number;
  /** Model probability after correlation between legs is applied. */
  modelProb: number;
  /** The book's implied probability — the product of vigged leg prices. */
  impliedProb: number;
  /** Market's fair probability for the ticket, when every leg carries a fair price. */
  fairProb?: number;
  /** Compounded hold on the ticket, in percent. */
  holdPct?: number;
  /** Hold on a single average leg, for comparison against the ticket. */
  legHoldPct?: number;
  /** Expected profit per $1 on the parlay. */
  evPerDollar: number;
  /** Expected profit per $1 spread evenly across the same legs as straight bets. */
  straightEvPerDollar: number;
  /** Expected log growth per bet from a Kelly-sized parlay. This is the decision number. */
  parlayGrowthRate: number;
  /** Expected log growth from Kelly-sizing the same legs as separate straight bets. */
  straightGrowthRate: number;
  kellyPct: number;
  suggestedStake: number;
  /** How much of the independent probability the correlation adjustment moved. */
  correlationLiftPts: number;
  verdict: ParlayVerdict;
  rationale: string;
}

export interface ParlayOptions {
  bankroll?: number;
  /** Fractional Kelly, matching the rest of the desk. */
  kellyFraction?: number;
}

const UNAVAILABLE: ParlayPricing = {
  legs: 0,
  decimalOdds: 0,
  americanOdds: 0,
  independentModelProb: 0,
  modelProb: 0,
  impliedProb: 0,
  evPerDollar: 0,
  straightEvPerDollar: 0,
  parlayGrowthRate: 0,
  straightGrowthRate: 0,
  kellyPct: 0,
  suggestedStake: 0,
  correlationLiftPts: 0,
  verdict: "unavailable",
  rationale: "A parlay needs at least two legs with usable prices.",
};

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function narrativeOf(leg: ParlayLeg): "favorite" | "underdog" {
  return leg.americanOdds < 0 ? "favorite" : "underdog";
}

/**
 * Expected log growth of a Kelly-sized bet: p*ln(1 + f*b) + (1-p)*ln(1 - f).
 *
 * This, not expected value, is what decides between a parlay and the same legs
 * bet straight. A parlay of independent +EV legs always has the higher EV per
 * dollar — the products of (p * decimal) multiply — but it wins far less often,
 * and compounding a bankroll rewards growth rate rather than raw EV.
 */
export function kellyGrowthRate(winProb: number, decimalOdds: number, kellyFraction: number): number {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const f = kellyCriterion(winProb, decimalOdds, kellyFraction);
  if (f <= 0) return 0;
  if (f >= 1) return Number.NEGATIVE_INFINITY;
  return winProb * Math.log(1 + f * b) + (1 - winProb) * Math.log(1 - f);
}

/**
 * Assumed correlation between two legs. Coarse on purpose — the job is to stop a
 * ticket being priced as if six bets on one night were six independent coin
 * flips, not to claim a precise rho.
 */
export function legCorrelation(a: ParlayLeg, b: ParlayLeg): number {
  if (a.id === b.id) return 1;
  if (a.gameId && b.gameId && a.gameId === b.gameId) return 0.6;
  if (a.sport && b.sport && a.sport === b.sport) {
    return narrativeOf(a) === narrativeOf(b) ? 0.08 : 0.04;
  }
  return 0;
}

/**
 * Fold legs into a joint probability, interpolating each step between
 * independence (rho 0, plain product) and full dependence (rho 1, the weaker
 * leg carries the ticket). Each incoming leg is folded at its strongest
 * correlation with the legs already in the ticket.
 */
export function jointProbability(legs: ParlayLeg[]): number {
  if (legs.length === 0) return 0;

  let joint = legs[0].modelProb;
  for (let i = 1; i < legs.length; i++) {
    const leg = legs[i];
    const rho = Math.max(0, ...legs.slice(0, i).map((prior) => legCorrelation(prior, leg)));
    joint = (1 - rho) * joint * leg.modelProb + rho * Math.min(joint, leg.modelProb);
  }
  return joint;
}

export function priceParlay(legs: ParlayLeg[], options: ParlayOptions = {}): ParlayPricing {
  const usable = legs.filter(
    (leg) =>
      isValidMoneyline(leg.americanOdds) &&
      Number.isFinite(leg.modelProb) &&
      leg.modelProb > 0 &&
      leg.modelProb < 1,
  );
  if (usable.length < 2) return UNAVAILABLE;

  const bankroll = options.bankroll ?? 1000;
  const kellyFraction = options.kellyFraction ?? 0.25;

  const decimalOdds = usable.reduce((product, leg) => product * americanToDecimal(leg.americanOdds), 1);
  const impliedProb = usable.reduce((product, leg) => product * americanToImpliedProb(leg.americanOdds), 1);
  const independentModelProb = usable.reduce((product, leg) => product * leg.modelProb, 1);
  const modelProb = jointProbability(usable);

  const hasFairLegs = usable.every((leg) => typeof leg.fairProb === "number" && leg.fairProb > 0);
  const fairProb = hasFairLegs ? usable.reduce((product, leg) => product * (leg.fairProb as number), 1) : undefined;
  const holdPct = fairProb !== undefined ? (1 - fairProb / impliedProb) * 100 : undefined;
  const legHoldPct =
    fairProb !== undefined ? (1 - Math.pow(fairProb / impliedProb, 1 / usable.length)) * 100 : undefined;

  const evPerDollar = modelProb * (decimalOdds - 1) - (1 - modelProb);
  // The same dollar split evenly across the legs as straight bets.
  const straightEvPerDollar =
    usable.reduce(
      (sum, leg) => sum + (leg.modelProb * (americanToDecimal(leg.americanOdds) - 1) - (1 - leg.modelProb)),
      0,
    ) / usable.length;

  const kellyPct = kellyCriterion(modelProb, decimalOdds, kellyFraction);

  const parlayGrowthRate = kellyGrowthRate(modelProb, decimalOdds, kellyFraction);
  // Growth adds across independent bets. Correlated legs bet straight grow slower
  // than this sum, so the comparison leans toward "bet them separately" — the
  // conservative direction for a product that profits from parlays.
  const straightGrowthRate = usable.reduce(
    (sum, leg) => sum + kellyGrowthRate(leg.modelProb, americanToDecimal(leg.americanOdds), kellyFraction),
    0,
  );

  let verdict: ParlayVerdict;
  let rationale: string;
  if (evPerDollar <= 0) {
    verdict = "skip";
    rationale =
      holdPct !== undefined
        ? `The compounded hold is ${holdPct.toFixed(1)}% — about ${(legHoldPct ?? 0).toFixed(1)}% per leg, charged ${usable.length} times. A leg the model does not like drags the whole ticket under water.`
        : "Expected value on the ticket is negative. The payout does not cover the combined risk.";
  } else if (straightGrowthRate >= parlayGrowthRate) {
    verdict = "singles-better";
    rationale =
      "The ticket is +EV — a parlay of +EV legs always is — but Kelly-sizing these legs separately compounds the bankroll faster. The parlay buys expected value with variance you are not paid for.";
  } else {
    verdict = "playable";
    rationale =
      "Correlation between these legs pays more than the compounded hold costs: the ticket grows the bankroll faster than sizing the same legs separately.";
  }

  return {
    legs: usable.length,
    decimalOdds: round(decimalOdds),
    americanOdds: probToAmericanOdds(1 / decimalOdds),
    independentModelProb: round(independentModelProb),
    modelProb: round(modelProb),
    impliedProb: round(impliedProb),
    fairProb: fairProb === undefined ? undefined : round(fairProb),
    holdPct: holdPct === undefined ? undefined : round(holdPct, 2),
    legHoldPct: legHoldPct === undefined ? undefined : round(legHoldPct, 2),
    evPerDollar: round(evPerDollar),
    straightEvPerDollar: round(straightEvPerDollar),
    parlayGrowthRate: round(parlayGrowthRate, 6),
    straightGrowthRate: round(straightGrowthRate, 6),
    kellyPct: round(kellyPct),
    suggestedStake: round(kellyPct * bankroll, 2),
    correlationLiftPts: round((modelProb - independentModelProb) * 100, 2),
    verdict,
    rationale,
  };
}

export function formatParlayVerdict(verdict: ParlayVerdict): string {
  if (verdict === "playable") return "Playable";
  if (verdict === "singles-better") return "Singles better";
  if (verdict === "skip") return "Skip";
  return "Add legs";
}
