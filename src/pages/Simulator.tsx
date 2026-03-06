/**
 * Monte Carlo Bankroll Simulator
 *
 * Runs N simulated betting seasons in real-time and visualises:
 *  - Animated fan chart of all trajectories
 *  - Median, P10 / P90, P5 / P95 bands
 *  - Ruin probability, doubling probability, expected final bankroll
 *  - Histogram of final bankroll distribution
 *
 * Uses recharts (already in deps) — no new packages needed.
 */

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, ReferenceLine,
} from "recharts";
import {
  Play, RotateCcw, TrendingUp, TrendingDown,
  Skull, Trophy, BarChart3, Zap,
} from "lucide-react";

// ─── Engine ──────────────────────────────────────────────────────────────────

interface SimParams {
  startBank: number;   // $
  numBets: number;
  winRate: number;     // 0-1
  avgOdds: number;     // American
  strategy: "flat" | "kelly" | "halfKelly" | "fixedPct";
  betSizePct: number;  // used for flat / fixedPct
  simCount: number;
}

function americanToDecimal(a: number) {
  return a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
}

function kellyFraction(winRate: number, decimalOdds: number): number {
  const b = decimalOdds - 1;
  return Math.max(0, (b * winRate - (1 - winRate)) / b);
}

/** Run one simulation, returning the bankroll at each bet step */
function runOneSim(p: SimParams): number[] {
  const dec = americanToDecimal(p.avgOdds);
  const kf = kellyFraction(p.winRate, dec);

  let bank = p.startBank;
  const path = [bank];

  for (let i = 0; i < p.numBets; i++) {
    if (bank <= 0) { path.push(0); continue; }

    let stake: number;
    if (p.strategy === "flat") {
      stake = p.startBank * (p.betSizePct / 100);
    } else if (p.strategy === "fixedPct") {
      stake = bank * (p.betSizePct / 100);
    } else if (p.strategy === "kelly") {
      stake = bank * kf;
    } else {
      stake = bank * kf * 0.5;
    }
    stake = Math.min(stake, bank);

    const won = Math.random() < p.winRate;
    bank = won ? bank + stake * (dec - 1) : bank - stake;
    bank = Math.max(0, bank);
    path.push(bank);
  }
  return path;
}

interface SimResult {
  paths: number[][];
  finalValues: number[];
  ruinCount: number;
  doublingCount: number;
  median: number;
  p10: number;
  p90: number;
  p5: number;
  p95: number;
}

function runAllSims(p: SimParams): SimResult {
  const paths: number[][] = [];
  for (let i = 0; i < p.simCount; i++) paths.push(runOneSim(p));

  const finalValues = paths.map((path) => path[path.length - 1]);
  finalValues.sort((a, b) => a - b);

  function pctile(arr: number[], pct: number) {
    return arr[Math.floor(arr.length * pct)] ?? 0;
  }

  return {
    paths,
    finalValues,
    ruinCount: finalValues.filter((v) => v <= 0).length,
    doublingCount: finalValues.filter((v) => v >= p.startBank * 2).length,
    median: pctile(finalValues, 0.5),
    p10: pctile(finalValues, 0.1),
    p90: pctile(finalValues, 0.9),
    p5: pctile(finalValues, 0.05),
    p95: pctile(finalValues, 0.95),
  };
}

// ─── Chart data builders ──────────────────────────────────────────────────────

/** Downsample paths to a percentile-band chart (one point per bet step) */
function buildBandData(result: SimResult, numBets: number) {
  const rows = [];
  for (let i = 0; i <= numBets; i++) {
    const vals = result.paths.map((p) => p[i]).sort((a, b) => a - b);
    function pct(p: number) { return vals[Math.floor(vals.length * p)] ?? 0; }
    rows.push({
      bet: i,
      p5:  pct(0.05),
      p10: pct(0.1),
      p25: pct(0.25),
      median: pct(0.5),
      p75: pct(0.75),
      p90: pct(0.9),
      p95: pct(0.95),
    });
  }
  return rows;
}

/** Histogram of final bankroll distribution */
function buildHistogram(finalValues: number[], startBank: number, bins = 30) {
  if (!finalValues.length) return [];
  const min = 0;
  const max = Math.max(...finalValues);
  const step = (max - min) / bins || 1;
  const histogram: { range: string; count: number; isAboveStart: boolean }[] = [];
  for (let b = 0; b < bins; b++) {
    const lo = min + b * step;
    const hi = lo + step;
    histogram.push({
      range: `$${Math.round(lo)}`,
      count: finalValues.filter((v) => v >= lo && v < hi).length,
      isAboveStart: lo >= startBank,
    });
  }
  return histogram;
}

