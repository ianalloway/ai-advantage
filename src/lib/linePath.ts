import { americanToImpliedProb, formatOdds } from "@/lib/predictions";

/** Close-line value in implied-prob points (same convention as executionBoard). */
export function closeLineValuePts(entryOdds: number, closeOdds: number): number {
  return (americanToImpliedProb(closeOdds) - americanToImpliedProb(entryOdds)) * 100;
}

export type CloseVerdict = "beat" | "lost" | "push" | "pending";

export function closeVerdict(entryOdds: number | undefined, closeOdds: number | undefined): CloseVerdict {
  if (entryOdds === undefined || closeOdds === undefined) return "pending";
  const clv = closeLineValuePts(entryOdds, closeOdds);
  if (Math.abs(clv) < 0.05) return "push";
  return clv > 0 ? "beat" : "lost";
}

export interface LinePathPoint {
  label: "Open" | "Now" | "Close";
  odds: number;
}

export function buildLinePath(odds: {
  open?: number;
  current?: number;
  close?: number;
}): LinePathPoint[] {
  const points: LinePathPoint[] = [];
  if (odds.open !== undefined) points.push({ label: "Open", odds: odds.open });
  if (odds.current !== undefined) points.push({ label: "Now", odds: odds.current });
  if (odds.close !== undefined && odds.close !== odds.current) {
    points.push({ label: "Close", odds: odds.close });
  } else if (odds.close !== undefined && odds.open === undefined && odds.current === undefined) {
    points.push({ label: "Close", odds: odds.close });
  }
  return points;
}

export function formatCloseBadge(verdict: CloseVerdict, clvPts?: number): string {
  if (verdict === "pending") return "Close pending";
  if (verdict === "push") return "Matched close";
  const pts = clvPts !== undefined ? ` · ${clvPts > 0 ? "+" : ""}${clvPts.toFixed(1)} pts` : "";
  return verdict === "beat" ? `Beat close${pts}` : `Lost to close${pts}`;
}

export function formatPathLabel(points: LinePathPoint[]): string {
  return points.map((p) => `${p.label} ${formatOdds(p.odds)}`).join(" → ");
}
