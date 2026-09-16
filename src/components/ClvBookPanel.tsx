import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, LineChart } from "lucide-react";
import {
  formatClvBookBadge,
  summarizeClv,
  type ClvRollupEntry,
  type ClvRollupSummary,
} from "@/lib/clvRollup";

function formatPts(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatPct(rate: number | undefined): string {
  if (rate === undefined) return "—";
  return `${Math.round(rate * 100)}%`;
}

function toneForBook(summary: ClvRollupSummary) {
  if (summary.settled === 0) {
    return { text: "text-zinc-300", ring: "border-zinc-500/30 bg-zinc-500/10", label: "Pending" };
  }
  if ((summary.meanClvPts ?? 0) > 0.05 && (summary.beatRate ?? 0) >= 0.5) {
    return { text: "text-emerald-300", ring: "border-emerald-400/30 bg-emerald-400/10", label: "Beating close" };
  }
  if ((summary.meanClvPts ?? 0) < -0.05) {
    return { text: "text-red-300", ring: "border-red-400/30 bg-red-400/10", label: "Trailing close" };
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

export default function ClvBookPanel({ entries }: { entries: ClvRollupEntry[] }) {
  const [isOpen, setIsOpen] = useState(true);
  const summary = useMemo(() => summarizeClv(entries), [entries]);
  const tone = toneForBook(summary);

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <LineChart className={`h-4 w-4 ${tone.text}`} />
          <div>
            <h3 className="text-sm font-bold text-white">CLV book</h3>
            <p className="text-[11px] text-zinc-500">Mean close-line value across today’s desk</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${tone.ring} ${tone.text}`}>
            {tone.label}
          </Badge>
          <button
            type="button"
            aria-label={isOpen ? "Collapse CLV book" : "Expand CLV book"}
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
            No picks on the filtered desk right now. This panel stays empty rather than inventing a CLV sample.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-zinc-400">{formatClvBookBadge(summary)}</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <MetricTile
                label="Mean CLV"
                value={formatPts(summary.meanClvPts)}
                sub={
                  summary.settled === 0
                    ? "Waiting on closes"
                    : `Median ${formatPts(summary.medianClvPts)} · ${summary.settled} settled`
                }
                tone={
                  summary.meanClvPts === undefined
                    ? "text-zinc-400"
                    : summary.meanClvPts > 0.05
                      ? "text-emerald-300"
                      : summary.meanClvPts < -0.05
                        ? "text-red-300"
                        : "text-white"
                }
              />
              <MetricTile
                label="Beat rate"
                value={formatPct(summary.beatRate)}
                sub={`${summary.beat} beat · ${summary.lost} lost · ${summary.push} push`}
                tone={
                  summary.beatRate === undefined
                    ? "text-zinc-400"
                    : summary.beatRate >= 0.5
                      ? "text-emerald-300"
                      : "text-amber-300"
                }
              />
              <MetricTile
                label="Pending close"
                value={String(summary.pending)}
                sub={`${summary.sample} picks on the book`}
                tone="text-zinc-300"
              />
              <MetricTile
                label="Settled"
                value={String(summary.settled)}
                sub={
                  summary.settled === 0
                    ? "Honest blank until ESPN posts close"
                    : "Entry vs close (implied-prob pts)"
                }
                tone="text-cyan-300"
              />
            </div>

            <p className="mt-4 border-t border-white/5 pt-3 text-[10px] leading-4 text-zinc-600">
              Positive pts means the entry beat the close. Pending rows have no close yet — they are counted, not
              guessed.
            </p>
          </>
        )
      ) : null}
    </div>
  );
}
