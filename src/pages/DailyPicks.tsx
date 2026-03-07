import { useState, useEffect, useRef } from "react";
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
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import {
  analyzeGame,
  formatOdds,
  formatProb,
  formatEdge,
  SPORT_CONFIG,
  type Sport,
  type GamePrediction,
} from "@/lib/predictions";
import { isPremiumUser } from "@/lib/stripe";
import { useNavigate } from "react-router-dom";
import CryptoPaymentModal, { type UnlockType } from "@/components/CryptoPaymentModal";

// ─── Data ──────────────────────────────────────────────────────────────────

interface DailyPick {
  sport: Sport;
  home: string;
  away: string;
  time: string;
  confidence: "high" | "medium" | "low";
  isPremium: boolean;
}

// March 2, 2026 — NBA mid-season slate
const TODAY_PICKS: DailyPick[] = [
  // Free picks — shown immediately to all visitors
  { sport: "nba", home: "Oklahoma City Thunder", away: "Boston Celtics",         time: "7:30 PM ET",  confidence: "high",   isPremium: false },
  { sport: "nba", home: "Cleveland Cavaliers",   away: "Milwaukee Bucks",        time: "7:00 PM ET",  confidence: "high",   isPremium: false },
  { sport: "nba", home: "Denver Nuggets",        away: "Golden State Warriors",  time: "9:00 PM ET",  confidence: "medium", isPremium: false },
  // Premium picks — locked until crypto payment
  { sport: "nba", home: "Los Angeles Lakers",    away: "Dallas Mavericks",       time: "9:30 PM ET",  confidence: "high",   isPremium: true  },
  { sport: "nba", home: "Minnesota Timberwolves",away: "Memphis Grizzlies",      time: "8:00 PM ET",  confidence: "high",   isPremium: true  },
  { sport: "nba", home: "Philadelphia 76ers",    away: "New York Knicks",        time: "7:30 PM ET",  confidence: "medium", isPremium: true  },
];

// Animated count-up hook
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(eased * target);
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { value, ref };
}

