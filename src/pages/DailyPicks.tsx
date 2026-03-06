import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Trophy,
  Target,
  Zap,
  ChevronLeft,
  Star,
  Lock,
  Brain,
  Calendar,
  Percent,
  DollarSign,
  Activity,
  Flame,
  Crown,
  Check,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import {
  analyzeGame,
  formatOdds,
  formatProb,
  formatEdge,
  SPORT_CONFIG,
  type Sport,
  type GamePrediction,
  calculateSpread,
  calculateTotal,
  getSimulatedForm,
  generatePickAnalysis,
  getTeamStats,
  getDefaultStats,
} from "@/lib/predictions";
import { isPremiumUser } from "@/lib/stripe";
import { useNavigate } from "react-router-dom";
import CryptoPaymentModal, { type UnlockType } from "@/components/CryptoPaymentModal";

// ─── Types ─────────────────────────────────────────────────────────────────

type BetType = "moneyline" | "spread" | "total";
type Confidence = "high" | "medium" | "low";
type SportFilter = "ALL" | Sport;
type ConfFilter = "ALL" | Confidence;

interface DailyPick {
  sport: Sport;
  home: string;
  away: string;
  time: string;
  confidence: Confidence;
  isPremium: boolean;
  betType: BetType;
}

// ─── Today's Picks Data — March 5, 2026 ────────────────────────────────────

const TODAY_PICKS: DailyPick[] = [
  // ── FREE ──
  { sport: "nba", home: "Oklahoma City Thunder", away: "Boston Celtics",        time: "7:30 PM ET", confidence: "high",   isPremium: false, betType: "spread"     },
  { sport: "nba", home: "Cleveland Cavaliers",   away: "Milwaukee Bucks",       time: "7:00 PM ET", confidence: "high",   isPremium: false, betType: "moneyline"  },
  { sport: "nfl", home: "Kansas City Chiefs",    away: "Philadelphia Eagles",   time: "8:15 PM ET", confidence: "high",   isPremium: false, betType: "spread"     },
  { sport: "nba", home: "Denver Nuggets",        away: "Golden State Warriors", time: "9:00 PM ET", confidence: "medium", isPremium: false, betType: "total"      },
  // ── PREMIUM ──
  { sport: "nba", home: "Los Angeles Lakers",    away: "Dallas Mavericks",      time: "9:30 PM ET", confidence: "high",   isPremium: true,  betType: "spread"     },
  { sport: "nba", home: "Minnesota Timberwolves",away: "Memphis Grizzlies",     time: "8:00 PM ET", confidence: "high",   isPremium: true,  betType: "moneyline"  },
  { sport: "nfl", home: "Buffalo Bills",         away: "Baltimore Ravens",      time: "7:00 PM ET", confidence: "medium", isPremium: true,  betType: "spread"     },
];

// ─── Styling helpers ────────────────────────────────────────────────────────

