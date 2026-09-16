import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { calculateHedge, formatHedgeVerdict, partialHedge, type HedgeVerdict } from "@/lib/hedge";
import { formatOdds } from "@/lib/predictions";

function verdictClasses(verdict: HedgeVerdict) {
  if (verdict === "hedge") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (verdict === "partial") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (verdict === "let-it-ride") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}

function money(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export interface HedgeCalculatorProps {
  /** Prefill from a live board position — the ticket you would actually be hedging. */
  defaultEntryOdds?: number;
  defaultStake?: number;
  defaultHedgeOdds?: number;
  defaultModelProb?: number;
  /** Shown above the inputs so the prefill is traceable to a game. */
  contextLabel?: string;
}

export default function HedgeCalculator({
  defaultEntryOdds = 150,
  defaultStake = 100,
  defaultHedgeOdds = -130,
  defaultModelProb,
  contextLabel,
}: HedgeCalculatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [entryOdds, setEntryOdds] = useState(defaultEntryOdds);
  const [stake, setStake] = useState(defaultStake);
  const [hedgeOdds, setHedgeOdds] = useState(defaultHedgeOdds);
  const [modelProbPct, setModelProbPct] = useState(Math.round((defaultModelProb ?? 0.5) * 100));
  const [fraction, setFraction] = useState(1);
  const [touched, setTouched] = useState(false);

  // Track the board while the user has not taken over the inputs.
  useEffect(() => {
    if (touched) return;
    setEntryOdds(defaultEntryOdds);
    setStake(defaultStake);
    setHedgeOdds(defaultHedgeOdds);
    setModelProbPct(Math.round((defaultModelProb ?? 0.5) * 100));
  }, [defaultEntryOdds, defaultStake, defaultHedgeOdds, defaultModelProb, touched]);

  const input = useMemo(
    () => ({ entryOdds, stake, hedgeOdds, modelProb: modelProbPct / 100 }),
    [entryOdds, stake, hedgeOdds, modelProbPct],
  );
  const result = useMemo(() => calculateHedge(input), [input]);
  const scaled = useMemo(() => partialHedge(input, fraction), [input, fraction]);

  const priceable = result.verdict !== "unavailable";

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-cyan-300" />
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-white">Hedge desk</span>
        </span>
        <span className="flex items-center gap-2">
          {priceable ? (
            <Badge variant="outline" className={verdictClasses(result.verdict)}>
              {formatHedgeVerdict(result.verdict)}
            </Badge>
          ) : null}
          {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </span>
      </button>

      <p className="mt-2 text-xs leading-5 text-zinc-500">
        Price a live ticket against the other side: the stake that equalises both branches, what the lock is worth, and
        whether taking it beats letting the model's edge run.
      </p>

      {isOpen ? (
        <div className="mt-4 space-y-4">
          {contextLabel ? (
            <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs text-zinc-400">
              Prefilled from <span className="text-zinc-200">{contextLabel}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="hedge-entry-odds" className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Entry odds
              </Label>
              <Input
                id="hedge-entry-odds"
                type="number"
                className="mt-1 h-9 border-white/10 bg-black/30 font-mono text-sm text-white"
                value={entryOdds}
                onChange={(event) => {
                  setTouched(true);
                  setEntryOdds(Number(event.target.value));
                }}
              />
            </div>
            <div>
              <Label htmlFor="hedge-stake" className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Stake ($)
              </Label>
              <Input
                id="hedge-stake"
                type="number"
                min={0}
                className="mt-1 h-9 border-white/10 bg-black/30 font-mono text-sm text-white"
                value={stake}
                onChange={(event) => {
                  setTouched(true);
                  setStake(Number(event.target.value));
                }}
              />
            </div>
            <div>
              <Label htmlFor="hedge-odds" className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Hedge odds
              </Label>
              <Input
                id="hedge-odds"
                type="number"
                className="mt-1 h-9 border-white/10 bg-black/30 font-mono text-sm text-white"
                value={hedgeOdds}
                onChange={(event) => {
                  setTouched(true);
                  setHedgeOdds(Number(event.target.value));
                }}
              />
            </div>
            <div>
              <Label htmlFor="hedge-model-prob" className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Model win %
              </Label>
              <Input
                id="hedge-model-prob"
                type="number"
                min={1}
                max={99}
                className="mt-1 h-9 border-white/10 bg-black/30 font-mono text-sm text-white"
                value={modelProbPct}
                onChange={(event) => {
                  setTouched(true);
                  setModelProbPct(Number(event.target.value));
                }}
              />
            </div>
          </div>

          {!priceable ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
              {result.rationale}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Full hedge stake</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-white">{money(result.hedgeStake)}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">at {formatOdds(hedgeOdds)}</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Locked profit</div>
                  <div
                    className={`mt-1 font-mono text-lg font-semibold ${
                      result.lockedProfit >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {money(result.lockedProfit)}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">{result.lockedRoi.toFixed(1)}% on total outlay</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <span className="uppercase tracking-[0.18em]">Hedge size</span>
                  <span className="font-mono text-cyan-200">{Math.round(fraction * 100)}% of full</span>
                </div>
                <Slider
                  aria-label="Hedge size as a share of the full hedge"
                  className="mt-3"
                  valueText={`${Math.round(fraction * 100)} percent of a full hedge`}
                  min={0}
                  max={100}
                  step={5}
                  value={[Math.round(fraction * 100)]}
                  onValueChange={(value) => setFraction((value[0] ?? 100) / 100)}
                />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Ticket wins</div>
                    <div
                      className={`mt-1 font-mono text-sm font-semibold ${
                        scaled.ifOriginalWins >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {money(scaled.ifOriginalWins)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Hedge wins</div>
                    <div
                      className={`mt-1 font-mono text-sm font-semibold ${
                        scaled.ifHedgeWins >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {money(scaled.ifHedgeWins)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Worst case</div>
                    <div
                      className={`mt-1 font-mono text-sm font-semibold ${
                        scaled.worstCase >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {money(scaled.worstCase)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-black/25 p-3 text-xs leading-5 text-zinc-400">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="uppercase tracking-[0.18em] text-zinc-500">Lock vs ride</span>
                  <Badge variant="outline" className={verdictClasses(result.verdict)}>
                    {formatHedgeVerdict(result.verdict)}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-zinc-300">
                  <div>Hold EV {result.holdEv !== undefined ? money(result.holdEv) : "—"}</div>
                  <div>Hedge EV {money(result.hedgeEv ?? result.lockedProfit)}</div>
                  <div>Insurance stake {money(result.insuranceStake)}</div>
                  <div>Cash-out value {money(result.syntheticCashOut)}</div>
                </div>
                <p className="mt-2">{result.rationale}</p>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