function AnimatedStat({
  label,
  target,
  suffix,
  prefix,
  decimals,
  Icon,
  color,
}: {
  label: string;
  target: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  const { value, ref } = useCountUp(target);
  const display = `${prefix ?? ""}${value.toFixed(decimals ?? 0)}${suffix ?? ""}`;

  return (
    <div ref={ref} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
      <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
      <div className={`text-xl font-bold ${color} font-mono tabular-nums`}>{display}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

const CONF = {
  high:   { label: "HIGH",   textColor: "text-green-400",  border: "border-green-500/30",  bg: "bg-green-500/8",   Icon: Zap      },
  medium: { label: "MEDIUM", textColor: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-500/8",  Icon: Target   },
  low:    { label: "LOW",    textColor: "text-orange-400", border: "border-orange-500/30", bg: "bg-orange-500/8",  Icon: Activity },
};

// ─── Free Pick Card ────────────────────────────────────────────────────────

function FreePick({ pick }: { pick: DailyPick }) {
  const c = CONF[pick.confidence];
  const { Icon } = c;

  // Run prediction immediately — no button click required
  const pred: GamePrediction = analyzeGame(pick.home, pick.away, pick.sport);
  const isHomeWin  = pred.predictedWinner === pick.home;
  const winnerOdds = isHomeWin ? pred.homeOdds : pred.awayOdds;
  const winnerProb = isHomeWin ? pred.homeProb : pred.awayProb;
  const winnerEdge = isHomeWin ? pred.homeEdge : pred.awayEdge;
  const loserProb  = isHomeWin ? pred.awayProb : pred.homeProb;

  return (
    <div className={`rounded-xl border ${c.border} p-5 bg-gray-900/60`}>
      {/* Sport / time / confidence header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider">
          <span className="font-mono">{SPORT_CONFIG[pick.sport].name}</span>
          <span className="text-gray-600">·</span>
          <span>{pick.time}</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-800 border ${c.border}`}>
          <Icon className={`w-3 h-3 ${c.textColor}`} />
          <span className={`text-xs font-bold ${c.textColor}`}>{c.label}</span>
        </div>
      </div>

      {/* Matchup */}
      <div className="text-white font-semibold text-lg mb-4">
        {pick.away}
        <span className="text-gray-500 font-normal text-sm mx-2">@</span>
        {pick.home}
      </div>

      {/* AI Prediction — always visible for free picks */}
      <div className="rounded-lg bg-black/40 border border-gray-700 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-4 h-4 text-brand-400" />
          <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">AI Model Pick</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          {/* Winner */}
          <div>
            <div className="text-green-400 font-bold text-xl">{pred.predictedWinner}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Moneyline {formatOdds(winnerOdds)}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-white font-mono font-bold text-lg">{formatProb(winnerProb)}</div>
              <div className="text-xs text-gray-500">Win Prob</div>
            </div>
            <div>
              <div className={`font-mono font-bold text-lg ${winnerEdge > 0 ? "text-green-400" : "text-red-400"}`}>
                {formatEdge(winnerEdge)}
              </div>
              <div className="text-xs text-gray-500">Edge</div>
            </div>
          </div>
        </div>

        {/* Win probability bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{pred.homeTeam.split(" ").pop()}</span>
            <span>{pred.awayTeam.split(" ").pop()}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-700 overflow-hidden flex">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${(pred.homeProb * 100).toFixed(0)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatProb(pred.homeProb)}</span>
            <span>{formatProb(pred.awayProb)}</span>
          </div>
        </div>

        {/* Value bet badge */}
        {pred.valueBet && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <Zap className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <span className="text-xs text-green-400 font-medium">
              VALUE BET — +{pred.valueBet.edge.toFixed(1)}% edge · Suggested ${pred.valueBet.suggestedBet.toFixed(0)}
            </span>
          </div>
        )}

        {/* Reasoning */}
        <p className="text-xs text-gray-500 italic leading-relaxed">
          {pred.valueBet
            ? `Model has ${pred.predictedWinner} at ${formatProb(winnerProb)} — +${pred.valueBet.edge.toFixed(1)}% edge vs market line. Kelly fraction ${(pred.valueBet.kellyPct * 100).toFixed(1)}%.`
            : `Model has ${pred.predictedWinner} at ${formatProb(winnerProb)} win probability vs market-implied ${formatProb(isHomeWin ? pred.homeImpliedProb : pred.awayImpliedProb)}. Opponent win prob: ${formatProb(loserProb)}.`
          }
        </p>
      </div>
    </div>
  );
}

// ─── Premium (locked) Pick Card ────────────────────────────────────────────

function PremiumPick({
  pick,
  isPremium,
  onUnlockClick,
}: {
  pick: DailyPick;
  isPremium: boolean;
  onUnlockClick: () => void;
}) {
  const c = CONF[pick.confidence];
  const { Icon } = c;

  // Always run prediction — shown when premium is active
  const pred: GamePrediction = analyzeGame(pick.home, pick.away, pick.sport);
  const isHomeWin  = pred.predictedWinner === pick.home;
  const winnerOdds = isHomeWin ? pred.homeOdds : pred.awayOdds;
  const winnerProb = isHomeWin ? pred.homeProb : pred.awayProb;
  const winnerEdge = isHomeWin ? pred.homeEdge : pred.awayEdge;

  return (
    <div className={`rounded-xl border ${isPremium ? c.border : "border-yellow-500/30"} p-5 ${isPremium ? "bg-gray-900/60" : "bg-yellow-500/4"} relative`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider">
          <span className="font-mono">{SPORT_CONFIG[pick.sport].name}</span>
          <span className="text-gray-600">·</span>
          <span>{pick.time}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/20 border border-yellow-500/30">
            <Crown className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-yellow-400 font-bold">PREMIUM</span>
          </div>
          {isPremium && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-800 border ${c.border}`}>
              <Icon className={`w-3 h-3 ${c.textColor}`} />
              <span className={`text-xs font-bold ${c.textColor}`}>{c.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Matchup */}
      <div className="text-white font-semibold text-lg mb-4">
        {pick.away}
        <span className="text-gray-500 font-normal text-sm mx-2">@</span>
        {pick.home}
      </div>

      {isPremium ? (
        // Unlocked — show full prediction
        <div className="rounded-lg bg-black/40 border border-gray-700 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-brand-400" />
            <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">AI Model Pick</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-green-400 font-bold text-xl">{pred.predictedWinner}</div>
              <div className="text-xs text-gray-500 mt-0.5">Moneyline {formatOdds(winnerOdds)}</div>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <div className="text-white font-mono font-bold text-lg">{formatProb(winnerProb)}</div>
                <div className="text-xs text-gray-500">Win Prob</div>
              </div>
              <div>
                <div className={`font-mono font-bold text-lg ${winnerEdge > 0 ? "text-green-400" : "text-red-400"}`}>
                  {formatEdge(winnerEdge)}
                </div>
                <div className="text-xs text-gray-500">Edge</div>
              </div>
            </div>
          </div>
          <div>
            <div className="h-2 rounded-full bg-gray-700 overflow-hidden flex">
              <div
                className="h-full bg-brand-500 rounded-full"
                style={{ width: `${(pred.homeProb * 100).toFixed(0)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{pred.homeTeam.split(" ").pop()} {formatProb(pred.homeProb)}</span>
              <span>{pred.awayTeam.split(" ").pop()} {formatProb(pred.awayProb)}</span>
            </div>
          </div>
          {pred.valueBet && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
              <Zap className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-400 font-medium">
                VALUE BET — +{pred.valueBet.edge.toFixed(1)}% edge · Suggested ${pred.valueBet.suggestedBet.toFixed(0)}
              </span>
            </div>
          )}
        </div>
      ) : (
        // Locked — blur overlay + CTA
        <div className="relative">
          {/* Blurred preview */}
          <div className="rounded-lg bg-black/40 border border-gray-700 p-4 blur-sm select-none pointer-events-none" aria-hidden>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-green-400 font-bold text-xl">██████████</div>
                <div className="text-xs text-gray-500 mt-0.5">Moneyline ████</div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <div className="text-white font-mono font-bold text-lg">██.█%</div>
                  <div className="text-xs text-gray-500">Win Prob</div>
                </div>
                <div>
                  <div className="text-green-400 font-mono font-bold text-lg">+█.█%</div>
                  <div className="text-xs text-gray-500">Edge</div>
                </div>
              </div>
            </div>
          </div>
          {/* CTA overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Lock className="w-7 h-7 text-yellow-400/80" />
            <p className="text-gray-300 text-sm font-medium">Unlock this pick for $10 in crypto</p>
            <Button
              size="sm"
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold px-5"
              onClick={onUnlockClick}
            >
              <Flame className="w-3.5 h-3.5 mr-1.5" />
              Pay with Crypto
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DailyPicks() {
  const navigate = useNavigate();
  const [premium, setPremium] = useState(isPremiumUser());
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [cryptoUnlockType] = useState<UnlockType>("big-game");

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const freePicks    = TODAY_PICKS.filter((p) => !p.isPremium);
  const premiumPicks = TODAY_PICKS.filter((p) => p.isPremium);
  const highConf     = TODAY_PICKS.filter((p) => p.confidence === "high").length;

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-16 md:pb-0">
      {/* Nav */}
      <div className="border-b border-gray-800 px-4 py-3 flex items-center justify-between max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white"
          onClick={() => navigate("/")}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
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
              Machine learning predictions for today's {SPORT_CONFIG.nba.name} slate
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
          </div>
        </div>

        {/* Stats bar — animated counters */}
        <div className="grid grid-cols-3 gap-3">
          <AnimatedStat label="Model Accuracy" target={68} suffix="%" Icon={Percent} color="text-green-400" />
          <AnimatedStat label="Avg Edge" target={4.2} suffix="%" prefix="+" decimals={1} Icon={TrendingUp} color="text-blue-400" />
          <AnimatedStat label="Season ROI" target={12.3} suffix="%" prefix="+" decimals={1} Icon={DollarSign} color="text-yellow-400" />
        </div>

        {/* ── FREE PICKS ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-4 h-4 text-green-400" />
            <h2 className="font-bold text-white text-lg">Free Picks</h2>
            <Badge variant="outline" className="text-green-400 border-green-400/40 text-xs">
              {freePicks.length} picks · free
            </Badge>
          </div>
          <div className="space-y-4">
            {freePicks.map((pick, i) => (
              <FreePick key={i} pick={pick} />
            ))}
          </div>
        </div>

        {/* ── PREMIUM PICKS ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-400" />
              <h2 className="font-bold text-white text-lg">Premium Picks</h2>
              <Badge variant="outline" className="text-yellow-400 border-yellow-400/40 text-xs">
                {premium ? `${premiumPicks.length} unlocked` : `${premiumPicks.length} locked`}
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
            {premiumPicks.map((pick, i) => (
              <PremiumPick
                key={i}
                pick={pick}
                isPremium={premium}
                onUnlockClick={() => setShowCryptoModal(true)}
              />
            ))}
          </div>

          {/* Premium upsell banner (only if not premium) */}
          {!premium && (
            <div className="mt-6 rounded-xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="w-5 h-5 text-orange-400" />
                  <span className="font-bold text-white text-lg">Unlock All Premium Picks</span>
                </div>
                <p className="text-sm text-gray-400">
                  Send $10 in ETH or USDC — includes {premiumPicks.length} picks, value bets &amp; edge scores. One-time, never expires.
                </p>
                <ul className="mt-2 space-y-1">
                  {["High-confidence championship picks", "Value bet alerts with Kelly sizing", "Sharp money flow indicator"].map((f) => (
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

        {/* Disclaimer */}
        <p className="text-gray-600 text-xs text-center pb-4">
          AI picks are for informational purposes only. Always gamble responsibly.
          Past performance is not indicative of future results. Must be 21+.
        </p>
      </div>

      {/* Crypto payment modal */}
      <CryptoPaymentModal
        open={showCryptoModal}
        onOpenChange={setShowCryptoModal}
        unlockType={cryptoUnlockType}
        onSuccess={() => setPremium(true)}
      />
    </div>
  );
}
