import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Play, RotateCcw, HelpCircle, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SimulationPoint {
  betNum: number;
  bankroll: number;
}

export default function KellySimulator() {
  const [isOpen, setIsOpen] = useState(true);

  // Inputs
  const [bankroll, setBankroll] = useState<number>(1000);
  const [winProb, setWinProb] = useState<number>(55);
  const [americanOdds, setAmericanOdds] = useState<number>(-110);
  const [kellyFraction, setKellyFraction] = useState<number>(0.5); // Half Kelly default

  // Simulation state
  const [simulationData, setSimulationData] = useState<SimulationPoint[]>([]);
  const [simulationResult, setSimulationResult] = useState<{
    finalBankroll: number;
    maxBankroll: number;
    minBankroll: number;
    winCount: number;
    lossCount: number;
  } | null>(null);

  // Convert American Odds to net decimal odds (b)
  const netDecimalOdds = useMemo(() => {
    if (americanOdds === 0) return 0;
    if (americanOdds > 0) {
      return americanOdds / 100;
    } else {
      return 100 / Math.abs(americanOdds);
    }
  }, [americanOdds]);

  // Kelly % calculation: f* = (p * (b + 1) - 1) / b
  const calculatedKellyPct = useMemo(() => {
    const p = winProb / 100;
    const b = netDecimalOdds;
    if (b <= 0) return 0;
    const fStar = (p * (b + 1) - 1) / b;
    return Math.max(0, fStar);
  }, [winProb, netDecimalOdds]);

  // Safe sizing percentage
  const appliedKellyPct = useMemo(() => {
    return calculatedKellyPct * kellyFraction;
  }, [calculatedKellyPct, kellyFraction]);

  // Run the 100-bet simulation
  const runSimulation = useCallback(() => {
    let currentBankroll = bankroll;
    const data: SimulationPoint[] = [{ betNum: 0, bankroll: currentBankroll }];
    const b = netDecimalOdds;
    const p = winProb / 100;
    
    let max = currentBankroll;
    let min = currentBankroll;
    let wins = 0;
    let losses = 0;

    for (let i = 1; i <= 100; i++) {
      if (currentBankroll <= 1) {
        currentBankroll = 0;
        data.push({ betNum: i, bankroll: 0 });
        continue;
      }

      // Calculate bet size
      const betSize = currentBankroll * appliedKellyPct;
      const isWin = Math.random() <= p;

      if (isWin) {
        currentBankroll += betSize * b;
        wins++;
      } else {
        currentBankroll -= betSize;
        losses++;
      }

      // Keep it formatted
      currentBankroll = Math.round(currentBankroll * 100) / 100;
      
      if (currentBankroll > max) max = currentBankroll;
      if (currentBankroll < min) min = currentBankroll;

      data.push({ betNum: i, bankroll: currentBankroll });
    }

    setSimulationData(data);
    setSimulationResult({
      finalBankroll: currentBankroll,
      maxBankroll: Math.round(max),
      minBankroll: Math.round(min),
      winCount: wins,
      lossCount: losses,
    });
  }, [bankroll, winProb, netDecimalOdds, appliedKellyPct]);

  // Run simulation on load
  useEffect(() => {
    runSimulation();
  }, [runSimulation]);

  // Chart Dimensions & calculations
  const chartHeight = 160;
  const chartWidth = 400;
  const points = useMemo(() => {
    if (simulationData.length === 0) return "";
    const maxVal = Math.max(...simulationData.map((d) => d.bankroll), bankroll * 1.5);
    const minVal = Math.min(...simulationData.map((d) => d.bankroll), 0);
    const range = maxVal - minVal || 1;

    return simulationData
      .map((d, index) => {
        const x = (index / (simulationData.length - 1)) * chartWidth;
        const y = chartHeight - ((d.bankroll - minVal) / range) * chartHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [simulationData, bankroll]);

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5 text-white shadow-xl backdrop-blur-md">
      <div
        className={`flex items-center justify-between cursor-pointer select-none transition-all ${
          isOpen ? "border-b border-white/10 pb-4" : ""
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
            <TrendingUp className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Interactive Sizing Simulator</h3>
            <p className="text-xs text-zinc-400">Model bankroll outcomes over 100 bets</p>
          </div>
        </div>
        <div className="text-zinc-400 hover:text-white transition-colors mr-1">
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </div>

      {isOpen && (
        <>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            {/* Left Hand: Controls */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  Starting Bankroll
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-950 border-white/10 text-zinc-300 max-w-xs">
                        Your total dedicated betting bankroll for this model.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-2.5 text-zinc-500 text-sm">$</span>
                  <Input
                    type="number"
                    value={bankroll || ""}
                    onChange={(e) => setBankroll(Number(e.target.value))}
                    className="pl-7 bg-black/20 border-white/10 text-white rounded-xl focus:border-brand-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    Win Prob (%)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    value={winProb || ""}
                    onChange={(e) => setWinProb(Math.min(99, Math.max(1, Number(e.target.value))))}
                    className="mt-1.5 bg-black/20 border-white/10 text-white rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    American Odds
                  </label>
                  <Input
                    type="number"
                    value={americanOdds || ""}
                    onChange={(e) => setAmericanOdds(Number(e.target.value))}
                    className="mt-1.5 bg-black/20 border-white/10 text-white rounded-xl"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <span>Kelly Fraction</span>
                  <span className="font-mono text-cyan-400">
                    {(kellyFraction * 100).toFixed(0)}% ({kellyFraction === 1 ? "Full" : kellyFraction === 0.5 ? "Half" : kellyFraction === 0.25 ? "Quarter" : "Custom"})
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Slider
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={[kellyFraction]}
                    onValueChange={(val) => setKellyFraction(val[0])}
                    className="flex-1"
                  />
                </div>
                <div className="mt-2 flex gap-1.5">
                  {[0.25, 0.5, 1.0].map((frac) => (
                    <Button
                      key={frac}
                      variant="outline"
                      size="sm"
                      className={`h-6 text-[10px] px-2 rounded-md border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white ${
                        kellyFraction === frac ? "border-cyan-400/30 text-cyan-300 bg-cyan-400/10" : ""
                      }`}
                      onClick={() => setKellyFraction(frac)}
                    >
                      {frac === 1 ? "Full" : frac === 0.5 ? "Half" : "Quarter"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Hand: Output & Simulation Chart */}
            <div className="flex flex-col justify-between space-y-4">
              <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Calculated Bet</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-black text-white">
                        {appliedKellyPct > 0 ? `${(appliedKellyPct * 100).toFixed(1)}%` : "0.0%"}
                      </span>
                      {appliedKellyPct > 0 && (
                        <span className="text-xs text-zinc-400 font-mono">
                          (${(bankroll * appliedKellyPct).toFixed(0)})
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] border-white/10 ${
                      appliedKellyPct > 0 ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5" : "text-zinc-500"
                    }`}
                  >
                    {appliedKellyPct > 0 ? "Positive Edge" : "No Advantage"}
                  </Badge>
                </div>

                {appliedKellyPct > 0 ? (
                  <p className="mt-2 text-[11px] text-zinc-400 leading-normal">
                    Suggested stake size is **${(bankroll * appliedKellyPct).toFixed(0)}** based on decimal odds of **{(netDecimalOdds + 1).toFixed(2)}**.
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-red-300 leading-normal">
                    No positive edge found. Kelly sizing suggests placing **no bet ($0)**.
                  </p>
                )}
              </div>

              {/* SVG Sparkline */}
              <div className="relative rounded-2xl border border-white/5 bg-black/30 p-3 h-[180px] flex flex-col justify-between">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                  <TrendingUp className="w-32 h-32 text-white" />
                </div>

                <div className="z-10 flex justify-between text-[10px] text-zinc-500 font-mono">
                  <span>Bet 0</span>
                  <span>100 Bets</span>
                </div>

                {simulationData.length > 0 && (
                  <svg className="w-full h-[120px] overflow-visible mt-2" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                    {/* Horizontal baseline */}
                    <line
                      x1="0"
                      y1={chartHeight}
                      x2={chartWidth}
                      y2={chartHeight}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="1"
                    />
                    
                    {/* Sparkline Path */}
                    <polyline
                      fill="none"
                      stroke="url(#sparkline-gradient)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />

                    {/* SVG Gradients */}
                    <defs>
                      <linearGradient id="sparkline-gradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>
                )}

                {simulationResult && (
                  <div className="z-10 mt-1 flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                    <span>Final: <strong className={simulationResult.finalBankroll >= bankroll ? "text-emerald-400" : "text-red-400"}>${simulationResult.finalBankroll.toFixed(0)}</strong></span>
                    <span>Max: <strong className="text-zinc-300">${simulationResult.maxBankroll}</strong></span>
                    <span>W/L: {simulationResult.winCount}/{simulationResult.lossCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              size="sm"
              onClick={runSimulation}
              className="bg-zinc-800 text-white hover:bg-zinc-700 border border-white/10 rounded-xl"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Rerun Walk
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
