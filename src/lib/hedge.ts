/**
 * Hedge / cash-out math.
 *
 * Once a bet is live the question stops being "is there an edge" and becomes
 * "do I lock this in". This computes the opposite-side stake that equalises both
 * branches, what that guarantee is worth, and — using the model's own probability —
 * whether locking is actually better than letting the ticket run.
 */

import { americanToDecimal } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";

export type HedgeVerdict = "hedge" | "partial" | "let-it-ride" | "unavailable";

export interface HedgeInput {
  /** American price the original ticket was taken at. */
  entryOdds: number;
  /** Stake already at risk on the original ticket. */
  stake: number;
  /** American price currently available on the opposing outcome. */
  hedgeOdds: number;
  /** Model probability the ORIGINAL side wins (0–1). Drives the EV comparison. */
  modelProb?: number;
}

export interface HedgeResult {
  /** Stake on the opposite side that makes both branches pay the same. */
  hedgeStake: number;
  /** Profit locked in by the equalising hedge — negative means paying to de-risk. */
  lockedProfit: number;
  /** Locked profit as a percent of total money outlaid. */
  lockedRoi: number;
  /** What hedging is worth as a cash figure: stake back plus locked profit. */
  syntheticCashOut: number;
  /** Stake on the opposite side that just returns the original risk (worst case $0). */
  insuranceStake: number;
  /** Profit if the original side wins, with the equalising hedge placed. */
  profitIfOriginalWins: number;
  /** Profit if the hedge side wins, with the equalising hedge placed. */
  profitIfHedgeWins: number;
  /** Profit if the original ticket wins with no hedge. */
  unhedgedProfit: number;
  /** Loss if the original ticket loses with no hedge (negative). */
  unhedgedLoss: number;
  /** True when the two prices alone guarantee a profit — a genuine arb. */
  isArb: boolean;
  /** EV of letting it ride, using modelProb. Undefined without a model probability. */
  holdEv?: number;
  /** EV of hedging — deterministic, so it equals lockedProfit. */
  hedgeEv?: number;
  /** What the guarantee costs in EV terms (positive = hedging gives up EV). */
  evGiveUp?: number;
  verdict: HedgeVerdict;
  rationale: string;
}

const UNAVAILABLE: HedgeResult = {
  hedgeStake: 0,
  lockedProfit: 0,
  lockedRoi: 0,
  syntheticCashOut: 0,
  insuranceStake: 0,
  profitIfOriginalWins: 0,
  profitIfHedgeWins: 0,
  unhedgedProfit: 0,
  unhedgedLoss: 0,
  isArb: false,
  verdict: "unavailable",
  rationale: "Needs a valid entry price, a stake, and a live price on the other side.",
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

/** Both branch outcomes for an arbitrary (possibly partial) hedge stake. */
export function hedgeBranches(input: HedgeInput, hedgeStake: number) {
  const entryDecimal = americanToDecimal(input.entryOdds);
  const hedgeDecimal = americanToDecimal(input.hedgeOdds);
  const stake = Math.max(0, hedgeStake);
  return {
    ifOriginalWins: round(input.stake * (entryDecimal - 1) - stake),
    ifHedgeWins: round(stake * (hedgeDecimal - 1) - input.stake),
  };
}

export function calculateHedge(input: HedgeInput): HedgeResult {
  if (!isValidMoneyline(input.entryOdds) || !isValidMoneyline(input.hedgeOdds) || !(input.stake > 0)) {
    return UNAVAILABLE;
  }

  const entryDecimal = americanToDecimal(input.entryOdds);
  const hedgeDecimal = americanToDecimal(input.hedgeOdds);

  // Equalise the branches: stake * entryDecimal === hedgeStake * hedgeDecimal.
  const hedgeStake = (input.stake * entryDecimal) / hedgeDecimal;
  const totalOutlay = input.stake + hedgeStake;
  const guaranteedReturn = input.stake * entryDecimal;
  const lockedProfit = guaranteedReturn - totalOutlay;
  const branches = hedgeBranches(input, hedgeStake);

  const unhedgedProfit = input.stake * (entryDecimal - 1);
  const holdEv =
    input.modelProb === undefined
      ? undefined
      : input.modelProb * unhedgedProfit - (1 - input.modelProb) * input.stake;

  let verdict: HedgeVerdict;
  let rationale: string;
  if (holdEv === undefined) {
    verdict = lockedProfit > 0 ? "hedge" : "let-it-ride";
    rationale =
      lockedProfit > 0
        ? "The two prices lock a profit on their own — no model view required."
        : "Hedging costs money here; add a model probability to compare it against letting it ride.";
  } else if (lockedProfit >= holdEv) {
    verdict = "hedge";
    rationale = "The guaranteed number is at least as good as the model's expected value. Take the certainty.";
  } else if (lockedProfit > 0) {
    verdict = "partial";
    rationale = "Hedging locks a profit but gives up expected value. A partial hedge keeps some of the edge.";
  } else {
    verdict = "let-it-ride";
    rationale = "Hedging turns a positive expected value into a guaranteed loss. The model still likes the ticket.";
  }

  return {
    hedgeStake: round(hedgeStake),
    lockedProfit: round(lockedProfit),
    lockedRoi: round((lockedProfit / totalOutlay) * 100),
    syntheticCashOut: round(guaranteedReturn - hedgeStake),
    insuranceStake: round(input.stake / (hedgeDecimal - 1)),
    profitIfOriginalWins: branches.ifOriginalWins,
    profitIfHedgeWins: branches.ifHedgeWins,
    unhedgedProfit: round(unhedgedProfit),
    unhedgedLoss: round(-input.stake),
    isArb: lockedProfit > 0,
    holdEv: holdEv === undefined ? undefined : round(holdEv),
    hedgeEv: round(lockedProfit),
    evGiveUp: holdEv === undefined ? undefined : round(holdEv - lockedProfit),
    verdict,
    rationale,
  };
}

export interface PartialHedgeResult {
  fraction: number;
  hedgeStake: number;
  ifOriginalWins: number;
  ifHedgeWins: number;
  worstCase: number;
  ev?: number;
}

/**
 * Scale the equalising hedge down to a fraction of itself. 0 is no hedge,
 * 1 is a full lock — the points between are the usual real-world answer.
 */
export function partialHedge(input: HedgeInput, fraction: number): PartialHedgeResult {
  const full = calculateHedge(input);
  if (full.verdict === "unavailable") {
    return { fraction: 0, hedgeStake: 0, ifOriginalWins: 0, ifHedgeWins: 0, worstCase: 0 };
  }

  const clamped = Math.max(0, Math.min(fraction, 1));
  const hedgeStake = round(full.hedgeStake * clamped);
  const branches = hedgeBranches(input, hedgeStake);

  const ev =
    input.modelProb === undefined
      ? undefined
      : round(input.modelProb * branches.ifOriginalWins + (1 - input.modelProb) * branches.ifHedgeWins);

  return {
    fraction: clamped,
    hedgeStake,
    ifOriginalWins: branches.ifOriginalWins,
    ifHedgeWins: branches.ifHedgeWins,
    worstCase: Math.min(branches.ifOriginalWins, branches.ifHedgeWins),
    ev,
  };
}

export function formatHedgeVerdict(verdict: HedgeVerdict): string {
  if (verdict === "hedge") return "Lock it";
  if (verdict === "partial") return "Partial hedge";
  if (verdict === "let-it-ride") return "Let it ride";
  return "Not priceable";
}
