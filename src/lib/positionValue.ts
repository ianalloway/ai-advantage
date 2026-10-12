/**
 * What an open ticket is worth right now.
 *
 * The bet log records what was taken and what it will pay. While a game is
 * running neither number is the one that matters: a bet struck at +150 on a team
 * now leading by ten is not a +150 bet any more. This marks open positions to
 * the live model, and prices the choice every live ticket poses — hold it for
 * what it might pay, or lock what it is already worth.
 *
 * The hedge arithmetic is the desk's existing hedge desk. What this adds is the
 * valuation around it, and the one number that decides: the probability at which
 * holding stops beating locking.
 */

import { americanToDecimal } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { calculateHedge } from "@/lib/hedge";

export type PositionAction = "hold" | "lock" | "no-market";

export interface OpenPositionInput {
  stake: number;
  /** The price the ticket was struck at. */
  americanOdds: number;
  /** Probability it wins now, from the live model. */
  liveProb: number;
  /** Price currently available on the opposing side, when one exists. */
  oppositeOdds?: number;
}

export interface PositionValue {
  applicable: boolean;
  /** The stake this valuation is for, carried so a summary cannot mismatch them. */
  stake: number;
  /** Total returned if it wins: stake plus profit. */
  potentialReturn: number;
  /** The ticket's expected value at the live probability. */
  fairValue: number;
  /** Fair value against the stake — unrealised, and still at risk. */
  unrealisedPnl: number;
  expectedRoiPct: number;
  hedgeStake?: number;
  /** Certain value of a full hedge: stake back plus the locked profit. */
  lockedValue?: number;
  lockedProfit?: number;
  /** Expected value surrendered by taking the certain number instead. */
  evGiveUp?: number;
  /**
   * The win probability at which holding and locking are worth the same. Above
   * it, holding wins; below it, the lock is the better of the two.
   */
  breakEvenProb?: number;
  recommendation: PositionAction;
  note: string;
}

export interface OpenPositionsSummary {
  positions: number;
  stakeAtRisk: number;
  fairValue: number;
  unrealisedPnl: number;
  /** Positions the live model now rates below the price they were taken at. */
  underwater: number;
}

const NOT_APPLICABLE = (note: string): PositionValue => ({
  applicable: false,
  stake: 0,
  potentialReturn: 0,
  fairValue: 0,
  unrealisedPnl: 0,
  expectedRoiPct: 0,
  recommendation: "no-market",
  note,
});

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

export function valueOpenPosition(input: OpenPositionInput): PositionValue {
  if (!isValidMoneyline(input.americanOdds) || !(input.stake > 0)) {
    return NOT_APPLICABLE("Needs a real price and stake to value.");
  }
  if (!Number.isFinite(input.liveProb) || input.liveProb < 0 || input.liveProb > 1) {
    return NOT_APPLICABLE("No live probability for this game yet.");
  }

  const potentialReturn = input.stake * americanToDecimal(input.americanOdds);
  const fairValue = input.liveProb * potentialReturn;
  const unrealisedPnl = fairValue - input.stake;

  const base = {
    applicable: true,
    stake: round(input.stake),
    potentialReturn: round(potentialReturn),
    fairValue: round(fairValue),
    unrealisedPnl: round(unrealisedPnl),
    expectedRoiPct: round((unrealisedPnl / input.stake) * 100),
  };

  if (input.oppositeOdds === undefined || !isValidMoneyline(input.oppositeOdds)) {
    return {
      ...base,
      recommendation: "no-market",
      note: `Worth ${base.fairValue.toFixed(2)} against a ${input.stake.toFixed(2)} stake. No opposing price on the board, so there is nothing to lock it with.`,
    };
  }

  const hedge = calculateHedge({
    entryOdds: input.americanOdds,
    stake: input.stake,
    hedgeOdds: input.oppositeOdds,
    modelProb: input.liveProb,
  });

  const lockedValue = hedge.syntheticCashOut;
  const breakEvenProb = potentialReturn > 0 ? lockedValue / potentialReturn : undefined;
  const lock = lockedValue >= fairValue;

  return {
    ...base,
    hedgeStake: hedge.hedgeStake,
    lockedValue,
    lockedProfit: hedge.lockedProfit,
    evGiveUp: round(unrealisedPnl - hedge.lockedProfit),
    breakEvenProb: breakEvenProb === undefined ? undefined : round(breakEvenProb, 4),
    recommendation: lock ? "lock" : "hold",
    note: describePosition(lock, lockedValue, fairValue, breakEvenProb, input.liveProb),
  };
}

export function describePosition(
  lock: boolean,
  lockedValue: number,
  fairValue: number,
  breakEvenProb: number | undefined,
  liveProb: number,
): string {
  const threshold =
    breakEvenProb === undefined
      ? ""
      : ` Holding only beats locking above ${(breakEvenProb * 100).toFixed(1)}%, and the live model has it at ${(liveProb * 100).toFixed(1)}%.`;

  if (lock) {
    return `Locking returns ${lockedValue.toFixed(2)} for certain against an expected ${fairValue.toFixed(2)} for holding.${threshold}`;
  }
  return `Holding is worth ${fairValue.toFixed(2)} in expectation against ${lockedValue.toFixed(2)} guaranteed — but the guaranteed number is the only one you can spend.${threshold}`;
}

export function summarizeOpenPositions(values: PositionValue[]): OpenPositionsSummary {
  const live = values.filter((value) => value.applicable);

  return {
    positions: live.length,
    stakeAtRisk: round(live.reduce((sum, value) => sum + value.stake, 0)),
    fairValue: round(live.reduce((sum, value) => sum + value.fairValue, 0)),
    unrealisedPnl: round(live.reduce((sum, value) => sum + value.unrealisedPnl, 0)),
    underwater: live.filter((value) => value.unrealisedPnl < 0).length,
  };
}
