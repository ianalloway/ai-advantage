import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Trophy,
  Target,
  Zap,
  ChevronLeft,
  RefreshCw,
  Star,
  Lock,
  Brain,
  Calendar,
  Percent,
  DollarSign,
  Activity,
  Flame,
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

interface DailyPick {
  sport: Sport;
  home: string;
  away: string;
  time: string;
  confidence: "high" | "medium" | "low";
  isPremium: boolean;
}

// March 2, 2026 — NBA mid-season slate (NFL is off-season in March)
const TODAY_PICKS: DailyPick[] = [
  // Free picks
  { sport: "nba", home: "Oklahoma City Thunder", away: "Boston Celtics",        time: "7:30 PM ET",  confidence: "high",   isPremium: false },
  { sport: "nba", home: "Cleveland Cavaliers",   away: "Milwaukee Bucks",       time: "7:00 PM ET",  confidence: "high",   isPremium: false },
  { sport: "nba", home: "Denver Nuggets",        away: "Golden State Warriors", time: "9:00 PM ET",  confidence: "medium", isPremium: false },
  // Premium picks
  { sport: "nba", home: "Los Angeles Lakers",    away: "Dallas Mavericks",      time: "9:30 PM ET",  confidence: "high",   isPremium: true  },
  { sport: "nba", home: "Minnesota Timberwolves",away: "Memphis Grizzlies",     time: "8:00 PM ET",  confidence: "medium", isPremium: true  },
  { sport: "nba", home: "Philadelphia 76ers",    away: "New York Knicks",       time: "7:30 PM ET",  confidence: "medium", isPremium: true  },
];

const CONFIDENCE_CONFIG = {
  high:   { label: "HIGH",   color: "text-green-400",  bg: "bg-green-400/10 border-green-400/30",   icon: Zap      },
  medium: { label: "MEDIUM", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30", icon: Target   },
  low:    { label: "LOW",    color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30", icon: Activity },
};

// Build a plain-English reasoning line from a GamePrediction
function buildReasoning(pred: GamePrediction): string {
  const w = pred.predictedWinner;
  const conf = (pred.confidence * 100).toFixed(1);
  if (pred.valueBet) {
    return `Model favors ${w} at ${conf}% — +${pred.valueBet.edge.toFixed(1)}% edge vs the closing line. ${pred.valueBet.location} team, Kelly stake ${(pred.valueBet.kellyPct * 100).toFixed(1)}%.`;
  }
  const bestEdge = pred.homeEdge > pred.awayEdge ? pred.homeEdge : pred.awayEdge;
  return `Model favors ${w} at ${conf}% win probability. No clear value edge detected (${formatEdge(bestEdge)} best side).`;
}

interface PickCardProps {
  pick: DailyPick;
  isPremium: boolean;
  onUnlockClick: () => void;
}

function PickCard({ pick, isPremium, onUnlockClick }: PickCardProps) {
  const [revealed, setRevealed] = useState(false);
  const locked = pick.isPremium && !isPremium;
  const conf = CONFIDENCE_CONFIG[pick.confidence];
  const ConfIcon = conf.icon;

  // Correct analyzeGame call: (homeTeam, awayTeam, sport)
  const prediction: GamePrediction = useMemo(
    () => analyzeGame(pick.home, pick.away, pick.sport),
    [pick.home, pick.away, pick.sport]
  );

  // Determine display values for the predicted winner
  const isHomeWinner = prediction.predictedWinner === pick.home;
  const winnerOdds    = isHomeWinner ? prediction.homeOdds    : prediction.awayOdds;
  const winnerProb    = isHomeWinner ? prediction.homeProb    : prediction.awayProb;
  const winnerEdge    = isHomeWinner ? prediction.homeEdge    : prediction.awayEdge;
  const reasoning     = buildReasoning(prediction);

  return (
    <div className={`relative rounded-xl border ${conf.bg} p-5 transition-all duration-300 hover:scale-[1.01]`}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">
              {SPORT_CONFIG[pick.sport].name}
            </span>
            <span className="text-xs text-gray-500">·</span>
            <span className="text-xs text-gray-400">{pick.time}</span>
          </div>
          <div className="text-white font-semibold text-lg leading-tight">
            {pick.away} <span className="text-gray-500 font-normal text-sm">@</span> {pick.home}
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${conf.bg}`}>
          <ConfIcon className={`w-3 h-3 ${conf.color}`} />
          <span className={`text-xs font-bold ${conf.color}`}>{conf.label}</span>
        </div>
      </div>

      {/* Prediction content */}
      {locked ? (
        <div className="mt-4 flex flex-col items-center gap-3 py-4">
          <Lock className="w-8 h-8 text-yellow-400/60" />
          <p className="text-gray-400 text-sm text-center">
            Premium pick — send $10 in crypto to unlock
          </p>
          <Button
            size="sm"
            className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold"
            onClick={onUnlockClick}
          >
            <Flame className="w-3.5 h-3.5 mr-1.5" />
            Unlock with Crypto
          </Button>
        </div>
      ) : !revealed ? (
        <Button
          variant="outline"
          className="w-full mt-2 border-gray-600 text-gray-300 hover:bg-gray-700"
          onClick={() => setRevealed(true)}
        >
          <Brain className="w-4 h-4 mr-2" />
          Reveal AI Pick
        </Button>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between p-3 bg-black/30 rounded-lg gap-4">
            <div className="min-w-0">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Model Pick</div>
              <div className="text-green-400 font-bold text-lg truncate">
                {prediction.predictedWinner}
              </div>
              <div className="text-xs text-gray-400">{formatOdds(winnerOdds)}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-400 mb-1">Win Prob</div>
              <div className="text-white font-mono font-bold text-xl">
                {formatProb(winnerProb)}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-400 mb-1">Edge</div>
              <div
                className={`font-mono font-bold text-xl ${
                  winnerEdge > 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {formatEdge(winnerEdge)}
              </div>
            </div>
          </div>
          {prediction.valueBet && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <Zap className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-400 font-medium">
                VALUE BET — Suggested stake ${prediction.valueBet.suggestedBet.toFixed(0)}
              </span>
            </div>
          )}
          <div className="text-xs text-gray-500 italic">{reasoning}</div>
        </div>
      )}
    </div>
  );
}

