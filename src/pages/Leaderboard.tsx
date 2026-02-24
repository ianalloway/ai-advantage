import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  Medal,
  Zap,
  Flame,
  Activity,
  Crown,
  Star,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BettorEntry {
  rank: number;
  handle: string;
  avatar: string;
  units: number;
  winRate: number;
  streak: number;
  streakDir: "W" | "L";
  bets: number;
  roi: number;
  badge: string | null;
  sport: string;
  weeklyUnits: number;
}

const LEADERBOARD: BettorEntry[] = [
  { rank: 1,  handle: "@sharpEdgeIan",    avatar: "SI", units: +142.5, winRate: 0.584, streak: 7,  streakDir: "W", bets: 312, roi: 0.123, badge: "👑 GOAT",          sport: "NBA",    weeklyUnits: +18.4 },
  { rank: 2,  handle: "@kellyQueen",      avatar: "KQ", units: +118.2, winRate: 0.571, streak: 4,  streakDir: "W", bets: 287, roi: 0.109, badge: "🔥 On Fire",       sport: "NFL",    weeklyUnits: +11.2 },
  { rank: 3,  handle: "@valueHunter",     avatar: "VH", units: +97.8,  winRate: 0.563, streak: 2,  streakDir: "W", bets: 341, roi: 0.096, badge: "⚡ Sharp",         sport: "MLB",    weeklyUnits: +6.7  },
  { rank: 4,  handle: "@clvChaser",       avatar: "CC", units: +84.1,  winRate: 0.558, streak: 1,  streakDir: "W", bets: 198, roi: 0.088, badge: null,               sport: "NBA",    weeklyUnits: +4.2  },
  { rank: 5,  handle: "@spreadSlayer",    avatar: "SS", units: +71.3,  winRate: 0.551, streak: 3,  streakDir: "W", bets: 224, roi: 0.079, badge: "📈 Trending",      sport: "NFL",    weeklyUnits: +9.1  },
  { rank: 6,  handle: "@contrarian99",    avatar: "C9", units: +58.6,  winRate: 0.548, streak: 2,  streakDir: "L", bets: 175, roi: 0.071, badge: null,               sport: "NBA",    weeklyUnits: -2.1  },
  { rank: 7,  handle: "@totalKiller",     avatar: "TK", units: +44.9,  winRate: 0.544, streak: 4,  streakDir: "W", bets: 263, roi: 0.062, badge: null,               sport: "MLB",    weeklyUnits: +7.8  },
  { rank: 8,  handle: "@moneylineOnly",   avatar: "MO", units: +38.2,  winRate: 0.541, streak: 1,  streakDir: "L", bets: 142, roi: 0.058, badge: null,               sport: "NFL",    weeklyUnits: +1.4  },
  { rank: 9,  handle: "@propKing",        avatar: "PK", units: +27.5,  winRate: 0.537, streak: 2,  streakDir: "W", bets: 389, roi: 0.044, badge: null,               sport: "NBA",    weeklyUnits: +3.2  },
  { rank: 10, handle: "@liveOddsLeo",     avatar: "LL", units: +18.3,  winRate: 0.533, streak: 1,  streakDir: "W", bets: 211, roi: 0.031, badge: "🆕 Rising Star",   sport: "NFL",    weeklyUnits: +5.9  },
];

const WEEKLY_LEADERS: BettorEntry[] = [...LEADERBOARD]
  .sort((a, b) => b.weeklyUnits - a.weeklyUnits)
  .slice(0, 5);

const RANK_COLORS: Record<number, string> = {
  1: "text-yellow-400",
  2: "text-gray-300",
  3: "text-orange-400",
};

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-orange-400" />;
  return <span className={`text-sm font-mono font-bold text-gray-500`}>#{rank}</span>;
}

type Tab = "alltime" | "weekly";

