/**
 * Where the edge actually comes from.
 *
 * A single ROI number over a whole ledger hides the thing worth knowing: the
 * desk is usually not uniformly good. It is good on one sport, at one edge
 * band, on one side of the market — and quietly giving it back somewhere else.
 * This cuts the graded history into segments and refuses to call any of them a
 * finding until the sample supports it.
 */

import { americanToDecimal } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";

export type SegmentDimension = "sport" | "edge" | "side" | "window";

export interface SegmentSource {
  sportLabel: string;
  entryOdds: number;
  executionAdjustedEdge: number;
  executionWindow: string;
  ledgerOutcome: string;
  closeLineValue?: number;
}

export interface SegmentRow {
  dimension: SegmentDimension;
  key: string;
  label: string;
  /** Settled bets in this segment, pushes included. */
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRatePct: number;
  /** Profit in units, betting one flat unit at each recorded price. */
  unitsProfit: number;
  roiPct: number;
  avgExecEdge: number;
  avgClvPts?: number;
  beatCloseRatePct?: number;
  /** False until the segment has enough settled bets to mean anything. */
  reliable: boolean;
}

export interface SegmentReport {
  minSample: number;
  totalSettled: number;
  dimensions: Record<SegmentDimension, SegmentRow[]>;
  /** Best and worst are chosen among reliable segments only. */
  best: SegmentRow | null;
  worst: SegmentRow | null;
  headline: string;
}

export interface SegmentOptions {
  /** Settled bets a segment needs before it is reported as reliable. Default 15. */
  minSample?: number;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function edgeBucket(edge: number): { key: string; label: string } {
  if (edge < 3) return { key: "edge-lt3", label: "Under 3%" };
  if (edge < 5) return { key: "edge-3-5", label: "3–5%" };
  if (edge < 8) return { key: "edge-5-8", label: "5–8%" };
  return { key: "edge-8plus", label: "8%+" };
}

function segmentKeys(entry: SegmentSource): Array<{ dimension: SegmentDimension; key: string; label: string }> {
  const bucket = edgeBucket(entry.executionAdjustedEdge);
  return [
    { dimension: "sport", key: `sport-${entry.sportLabel}`, label: entry.sportLabel },
    { dimension: "edge", key: bucket.key, label: bucket.label },
    {
      dimension: "side",
      key: entry.entryOdds < 0 ? "side-favorite" : "side-underdog",
      label: entry.entryOdds < 0 ? "Favorites" : "Underdogs",
    },
    { dimension: "window", key: `window-${entry.executionWindow}`, label: entry.executionWindow },
  ];
}

/** One flat unit at the recorded price. */
function unitResult(entry: SegmentSource): number {
  if (entry.ledgerOutcome === "won") return americanToDecimal(entry.entryOdds) - 1;
  if (entry.ledgerOutcome === "lost") return -1;
  return 0;
}

export function buildSegmentReport(entries: SegmentSource[], options: SegmentOptions = {}): SegmentReport {
  const minSample = options.minSample ?? 15;
  const settled = entries.filter(
    (entry) =>
      isValidMoneyline(entry.entryOdds) &&
      (entry.ledgerOutcome === "won" || entry.ledgerOutcome === "lost" || entry.ledgerOutcome === "push"),
  );

  interface Accumulator {
    dimension: SegmentDimension;
    key: string;
    label: string;
    bets: number;
    wins: number;
    losses: number;
    pushes: number;
    units: number;
    staked: number;
    edgeSum: number;
    clv: number[];
  }

  const buckets = new Map<string, Accumulator>();

  for (const entry of settled) {
    for (const { dimension, key, label } of segmentKeys(entry)) {
      const existing = buckets.get(key) ?? {
        dimension,
        key,
        label,
        bets: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        units: 0,
        staked: 0,
        edgeSum: 0,
        clv: [],
      };

      existing.bets += 1;
      if (entry.ledgerOutcome === "won") existing.wins += 1;
      if (entry.ledgerOutcome === "lost") existing.losses += 1;
      if (entry.ledgerOutcome === "push") existing.pushes += 1;
      existing.units += unitResult(entry);
      // A push risks a unit that comes straight back, so it is not turnover.
      existing.staked += entry.ledgerOutcome === "push" ? 0 : 1;
      existing.edgeSum += entry.executionAdjustedEdge;
      if (entry.closeLineValue !== undefined) existing.clv.push(entry.closeLineValue);

      buckets.set(key, existing);
    }
  }

  const rows: SegmentRow[] = Array.from(buckets.values()).map((bucket) => {
    const decided = bucket.wins + bucket.losses;
    return {
      dimension: bucket.dimension,
      key: bucket.key,
      label: bucket.label,
      bets: bucket.bets,
      wins: bucket.wins,
      losses: bucket.losses,
      pushes: bucket.pushes,
      winRatePct: decided > 0 ? round((bucket.wins / decided) * 100) : 0,
      unitsProfit: round(bucket.units),
      roiPct: bucket.staked > 0 ? round((bucket.units / bucket.staked) * 100) : 0,
      avgExecEdge: bucket.bets > 0 ? round(bucket.edgeSum / bucket.bets) : 0,
      avgClvPts: bucket.clv.length
        ? round(bucket.clv.reduce((sum, value) => sum + value, 0) / bucket.clv.length, 3)
        : undefined,
      beatCloseRatePct: bucket.clv.length
        ? round((bucket.clv.filter((value) => value > 0).length / bucket.clv.length) * 100)
        : undefined,
      reliable: bucket.bets >= minSample,
    };
  });

  const dimensions: Record<SegmentDimension, SegmentRow[]> = {
    sport: [],
    edge: [],
    side: [],
    window: [],
  };
  for (const row of rows) {
    dimensions[row.dimension].push(row);
  }
  for (const dimension of Object.keys(dimensions) as SegmentDimension[]) {
    dimensions[dimension].sort((a, b) => b.roiPct - a.roiPct);
  }

  const reliable = rows.filter((row) => row.reliable);
  const best = reliable.length
    ? reliable.reduce((top, row) => (row.roiPct > top.roiPct ? row : top))
    : null;
  const worst = reliable.length
    ? reliable.reduce((bottom, row) => (row.roiPct < bottom.roiPct ? row : bottom))
    : null;

  return {
    minSample,
    totalSettled: settled.length,
    dimensions,
    best,
    worst,
    headline: describeSegments(settled.length, minSample, best, worst),
  };
}

export function describeSegments(
  totalSettled: number,
  minSample: number,
  best: SegmentRow | null,
  worst: SegmentRow | null,
): string {
  if (totalSettled === 0) return "Nothing has settled yet — segments fill in as tracked bets are graded.";
  if (!best || !worst) {
    return `No segment has reached ${minSample} settled bets yet. Splits are shown, but none of them is a finding.`;
  }
  if (best.key === worst.key) {
    return `Only one segment has cleared ${minSample} settled bets: ${best.label} at ${best.roiPct.toFixed(1)}% ROI.`;
  }
  return `Best reliable segment: ${best.label} at ${best.roiPct.toFixed(1)}% ROI over ${best.bets} bets. Worst: ${worst.label} at ${worst.roiPct.toFixed(1)}%.`;
}