const CONF_STYLE = {
  high:   { label: "HIGH",   textColor: "text-green-400",  border: "border-green-500/30",  bg: "bg-green-500/8",   Icon: Zap    },
  medium: { label: "MEDIUM", textColor: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-500/8",  Icon: Target },
  low:    { label: "LOW",    textColor: "text-orange-400", border: "border-orange-500/30", bg: "bg-orange-500/8",  Icon: Activity },
};

const BET_TYPE_STYLE: Record<BetType, { label: string; color: string; bg: string }> = {
  spread:     { label: "SPREAD",    color: "text-blue-400",   bg: "bg-blue-500/15 border-blue-500/30"   },
  moneyline:  { label: "MONEYLINE", color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/30" },
  total:      { label: "TOTAL",     color: "text-cyan-400",   bg: "bg-cyan-500/15 border-cyan-500/30"   },
};

// ─── Form bubbles component ─────────────────────────────────────────────────

function FormBubbles({ form }: { form: ('W' | 'L')[] }) {
  return (
    <div className="flex gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center ${
            r === 'W' ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-red-500/20 text-red-400 border border-red-500/40'
          }`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

// ─── Spread / Total display helper ──────────────────────────────────────────

function getPickDisplay(pick: DailyPick, pred: GamePrediction) {
  const teamStats = getTeamStats(pick.sport);
  const homeStats = teamStats[pick.home] || getDefaultStats();
  const awayStats = teamStats[pick.away] || getDefaultStats();
  const spread = calculateSpread(homeStats, awayStats, pick.sport);
  const total  = calculateTotal(homeStats, awayStats, pick.sport);
  const isHomeWin = pred.predictedWinner === pick.home;

  if (pick.betType === "spread") {
    // Recommend the team that beats the spread
    const teamSpread = isHomeWin ? spread : -spread;
    const label = `${pred.predictedWinner} ${teamSpread > 0 ? '+' : ''}${teamSpread}`;
    const odds  = -110;
    return { label, odds, detail: `Spread pick`, spread, total };
  }
  if (pick.betType === "total") {
    const overLabel = `OVER ${total}`;
    const odds = -110;
    return { label: overLabel, odds, detail: `Total pick`, spread, total };
  }
  // moneyline
  const winnerOdds = isHomeWin ? pred.homeOdds : pred.awayOdds;
  return { label: pred.predictedWinner, odds: winnerOdds, detail: `Moneyline pick`, spread, total };
}

// ─── Pick Card (shared between free and unlocked-premium) ──────────────────

function PickCard({
  pick,
  pred,
  isExpanded,
  onToggle,
  isFeatured = false,
}: {
  pick: DailyPick;
  pred: GamePrediction;
  isExpanded: boolean;
  onToggle: () => void;
  isFeatured?: boolean;
}) {
  const c    = CONF_STYLE[pick.confidence];
  const bt   = BET_TYPE_STYLE[pick.betType];
  const { Icon } = c;
  const display = getPickDisplay(pick, pred);
  const isHomeWin = pred.predictedWinner === pick.home;
  const winnerProb = isHomeWin ? pred.homeProb : pred.awayProb;
  const winnerEdge = isHomeWin ? pred.homeEdge : pred.awayEdge;
  const loserProb  = isHomeWin ? pred.awayProb : pred.homeProb;
  const homeForm = getSimulatedForm(pick.home, pick.sport);
  const awayForm = getSimulatedForm(pick.away, pick.sport);
  const analysis = generatePickAnalysis(pick.home, pick.away, pred, pick.sport);
  const teamStats = getTeamStats(pick.sport);
  const homeStats = teamStats[pick.home] || getDefaultStats();
  const awayStats = teamStats[pick.away] || getDefaultStats();

  return (
    <div
      className={`rounded-xl border p-5 transition-all cursor-pointer hover:border-opacity-60 ${
        isFeatured
          ? "border-yellow-500/50 bg-gradient-to-br from-yellow-500/8 to-orange-500/5"
          : `${c.border} bg-gray-900/60`
      }`}
      onClick={onToggle}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-semibold text-gray-400 uppercase tracking-wider">
            {SPORT_CONFIG[pick.sport].name.split(' ')[0]}
          </span>
          <span className="text-gray-700">·</span>
          <span className="text-xs text-gray-500">{pick.time}</span>
          {isFeatured && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-xs text-yellow-400 font-bold">
              <Star className="w-2.5 h-2.5" /> PICK OF THE DAY
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${bt.bg} ${bt.color}`}>
            {bt.label}
          </span>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 border ${c.border}`}>
            <Icon className={`w-3 h-3 ${c.textColor}`} />
            <span className={`text-[10px] font-bold ${c.textColor}`}>{c.label}</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500 ml-1" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500 ml-1" />
          )}
        </div>
      </div>

      {/* Team vs Team */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-4">
        {/* Away team */}
        <div className="text-left">
          <div className={`font-bold text-base leading-tight ${pred.predictedWinner === pick.away ? 'text-green-400' : 'text-gray-300'}`}>
            {pick.away.split(' ').pop()}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{pick.away.split(' ').slice(0,-1).join(' ')}</div>
          <div className="text-[10px] text-gray-500 mt-1">{(awayStats.win_pct * 100).toFixed(0)}% WR</div>
          <div className="mt-1.5">
            <FormBubbles form={awayForm} />
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-600 font-medium">@</span>
        </div>

        {/* Home team */}
        <div className="text-right">
          <div className={`font-bold text-base leading-tight ${pred.predictedWinner === pick.home ? 'text-green-400' : 'text-gray-300'}`}>
            {pick.home.split(' ').pop()}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{pick.home.split(' ').slice(0,-1).join(' ')}</div>
          <div className="text-[10px] text-gray-500 mt-1">{(homeStats.win_pct * 100).toFixed(0)}% WR · Home</div>
          <div className="mt-1.5 flex justify-end">
            <FormBubbles form={homeForm} />
          </div>
        </div>
      </div>

      {/* AI Recommendation pill */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg bg-black/40 border ${
        winnerEdge >= 3 ? 'border-green-500/30' : 'border-gray-700'
      }`}>
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
          <span className="text-white font-semibold text-sm">{display.label}</span>
          <span className="text-xs text-gray-500">{formatOdds(display.odds)}</span>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="text-white font-mono font-bold text-sm">{formatProb(winnerProb)}</div>
            <div className="text-[10px] text-gray-500">Win Prob</div>
          </div>
          <div>
            <div className={`font-mono font-bold text-sm ${winnerEdge > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatEdge(winnerEdge)}
            </div>
            <div className="text-[10px] text-gray-500">Edge</div>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Win probability bar */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>{pick.away.split(' ').pop()} {formatProb(loserProb)}</span>
              <span>{pick.home.split(' ').pop()} {formatProb(pred.homeProb)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full"
                style={{ width: `${(pred.homeProb * 100).toFixed(0)}%` }}
              />
            </div>
          </div>

          {/* Spread + Total info row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
              <div className="text-gray-400 mb-0.5">Spread</div>
              <div className="text-white font-mono font-bold">
                {pick.home.split(' ').pop()} {display.spread > 0 ? '+' : ''}{display.spread}
              </div>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
              <div className="text-gray-400 mb-0.5">O/U Total</div>
              <div className="text-white font-mono font-bold">{display.total}</div>
            </div>
          </div>

          {/* Value bet alert */}
          {pred.valueBet && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
              <Zap className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-400 font-medium">
                VALUE BET — +{pred.valueBet.edge.toFixed(1)}% edge · Kelly {(pred.valueBet.kellyPct * 100).toFixed(1)}% · Suggest ${pred.valueBet.suggestedBet.toFixed(0)} / $1,000 bank
              </span>
            </div>
          )}

          {/* Analysis text */}
          <p className="text-xs text-gray-400 italic leading-relaxed border-l-2 border-brand-500/40 pl-3">
            {analysis}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Locked Premium Card ────────────────────────────────────────────────────

function LockedPickCard({ pick, onUnlockClick }: { pick: DailyPick; onUnlockClick: () => void }) {
  const c  = CONF_STYLE[pick.confidence];
  const bt = BET_TYPE_STYLE[pick.betType];

  return (
    <div className="rounded-xl border border-yellow-500/20 p-5 bg-yellow-500/3 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider">
          <span className="font-mono font-semibold">{SPORT_CONFIG[pick.sport].name.split(' ')[0]}</span>
          <span className="text-gray-700">·</span>
          <span className="text-gray-500">{pick.time}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${bt.bg} ${bt.color}`}>
            {bt.label}
          </span>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/20 border border-yellow-500/30">
            <Crown className="w-3 h-3 text-yellow-400" />
            <span className="text-[10px] text-yellow-400 font-bold">PREMIUM</span>
          </div>
        </div>
      </div>

      {/* Matchup (shown but blurred details) */}
      <div className="text-gray-300 font-semibold text-sm mb-3">
        {pick.away.split(' ').pop()} @ {pick.home.split(' ').pop()}
        <span className="text-gray-600 font-normal text-xs ml-2">{pick.confidence.toUpperCase()} conf.</span>
      </div>

      {/* Blurred preview */}
      <div className="rounded-lg bg-black/40 border border-gray-700 p-3 blur-sm select-none pointer-events-none" aria-hidden>
        <div className="flex items-center justify-between">
          <div className="text-green-400 font-bold">██████ -3.5</div>
          <div className="flex gap-3 text-right">
            <div>
              <div className="text-white font-mono font-bold">██.█%</div>
              <div className="text-xs text-gray-500">Win Prob</div>
            </div>
            <div>
              <div className="text-green-400 font-mono font-bold">+█.█%</div>
              <div className="text-xs text-gray-500">Edge</div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pt-12">
        <Lock className="w-6 h-6 text-yellow-400/80" />
        <p className="text-gray-300 text-xs font-medium">Premium pick — unlock for $10 in crypto</p>
        <Button
          size="sm"
          className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold px-4 text-xs"
          onClick={onUnlockClick}
        >
          <Flame className="w-3 h-3 mr-1" />
          Pay with Crypto
        </Button>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DailyPicks() {
  const navigate = useNavigate();
  const [premium, setPremium] = useState(isPremiumUser());
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0); // first pick expanded by default
  const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");
  const [confFilter, setConfFilter] = useState<ConfFilter>("ALL");
  const [betTypeFilter, setBetTypeFilter] = useState<BetType | "ALL">("ALL");

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Pre-compute predictions for all picks
  const predictions = useMemo(
    () => TODAY_PICKS.map((p) => analyzeGame(p.home, p.away, p.sport)),
    []
  );

  // Filter logic
  const filteredFree = TODAY_PICKS
    .map((p, i) => ({ pick: p, pred: predictions[i], origIdx: i }))
    .filter(({ pick }) => !pick.isPremium)
    .filter(({ pick }) => sportFilter === "ALL" || pick.sport === sportFilter)
    .filter(({ pick }) => confFilter === "ALL" || pick.confidence === confFilter)
    .filter(({ pick }) => betTypeFilter === "ALL" || pick.betType === betTypeFilter);

  const filteredPremium = TODAY_PICKS
    .map((p, i) => ({ pick: p, pred: predictions[i], origIdx: i }))
    .filter(({ pick }) => pick.isPremium)
    .filter(({ pick }) => sportFilter === "ALL" || pick.sport === sportFilter)
    .filter(({ pick }) => confFilter === "ALL" || pick.confidence === confFilter)
    .filter(({ pick }) => betTypeFilter === "ALL" || pick.betType === betTypeFilter);

  // Best free pick by edge for "Pick of the Day"
  const pickOfDay = useMemo(() => {
    let best: { pick: DailyPick; pred: GamePrediction; origIdx: number } | null = null;
    let bestEdge = -Infinity;
    TODAY_PICKS.forEach((pick, i) => {
      if (pick.isPremium) return;
      const pred = predictions[i];
      const edge = Math.max(pred.homeEdge, pred.awayEdge);
      if (edge > bestEdge) { bestEdge = edge; best = { pick, pred, origIdx: i }; }
    });
    return best;
  }, [predictions]);

  const highConf  = TODAY_PICKS.filter((p) => p.confidence === "high").length;
  const valueBets = predictions.filter((p) => p.valueBet !== null).length;

  // Available sport labels for filter
  const sports = Array.from(new Set(TODAY_PICKS.map((p) => p.sport)));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <div className="border-b border-gray-800 px-4 py-3 flex items-center justify-between max-w-4xl mx-auto">
        <Button
          variant="ghost" size="sm"
          className="text-gray-400 hover:text-white"
          onClick={() => navigate("/")}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <span className="font-bold text-lg">Daily Picks</span>
        </div>
        <div className="w-16" />
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <Calendar className="w-4 h-4" />
              <span>{today}</span>
            </div>
            <h1 className="text-2xl font-bold">Today's AI Picks</h1>
            <p className="text-gray-400 text-sm mt-1">
              ML predictions across {sports.map(s => SPORT_CONFIG[s].name.split(' ')[0]).join(' · ')} — spread, moneyline &amp; totals
            </p>
          </div>
          <div className="hidden sm:flex gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-brand-400">{TODAY_PICKS.length}</div>
              <div className="text-xs text-gray-500">Games</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">{highConf}</div>
              <div className="text-xs text-gray-500">High Conf</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">{valueBets}</div>
              <div className="text-xs text-gray-500">Value Bets</div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Model Accuracy", value: "68%",    Icon: Percent,    color: "text-green-400"  },
            { label: "Avg Edge",       value: "+4.2%",  Icon: TrendingUp, color: "text-blue-400"   },
            { label: "Season ROI",     value: "+12.3%", Icon: DollarSign, color: "text-yellow-400" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* ── PICK OF THE DAY ── */}
        {pickOfDay && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-yellow-400" />
              <h2 className="font-bold text-white text-lg">Pick of the Day</h2>
              <Badge variant="outline" className="text-yellow-400 border-yellow-400/40 text-xs">Best Edge</Badge>
            </div>
            <PickCard
              pick={pickOfDay.pick}
              pred={pickOfDay.pred}
              isExpanded={expandedIdx === pickOfDay.origIdx}
              onToggle={() => setExpandedIdx(expandedIdx === pickOfDay.origIdx ? null : pickOfDay.origIdx)}
              isFeatured
            />
          </div>
        )}

        {/* ── FILTERS ── */}
        <div className="flex flex-wrap gap-2 items-center pb-1 border-b border-gray-800">
          {/* Sport filter */}
          <div className="flex gap-1">
            {(["ALL", ...sports] as (SportFilter)[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={sportFilter === s ? "default" : "outline"}
                className={`text-xs px-2.5 py-1 h-7 ${sportFilter === s ? "bg-brand-600 text-white" : "border-gray-700 text-gray-400"}`}
                onClick={() => setSportFilter(s)}
              >
                {s === "ALL" ? "All Sports" : SPORT_CONFIG[s as Sport].name.split(' ')[0]}
              </Button>
            ))}
          </div>
          <div className="w-px h-5 bg-gray-700 hidden sm:block" />
          {/* Bet type filter */}
          <div className="flex gap-1">
            {(["ALL", "spread", "moneyline", "total"] as (BetType | "ALL")[]).map((bt) => (
              <Button
                key={bt}
                size="sm"
                variant={betTypeFilter === bt ? "default" : "outline"}
                className={`text-xs px-2.5 py-1 h-7 ${betTypeFilter === bt ? "bg-gray-700 text-white" : "border-gray-800 text-gray-500"}`}
                onClick={() => setBetTypeFilter(bt)}
              >
                {bt === "ALL" ? "All Types" : BET_TYPE_STYLE[bt as BetType].label}
              </Button>
            ))}
          </div>
          <div className="w-px h-5 bg-gray-700 hidden sm:block" />
          {/* Confidence filter */}
          <div className="flex gap-1">
            {(["ALL", "high", "medium"] as (ConfFilter)[]).map((cf) => (
              <Button
                key={cf}
                size="sm"
                variant={confFilter === cf ? "default" : "outline"}
                className={`text-xs px-2.5 py-1 h-7 ${confFilter === cf ? "bg-gray-700 text-white" : "border-gray-800 text-gray-500"}`}
                onClick={() => setConfFilter(cf)}
              >
                {cf === "ALL" ? "All Conf" : cf.charAt(0).toUpperCase() + cf.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* ── FREE PICKS ── */}
        {filteredFree.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-green-400" />
              <h2 className="font-bold text-white text-lg">Free Picks</h2>
              <Badge variant="outline" className="text-green-400 border-green-400/40 text-xs">
                {filteredFree.length} pick{filteredFree.length !== 1 ? 's' : ''} · free
              </Badge>
            </div>
            <div className="space-y-4">
              {filteredFree.map(({ pick, pred, origIdx }) => (
                <PickCard
                  key={origIdx}
                  pick={pick}
                  pred={pred}
                  isExpanded={expandedIdx === origIdx}
                  onToggle={() => setExpandedIdx(expandedIdx === origIdx ? null : origIdx)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── PREMIUM PICKS ── */}
        {filteredPremium.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-400" />
                <h2 className="font-bold text-white text-lg">Premium Picks</h2>
                <Badge variant="outline" className="text-yellow-400 border-yellow-400/40 text-xs">
                  {premium ? `${filteredPremium.length} unlocked` : `${filteredPremium.length} locked`}
                </Badge>
              </div>
              {!premium && (
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold"
                  onClick={() => setShowCryptoModal(true)}
                >
                  <Flame className="w-3.5 h-3.5 mr-1.5" />
                  Unlock All · $10
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {filteredPremium.map(({ pick, pred, origIdx }) =>
                premium ? (
                  <PickCard
                    key={origIdx}
                    pick={pick}
                    pred={pred}
                    isExpanded={expandedIdx === origIdx}
                    onToggle={() => setExpandedIdx(expandedIdx === origIdx ? null : origIdx)}
                  />
                ) : (
                  <LockedPickCard
                    key={origIdx}
                    pick={pick}
                    onUnlockClick={() => setShowCryptoModal(true)}
                  />
                )
              )}
            </div>

            {/* Upsell banner */}
            {!premium && (
              <div className="mt-6 rounded-xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="w-5 h-5 text-orange-400" />
                    <span className="font-bold text-white text-lg">Unlock All Premium Picks</span>
                  </div>
                  <p className="text-sm text-gray-400">
                    Send $10 in ETH or USDC — includes {filteredPremium.length} picks with spread, moneyline &amp; value bet analysis. One-time, never expires.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {[
                      "Full spread + totals analysis for every pick",
                      "Value bet alerts with Kelly Criterion sizing",
                      "AI analysis text with model reasoning",
                    ].map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
                        <Check className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold px-6 py-5 text-base whitespace-nowrap flex-shrink-0"
                  onClick={() => setShowCryptoModal(true)}
                >
                  Pay $10 in Crypto
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {filteredFree.length === 0 && filteredPremium.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>No picks match your current filters.</p>
            <Button size="sm" variant="outline" className="mt-3 border-gray-700 text-gray-400"
              onClick={() => { setSportFilter("ALL"); setConfFilter("ALL"); setBetTypeFilter("ALL"); }}>
              Clear filters
            </Button>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-gray-600 text-xs text-center pb-4">
          AI picks are for informational purposes only. Always gamble responsibly.
          Past performance is not indicative of future results. Must be 21+.
        </p>
      </div>

      <CryptoPaymentModal
        open={showCryptoModal}
        onOpenChange={setShowCryptoModal}
        unlockType={"big-game" as UnlockType}
        onSuccess={() => setPremium(true)}
      />
    </div>
  );
}