export default function DailyPicks() {
  const navigate = useNavigate();
  const [premium, setPremium] = useState(isPremiumUser());
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [cryptoUnlockType, setCryptoUnlockType] = useState<UnlockType>("big-game");

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const freePicks    = TODAY_PICKS.filter((p) => !p.isPremium);
  const premiumPicks = TODAY_PICKS.filter((p) => p.isPremium);
  const highConf     = TODAY_PICKS.filter((p) => p.confidence === "high").length;

  const handleUnlockClick = () => {
    setCryptoUnlockType("big-game");
    setShowCryptoModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <div className="border-b border-gray-800 px-4 py-3 flex items-center justify-between max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white"
          onClick={() => navigate("/")}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <span className="font-bold text-lg">Daily Picks</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Date + summary */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <Calendar className="w-4 h-4" />
              <span>{today}</span>
            </div>
            <h1 className="text-2xl font-bold">Today's AI Picks</h1>
          </div>
          <div className="flex gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{TODAY_PICKS.length}</div>
              <div className="text-xs text-gray-500">Games</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{highConf}</div>
              <div className="text-xs text-gray-500">High Conf</div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: "Model Accuracy", value: "68%",    icon: Percent,    color: "text-green-400"  },
            { label: "Avg Edge",       value: "+4.2%",  icon: TrendingUp, color: "text-blue-400"   },
            { label: "Season ROI",     value: "+12.3%", icon: DollarSign, color: "text-yellow-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center"
            >
              <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Free picks */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-green-400" />
            <h2 className="font-semibold text-gray-200">Free Picks</h2>
            <Badge variant="outline" className="text-green-400 border-green-400/40 text-xs">
              {freePicks.length} available
            </Badge>
          </div>
          <div className="space-y-4">
            {freePicks.map((pick, i) => (
              <PickCard
                key={i}
                pick={pick}
                isPremium={premium}
                onUnlockClick={handleUnlockClick}
              />
            ))}
          </div>
        </div>

        {/* Premium picks */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-yellow-400" />
            <h2 className="font-semibold text-gray-200">Premium Picks</h2>
            <Badge variant="outline" className="text-yellow-400 border-yellow-400/40 text-xs">
              {premium ? `${premiumPicks.length} unlocked` : `${premiumPicks.length} locked`}
            </Badge>
          </div>
          <div className="space-y-4">
            {premiumPicks.map((pick, i) => (
              <PickCard
                key={i}
                pick={pick}
                isPremium={premium}
                onUnlockClick={handleUnlockClick}
              />
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-gray-600 text-xs text-center mt-10">
          AI picks are for informational purposes only. Always gamble responsibly. Past performance
          is not indicative of future results.
        </p>
      </div>

      {/* Crypto payment modal */}
      <CryptoPaymentModal
        open={showCryptoModal}
        onOpenChange={setShowCryptoModal}
        unlockType={cryptoUnlockType}
        onSuccess={() => {
          setPremium(true);
        }}
      />
    </div>
  );
}
