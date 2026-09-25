import { useMemo, useState } from "react";
import { PieChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildSegmentReport, type SegmentDimension, type SegmentSource } from "@/lib/segments";

const DIMENSION_LABELS: Record<SegmentDimension, string> = {
  sport: "Sport",
  edge: "Edge band",
  side: "Side",
  window: "Timing",
};

const DIMENSIONS = Object.keys(DIMENSION_LABELS) as SegmentDimension[];

export interface SegmentBreakdownProps {
  entries: SegmentSource[];
  minSample?: number;
}

/**
 * Where the ledger's return actually comes from. A headline ROI averages a desk's
 * best segment together with the one giving it back; this separates them, and
 * marks every split that is still too thin to believe.
 */
export default function SegmentBreakdown({ entries, minSample = 15 }: SegmentBreakdownProps) {
  const [dimension, setDimension] = useState<SegmentDimension>("sport");
  const report = useMemo(() => buildSegmentReport(entries, { minSample }), [entries, minSample]);
  const rows = report.dimensions[dimension];
  const widest = Math.max(1, ...rows.map((row) => Math.abs(row.roiPct)));

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <PieChart className="h-4 w-4 text-cyan-300" />
          Edge attribution
        </h2>
        <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300">
          {report.totalSettled} settled
        </Badge>
      </div>

      <p className="mt-2 text-sm leading-6 text-zinc-400">{report.headline}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {DIMENSIONS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setDimension(candidate)}
            aria-pressed={dimension === candidate}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              dimension === candidate
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 text-zinc-400 hover:bg-white/[0.06]"
            }`}
          >
            {DIMENSION_LABELS[candidate]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-white/8 bg-black/25 p-4 text-sm text-zinc-400">
          Nothing graded in this cut yet.
        </div>
      ) : (
        <div className="mt-5 space-y-2.5">
          {rows.map((row) => {
            const width = (Math.abs(row.roiPct) / widest) * 100;
            return (
              <div key={row.key} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{row.label}</span>
                    {!row.reliable ? (
                      <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-200">
                        Thin sample
                      </span>
                    ) : null}
                  </div>
                  <div className="font-mono text-xs text-zinc-400">
                    {row.wins}-{row.losses}
                    {row.pushes > 0 ? `-${row.pushes}` : ""} ·{" "}
                    <span className={row.roiPct >= 0 ? "text-emerald-300" : "text-red-300"}>
                      {row.roiPct >= 0 ? "+" : ""}
                      {row.roiPct.toFixed(1)}% ROI
                    </span>
                  </div>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${
                      row.roiPct >= 0 ? "bg-emerald-300/70" : "bg-red-400/70"
                    } ${row.reliable ? "" : "opacity-40"}`}
                    style={{ width: `${width}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-500">
                  <span>{row.unitsProfit >= 0 ? "+" : ""}{row.unitsProfit.toFixed(2)}u</span>
                  <span>win {row.winRatePct.toFixed(0)}%</span>
                  <span>avg edge {row.avgExecEdge.toFixed(1)}%</span>
                  {row.avgClvPts !== undefined ? <span>CLV {row.avgClvPts.toFixed(2)} pts</span> : null}
                  {row.beatCloseRatePct !== undefined ? <span>beat close {row.beatCloseRatePct.toFixed(0)}%</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        Profit is one flat unit per bet at the recorded price, so segments compare on equal terms rather than on
        whichever got the biggest stake. Anything under {report.minSample} settled bets is marked thin and kept out of
        the best/worst call.
      </p>
    </div>
  );
}
