/**
 * Does the market agree with itself?
 *
 * A book posts a moneyline and a spread on the same game, and they are two
 * statements of the same probability. When they drift apart, one of them is
 * stale — and the desk is already carrying both numbers and showing them side
 * by side without ever comparing them.
 *
 * This is not a claim that either number is wrong. It is a flag that they
 * cannot both be right, which is the cheapest signal a board can produce.
 */

import { isThreeWaySport, type Sport } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { devigMarket, findFairOutcome } from "@/lib/devig";
import { probToSpread, spreadToProb } from "@/lib/spreadTranslation";

export type ConsistencyVerdict = "aligned" | "moneyline-longer" | "spread-longer" | "contradictory" | "unavailable";

export interface MarketConsistencyInput {
  sport: Sport;
  homeMoneyline: number;
  awayMoneyline: number;
  /**
   * The home team's posted spread, ESPN PickCenter convention: negative when
   * the home side is laying points.
   */
  homeSpread?: number;
}

export interface MarketConsistency {
  applicable: boolean;
  /** Vig-free home win probability implied by the moneyline. */
  moneylineHomeProb: number;
  /** Home win probability implied by the posted spread. */
  spreadHomeProb: number;
  /** Moneyline probability minus spread probability, in points. */
  gapPts: number;
  /** The same gap expressed as the line the moneyline is really quoting. */
  moneylineImpliedSpread: number;
  verdict: ConsistencyVerdict;
  note: string;
}

const UNAVAILABLE = (note: string): MarketConsistency => ({
  applicable: false,
  moneylineHomeProb: 0,
  spreadHomeProb: 0,
  gapPts: 0,
  moneylineImpliedSpread: 0,
  verdict: "unavailable",
  note,
});

/** Points of disagreement below which two markets are just rounding to each other. */
export const ALIGNED_TOLERANCE_PTS = 2;
/** Beyond this, the two markets are not describing the same game. */
export const CONTRADICTION_PTS = 12;

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

export function checkMarketConsistency(input: MarketConsistencyInput): MarketConsistency {
  if (isThreeWaySport(input.sport)) {
    return UNAVAILABLE("A three-way market has no two-way spread to check against.");
  }
  if (!isValidMoneyline(input.homeMoneyline) || !isValidMoneyline(input.awayMoneyline)) {
    return UNAVAILABLE("Needs both moneyline sides to strip the vig out.");
  }
  if (input.homeSpread === undefined || !Number.isFinite(input.homeSpread)) {
    return UNAVAILABLE("No posted spread on this game to check the moneyline against.");
  }

  const market = devigMarket([
    { label: "Home", americanOdds: input.homeMoneyline },
    { label: "Away", americanOdds: input.awayMoneyline },
  ]);
  const fairHome = findFairOutcome(market, "Home");
  if (!fairHome) {
    return UNAVAILABLE("Could not price a fair moneyline from these numbers.");
  }

  // A home spread of -3.5 means the home side is favoured by 3.5 points.
  const pointsFavoured = -input.homeSpread;
  const spreadHomeProb = spreadToProb(pointsFavoured, input.sport);
  const gapPts = (fairHome.fairProb - spreadHomeProb) * 100;
  const moneylineImpliedSpread = probToSpread(fairHome.fairProb, input.sport);

  let verdict: ConsistencyVerdict;
  let note: string;
  if (Math.abs(gapPts) > CONTRADICTION_PTS) {
    verdict = "contradictory";
    note = `The moneyline and the spread disagree by ${Math.abs(gapPts).toFixed(1)} points of win probability. That is too far apart to be an edge — treat one of these numbers as stale.`;
  } else if (Math.abs(gapPts) <= ALIGNED_TOLERANCE_PTS) {
    verdict = "aligned";
    note = "The moneyline and the spread tell the same story on this game.";
  } else if (gapPts < 0) {
    // The moneyline rates home lower than the spread does, so the home
    // moneyline is the longer — cheaper — of the two prices.
    verdict = "moneyline-longer";
    note = `The spread makes the home side ${Math.abs(gapPts).toFixed(1)} points likelier than the moneyline does. The home moneyline is the cheaper of the two numbers.`;
  } else {
    verdict = "spread-longer";
    note = `The moneyline makes the home side ${gapPts.toFixed(1)} points likelier than the spread does. The spread is the cheaper way to back it.`;
  }

  return {
    applicable: true,
    moneylineHomeProb: round(fairHome.fairProb, 4),
    spreadHomeProb: round(spreadHomeProb, 4),
    gapPts: round(gapPts),
    moneylineImpliedSpread: round(-moneylineImpliedSpread, 1),
    verdict,
    note,
  };
}

export function formatConsistencyVerdict(verdict: ConsistencyVerdict): string {
  if (verdict === "aligned") return "Markets agree";
  if (verdict === "moneyline-longer") return "ML is cheaper";
  if (verdict === "spread-longer") return "Spread is cheaper";
  if (verdict === "contradictory") return "Numbers disagree";
  return "Not comparable";
}