/** Fan lines: pick ~50 evenly-spaced individual paths for display */
function buildFanLines(paths: number[], numBets: number, pick = 50) {
  const stride = Math.max(1, Math.floor(paths.length / pick));
  const selected = paths.filter((_, i) => i % stride === 0);
  return Array.from({ length: numBets + 1 }, (_, i) => {
    const row: Record<string, number | string> = { bet: i };
    selected.forEach((path, j) => { row[`s${j}`] = path[i] ?? 0; });
    return row;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ParamSlider({
  label, value, min, max, step, format, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold text-foreground">{format(value)}</span>
      </div>
      <Slider
        min={min} max={max} step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STRATEGY_OPTIONS = [
  { value: "flat",      label: "Flat Stake",    desc: "Fixed $ amount each bet" },
  { value: "fixedPct",  label: "Fixed %",       desc: "% of current bankroll" },
  { value: "halfKelly", label: "Half Kelly",    desc: "50% of Kelly fraction" },
  { value: "kelly",     label: "Full Kelly",    desc: "Maximises log growth" },
] as const;

export default function Simulator() {
  const [params, setParams] = useState<SimParams>({
    startBank: 1000,
    numBets: 100,
    winRate: 0.54,
    avgOdds: -110,
    strategy: "halfKelly",
    betSizePct: 2,
    simCount: 500,
  });
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const animRef = useRef<ReturnType<typeof requestAnimationFrame>>();

  const dec = americanToDecimal(params.avgOdds);
  const kf = kellyFraction(params.winRate, dec);
  const theoreticalEV =
    params.winRate * (dec - 1) - (1 - params.winRate);

  const set = useCallback(
    (key: keyof SimParams) => (val: number | string) =>
      setParams((p) => ({ ...p, [key]: val })),
    []
  );

  function run() {
    setRunning(true);
    // Defer to allow React to render the loading state
    requestAnimationFrame(() => {
      const r = runAllSims(params);
      setResult(r);
      setRunning(false);
    });
  }

  function reset() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setResult(null);
    setRunning(false);
  }

  const bandData = result ? buildBandData(result, params.numBets) : [];
  const histData = result ? buildHistogram(result.finalValues, params.startBank) : [];
  const fanKeys = result
    ? Object.keys(buildFanLines(result.paths as any, 1)[0]).filter((k) => k.startsWith("s"))
    : [];
  const fanData = result
    ? buildFanLines(result.paths as any, params.numBets)
    : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Zap className="w-6 h-6 text-yellow-500" />
        <h1 className="text-2xl font-bold text-foreground">Monte Carlo Simulator</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Run thousands of simulated betting seasons to visualise the full distribution of possible outcomes — not just the average.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Params ── */}
        <div className="lg:col-span-1 space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-5">
            <h2 className="font-semibold text-foreground">Parameters</h2>

            <ParamSlider
              label="Starting Bankroll"
              value={params.startBank}
              min={100} max={10000} step={100}
              format={(v) => `$${v.toLocaleString()}`}
              onChange={set("startBank")}
            />
            <ParamSlider
              label="Number of Bets"
              value={params.numBets}
              min={20} max={500} step={10}
              format={(v) => `${v}`}
              onChange={set("numBets")}
            />
            <ParamSlider
              label="Win Rate"
              value={params.winRate}
              min={0.3} max={0.75} step={0.01}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              onChange={set("winRate")}
            />
            <ParamSlider
              label="Average Odds"
              value={params.avgOdds}
              min={-300} max={300} step={5}
              format={(v) => (v > 0 ? `+${v}` : `${v}`)}
              onChange={set("avgOdds")}
            />
            <ParamSlider
              label="Simulations"
              value={params.simCount}
              min={100} max={2000} step={100}
              format={(v) => `${v}`}
              onChange={set("simCount")}
            />

            {/* Strategy */}
            <div>
              <div className="text-sm text-muted-foreground mb-2">Bet Sizing Strategy</div>
              <div className="grid grid-cols-2 gap-1.5">
                {STRATEGY_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => set("strategy")(s.value)}
                    className={`rounded-lg border px-2 py-2 text-left text-xs transition-colors
                      ${params.strategy === s.value
                        ? "border-green-500/50 bg-green-500/10 text-green-400"
                        : "border-border bg-background text-muted-foreground hover:border-border/80"}`}
                  >
                    <div className="font-semibold">{s.label}</div>
                    <div className="opacity-70">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {(params.strategy === "flat" || params.strategy === "fixedPct") && (
              <ParamSlider
                label={params.strategy === "flat" ? "Stake (% of start)" : "Stake (% of current)"}
                value={params.betSizePct}
                min={0.5} max={25} step={0.5}
                format={(v) => `${v}%`}
                onChange={set("betSizePct")}
              />
            )}

            {/* Live metrics */}
            <div className="text-xs space-y-1 pt-1 border-t border-border text-muted-foreground font-mono">
              <div className="flex justify-between">
                <span>Kelly fraction</span>
                <span className="text-foreground">{(kf * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Edge per bet</span>
                <span className={theoreticalEV >= 0 ? "text-green-500" : "text-red-500"}>
                  {theoreticalEV >= 0 ? "+" : ""}{(theoreticalEV * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Break-even win%</span>
                <span className="text-foreground">
                  {(100 / dec).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Run button */}
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold gap-2"
              onClick={run}
              disabled={running}
            >
              {running ? (
                <><Zap className="w-4 h-4 animate-pulse" /> Simulating…</>
              ) : (
                <><Play className="w-4 h-4" /> Run Simulation</>
              )}
            </Button>
            {result && (
              <Button variant="outline" size="icon" onClick={reset}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>

          {theoreticalEV < 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              ⚠️ Negative edge ({(theoreticalEV * 100).toFixed(2)}% per bet). All strategies will lose long-term.
            </div>
          )}
        </div>

        {/* ── Charts ── */}
        <div className="lg:col-span-2 space-y-5">
          {!result && !running && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border h-72 text-muted-foreground gap-3">
              <BarChart3 className="w-12 h-12 opacity-30" />
              <p className="text-sm">Configure parameters and hit <strong>Run Simulation</strong></p>
            </div>
          )}

          {running && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card h-72 gap-3 text-muted-foreground">
              <Zap className="w-10 h-10 text-yellow-500 animate-pulse" />
              <p className="text-sm">Running {params.simCount.toLocaleString()} simulations…</p>
            </div>
          )}

          {result && (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Ruin Risk"
                  value={`${((result.ruinCount / params.simCount) * 100).toFixed(1)}%`}
                  sub="Bankroll hits $0"
                  icon={Skull}
                  color={result.ruinCount / params.simCount > 0.2 ? "text-red-500" : "text-orange-400"}
                />
                <StatCard
                  label="2× Chance"
                  value={`${((result.doublingCount / params.simCount) * 100).toFixed(1)}%`}
                  sub="Doubles bankroll"
                  icon={Trophy}
                  color="text-green-500"
                />
                <StatCard
                  label="Median"
                  value={`$${Math.round(result.median).toLocaleString()}`}
                  sub={`${result.median >= params.startBank ? "+" : ""}${(((result.median - params.startBank) / params.startBank) * 100).toFixed(0)}%`}
                  icon={result.median >= params.startBank ? TrendingUp : TrendingDown}
                  color={result.median >= params.startBank ? "text-green-500" : "text-red-500"}
                />
                <StatCard
                  label="P90 Outcome"
                  value={`$${Math.round(result.p90).toLocaleString()}`}
                  sub="90th percentile"
                  icon={TrendingUp}
                  color="text-blue-400"
                />
              </div>

              {/* Fan + band chart */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground text-sm">Bankroll Trajectories</h3>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block"/> Median</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500/20 inline-block rounded"/> P25–P75</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500/10 inline-block rounded"/> P5–P95</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={bandData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="bandMid" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="bandOuter" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis dataKey="bet" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickLine={false} label={{ value: "Bets", position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false}
                      tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                      width={55} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number, name: string) => [`$${Math.round(v).toLocaleString()}`, name]}
                    />
                    <ReferenceLine y={params.startBank} stroke="#6b7280" strokeDasharray="4 4" strokeWidth={1} />
                    {/* Outer band P5-P95 */}
                    <Area type="monotone" dataKey="p95" stroke="none" fill="url(#bandOuter)" />
                    <Area type="monotone" dataKey="p5"  stroke="none" fill="var(--background)" />
                    {/* Mid band P25-P75 */}
                    <Area type="monotone" dataKey="p75" stroke="none" fill="url(#bandMid)" />
                    <Area type="monotone" dataKey="p25" stroke="none" fill="var(--background)" />
                    {/* Percentile lines */}
                    <Line type="monotone" dataKey="p90" stroke="#3b82f6" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="p10" stroke="#3b82f6" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="median" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Histogram */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-semibold text-foreground text-sm mb-4">
                  Final Bankroll Distribution
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({params.simCount} simulations · dashed line = starting bankroll)
                  </span>
                </h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={histData} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis dataKey="range" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} width={35} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [v, "Simulations"]}
                    />
                    <ReferenceLine x={`$${params.startBank}`} stroke="#6b7280" strokeDasharray="4 4" />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]}
                      fill="#22c55e"
                      // Color bars below start as red
                      label={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Interpretation */}
              <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-2">
                <h3 className="font-semibold text-foreground">Reading the Results</h3>
                <ul className="space-y-1 text-muted-foreground text-xs list-disc pl-4">
                  <li>The <span className="text-green-500 font-semibold">green band</span> shows the middle 50% of outcomes (P25–P75) — your most likely range.</li>
                  <li>The <span className="text-blue-400 font-semibold">blue dashed lines</span> show P10/P90 — only 1 in 10 runs finish outside these bounds.</li>
                  <li>The dashed horizontal line is your starting bankroll (${ params.startBank.toLocaleString()}).</li>
                  <li>Half Kelly dramatically reduces ruin risk vs full Kelly with ~70% of the growth.</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-10">
        Simulation assumes independent bets with constant win rate and odds. Real results will vary. Gamble responsibly.
      </p>
    </div>
  );
}
