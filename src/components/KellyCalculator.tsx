import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { TrendingUp, DollarSign, Percent, Target } from "lucide-react";

type KellyFraction = "full" | "half" | "quarter";

const KELLY_FRACTIONS: { label: string; value: KellyFraction; multiplier: number }[] = [
  { label: "Full Kelly", value: "full", multiplier: 1 },
  { label: "Half Kelly", value: "half", multiplier: 0.5 },
  { label: "Quarter Kelly", value: "quarter", multiplier: 0.25 },
];

function americanToDecimal(american: number): number {
  if (american >= 100) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

function calculateKelly(winProb: number, decimalOdds: number): number {
  const b = decimalOdds - 1; // net odds received on a win
  const p = winProb;
  const q = 1 - p;
  const kelly = (b * p - q) / b;
  return Math.max(0, kelly);
}

function impliedProbability(decimalOdds: number): number {
  return 1 / decimalOdds;
}

export default function KellyCalculator() {
  const [winProb, setWinProb] = useState(55);
  const [americanOdds, setAmericanOdds] = useState("-110");
  const [bankroll, setBankroll] = useState("1000");
  const [kellyFraction, setKellyFraction] = useState<KellyFraction>("half");

  const results = useMemo(() => {
    const oddsNum = parseFloat(americanOdds);
    const bankrollNum = parseFloat(bankroll);
    const probDecimal = winProb / 100;

    if (isNaN(oddsNum) || isNaN(bankrollNum) || bankrollNum <= 0) {
      return null;
    }

    const decimalOdds = americanToDecimal(oddsNum);
    const impliedProb = impliedProbability(decimalOdds);
    const rawKelly = calculateKelly(probDecimal, decimalOdds);
    const fractionMultiplier =
      KELLY_FRACTIONS.find((f) => f.value === kellyFraction)?.multiplier ?? 0.5;
    const adjustedKelly = rawKelly * fractionMultiplier;

    const betSizePct = adjustedKelly * 100;
    const betSizeDollar = adjustedKelly * bankrollNum;
    const edge = (probDecimal - impliedProb) * 100;
    const expectedValue = probDecimal * (decimalOdds - 1) - (1 - probDecimal);

    return {
      betSizePct,
      betSizeDollar,
      edge,
      expectedValue: expectedValue * 100,
      impliedProb: impliedProb * 100,
      decimalOdds,
      isPositiveEV: expectedValue > 0,
    };
  }, [winProb, americanOdds, bankroll, kellyFraction]);

  const oddsNum = parseFloat(americanOdds);
  const validOdds = !isNaN(oddsNum);

  return (
    <Card className="bg-black border border-[#00ff41]/20 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-[#00ff41] font-mono text-lg">
          <Target className="h-5 w-5" />
          Kelly Criterion Calculator
        </CardTitle>
        <p className="text-gray-400 text-sm font-mono">
          Optimal bet sizing based on your edge and bankroll
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Win Probability Slider */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="text-gray-300 font-mono text-sm">Win Probability</Label>
            <span className="text-[#00ff41] font-mono font-bold text-lg">{winProb}%</span>
          </div>
          <Slider
            min={1}
            max={99}
            step={1}
            value={[winProb]}
            onValueChange={(v) => setWinProb(v[0])}
            className="[&_[role=slider]]:bg-[#00ff41] [&_[role=slider]]:border-[#00ff41] [&_.relative]:bg-gray-800"
          />
          <div className="flex justify-between text-xs text-gray-600 font-mono">
            <span>1%</span>
            <span>50%</span>
            <span>99%</span>
          </div>
        </div>

        {/* American Odds + Bankroll */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-300 font-mono text-sm">American Odds</Label>
            <Input
              value={americanOdds}
              onChange={(e) => setAmericanOdds(e.target.value)}
              placeholder="-110"
              className="bg-gray-900 border-[#00ff41]/30 text-[#00ff41] font-mono focus:border-[#00ff41] focus:ring-[#00ff41]/20"
            />
            {validOdds && (
              <p className="text-xs text-gray-500 font-mono">
                Decimal: {americanToDecimal(oddsNum).toFixed(3)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-gray-300 font-mono text-sm">Bankroll ($)</Label>
            <Input
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
              placeholder="1000"
              type="number"
              min="1"
              className="bg-gray-900 border-[#00ff41]/30 text-[#00ff41] font-mono focus:border-[#00ff41] focus:ring-[#00ff41]/20"
            />
          </div>
        </div>

        {/* Kelly Fraction Selector */}
        <div className="space-y-2">
          <Label className="text-gray-300 font-mono text-sm">Kelly Fraction</Label>
          <div className="grid grid-cols-3 gap-2">
            {KELLY_FRACTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setKellyFraction(f.value)}
                className={`py-2 px-3 rounded border font-mono text-sm transition-all duration-150 ${
                  kellyFraction === f.value
                    ? "bg-[#00ff41]/10 border-[#00ff41] text-[#00ff41] shadow-[0_0_10px_rgba(0,255,65,0.2)]"
                    : "bg-gray-900 border-gray-700 text-gray-400 hover:border-[#00ff41]/40 hover:text-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results Grid */}
        {results ? (
          <div className="space-y-3">
            <div className="border-t border-[#00ff41]/10 pt-4">
              <p className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-3">
                Results
              </p>
              <div className="grid grid-cols-2 gap-3">
                {/* Bet Size $ */}
                <div className="bg-gray-900/60 border border-[#00ff41]/15 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span className="text-xs font-mono">Bet Size</span>
                  </div>
                  <p
                    className={`text-2xl font-bold font-mono ${
                      results.betSizeDollar > 0 ? "text-[#00ff41]" : "text-gray-500"
                    }`}
                  >
                    ${results.betSizeDollar.toFixed(2)}
                  </p>
                </div>

                {/* Bet Size % */}
                <div className="bg-gray-900/60 border border-[#00ff41]/15 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Percent className="h-3.5 w-3.5" />
                    <span className="text-xs font-mono">Of Bankroll</span>
                  </div>
                  <p
                    className={`text-2xl font-bold font-mono ${
                      results.betSizePct > 0 ? "text-[#00ff41]" : "text-gray-500"
                    }`}
                  >
                    {results.betSizePct.toFixed(2)}%
                  </p>
                </div>

                {/* Expected Value */}
                <div className="bg-gray-900/60 border border-[#00ff41]/15 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span className="text-xs font-mono">Expected Value</span>
                  </div>
                  <p
                    className={`text-2xl font-bold font-mono ${
                      results.expectedValue > 0 ? "text-[#00ff41]" : "text-red-400"
                    }`}
                  >
                    {results.expectedValue > 0 ? "+" : ""}
                    {results.expectedValue.toFixed(2)}%
                  </p>
                </div>

                {/* Edge % */}
                <div className="bg-gray-900/60 border border-[#00ff41]/15 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Target className="h-3.5 w-3.5" />
                    <span className="text-xs font-mono">Edge</span>
                  </div>
                  <p
                    className={`text-2xl font-bold font-mono ${
                      results.edge > 0 ? "text-[#00ff41]" : "text-red-400"
                    }`}
                  >
                    {results.edge > 0 ? "+" : ""}
                    {results.edge.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            {/* EV Banner */}
            <div
              className={`rounded-lg p-3 border text-center font-mono text-sm ${
                results.isPositiveEV
                  ? "bg-[#00ff41]/5 border-[#00ff41]/30 text-[#00ff41]"
                  : "bg-red-900/10 border-red-500/30 text-red-400"
              }`}
            >
              {results.isPositiveEV
                ? `Positive EV bet — implied prob ${results.impliedProb.toFixed(1)}% vs your ${winProb}%`
                : `Negative EV — market gives ${results.impliedProb.toFixed(1)}%, you estimate ${winProb}%`}
            </div>

            {results.betSizeDollar === 0 && (
              <p className="text-center text-xs text-gray-500 font-mono">
                Kelly returns 0 — no edge detected at these inputs. Do not bet.
              </p>
            )}
          </div>
        ) : (
          <div className="border-t border-[#00ff41]/10 pt-4 text-center text-gray-500 font-mono text-sm">
            Enter valid odds and bankroll to see results
          </div>
        )}
      </CardContent>
    </Card>
  );
}
