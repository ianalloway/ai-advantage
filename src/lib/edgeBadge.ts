/** DawBets-style badge tiers — but keyed off *execution-adjusted* edge, not raw EV. */

export type EdgeBadgeTier = "must" | "strong" | "watch" | "pass";

export interface EdgeBadge {
  tier: EdgeBadgeTier;
  label: string;
  shortLabel: string;
  className: string;
}

export function getEdgeBadge(executionAdjustedEdge: number, hasValueBet: boolean): EdgeBadge {
  if (!hasValueBet || executionAdjustedEdge < 3) {
    return {
      tier: "pass",
      label: "Pass",
      shortLabel: "PASS",
      className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
    };
  }
  if (executionAdjustedEdge >= 8) {
    return {
      tier: "must",
      label: "Must bet",
      shortLabel: "MUST",
      className: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
    };
  }
  if (executionAdjustedEdge >= 5) {
    return {
      tier: "strong",
      label: "Strong",
      shortLabel: "STRONG",
      className: "border-cyan-400/35 bg-cyan-400/12 text-cyan-200",
    };
  }
  return {
    tier: "watch",
    label: "Watch",
    shortLabel: "WATCH",
    className: "border-amber-400/35 bg-amber-400/12 text-amber-200",
  };
}
