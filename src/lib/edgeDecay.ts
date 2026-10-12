/**
 * Is the edge still there?
 *
 * A significance test asks whether the whole record could be luck. Segments ask
 * which categories earn. Neither asks the question that kills a betting model
 * quietly: whether what worked last season is still working this month. Markets
 * adapt, and an edge that has been arbitraged away leaves a lifetime ROI that
 * still looks fine.
 *
 * This cuts the graded ledger by time rather than by category, and tests the
 * recent half against the earlier one instead of eyeballing a trend.
 */

import { americanToDecimal } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { normalCdf } from "@/lib/spreadTranslation";

export interface DecaySource {
  entryOdds: number;
  ledgerOutcome: string;
  commenceTime?: string;
  closeLineValue?: number;
}

export interface DecayWindow {
  index: number;
  label: string;
  bets: number;
  wins: number;
  losses: number;
  winRatePct: number;
  /** Profit in flat units at the recorded prices, the same convention segments use. */
  unitsProfit: number;
  roiPct: number;
  avgClvPts?: number;
  from?: string;
  to?: string;
}

export type DecayVerdict = "holding" | "decaying" | "improving" | "insufficient";

export interface EdgeDecayReport {
  windows: DecayWindow[];
  totalSettled: number;
  earlyRoiPct: number;
  recentRoiPct: number;
  /** Recent minus early, in points of ROI. */
  deltaRoiPts: number;
  earlyWinRatePct: number;
  recentWinRatePct: number;
  /** Two-sided p-value on the difference in win rate between the halves. */
  pValue: number;
  verdict: DecayVerdict;
  headline: string;
}

export interface EdgeDecayOptions {
  /** Windows to split the history into for display. Default 4. */
  windows?: number;
  /** Decided bets each half needs before the comparison is offered. Default 20. */
  minPerHalf?: number;
  /** Significance threshold for calling a change real. Default 0.05. */
  alpha?: number;
  /** ROI points of drop before a significant change is called decay. Default 3. */
  tolerancePts?: number;
}

const EMPTY: EdgeDecayReport = {
  windows: [],
  totalSettled: 0,
  earlyRoiPct: 0,
  recentRoiPct: 0,
  deltaRoiPts: 0,
  earlyWinRatePct: 0,
  recentWinRatePct: 0,
  pValue: 1,
  verdict: "insufficient",
  headline: "Nothing graded yet — decay needs a history to cut in half.",
};

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function unitResult(entry: DecaySource): number {
  if (entry.ledgerOutcome === "won") return americanToDecimal(entry.entryOdds) - 1;
  if (entry.ledgerOutcome === "lost") return -1;
  return 0;
}

function summarise(rows: DecaySource[], index: number, label: string): DecayWindow {
  const wins = rows.filter((row) => row.ledgerOutcome === "won").length;
  const losses = rows.filter((row) => row.ledgerOutcome === "lost").length;
  const decided = wins + losses;
  const units = rows.reduce((sum, row) => sum + unitResult(row), 0);
  const clv = rows.filter((row) => row.closeLineValue !== undefined).map((row) => row.closeLineValue as number);

  return {
    index,
    label,
    bets: rows.length,
    wins,
    losses,
    winRatePct: decided > 0 ? round((wins / decided) * 100) : 0,
    unitsProfit: round(units),
    roiPct: decided > 0 ? round((units / decided) * 100) : 0,
    avgClvPts: clv.length ? round(clv.reduce((sum, value) => sum + value, 0) / clv.length, 3) : undefined,
    from: rows[0]?.commenceTime,
    to: rows[rows.length - 1]?.commenceTime,
  };
}

/** Two-sided p-value on the difference between two win rates. */
export function twoProportionPValue(wins1: number, n1: number, wins2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 1;

  const p1 = wins1 / n1;
  const p2 = wins2 / n2;
  const pooled = (wins1 + wins2) / (n1 + n2);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (standardError <= 0) return 1;

  const z = (p1 - p2) / standardError;
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
}

