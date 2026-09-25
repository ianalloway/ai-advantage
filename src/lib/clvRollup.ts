import { closeLineValuePts, closeVerdict, type CloseVerdict } from "@/lib/linePath";

/**
 * Closing Line Value rollup — aggregate book-level CLV from per-pick entry/close odds.
 *
 * Reuses closeLineValuePts / closeVerdict so the desk and the rollup share one convention:
 * positive pts = entry beat the close (line shortened against the bettor).
 */

export interface ClvRollupEntry {
  entryOdds?: number;
  closeOdds?: number;
  sport?: string;
  /** ISO date or commence timestamp used by window helpers */
  date?: string;
}

export interface ClvRollupSummary {
  sample: number;
  settled: number;
  pending: number;
  beat: number;
  lost: number;
  push: number;
  /** beat / settled; undefined when nothing has closed */
  beatRate: number | undefined;
  lostRate: number | undefined;
  pushRate: number | undefined;
  /** Mean CLV pts over settled (non-pending) rows; undefined if none settled */
  meanClvPts: number | undefined;
  /** Median CLV pts over settled rows; undefined if none settled */
  medianClvPts: number | undefined;
}

export interface ClvWindowSlice extends ClvRollupSummary {
  /** Inclusive start of the window (ms epoch), or null for the unbounded tail */
  fromMs: number | null;
  /** Inclusive end of the window (ms epoch) */
  toMs: number;
  label: string;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function rate(count: number, denom: number): number | undefined {
  if (denom === 0) return undefined;
  return count / denom;
}

/** Per-entry CLV pts when both legs exist; otherwise undefined (pending). */
export function entryClvPts(entry: ClvRollupEntry): number | undefined {
  if (entry.entryOdds === undefined || entry.closeOdds === undefined) return undefined;
  return closeLineValuePts(entry.entryOdds, entry.closeOdds);
}

export function entryVerdict(entry: ClvRollupEntry): CloseVerdict {
  return closeVerdict(entry.entryOdds, entry.closeOdds);
}

/** Aggregate mean/median CLV and beat/lost/push/pending counts for a pick book. */
export function summarizeClv(entries: ClvRollupEntry[]): ClvRollupSummary {
  let beat = 0;
  let lost = 0;
  let push = 0;
  let pending = 0;
  const settledPts: number[] = [];

  for (const entry of entries) {
    const verdict = entryVerdict(entry);
    switch (verdict) {
      case "pending":
        pending += 1;
        break;
      case "beat": {
        beat += 1;
        const pts = entryClvPts(entry);
        if (pts !== undefined) settledPts.push(pts);
        break;
      }
      case "lost": {
        lost += 1;
        const pts = entryClvPts(entry);
        if (pts !== undefined) settledPts.push(pts);
        break;
      }
      case "push": {
        push += 1;
        const pts = entryClvPts(entry);
        if (pts !== undefined) settledPts.push(pts);
        break;
      }
      default: {
        const _exhaustive: never = verdict;
        void _exhaustive;
        break;
      }
    }
  }

  const settled = beat + lost + push;
  const meanClvPts =
    settledPts.length > 0
      ? settledPts.reduce((sum, pts) => sum + pts, 0) / settledPts.length
      : undefined;

  return {
    sample: entries.length,
    settled,
    pending,
    beat,
    lost,
    push,
    beatRate: rate(beat, settled),
    lostRate: rate(lost, settled),
    pushRate: rate(push, settled),
    meanClvPts,
    medianClvPts: median(settledPts),
  };
}

/**
 * Rolling windows ending at `asOf` (default now). Each window keeps entries whose
 * `date` falls inside [asOf - days, asOf]. Entries without a parseable date are
 * excluded from windowed slices (they still count in a full-book summarizeClv).
 */
export function rollingClvWindows(
  entries: ClvRollupEntry[],
  dayWindows: number[] = [1, 7, 30],
  asOf: Date = new Date(),
): ClvWindowSlice[] {
  const toMs = asOf.getTime();
  const dated = entries
    .map((entry) => {
      if (!entry.date) return null;
      const ms = Date.parse(entry.date);
      if (Number.isNaN(ms)) return null;
      return { entry, ms };
    })
    .filter((row): row is { entry: ClvRollupEntry; ms: number } => row !== null);

  return dayWindows.map((days) => {
    const fromMs = toMs - days * 24 * 60 * 60 * 1000;
    const inWindow = dated.filter((row) => row.ms >= fromMs && row.ms <= toMs).map((row) => row.entry);
    return {
      ...summarizeClv(inWindow),
      fromMs,
      toMs,
      label: days === 1 ? "1d" : `${days}d`,
    };
  });
}

/** Compact desk label: "+0.8 pts · 62% beat · 5 pending". */
export function formatClvBookBadge(summary: ClvRollupSummary): string {
  if (summary.sample === 0) return "No picks";
  if (summary.settled === 0) {
    return summary.pending === 1 ? "1 close pending" : `${summary.pending} closes pending`;
  }
  const mean =
    summary.meanClvPts !== undefined
      ? `${summary.meanClvPts > 0 ? "+" : ""}${summary.meanClvPts.toFixed(1)} pts`
      : "—";
  const beat =
    summary.beatRate !== undefined ? `${Math.round(summary.beatRate * 100)}% beat` : "—";
  const pending =
    summary.pending > 0
      ? ` · ${summary.pending} pending`
      : "";
  return `${mean} · ${beat}${pending}`;
}
