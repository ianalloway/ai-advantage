import { americanToImpliedProb, formatOdds } from "@/lib/predictions";

/**
 * Steam / line-move desk lens — open → now on the ticket (lean) side.
 *
 * Positive movePts = lean side shortened (implied prob rose) = steam toward the lean.
 * Negative movePts = lean side lengthened = reverse steam / steam against the lean.
 *
 * Aligns with LiveOddsTicker’s ±8 American “non-flat” band and linePath’s
 * implied-prob-point convention (CLV is entry→close; steam is open→now).
 */

/** American odds units colloquially called “cents” on a moneyline desk. */
export const STEAM_CENTS_THRESHOLD = 8;
/** Implied-prob points — ~half a point of vig-scale noise floor. */
export const STEAM_PTS_THRESHOLD = 1.0;

export type SteamClass = "steamed_toward" | "steamed_against" | "quiet" | "unknown";

export interface SteamLensInput {
  openOdds?: number;
  currentOdds?: number;
}

export interface SteamLensResult {
  classification: SteamClass;
  /** Implied-prob points: now − open. Positive = shortened toward lean. */
  movePts: number | undefined;
  /** American delta (cents): current − open. */
  moveCents: number | undefined;
  openOdds: number | undefined;
  currentOdds: number | undefined;
}

export interface SteamDeskEntry extends SteamLensInput {
  sport?: string;
  label?: string;
}

export interface SteamDeskSummary {
  sample: number;
  known: number;
  unknown: number;
  steamedToward: number;
  steamedAgainst: number;
  quiet: number;
  /** Mean |movePts| over known rows with a move; undefined if none known */
  meanAbsMovePts: number | undefined;
  /** Mean signed movePts over known rows */
  meanMovePts: number | undefined;
}

/** Open→now move in implied-prob points (same units as closeLineValuePts). */
export function openToNowMovePts(openOdds: number, currentOdds: number): number {
  return (americanToImpliedProb(currentOdds) - americanToImpliedProb(openOdds)) * 100;
}

/** Signed American “cents” delta (current − open). */
export function openToNowMoveCents(openOdds: number, currentOdds: number): number {
  return currentOdds - openOdds;
}

function isMeaningful(movePts: number, moveCents: number): boolean {
  return Math.abs(movePts) >= STEAM_PTS_THRESHOLD || Math.abs(moveCents) >= STEAM_CENTS_THRESHOLD;
}

/**
 * Classify open→now movement relative to the lean/ticket side.
 * Missing either leg → unknown. Sub-threshold move → quiet.
 */
export function classifySteam(input: SteamLensInput): SteamLensResult {
  const { openOdds, currentOdds } = input;
  if (openOdds === undefined || currentOdds === undefined) {
    return {
      classification: "unknown",
      movePts: undefined,
      moveCents: undefined,
      openOdds,
      currentOdds,
    };
  }

  const movePts = openToNowMovePts(openOdds, currentOdds);
  const moveCents = openToNowMoveCents(openOdds, currentOdds);

  if (!isMeaningful(movePts, moveCents)) {
    return {
      classification: "quiet",
      movePts,
      moveCents,
      openOdds,
      currentOdds,
    };
  }

  // Shortened lean (higher implied) = steam toward; lengthened = against.
  const classification: SteamClass = movePts > 0 ? "steamed_toward" : "steamed_against";
  return {
    classification,
    movePts,
    moveCents,
    openOdds,
    currentOdds,
  };
}

export function formatSteamBadge(result: SteamLensResult): string | null {
  switch (result.classification) {
    case "unknown":
    case "quiet":
      return null;
    case "steamed_toward": {
      const pts =
        result.movePts !== undefined
          ? ` · +${Math.abs(result.movePts).toFixed(1)} pts`
          : "";
      return `Steam toward${pts}`;
    }
    case "steamed_against": {
      const pts =
        result.movePts !== undefined
          ? ` · −${Math.abs(result.movePts).toFixed(1)} pts`
          : "";
      return `Reverse steam${pts}`;
    }
    default: {
      const _exhaustive: never = result.classification;
      return _exhaustive;
    }
  }
}

/** Compact short label for the pick header chip. */
export function formatSteamChip(result: SteamLensResult): string | null {
  switch (result.classification) {
    case "unknown":
    case "quiet":
      return null;
    case "steamed_toward":
      return "STEAM";
    case "steamed_against":
      return "REV";
    default: {
      const _exhaustive: never = result.classification;
      return _exhaustive;
    }
  }
}

export function steamChipClassName(classification: SteamClass): string {
  switch (classification) {
    case "steamed_toward":
      return "border-orange-400/35 bg-orange-400/12 text-orange-200";
    case "steamed_against":
      return "border-violet-400/35 bg-violet-400/12 text-violet-200";
    case "quiet":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
    case "unknown":
      return "border-zinc-500/20 bg-zinc-500/5 text-zinc-500";
    default: {
      const _exhaustive: never = classification;
      return _exhaustive;
    }
  }
}

/** Path caption for tooltips: Open -110 → Now -125. */
export function formatSteamPath(result: SteamLensResult): string | null {
  if (result.openOdds === undefined || result.currentOdds === undefined) return null;
  return `Open ${formatOdds(result.openOdds)} → Now ${formatOdds(result.currentOdds)}`;
}

export function summarizeSteamDesk(entries: SteamDeskEntry[]): SteamDeskSummary {
  let steamedToward = 0;
  let steamedAgainst = 0;
  let quiet = 0;
  let unknown = 0;
  const signedPts: number[] = [];

  for (const entry of entries) {
    const result = classifySteam(entry);
    switch (result.classification) {
      case "steamed_toward":
        steamedToward += 1;
        if (result.movePts !== undefined) signedPts.push(result.movePts);
        break;
      case "steamed_against":
        steamedAgainst += 1;
        if (result.movePts !== undefined) signedPts.push(result.movePts);
        break;
      case "quiet":
        quiet += 1;
        if (result.movePts !== undefined) signedPts.push(result.movePts);
        break;
      case "unknown":
        unknown += 1;
        break;
      default: {
        const _exhaustive: never = result.classification;
        void _exhaustive;
        break;
      }
    }
  }

  const known = steamedToward + steamedAgainst + quiet;
  const meanMovePts =
    signedPts.length > 0
      ? signedPts.reduce((sum, pts) => sum + pts, 0) / signedPts.length
      : undefined;
  const meanAbsMovePts =
    signedPts.length > 0
      ? signedPts.reduce((sum, pts) => sum + Math.abs(pts), 0) / signedPts.length
      : undefined;

  return {
    sample: entries.length,
    known,
    unknown,
    steamedToward,
    steamedAgainst,
    quiet,
    meanAbsMovePts,
    meanMovePts,
  };
}

/** One-liner for the rail: "2 steam · 1 reverse · 4 quiet". */
export function formatSteamDeskBadge(summary: SteamDeskSummary): string {
  if (summary.sample === 0) return "No picks";
  if (summary.known === 0) {
    return summary.unknown === 1 ? "1 open unknown" : `${summary.unknown} opens unknown`;
  }
  const parts: string[] = [];
  if (summary.steamedToward > 0) parts.push(`${summary.steamedToward} steam`);
  if (summary.steamedAgainst > 0) parts.push(`${summary.steamedAgainst} reverse`);
  if (summary.quiet > 0) parts.push(`${summary.quiet} quiet`);
  if (summary.unknown > 0) parts.push(`${summary.unknown} unknown`);
  return parts.join(" · ") || "Quiet book";
}