export function buildEdgeDecayReport(
  entries: DecaySource[],
  options: EdgeDecayOptions = {},
): EdgeDecayReport {
  const windowCount = Math.max(2, Math.min(options.windows ?? 4, 10));
  const minPerHalf = options.minPerHalf ?? 20;
  const alpha = options.alpha ?? 0.05;
  const tolerancePts = options.tolerancePts ?? 3;

  const settled = entries
    .filter(
      (entry) =>
        isValidMoneyline(entry.entryOdds) &&
        (entry.ledgerOutcome === "won" || entry.ledgerOutcome === "lost" || entry.ledgerOutcome === "push"),
    )
    .slice()
    .sort((a, b) => new Date(a.commenceTime ?? 0).getTime() - new Date(b.commenceTime ?? 0).getTime());

  if (settled.length === 0) return EMPTY;

  const perWindow = Math.ceil(settled.length / windowCount);
  const windows: DecayWindow[] = [];
  for (let index = 0; index < windowCount; index++) {
    const slice = settled.slice(index * perWindow, (index + 1) * perWindow);
    if (slice.length === 0) continue;
    windows.push(summarise(slice, windows.length, `Window ${windows.length + 1}`));
  }

  const midpoint = Math.floor(settled.length / 2);
  const early = settled.slice(0, midpoint);
  const recent = settled.slice(midpoint);
  const earlySummary = summarise(early, -1, "Earlier half");
  const recentSummary = summarise(recent, -1, "Recent half");

  const earlyDecided = earlySummary.wins + earlySummary.losses;
  const recentDecided = recentSummary.wins + recentSummary.losses;
  const pValue =
    earlyDecided >= minPerHalf && recentDecided >= minPerHalf
      ? twoProportionPValue(recentSummary.wins, recentDecided, earlySummary.wins, earlyDecided)
      : 1;

  const deltaRoi = recentSummary.roiPct - earlySummary.roiPct;

  let verdict: DecayVerdict;
  if (earlyDecided < minPerHalf || recentDecided < minPerHalf) {
    verdict = "insufficient";
  } else if (pValue < alpha && deltaRoi <= -tolerancePts) {
    verdict = "decaying";
  } else if (pValue < alpha && deltaRoi >= tolerancePts) {
    verdict = "improving";
  } else {
    verdict = "holding";
  }

  return {
    windows,
    totalSettled: settled.length,
    earlyRoiPct: earlySummary.roiPct,
    recentRoiPct: recentSummary.roiPct,
    deltaRoiPts: round(deltaRoi),
    earlyWinRatePct: earlySummary.winRatePct,
    recentWinRatePct: recentSummary.winRatePct,
    pValue: Number(pValue.toFixed(5)),
    verdict,
    headline: describeDecay(verdict, deltaRoi, pValue, minPerHalf),
  };
}

export function describeDecay(
  verdict: DecayVerdict,
  deltaRoiPts: number,
  pValue: number,
  minPerHalf: number,
): string {
  if (verdict === "insufficient") {
    return `Each half needs ${minPerHalf} decided bets before early and recent form can be compared. Windows are shown for shape only.`;
  }
  if (verdict === "decaying") {
    return `Recent form is ${Math.abs(deltaRoiPts).toFixed(1)} ROI points below the earlier half, and the gap is unlikely to be noise (p ${pValue.toFixed(3)}). Treat the lifetime number as history.`;
  }
  if (verdict === "improving") {
    return `Recent form is ${deltaRoiPts.toFixed(1)} ROI points above the earlier half (p ${pValue.toFixed(3)}). The edge is getting stronger, not weaker.`;
  }
  return `Recent and earlier form differ by ${deltaRoiPts.toFixed(1)} ROI points, which is within what noise produces at this sample (p ${pValue.toFixed(3)}). No evidence the edge is going away.`;
}