export default function Leaderboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("alltime");
  const [sportFilter, setSportFilter] = useState<string>("ALL");

  const rows = tab === "alltime" ? LEADERBOARD : WEEKLY_LEADERS;
  const filtered = sportFilter === "ALL" ? rows : rows.filter((r) => r.sport === sportFilter);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <div className="border-b border-gray-800 px-4 py-3 flex items-center justify-between max-w-5xl mx-auto">
        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white" onClick={() => navigate("/")}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <span className="font-bold text-lg">Leaderboard</span>
        </div>
        <div />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold mb-2">Top Bettors</h1>
          <p className="text-gray-400 text-sm">Season standings — ranked by total units won</p>
        </div>

        {/* Podium (top 3) */}
        <div className="flex items-end justify-center gap-4 mb-10">
          {/* 2nd */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-gray-400/20 border-2 border-gray-300 flex items-center justify-center text-gray-300 font-bold text-lg">
              {LEADERBOARD[1].avatar}
            </div>
            <div className="bg-gray-700 rounded-t-lg w-24 h-20 flex flex-col items-center justify-center">
              <Medal className="w-5 h-5 text-gray-300 mb-1" />
              <span className="text-xs text-gray-400">{LEADERBOARD[1].handle.replace("@", "")}</span>
              <span className="text-white font-bold text-sm">+{LEADERBOARD[1].units}u</span>
            </div>
          </div>
          {/* 1st */}
          <div className="flex flex-col items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400" />
            <div className="w-16 h-16 rounded-full bg-yellow-400/20 border-2 border-yellow-400 flex items-center justify-center text-yellow-400 font-bold text-xl">
              {LEADERBOARD[0].avatar}
            </div>
            <div className="bg-gray-700 rounded-t-lg w-28 h-28 flex flex-col items-center justify-center">
              <Crown className="w-6 h-6 text-yellow-400 mb-1" />
              <span className="text-xs text-gray-300">{LEADERBOARD[0].handle.replace("@", "")}</span>
              <span className="text-yellow-400 font-bold">+{LEADERBOARD[0].units}u</span>
              <span className="text-xs text-gray-400">{(LEADERBOARD[0].roi * 100).toFixed(1)}% ROI</span>
            </div>
          </div>
          {/* 3rd */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-orange-400/20 border-2 border-orange-400 flex items-center justify-center text-orange-400 font-bold text-lg">
              {LEADERBOARD[2].avatar}
            </div>
            <div className="bg-gray-700 rounded-t-lg w-24 h-16 flex flex-col items-center justify-center">
              <Medal className="w-5 h-5 text-orange-400 mb-1" />
              <span className="text-xs text-gray-400">{LEADERBOARD[2].handle.replace("@", "")}</span>
              <span className="text-white font-bold text-sm">+{LEADERBOARD[2].units}u</span>
            </div>
          </div>
        </div>

        {/* Tabs + Filter */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex gap-2">
            {(["alltime", "weekly"] as Tab[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tab === t ? "default" : "outline"}
                className={tab === t ? "bg-brand-600 text-white" : "border-gray-700 text-gray-400"}
                onClick={() => setTab(t)}
              >
                {t === "alltime" ? "All Time" : "This Week"}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            {["ALL", "NBA", "NFL", "MLB"].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={sportFilter === s ? "default" : "outline"}
                className={sportFilter === s ? "bg-gray-700 text-white" : "border-gray-800 text-gray-500 text-xs"}
                onClick={() => setSportFilter(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Rank</th>
                <th className="px-4 py-3 text-left">Bettor</th>
                <th className="px-4 py-3 text-right">Units</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Win%</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">ROI</th>
                <th className="px-4 py-3 text-center hidden md:table-cell">Streak</th>
                <th className="px-4 py-3 text-right hidden lg:table-cell">Bets</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Badge</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr
                  key={entry.handle}
                  className={`border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors ${
                    i === 0 && tab === "alltime" ? "bg-yellow-400/5" : ""
                  }`}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center w-8">
                      <RankIcon rank={entry.rank} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          entry.rank === 1
                            ? "bg-yellow-400/20 text-yellow-400"
                            : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {entry.avatar}
                      </div>
                      <div>
                        <div className={`font-semibold ${RANK_COLORS[entry.rank] ?? "text-white"}`}>
                          {entry.handle}
                        </div>
                        <div className="text-xs text-gray-500">{entry.sport}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={`font-mono font-bold ${entry.units > 0 ? "text-green-400" : "text-red-400"}`}>
                      {entry.units > 0 ? "+" : ""}{entry.units}u
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right hidden sm:table-cell">
                    <span className="font-mono text-gray-300">{(entry.winRate * 100).toFixed(1)}%</span>
                  </td>
                  <td className="px-4 py-4 text-right hidden md:table-cell">
                    <span className={`font-mono font-semibold ${entry.roi > 0 ? "text-green-400" : "text-red-400"}`}>
                      {entry.roi > 0 ? "+" : ""}{(entry.roi * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center hidden md:table-cell">
                    <div className="flex items-center justify-center gap-1">
                      {entry.streakDir === "W" ? (
                        <Flame className="w-3 h-3 text-orange-400" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-blue-400" />
                      )}
                      <span className={`text-xs font-mono ${entry.streakDir === "W" ? "text-orange-400" : "text-blue-400"}`}>
                        {entry.streak}{entry.streakDir}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-gray-500 hidden lg:table-cell">
                    {entry.bets}
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell">
                    {entry.badge ? (
                      <Badge variant="outline" className="text-xs border-gray-600 text-gray-300 whitespace-nowrap">
                        {entry.badge}
                      </Badge>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Weekly movers */}
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="font-semibold text-sm">Biggest Movers This Week</span>
            </div>
            {[...LEADERBOARD]
              .sort((a, b) => b.weeklyUnits - a.weeklyUnits)
              .slice(0, 3)
              .map((e) => (
                <div key={e.handle} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                  <span className="text-gray-300 text-sm">{e.handle}</span>
                  <span className="text-green-400 font-mono text-sm font-bold">+{e.weeklyUnits}u</span>
                </div>
              ))}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="font-semibold text-sm">Hottest Streaks</span>
            </div>
            {[...LEADERBOARD]
              .filter((e) => e.streakDir === "W")
              .sort((a, b) => b.streak - a.streak)
              .slice(0, 3)
              .map((e) => (
                <div key={e.handle} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                  <span className="text-gray-300 text-sm">{e.handle}</span>
                  <div className="flex items-center gap-1">
                    <Flame className="w-3 h-3 text-orange-400" />
                    <span className="text-orange-400 font-mono text-sm font-bold">{e.streak}W</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <p className="text-gray-600 text-xs text-center mt-8">
          Leaderboard is for entertainment purposes only. Past performance does not guarantee future results.
        </p>
      </div>
    </div>
  );
}
