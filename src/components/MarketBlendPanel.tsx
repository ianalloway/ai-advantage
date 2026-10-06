import { useMemo } from "react";
import { Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { blendSamplesFromLedger, fitBlendWeight } from "@/lib/marketBlend";

export interface MarketBlendPanelProps {
  entries: Array<{ modelProb: number; impliedProb: number; ledgerOutcome: string; commenceTime?: string }>;
  minSample?: number;
}

/**
 * How much weight the model's view has actually earned against the posted
 * price, fitted on past rows and judged on rows the weight never saw.
 */
export default function MarketBlendPanel({ entries, minSample = 40 }: MarketBlendPanelProps) {
  const fit = useMemo(
    () => fitBlendWeight(blendSamplesFromLedger(entries), { minSample }),
    [entries, minSample],
  );

  const modelShare = Math.round(fit.weight * 100);

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Scale className="h-4 w-4 text-cyan-300" />
          Model vs the price
        </h2>
        <Badge
          variant="outline"
          className={
            !fit.usable
              ? "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
              : fit.improvedOutOfSample
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-300"
          }
        >
          {fit.usable ? `${modelShare}% model` : "Unfitted"}
        </Badge>
      </div>

      <p className="mt-2 text-sm leading-6 text-zinc-400">{fit.note}</p>

      {fit.usable ? (
        <>
          <div className="mt-5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              <span>All price</span>
              <span>Fitted weight</span>
              <span>All model</span>
            </div>
            <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400/60 to-emerald-300/70"
                style={{ width: `${modelShare}%` }}
              />
              <div
                className="absolute -top-1 w-0.5 bg-white"
                style={{ left: `${modelShare}%`, height: "1.125rem" }}
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Model alone</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">{fit.modelBrier.toFixed(4)}</div>
              <div className="mt-1 text-[11px] text-zinc-500">Brier, lower is better</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Price alone</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">{fit.marketBrier.toFixed(4)}</div>
              <div className="mt-1 text-[11px] text-zinc-500">the number on the board</div>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">Blended</div>
              <div className="mt-1 font-mono text-lg font-semibold text-cyan-200">{fit.blendBrier.toFixed(4)}</div>
              <div className="mt-1 text-[11px] text-zinc-500">at the fitted weight</div>
            </div>
          </div>

          {fit.holdoutSample > 0 ? (
            <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Held back: {fit.holdoutSample} rows the weight never saw
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
                <div className="text-zinc-300">model {fit.holdoutModelBrier?.toFixed(4) ?? "—"}</div>
                <div className="text-zinc-300">price {fit.holdoutMarketBrier?.toFixed(4) ?? "—"}</div>
                <div className={fit.improvedOutOfSample ? "text-emerald-300" : "text-amber-300"}>
                  blend {fit.holdoutBlendBrier?.toFixed(4) ?? "—"}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        The market input is the break-even probability the posted price demands, margin included — so a weight of zero
        means defer to the price as it stands. This is a different question from calibration: that fixes a model running
        hot or cold, this asks how much the model's view is worth against the number the market is already quoting.
      </p>
    </div>
  );
}
