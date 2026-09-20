import { useMemo } from "react";
import { Layers, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatParlayVerdict, priceParlay, type ParlayLeg, type ParlayVerdict } from "@/lib/parlay";
import { formatOdds, formatProb } from "@/lib/predictions";

function verdictClasses(verdict: ParlayVerdict) {
  if (verdict === "playable") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (verdict === "singles-better") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (verdict === "skip") return "border-red-400/30 bg-red-400/10 text-red-300";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}

export interface ParlayBuilderProps {
  legs: ParlayLeg[];
  bankroll: number;
  kellyFraction: number;
  onRemoveLeg: (id: string) => void;
  onClear: () => void;
}

/**
 * Prices a multi-leg ticket against the honest alternative — the same legs bet
 * straight — rather than just multiplying the payout and calling it upside.
 */
export default function ParlayBuilder({ legs, bankroll, kellyFraction, onRemoveLeg, onClear }: ParlayBuilderProps) {
  const pricing = useMemo(
    () => priceParlay(legs, { bankroll, kellyFraction }),
    [legs, bankroll, kellyFraction],
  );

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-cyan-300" />
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-white">Parlay desk</span>
        </span>
        <Badge variant="outline" className={verdictClasses(pricing.verdict)}>
          {formatParlayVerdict(pricing.verdict)}
        </Badge>
      </div>

      {legs.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Add legs from the board to price a ticket. The desk multiplies the posted prices the way a book does, then
          shows what the compounded hold costs and whether the legs are better bet straight.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            {legs.map((leg) => (
              <div
                key={leg.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">{leg.label}</div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    {formatOdds(leg.americanOdds)} · model {formatProb(leg.modelProb)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${leg.label} from the parlay`}
                  onClick={() => onRemoveLeg(leg.id)}
                  className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {pricing.verdict === "unavailable" ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
              {pricing.rationale}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Ticket price</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-sky-300">
                    {formatOdds(pricing.americanOdds)}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">{pricing.decimalOdds.toFixed(2)}x payout</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Compounded hold</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-red-300">
                    {pricing.holdPct !== undefined ? `${pricing.holdPct.toFixed(1)}%` : "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {pricing.legHoldPct !== undefined
                      ? `${pricing.legHoldPct.toFixed(1)}% per leg, ${pricing.legs}x`
                      : "no fair line on every leg"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-zinc-300">
                  <div>Model {formatProb(pricing.modelProb)}</div>
                  <div>Book {formatProb(pricing.impliedProb)}</div>
                  <div>
                    EV/$ {pricing.evPerDollar >= 0 ? "+" : ""}
                    {pricing.evPerDollar.toFixed(3)}
                  </div>
                  <div>
                    Straight EV/$ {pricing.straightEvPerDollar >= 0 ? "+" : ""}
                    {pricing.straightEvPerDollar.toFixed(3)}
                  </div>
                  <div>Parlay growth {pricing.parlayGrowthRate.toFixed(5)}</div>
                  <div>Split growth {pricing.straightGrowthRate.toFixed(5)}</div>
                </div>
                {pricing.correlationLiftPts > 0 ? (
                  <div className="mt-2 text-[11px] text-cyan-200/80">
                    Correlation between legs adds {pricing.correlationLiftPts.toFixed(1)} points over treating them as
                    independent.
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-brand-400/20 bg-brand-400/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-brand-200/80">Kelly stake</div>
                    <div className="mt-1 text-base font-semibold text-white">
                      ${pricing.suggestedStake.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right text-sm font-bold text-brand-300">
                    {(pricing.kellyPct * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              <p className="text-xs leading-5 text-zinc-400">{pricing.rationale}</p>
            </>
          )}

          <Button
            size="sm"
            variant="outline"
            className="w-full border-white/10 text-zinc-300 hover:bg-white/[0.06]"
            onClick={onClear}
          >
            Clear ticket
          </Button>
        </div>
      )}
    </div>
  );
}
