import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LineChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { simulateSlate } from "@/lib/slateSimulation";
import type { RiskPosition } from "@/lib/portfolioRisk";

export interface SlateSimulationPanelProps {
  positions: RiskPosition[];
  bankroll: number;
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * What a month of this slate does to the bankroll, with the bets correlated
 * rather than treated as independent coin flips.
 */
export default function SlateSimulationPanel({ positions, bankroll }: SlateSimulationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [days, setDays] = useState(30);

  const result = useMemo(
    // A fixed seed keeps the view stable between renders — this is a distribution,
    // not a dice roll the user should be able to reroll by blinking.
    () => simulateSlate({ positions, bankroll, days, paths: 2000, seed: 20260101 }),
    [positions, bankroll, days],
  );

  const hasSlate = result.positions > 0;
  const span = Math.max(result.p95 - result.p5, 1);
  const markerAt = (value: number) => ((value - result.p5) / span) * 100;

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-brand-300" />
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-white">Slate outlook</span>
        </span>
        <span className="flex items-center gap-2">
          {hasSlate ? (
            <Badge
              variant="outline"
              className={
                result.probProfitPct >= 50
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-300"
              }
            >
              {result.probProfitPct.toFixed(0)}% ahead
            </Badge>
          ) : null}
          {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </span>
      </button>

      <p className="mt-2 text-xs leading-5 text-zinc-500">
        {hasSlate
          ? result.headline
          : "Size some positions on the board and this simulates what repeating them does to the bankroll."}
      </p>

      {isOpen && hasSlate ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
              <span className="uppercase tracking-[0.18em]">Nights simulated</span>
              <span className="font-mono text-cyan-200">{days}</span>
            </div>
            <Slider
              aria-label="Nights of comparable action to simulate"
              className="mt-3"
              valueText={`${days} nights`}
              min={5}
              max={120}
              step={5}
              value={[days]}
              onValueChange={(value) => setDays(value[0] ?? 30)}
            />
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              <span>p5 {money(result.p5)}</span>
              <span>p95 {money(result.p95)}</span>
            </div>
            <div className="relative mt-2 h-2.5 rounded-full bg-gradient-to-r from-red-400/40 via-white/15 to-emerald-400/50">
              <div
                className="absolute -top-0.5 h-3.5 w-0.5 rounded-full bg-white"
                style={{ left: `${Math.min(Math.max(markerAt(result.p50), 0), 100)}%` }}
                title={`Median ${money(result.p50)}`}
              />
              <div
                className="absolute -top-1.5 h-5 w-0.5 rounded-full bg-cyan-300"
                style={{ left: `${Math.min(Math.max(markerAt(result.startingBankroll), 0), 100)}%` }}
                title={`Starting bankroll ${money(result.startingBankroll)}`}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
              <div className="text-red-300">p25 {money(result.p25)}</div>
              <div className="text-white">median {money(result.p50)}</div>
              <div className="text-emerald-300">p75 {money(result.p75)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Typical worst drawdown</div>
              <div className="mt-1 font-mono text-sm font-semibold text-amber-300">
                {result.medianMaxDrawdownPct.toFixed(0)}%
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Risk of ruin</div>
              <div
                className={`mt-1 font-mono text-sm font-semibold ${
                  result.riskOfRuinPct >= 1 ? "text-red-300" : "text-emerald-300"
                }`}
              >
                {result.riskOfRuinPct.toFixed(2)}%
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Nightly stake</div>
              <div className="mt-1 font-mono text-sm font-semibold text-white">{money(result.dailyStake)}</div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Nightly EV</div>
              <div
                className={`mt-1 font-mono text-sm font-semibold ${
                  result.dailyEv >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {result.dailyEv >= 0 ? "+" : "-"}${Math.abs(result.dailyEv).toFixed(2)}
              </div>
            </div>
          </div>

          <p className="text-[11px] leading-5 text-zinc-500">
            {result.paths.toLocaleString()} paths over {result.positions} sized{" "}
            {result.positions === 1 ? "position" : "positions"}, drawn through a shared market factor at an average
            correlation of {result.avgCorrelation.toFixed(2)}. Correlated bets lose together, so this spread is wider
            than any single-bet number implies. A model, not a forecast.
          </p>
        </div>
      ) : null}
    </div>
  );
}
