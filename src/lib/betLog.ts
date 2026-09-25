/**
 * The user's own bet log.
 *
 * The execution ledger records what the *desk* recommended. It cannot say what
 * you actually got — which side you took, at what number, for how much, or
 * whether you beat the price the board was quoting when you clicked. This tracks
 * the real tickets and grades them: realised P&L, close-line value, and how your
 * execution compared to the desk's own number.
 */

import { americanToDecimal, americanToImpliedProb } from "@/lib/predictions";
import { closeLineValuePts } from "@/lib/linePath";
import { isValidMoneyline } from "@/lib/oddsValidation";

export type BetLogOutcome = "pending" | "won" | "lost" | "push" | "void";

export interface BetLogEntry {
  id: string;
  gameId: string;
  sport: string;
  sportLabel: string;
  eventLabel: string;
  /** The side actually taken. */
  side: string;
  sideLocation: "Home" | "Away" | "Draw";
  /** The price actually got, which is rarely the price on the board. */
  americanOdds: number;
  stake: number;
  outcome: BetLogOutcome;
  placedAt: string;
  settledAt?: string;
  commenceTime?: string;
  bookmaker?: string;
  /** The desk's quoted price at the moment this was logged. */
  deskOdds?: number;
  /** Closing price, once the market has closed. */
  closeOdds?: number;
  modelProb?: number;
}

export interface BetLogSummary {
  logged: number;
  settled: number;
  pending: number;
  /** Total staked across every logged bet. */
  staked: number;
  /** Stake still live on pending bets. */
  openRisk: number;
  /** Realised profit, ignoring pending tickets. */
  netProfit: number;
  /** Profit over stake on settled bets, in percent. */
  roiPct: number;
  /** Wins over decided bets — pushes and voids are excluded, as they decide nothing. */
  winRatePct: number;
  wins: number;
  losses: number;
  /** Average price improvement against the desk's quote, in probability points. */
  avgExecutionPts?: number;
  /** Average close-line value, in probability points. */
  avgClvPts?: number;
  beatCloseRatePct?: number;
  clvSample: number;
  biggestWin: number;
  biggestLoss: number;
}

export interface CreateBetLogInput {
  gameId: string;
  sport: string;
  sportLabel: string;
  eventLabel: string;
  side: string;
  sideLocation: "Home" | "Away" | "Draw";
  americanOdds: number;
  stake: number;
  deskOdds?: number;
  commenceTime?: string;
  bookmaker?: string;
  modelProb?: number;
  placedAt?: string;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

/** Realised profit on a ticket. Pending, pushed and voided bets return nothing. */
export function betProfit(entry: Pick<BetLogEntry, "americanOdds" | "stake" | "outcome">): number {
  if (entry.outcome === "won") {
    if (!isValidMoneyline(entry.americanOdds)) return 0;
    return round(entry.stake * (americanToDecimal(entry.americanOdds) - 1));
  }
  if (entry.outcome === "lost") return round(-entry.stake);
  return 0;
}

/**
 * Price improvement against the desk's quote, in probability points. Positive
 * means a longer price than the board was showing — the same convention CLV uses.
 */
export function executionPts(americanOdds: number, deskOdds?: number): number | undefined {
  if (deskOdds === undefined || !isValidMoneyline(deskOdds) || !isValidMoneyline(americanOdds)) {
    return undefined;
  }
  return (americanToImpliedProb(deskOdds) - americanToImpliedProb(americanOdds)) * 100;
}

export function createBetLogEntry(input: CreateBetLogInput): BetLogEntry {
  const placedAt = input.placedAt ?? new Date().toISOString();
  return {
    id: `${input.gameId}:${input.side}:${placedAt}`,
    gameId: input.gameId,
    sport: input.sport,
    sportLabel: input.sportLabel,
    eventLabel: input.eventLabel,
    side: input.side,
    sideLocation: input.sideLocation,
    americanOdds: input.americanOdds,
    stake: input.stake,
    outcome: "pending",
    placedAt,
    commenceTime: input.commenceTime,
    bookmaker: input.bookmaker,
    deskOdds: input.deskOdds,
    modelProb: input.modelProb,
  };
}

export function settleBetLogEntry(entry: BetLogEntry, outcome: BetLogOutcome, closeOdds?: number): BetLogEntry {
  return {
    ...entry,
    outcome,
    closeOdds: closeOdds ?? entry.closeOdds,
    settledAt: outcome === "pending" ? undefined : new Date().toISOString(),
  };
}

export function summarizeBetLog(entries: BetLogEntry[]): BetLogSummary {
  const settled = entries.filter((entry) => entry.outcome !== "pending");
  const decided = entries.filter((entry) => entry.outcome === "won" || entry.outcome === "lost");
  const pending = entries.filter((entry) => entry.outcome === "pending");

  const profits = settled.map((entry) => betProfit(entry));
  const netProfit = profits.reduce((sum, profit) => sum + profit, 0);
  const settledStake = settled.reduce((sum, entry) => sum + entry.stake, 0);
  const wins = entries.filter((entry) => entry.outcome === "won").length;
  const losses = entries.filter((entry) => entry.outcome === "lost").length;

  const executionDeltas = entries
    .map((entry) => executionPts(entry.americanOdds, entry.deskOdds))
    .filter((value): value is number => value !== undefined);

  const clvValues = entries
    .filter((entry) => entry.closeOdds !== undefined && isValidMoneyline(entry.closeOdds))
    .map((entry) => closeLineValuePts(entry.americanOdds, entry.closeOdds as number));

  return {
    logged: entries.length,
    settled: settled.length,
    pending: pending.length,
    staked: round(entries.reduce((sum, entry) => sum + entry.stake, 0)),
    openRisk: round(pending.reduce((sum, entry) => sum + entry.stake, 0)),
    netProfit: round(netProfit),
    roiPct: settledStake > 0 ? round((netProfit / settledStake) * 100) : 0,
    winRatePct: decided.length > 0 ? round((wins / decided.length) * 100) : 0,
    wins,
    losses,
    avgExecutionPts: executionDeltas.length
      ? round(executionDeltas.reduce((sum, value) => sum + value, 0) / executionDeltas.length, 3)
      : undefined,
    avgClvPts: clvValues.length
      ? round(clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length, 3)
      : undefined,
    beatCloseRatePct: clvValues.length
      ? round((clvValues.filter((value) => value > 0).length / clvValues.length) * 100)
      : undefined,
    clvSample: clvValues.length,
    biggestWin: profits.length ? round(Math.max(0, ...profits)) : 0,
    biggestLoss: profits.length ? round(Math.min(0, ...profits)) : 0,
  };
}

/** Rows for the CSV export, matching the shape the rest of the desk exports use. */
export function betLogRows(entries: BetLogEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    placedAt: entry.placedAt,
    sport: entry.sportLabel,
    event: entry.eventLabel,
    side: entry.side,
    location: entry.sideLocation,
    bookmaker: entry.bookmaker ?? "",
    entryOdds: entry.americanOdds,
    deskOdds: entry.deskOdds ?? "",
    executionPts: (() => {
      const pts = executionPts(entry.americanOdds, entry.deskOdds);
      return pts === undefined ? "" : round(pts, 3);
    })(),
    closeOdds: entry.closeOdds ?? "",
    clvPts:
      entry.closeOdds !== undefined && isValidMoneyline(entry.closeOdds)
        ? round(closeLineValuePts(entry.americanOdds, entry.closeOdds), 3)
        : "",
    stake: round(entry.stake),
    outcome: entry.outcome,
    profit: round(betProfit(entry)),
    settledAt: entry.settledAt ?? "",
  }));
}
