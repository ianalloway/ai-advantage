import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import {
  formatSteamDeskBadge,
  summarizeSteamDesk,
  type SteamDeskEntry,
  type SteamDeskSummary,
} from "@/lib/steamLens";

function formatPts(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function toneForBook(summary: SteamDeskSummary) {
  if (summary.known === 0) {
    return { text: "text-zinc-300", ring: "border-zinc-500/30 bg-zinc-500/10", label: "No opens" };
  }
  if (summary.steamedToward > summary.steamedAgainst && summary.steamedToward > 0) {
    return { text: "text-orange-300", ring: "border-orange-400/30 bg-orange-400/10", label: "Steam heavy" };
  }
  if (summary.steamedAgainst > summary.steamedToward && summary.steamedAgainst > 0) {
    return { text: "text-violet-300", ring: "border-violet-400/30 bg-violet-400/10", label: "Reverse heavy" };
  }
  if (summary.steamedToward === 0 && summary.steamedAgainst === 0) {
    return { text: "text-zinc-300", ring: "border-zinc-500/30 bg-zinc-500/10", label: "Quiet" };
  }
  return { text: "text-amber-300", ring: "border-amber-400/30 bg-amber-400/10", label: "Mixed" };
}

function MetricTile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-black ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-zinc-500">{sub}</p>
    </div>
  );
}

export default function SteamLensPanel({ entries }: { entries: SteamDeskEntry[] }) {
  const [isOpen, setIsOpen] = useState(true);
  const summary = useMemo(() => summarizeSteamDesk(entries), [entries]);
  const tone = toneForBook(summary);

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className={`h-4 w-4 ${tone.text}`} />
          <div>
            <h3 className="text-sm font-bold text-white">Steam lens</h3>
            <p className="text-[11px] text-zinc-500">Open → now on each lean</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${tone.ring} ${tone.text}`}>
            {tone.label}
          </Badge>
          <button
            type="button"
            aria-label={isOpen ? "Collapse steam lens" : "Expand steam lens"}
            className="text-zinc-500 transition hover:text-white"
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {isOpen ? (
        summary.sample === 0 ? (
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            No picks on the filtered desk right now. Steam stays blank rather than inventing opens.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-zinc-400">{formatSteamDeskBadge(summary)}</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <MetricTile
                label="Steam toward"
                value={String(summary.steamedToward)}
                sub="Lean shortened since open"
                tone={summary.steamedToward > 0 ? "text-orange-300" : "text-zinc-400"}
              />
              <MetricTile
                label="Reverse"
                value={String(summary.steamedAgainst)}
                sub="Lean lengthened since open"
                tone={summary.steamedAgainst > 0 ? "text-violet-300" : "text-zinc-400"}
              />
              <MetricTile
                label="Quiet"
                value={String(summary.quiet)}
                sub="<8¢ / <1 pts band"
                tone="text-zinc-300"
              />
              <MetricTile
                label="Mean |move|"
                value={formatPts(summary.meanAbsMovePts)}
                sub={
                  summary.known === 0
                    ? "Waiting on opens"
                    : `Signed mean ${formatPts(summary.meanMovePts)} · ${summary.known} known`
                }
                tone="text-cyan-300"
              />
            </div>

            <p className="mt-4 border-t border-white/5 pt-3 text-[10px] leading-4 text-zinc-600">
              Steam = open→now on the ticket side (≥8 American or ≥1 implied-prob pts). Positive pts means the
              lean shortened. Unknown rows have no open — they are counted, not guessed.
            </p>
          </>
        )
      ) : null}
    </div>
  );
}
