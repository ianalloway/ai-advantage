import { useMemo } from "react";
import { TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildEdgeDecayReport, type DecaySource, type DecayVerdict } from "@/lib/edgeDecay";

function verdictClasses(verdict: DecayVerdict) {
  if (verdict === "holding") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (verdict === "improving") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  if (verdict === "decaying") return "border-red-400/30 bg-red-400/10 text-red-300";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}

function verdictLabel(verdict: DecayVerdict) {
  if (verdict === "holding") return "Holding up";
  if (verdict === "improving") return "Improving";
  if (verdict === "decaying") return "Decaying";
  return "Too few bets";
}

export interface EdgeDecayPanelProps {
  entries: DecaySource[];
  minPerHalf?: number;
}

/**
 * The edge measured against time rather than against category. A lifetime ROI
 * survives an edge that stopped working months ago; this is where that shows.
 */
export default function EdgeDecayPanel({ entries, minPerHalf = 20 }: EdgeDecayPanelProps) {
  const report = useMemo(
    () => buildEdgeDecayReport(entries, { windows: 4, minPerHalf }),
    [entries, minPerHalf],
  );

  const widest = Math.max(10, ...report.windows.map((window) => Math.abs(window.roiPct)));

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <TrendingDown className="h-4 w-4 text-amber-300" />
          Is the edge decaying?
        </h2>
        <Badge variant="outline" className={verdictClasses(report.verdict)}>
          {verdictLabel(report.verdict)}
        </Badge>
      </div>

      <p className="mt-2 text-sm leading-6 text-zinc-400">{report.headline}</p>

      {report.windows.length > 0 ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Earlier half</div>
              <div className="mt-1 font-mono text-xl font-semibold text-white">
                {report.earlyRoiPct >= 0 ? "+" : ""}
                {report.earlyRoiPct.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">{report.earlyWinRatePct.toFixed(0)}% win rate</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Recent half</div>
              <div
                className={`mt-1 font-mono text-xl font-semibold ${
                  report.recentRoiPct >= report.earlyRoiPct ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                {report.recentRoiPct >= 0 ? "+" : ""}
                {report.recentRoiPct.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">{report.recentWinRatePct.toFixed(0)}% win rate</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Difference</div>
              <div
                className={`mt-1 font-mono text-xl font-semibold ${
                  report.deltaRoiPts >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {report.deltaRoiPts >= 0 ? "+" : ""}
                {report.deltaRoiPts.toFixed(1)} pts
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">p {report.pValue.toFixed(3)}</div>
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            {report.windows.map((window) => {
              const width = (Math.abs(window.roiPct) / widest) * 100;
              return (
                <div key={window.index} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-zinc-300">{window.label}</span>
                    <span className="text-zinc-500">
                      {window.wins}-{window.losses} ·{" "}
                      <span className={window.roiPct >= 0 ? "text-emerald-300" : "text-red-300"}>
                        {window.roiPct >= 0 ? "+" : ""}
                        {window.roiPct.toFixed(1)}% ROI
                      </span>
                      {window.avgClvPts !== undefined ? ` · CLV ${window.avgClvPts.toFixed(2)}` : ""}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${window.roiPct >= 0 ? "bg-emerald-300/70" : "bg-red-400/70"}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        Profit is one flat unit per bet at the recorded price, and the halves are compared with a two-proportion test
        rather than by eye — a drop has to be bigger than the noise this sample produces before it is called decay.
      </p>
    </div>
  );
}
