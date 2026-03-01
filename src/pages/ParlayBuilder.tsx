/**
 * Parlay Builder — Issue #21
 * Interactive parlay builder with correlated leg detection,
 * true odds calculation, and EV analysis.
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Layers, Plus, Trash2, AlertTriangle, TrendingUp,
  TrendingDown, DollarSign, Percent, Info, X,
} from "lucide-react";
import { formatOdds } from "@/lib/predictions";

// ---------- Types ----------

interface ParlayLeg {
  id: string;
  game: string;   // e.g. "Bucks @ Celtics"
  pick: string;   // e.g. "Celtics -5.5"
  mlOdds: number; // American odds
  impliedProb: number;
  sport: string;
}

// ---------- Helpers ----------

function americanToDecimal(american: number): number {
  if (american > 0) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

function impliedProbFromAmerican(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

/** True parlay probability (product of individual leg probs) */
function trueProb(legs: ParlayLeg[]): number {
  return legs.reduce((p, l) => p * l.impliedProb, 1);
}

/** Sportsbook parlay decimal odds (product of decimal odds) */
function parlayDecimalOdds(legs: ParlayLeg[]): number {
  return legs.reduce((p, l) => p * americanToDecimal(l.mlOdds), 1);
}

/** Expected value per $1 wagered */
function parlayEV(legs: ParlayLeg[]): number {
  const prob = trueProb(legs);
  const payout = parlayDecimalOdds(legs) - 1; // net profit per $1
  return prob * payout - (1 - prob);
}

/** Break-even win rate */
function breakEvenRate(legs: ParlayLeg[]): number {
  return 1 / parlayDecimalOdds(legs);
}

/** Detect correlated legs: same game string */
function correlatedGroups(legs: ParlayLeg[]): Map<string, ParlayLeg[]> {
  const map = new Map<string, ParlayLeg[]>();
  for (const leg of legs) {
    const key = leg.game;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(leg);
  }
  return map;
}

function hasCorrelation(legs: ParlayLeg[]): boolean {
  for (const group of correlatedGroups(legs).values()) {
    if (group.length > 1) return true;
  }
  return false;
}

// ---------- Preset legs ----------

const PRESET_LEGS: Omit<ParlayLeg, "id">[] = [
  { game: "Bucks @ Celtics",   pick: "Celtics ML",   mlOdds: -205, impliedProb: impliedProbFromAmerican(-205), sport: "NBA" },
  { game: "Bucks @ Celtics",   pick: "Celtics -5.5",  mlOdds: -110, impliedProb: impliedProbFromAmerican(-110), sport: "NBA" },
  { game: "Nuggets @ Thunder", pick: "Thunder ML",    mlOdds: -290, impliedProb: impliedProbFromAmerican(-290), sport: "NBA" },
  { game: "Nuggets @ Thunder", pick: "Nuggets +7",    mlOdds: -108, impliedProb: impliedProbFromAmerican(-108), sport: "NBA" },
  { game: "Bills @ Chiefs",    pick: "Chiefs ML",     mlOdds: -168, impliedProb: impliedProbFromAmerican(-168), sport: "NFL" },
  { game: "Bills @ Chiefs",    pick: "Over 49.5",     mlOdds: -110, impliedProb: impliedProbFromAmerican(-110), sport: "NFL" },
  { game: "Eagles @ 49ers",    pick: "Eagles ML",     mlOdds: +105, impliedProb: impliedProbFromAmerican(+105), sport: "NFL" },
  { game: "Knicks @ Cavaliers",pick: "Cavaliers ML",  mlOdds: -420, impliedProb: impliedProbFromAmerican(-420), sport: "NBA" },
];

let legCounter = 0;
function makeId() { return `leg-${++legCounter}`; }

// ---------- UI ----------

