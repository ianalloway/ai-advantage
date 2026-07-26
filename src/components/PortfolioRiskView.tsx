import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Layers,
  Lock,
  Scissors,
  Shield,
  ShieldCheck,
} from "lucide-react";
import {
  analyzePortfolioRisk,
  type ExposureDimension,
  type PortfolioRiskReport,
  type RiskPosition,
} from "@/lib/portfolioRisk";
import type { RiskProfile } from "@/lib/profile";

const DIMENSION_LABEL: Record<ExposureDimension, string> = {
  team: "Team",
  game: "Game",
  sport: "Sport",
  narrative: "Narrative",
};

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function toneForExposure(report: PortfolioRiskReport) {
  if (report.warnings.some((warning) => warning.severity === "high")) {
    return { text: "text-red-300", ring: "border-red-400/30 bg-red-400/10", label: "Concentrated" };
  }
  if (report.warnings.length > 0) {
    return { text: "text-amber-300", ring: "border-amber-400/30 bg-amber-400/10", label: "Watch" };
  }
  return { text: "text-emerald-300", ring: "border-emerald-400/30 bg-emerald-400/10", label: "Balanced" };
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

function ClusterBar({
  label,
  dimension,
  positions,
  bankrollPct,
  limitPct,
  overLimit,
}: {
  label: string;
  dimension: ExposureDimension;
  positions: number;
  bankrollPct: number;
  limitPct: number;
  overLimit: boolean;
}) {
  const fill = limitPct > 0 ? Math.min((bankrollPct / limitPct) * 100, 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded border border-white/10 px-1 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
            {DIMENSION_LABEL[dimension]}
          </span>
          <span className="truncate text-zinc-300">{label}</span>
          {positions > 1 ? <span className="shrink-0 text-[10px] text-zinc-600">×{positions}</span> : null}
        </span>
        <span className={`shrink-0 font-mono ${overLimit ? "text-red-300" : "text-zinc-400"}`}>
          {bankrollPct.toFixed(1)}% / {limitPct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${overLimit ? "bg-red-400" : "bg-cyan-300/70"}`}
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  );
}

export default function PortfolioRiskView({
  positions,
  bankroll,
  riskProfile = "balanced",
  locked = false,
  onUnlock,
}: {
  positions: RiskPosition[];
  bankroll: number;
  riskProfile?: RiskProfile;
  locked?: boolean;
  onUnlock?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  const report = useMemo(
    () => analyzePortfolioRisk(positions, bankroll, riskProfile),
    [positions, bankroll, riskProfile],
  );

  const tone = toneForExposure(report);
  const visibleClusters = useMemo(
    () =>
      report.clusters
        .filter((cluster) => {
          // Below three positions a narrative bucket is just the bets themselves, and
          // its limit is not enforced — showing the bar would imply a cap that is not real.
          if (cluster.dimension === "narrative") return cluster.positions >= 3;
          return cluster.positions > 1 || cluster.overLimit;
        })
        .slice(0, 6),
    [report.clusters],
  );

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {report.warnings.length > 0 ? (
            <Shield className={`h-4 w-4 ${tone.text}`} />
          ) : (
            <ShieldCheck className={`h-4 w-4 ${tone.text}`} />
          )}
          <div>
            <h3 className="text-sm font-bold text-white">Portfolio risk</h3>
            <p className="text-[11px] text-zinc-500">Correlated exposure across the filtered desk</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${tone.ring} ${tone.text}`}>
            {tone.label}
          </Badge>
          <button
            type="button"
            aria-label={isOpen ? "Collapse portfolio risk" : "Expand portfolio risk"}
            className="text-zinc-500 transition hover:text-white"
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {isOpen ? (
        report.positions === 0 ? (
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            No sized positions on the desk right now. Lower the execution-edge filter or wait for the next slate — this
            panel stays empty rather than inventing exposure.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <MetricTile
                label="Slate exposure"
                value={`${report.exposurePct.toFixed(1)}%`}
                sub={`${money(report.totalStake)} across ${report.positions} ${report.positions === 1 ? "position" : "positions"}`}
                tone={tone.text}
              />
              <MetricTile
                label="1σ swing"
                value={`±${report.oneSigmaSwingPct.toFixed(1)}%`}
                sub={`±${money(report.correlatedSigma)} on a typical night`}
                tone="text-white"
              />
              <MetricTile
                label="Correlation"
                value={`${report.correlationMultiple.toFixed(2)}×`}
                sub={
                  report.correlationMultiple > 1.25
                    ? "These bets lose together"
                    : "Close to independent risk"
                }
                tone={report.correlationMultiple > 1.25 ? "text-red-300" : "text-emerald-300"}
              />
              <MetricTile
                label="Diversification"
                value={`${report.diversificationScore}`}
                sub={`Expected ${report.expectedValue >= 0 ? "+" : "−"}${money(Math.abs(report.expectedValue))} on the slate`}
                tone={report.diversificationScore >= 60 ? "text-emerald-300" : "text-amber-300"}
              />
            </div>

            {locked ? (
              <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.06] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-yellow-200">
                  <Lock className="h-3.5 w-3.5" />
                  Exposure breakdown is premium
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-400">
                  The headline numbers stay open. Unlock to see which team, game, and narrative buckets are over their
                  limits — and the stake haircut that pulls them back.
                </p>
                {onUnlock ? (
                  <Button
                    size="sm"
                    className="mt-3 bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"
                    onClick={onUnlock}
                  >
                    Unlock risk view
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                {report.warnings.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {report.warnings.slice(0, 4).map((warning) => (
                      <li
                        key={warning.code}
                        className={`flex gap-2 rounded-xl border p-2.5 text-[11px] leading-5 ${
                          warning.severity === "high"
                            ? "border-red-400/20 bg-red-400/[0.07] text-red-100"
                            : "border-amber-400/20 bg-amber-400/[0.07] text-amber-100"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{warning.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-2.5 text-[11px] leading-5 text-emerald-100">
                    Every team, game, and sport bucket is inside its {riskProfile} limit. No trim needed.
                  </p>
                )}

                {visibleClusters.length > 0 ? (
                  <div className="mt-4">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                      <Layers className="h-3 w-3" />
                      Exposure buckets
                    </div>
                    <div className="mt-3 space-y-3">
                      {visibleClusters.map((cluster) => (
                        <ClusterBar
                          key={cluster.key}
                          label={cluster.label}
                          dimension={cluster.dimension}
                          positions={cluster.positions}
                          bankrollPct={cluster.bankrollPct}
                          limitPct={cluster.limitPct}
                          overLimit={cluster.overLimit}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {report.haircutPct > 0 ? (
                  <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cyan-200">
                      <Scissors className="h-3 w-3" />
                      De-correlated plan
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-300">
                      Trim the slate {report.haircutPct.toFixed(0)}% — {money(report.totalStake)} down to{" "}
                      <span className="font-mono font-semibold text-cyan-200">{money(report.suggestedTotalStake)}</span>{" "}
                      — and every bucket lands inside its limit.
                      {report.correlationScale < 1
                        ? ` Includes a ${((1 - report.correlationScale) * 100).toFixed(0)}% correlation haircut on top of the bucket caps.`
                        : ""}
                    </p>
                  </div>
                ) : null}
              </>
            )}

            <p className="mt-4 border-t border-white/5 pt-3 text-[10px] leading-4 text-zinc-600">
              Limits follow your {riskProfile} risk profile against a {money(report.bankroll)} bankroll. Correlations are
              coarse assumptions — same game, same team, same league — not a fitted covariance matrix.
            </p>
          </>
        )
      ) : null}
    </div>
  );
}
