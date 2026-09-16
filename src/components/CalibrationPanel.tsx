import { useMemo } from "react";
import { Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  buildCalibrationReport,
  calibrationSamplesFromLedger,
  type CalibrationVerdict,
} from "@/lib/calibration";

function verdictClasses(verdict: CalibrationVerdict) {
  if (verdict === "calibrated") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (verdict === "overconfident") return "border-red-400/30 bg-red-400/10 text-red-300";
  if (verdict === "underconfident") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}

function verdictLabel(verdict: CalibrationVerdict) {
  if (verdict === "calibrated") return "Calibrated";
  if (verdict === "overconfident") return "Runs hot";
  if (verdict === "underconfident") return "Runs cold";
  return "Sample too small";
}

export interface CalibrationPanelProps {
  entries: Array<{ modelProb: number; ledgerOutcome: string }>;
  /** Minimum settled bets before a verdict is published. */
  minSample?: number;
}

/**
 * Reliability of the model's probabilities over the graded ledger — the check
 * that a win rate alone cannot give you, and the one that decides whether Kelly
 * stakes derived from those probabilities were the right size.
 */
export default function CalibrationPanel({ entries, minSample = 20 }: CalibrationPanelProps) {
  const report = useMemo(
    () => buildCalibrationReport(calibrationSamplesFromLedger(entries), { buckets: 5, minSample }),
    [entries, minSample],
  );

  const populated = report.buckets.filter((bucket) => bucket.count > 0);

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Gauge className="h-4 w-4 text-brand-300" />
          Model calibration
        </h2>
        <Badge variant="outline" className={verdictClasses(report.verdict)}>
          {verdictLabel(report.verdict)}
        </Badge>
      </div>

      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {report.headline} Win rate says whether the desk won; calibration says whether the probabilities behind the
        stakes were honest.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Settled sample</div>
          <div className="mt-1 text-xl font-semibold text-white">{report.sample}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Brier score</div>
          <div className="mt-1 text-xl font-semibold text-white">{report.brierScore.toFixed(3)}</div>
          <div className="mt-1 text-[11px] text-zinc-500">0.25 = coin flip</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Predicted vs actual</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {(report.avgPredicted * 100).toFixed(1)}% / {(report.actualRate * 100).toFixed(1)}%
          </div>
          <div
            className={`mt-1 text-[11px] ${
              Math.abs(report.biasPts) <= 3 ? "text-emerald-300" : report.biasPts > 0 ? "text-red-300" : "text-amber-300"
            }`}
          >
            {report.biasPts > 0 ? "+" : ""}
            {report.biasPts.toFixed(1)} pts bias
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Calibration error</div>
          <div className="mt-1 text-xl font-semibold text-white">{report.expectedCalibrationError.toFixed(1)} pts</div>
          <div className="mt-1 text-[11px] text-zinc-500">weighted bucket gap</div>
        </div>
      </div>

      {populated.length > 0 ? (
        <div className="mt-5 space-y-3">
          {populated.map((bucket) => {
            const predictedWidth = Math.min(bucket.avgPredicted * 100, 100);
            const actualWidth = Math.min(bucket.actualRate * 100, 100);
            return (
              <div key={bucket.label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-zinc-300">{bucket.label} band</span>
                  <span className="text-zinc-500">
                    {bucket.count} bet{bucket.count === 1 ? "" : "s"} ·{" "}
                    <span className={Math.abs(bucket.gapPts) <= 5 ? "text-emerald-300" : "text-amber-300"}>
                      {bucket.gapPts > 0 ? "+" : ""}
                      {bucket.gapPts.toFixed(1)} pts
                    </span>
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Model</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-cyan-300/70" style={{ width: `${predictedWidth}%` }} />
                    </div>
                    <span className="w-12 text-right font-mono text-[11px] text-cyan-200">
                      {predictedWidth.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Actual</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-emerald-300/70" style={{ width: `${actualWidth}%` }} />
                    </div>
                    <span className="w-12 text-right font-mono text-[11px] text-emerald-200">
                      {actualWidth.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/8 bg-black/25 p-4 text-sm text-zinc-400">
          Nothing graded yet. Buckets fill in as tracked bets settle — pushes and pending rows are excluded because they
          say nothing about the probability.
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        Brier skill vs the base rate: {report.brierSkillScore >= 0 ? "+" : ""}
        {report.brierSkillScore.toFixed(3)} · log loss {report.logLoss.toFixed(3)}
        {report.skipped > 0 ? ` · ${report.skipped} row${report.skipped === 1 ? "" : "s"} skipped` : ""}
      </p>
    </div>
  );
}