function LegRow({ leg, onRemove }: { leg: ParlayLeg; onRemove: () => void }) {
  const dir = leg.mlOdds > 0 ? "underdog" : "favorite";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
      <Badge variant="outline" className="text-[10px] font-mono shrink-0 w-10 justify-center">
        {leg.sport}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground truncate">{leg.game}</div>
        <div className="font-medium text-sm text-foreground truncate">{leg.pick}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono font-bold text-sm ${dir === "underdog" ? "text-blue-500" : "text-foreground"}`}>
          {formatOdds(leg.mlOdds)}
        </div>
        <div className="text-xs text-muted-foreground">{(leg.impliedProb * 100).toFixed(1)}%</div>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function ParlayBuilder() {
  const [legs, setLegs] = useState<ParlayLeg[]>([]);
  const [wager, setWager] = useState(10);

  const addLeg = (preset: Omit<ParlayLeg, "id">) => {
    // Don't add exact duplicate picks
    if (legs.some((l) => l.game === preset.game && l.pick === preset.pick)) return;
    setLegs((prev) => [...prev, { ...preset, id: makeId() }]);
  };

  const removeLeg = (id: string) => setLegs((prev) => prev.filter((l) => l.id !== id));

  const metrics = useMemo(() => {
    if (legs.length < 2) return null;
    const decOdds = parlayDecimalOdds(legs);
    const american = decimalToAmerican(decOdds);
    const prob = trueProb(legs);
    const ev = parlayEV(legs);
    const ber = breakEvenRate(legs);
    const payout = wager * (decOdds - 1);
    return { decOdds, american, prob, ev, ber, payout };
  }, [legs, wager]);

  const correlated = hasCorrelation(legs);
  const corrGroups = useMemo(() => correlatedGroups(legs), [legs]);

  // Available presets not yet added
  const available = PRESET_LEGS.filter(
    (p) => !legs.some((l) => l.game === p.game && l.pick === p.pick)
  );

  // Group available by game
  const availableByGame = useMemo(() => {
    const map = new Map<string, typeof PRESET_LEGS>();
    for (const p of available) {
      if (!map.has(p.game)) map.set(p.game, []);
      map.get(p.game)!.push(p);
    }
    return map;
  }, [available]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Layers className="w-6 h-6 text-green-500" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Parlay Builder</h1>
          <p className="text-sm text-muted-foreground">Build parlays, detect correlated legs, and analyze EV</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: leg selection */}
        <div className="lg:col-span-3 space-y-4">
          {/* Current legs */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Your Parlay ({legs.length} leg{legs.length !== 1 ? "s" : ""})
            </h2>
            {legs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                Add at least 2 legs from the games below
              </div>
            ) : (
              <div className="space-y-2">
                {legs.map((leg) => (
                  <LegRow key={leg.id} leg={leg} onRemove={() => removeLeg(leg.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Correlated warning */}
          {correlated && (
            <div className="flex gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-500">Correlated Legs Detected</p>
                {Array.from(corrGroups.entries())
                  .filter(([, g]) => g.length > 1)
                  .map(([game, group]) => (
                    <p key={game} className="text-xs text-yellow-400/80 mt-1">
                      <span className="font-medium">{game}</span>: {group.map((g) => g.pick).join(" + ")} — these legs are from the same game. Sportsbooks may reduce true combined odds or reject the parlay.
                    </p>
                  ))}
              </div>
            </div>
          )}

          {/* Available picks */}
          {availableByGame.size > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Add Legs
              </h2>
              <div className="space-y-3">
                {Array.from(availableByGame.entries()).map(([game, picks]) => (
                  <div key={game} className="rounded-xl border border-border bg-card p-3">
                    <div className="text-xs text-muted-foreground mb-2">{picks[0].sport} · {game}</div>
                    <div className="flex flex-wrap gap-2">
                      {picks.map((p) => (
                        <Button
                          key={p.pick}
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5"
                          onClick={() => addLeg(p)}
                        >
                          <Plus className="w-3 h-3" />
                          {p.pick} <span className="font-mono text-muted-foreground">{formatOdds(p.mlOdds)}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: analysis panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Wager input */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-semibold text-muted-foreground block mb-2">Wager Amount ($)</label>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <input
                type="number"
                min={1}
                value={wager}
                onChange={(e) => setWager(Math.max(1, Number(e.target.value)))}
                className="flex-1 bg-background border border-input rounded-md px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[10, 25, 50, 100].map((v) => (
                <Button key={v} variant="ghost" size="sm" className="h-7 text-xs flex-1 px-0"
                  onClick={() => setWager(v)}>
                  ${v}
                </Button>
              ))}
            </div>
          </div>

          {/* Metrics */}
          {metrics ? (
            <>
              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <h3 className="font-semibold text-foreground">Parlay Analysis</h3>

                <div className="space-y-3">
                  {/* Payout */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <DollarSign className="w-4 h-4" /> Potential Payout
                    </div>
                    <span className="font-mono font-bold text-green-500">
                      ${(wager + metrics.payout).toFixed(2)}
                    </span>
                  </div>

                  {/* American odds */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Percent className="w-4 h-4" /> Parlay Odds
                    </div>
                    <span className="font-mono font-bold text-foreground">
                      {formatOdds(metrics.american)}
                    </span>
                  </div>

                  {/* Win probability */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <TrendingUp className="w-4 h-4" /> Win Probability
                    </div>
                    <span className="font-mono font-bold text-foreground">
                      {(metrics.prob * 100).toFixed(2)}%
                    </span>
                  </div>

                  {/* Break-even */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Info className="w-4 h-4" /> Break-Even Rate
                    </div>
                    <span className="font-mono font-bold text-foreground">
                      {(metrics.ber * 100).toFixed(2)}%
                    </span>
                  </div>

                  {/* EV */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {metrics.ev >= 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                      Expected Value
                    </div>
                    <span className={`font-mono font-bold text-lg ${metrics.ev >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {metrics.ev >= 0 ? "+" : ""}${(metrics.ev * wager).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* EV warning */}
              {metrics.ev < 0 && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  This parlay has negative EV ({(metrics.ev * 100).toFixed(1)}% per dollar). Even if each leg is +EV individually, combining them in a parlay creates negative expected value due to the house margin.
                </div>
              )}

              {legs.length >= 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive border border-border"
                  onClick={() => setLegs([])}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear Parlay
                </Button>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Add 2+ legs to see parlay analysis
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            For informational purposes only. Always gamble responsibly.
          </p>
        </div>
      </div>
    </div>
  );
}
