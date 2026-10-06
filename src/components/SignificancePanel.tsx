import { useMemo } from "react";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  assessSignificance,
  significanceBetsFromLedger,
  type SignificanceVerdict,
} from "@/lib/significance";

function verdictClasses(verdict: SignificanceVerdict) {
  if (verdict === "significant") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (verdict === "not-yet") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (verdict === "losing") return "border-red-400/30 bg-red-400/10 text-red-300";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}

function verdictLabel(verdict: SignificanceVerdict) {
  if (verdict === "significant") return "Beyond luck";
  if (verdict === "not-yet") return "Not yet";
  if (verdict === "losing") return "No edge yet";
  return "Too few bets";
}

export interface SignificancePanelProps {
  entries: Array<{ entryOdds: number; ledgerOutcome: string }>;
  minSample?: number;
}

/**
 * The question a win rate cannot answer on its own: would a bettor with no edge
 * at all produce a record this good anyway?
 */
export default function SignificancePanel({ entries, minSample = 25 }: SignificancePanelProps) {
  const report = useMemo(
    () => assessSignificance(significanceBetsFromLedger(entries), { minSample }),
    [entries, minSample],
  );

  const spread = Math.max(report.wilsonUpperPct - report.wilsonLowerPct, 0.001);
  const breakevenAt = ((report.breakevenWinRatePct - report.wilsonLowerPct) / spread) * 100;
  const observedAt = ((report.winRatePct - report.wilsonLowerPct) / spread) * 100;
  const breakevenInside = breakevenAt >= 0 && breakevenAt <= 100;

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <FlaskConical className="h-4 w-4 text-emerald-300" />
          Is the edge real?
        </h2>
        <Badge variant="outline" className={verdictClasses(report.verdict)}>
          {verdictLabel(report.verdict)}
        </Badge>
      </div>

      <p className="mt-2 text-sm leading-6 text-zinc-400">{report.headline}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Record</div>
          <div className="mt-1 font-mono text-xl font-semibold text-white">
            {report.wins}-{report.losses}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">{report.winRatePct.toFixed(1)}% win rate</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Break-even needs</div>
          <div className="mt-1 font-mono text-xl font-semibold text-cyan-200">
            {report.breakevenWinRatePct.toFixed(1)}%
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">at the prices taken</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Luck explains it</div>
          <div
            className={`mt-1 font-mono text-xl font-semibold ${
              report.significant ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            {(report.pValue * 100).toFixed(1)}%
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">of the time</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            {report.significant ? "Unit ROI" : "Bets still needed"}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold text-white">
            {report.significant
              ? `${report.observedRoiPct >= 0 ? "+" : ""}${report.observedRoiPct.toFixed(1)}%`
              : report.betsNeeded !== undefined
                ? report.betsNeeded.toLocaleString()
                : "—"}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {report.significant ? "per bet staked" : "at this rate"}
          </div>
        </div>
      </div>

      {report.bets > 0 ? (
        <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            <span>{report.wilsonLowerPct.toFixed(1)}%</span>
            <span>95% confidence range on the true win rate</span>
            <span>{report.wilsonUpperPct.toFixed(1)}%</span>
          </div>
          <div className="relative mt-3 h-2.5 rounded-full bg-gradient-to-r from-cyan-400/25 via-cyan-300/40 to-cyan-400/25">
            <div
              className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-white"
              style={{ left: `${Math.min(Math.max(observedAt, 0), 100)}%`, height: "1.125rem" }}
              title={`Observed ${report.winRatePct.toFixed(1)}%`}
            />
            {breakevenInside ? (
              <div
                className="absolute -top-1 w-0.5 rounded-full bg-amber-300"
                style={{ left: `${breakevenAt}%`, height: "1.125rem" }}
                title={`Break-even ${report.breakevenWinRatePct.toFixed(1)}%`}
              />
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {breakevenInside
              ? "Break-even sits inside the range, so a true edge of zero is still consistent with this record."
              : report.winRatePct > report.breakevenWinRatePct
                ? "The whole range clears break-even — the record is hard to explain without a real edge."
                : "The whole range sits under break-even at these prices."}
          </p>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        The test is an exact one-sided binomial against the break-even rate the prices actually demand, not against a
        flat 52.4%. Pushes and pending rows carry no information and are excluded.
      </p>
    </div>
  );
}
