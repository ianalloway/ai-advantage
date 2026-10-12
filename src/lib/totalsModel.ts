/**
 * The total, which the desk has been carrying and never pricing.
 *
 * Every game on the board arrives with a posted over/under, and until now it
 * was printed and ignored — the model had an opinion about who wins and nothing
 * to say about how much scoring there would be. This builds the second opinion
 * from the same team scoring averages the win model already uses.
 *
 * Two honesty notes, both load-bearing. The scoring averages are season-long and
 * carry no pace, rest or venue adjustment, so this is a coarse number by
 * construction. And the feed supplies the total but not its price, so the edge
 * is quoted against a standard -110 unless a real price is passed in.
 */

import {
  americanToImpliedProb,
  getDefaultStats,
  getTeamStats,
  isThreeWaySport,
  kellyCriterion,
  americanToDecimal,
  resolveTeamName,
  type Sport,
} from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { normalCdf } from "@/lib/spreadTranslation";

/**
 * Standard deviation of the combined final score. Wider than the margin spread —
 * both teams' scoring varies, and the errors add rather than cancel.
 */
export const SPORT_TOTAL_SD: Record<Sport, number> = {
  nba: 18,
  nfl: 13.5,
  mlb: 4.6,
  wc: 1.6,
};

/** The price a total is assumed to carry when the feed does not supply one. */
export const ASSUMED_TOTAL_ODDS = -110;

export type TotalsSide = "over" | "under" | "pass";

export interface TotalsInput {
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  /** The posted over/under line. */
  postedTotal: number;
  /** Real prices, when a feed supplies them. Both default to -110. */
  overOdds?: number;
  underOdds?: number;
  bankroll?: number;
  kellyFraction?: number;
  /** Edge in points required before a side is recommended. Default 3. */
  minEdgePts?: number;
}

export interface TotalsPrediction {
  applicable: boolean;
  /** Combined score the model expects. */
  projectedTotal: number;
  postedTotal: number;
  /** Projected minus posted, in points of scoring. */
  lineDifference: number;
  overProb: number;
  underProb: number;
  /** Edge on the recommended side, in probability points. */
  edgePts: number;
  side: TotalsSide;
  kellyPct: number;
  suggestedStake: number;
  /** True when the price was assumed rather than supplied by the feed. */
  priceAssumed: boolean;
  note: string;
}

const NOT_APPLICABLE = (note: string): TotalsPrediction => ({
  applicable: false,
  projectedTotal: 0,
  postedTotal: 0,
  lineDifference: 0,
  overProb: 0,
  underProb: 0,
  edgePts: 0,
  side: "pass",
  kellyPct: 0,
  suggestedStake: 0,
  priceAssumed: true,
  note,
});

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

/**
 * Expected score for each side: what one team usually puts up, averaged against
 * what the other usually concedes.
 */
export function projectScores(
  sport: Sport,
  homeTeam: string,
  awayTeam: string,
): { home: number; away: number; total: number } {
  const table = getTeamStats(sport);
  const home = table[resolveTeamName(sport, homeTeam)] ?? getDefaultStats();
  const away = table[resolveTeamName(sport, awayTeam)] ?? getDefaultStats();

  const homeScore = (home.avg_points_for + away.avg_points_against) / 2;
  const awayScore = (away.avg_points_for + home.avg_points_against) / 2;

  return {
    home: round(homeScore),
    away: round(awayScore),
    total: round(homeScore + awayScore),
  };
}

/** Probability the combined score lands above the posted line. */
export function overProbability(projectedTotal: number, postedTotal: number, sport: Sport): number {
  return 1 - normalCdf((postedTotal - projectedTotal) / SPORT_TOTAL_SD[sport]);
}

export function predictTotal(input: TotalsInput): TotalsPrediction {
  if (isThreeWaySport(input.sport)) {
    return NOT_APPLICABLE("Totals are not modelled for this sport.");
  }
  if (!Number.isFinite(input.postedTotal) || input.postedTotal <= 0) {
    return NOT_APPLICABLE("No posted total on this game to price against.");
  }

  const overOdds = isValidMoneyline(input.overOdds) ? (input.overOdds as number) : ASSUMED_TOTAL_ODDS;
  const underOdds = isValidMoneyline(input.underOdds) ? (input.underOdds as number) : ASSUMED_TOTAL_ODDS;
  const priceAssumed = !isValidMoneyline(input.overOdds) || !isValidMoneyline(input.underOdds);

  const projected = projectScores(input.sport, input.homeTeam, input.awayTeam);
  const overProb = overProbability(projected.total, input.postedTotal, input.sport);
  const underProb = 1 - overProb;

  const overEdge = (overProb - americanToImpliedProb(overOdds)) * 100;
  const underEdge = (underProb - americanToImpliedProb(underOdds)) * 100;
  const minEdge = input.minEdgePts ?? 3;

  const bestEdge = Math.max(overEdge, underEdge);
  const side: TotalsSide = bestEdge < minEdge ? "pass" : overEdge >= underEdge ? "over" : "under";

  const sideOdds = side === "under" ? underOdds : overOdds;
  const sideProb = side === "under" ? underProb : overProb;
  const kellyPct =
    side === "pass" ? 0 : kellyCriterion(sideProb, americanToDecimal(sideOdds), input.kellyFraction ?? 0.25);

  return {
    applicable: true,
    projectedTotal: projected.total,
    postedTotal: input.postedTotal,
    lineDifference: round(projected.total - input.postedTotal),
    overProb: round(overProb, 4),
    underProb: round(underProb, 4),
    edgePts: round(side === "pass" ? bestEdge : side === "over" ? overEdge : underEdge),
    side,
    kellyPct: round(kellyPct, 4),
    suggestedStake: round(kellyPct * (input.bankroll ?? 1000)),
    priceAssumed,
    note: describeTotal(side, projected.total, input.postedTotal, bestEdge, priceAssumed),
  };
}

export function describeTotal(
  side: TotalsSide,
  projectedTotal: number,
  postedTotal: number,
  edgePts: number,
  priceAssumed: boolean,
): string {
  const assumption = priceAssumed
    ? " The feed carries the line but not its price, so this is measured against a standard -110."
    : "";

  if (side === "pass") {
    return `The model makes it ${projectedTotal.toFixed(1)} against a posted ${postedTotal.toFixed(1)} — not far enough from the line to bet.${assumption}`;
  }
  const direction = side === "over" ? "above" : "below";
  return `The model projects ${projectedTotal.toFixed(1)}, ${Math.abs(projectedTotal - postedTotal).toFixed(1)} points ${direction} the posted ${postedTotal.toFixed(1)}, worth ${edgePts.toFixed(1)} points of edge. Season scoring averages only — no pace, rest or venue adjustment.${assumption}`;
}
