/**
 * LiveOddsTicker — horizontal scrolling odds strip for AI Advantage Sports
 * Shows best available ML/spread lines, highlights significant line movement
 */

import { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";

interface OddsEntry {
  away: string;
  home: string;
  sport: "NBA" | "NFL" | "MLB" | "NHL";
  awayML: number;
  homeML: number;
  spread: number;
  spreadOdds: number;
  openAwayML: number;
  openHomeML: number;
  time: string;
}

const SAMPLE_ODDS: OddsEntry[] = [
  { sport: "NBA", away: "Bucks",    home: "Celtics",   awayML: +172, homeML: -205, spread: -5.5, spreadOdds: -110, openAwayML: +155, openHomeML: -185, time: "7:30 PM" },
  { sport: "NBA", away: "Nuggets",  home: "Thunder",   awayML: +240, homeML: -290, spread: -7.0, spreadOdds: -108, openAwayML: +210, openHomeML: -260, time: "9:00 PM" },
  { sport: "NBA", away: "Knicks",   home: "Cavaliers", awayML: +330, homeML: -420, spread: -9.5, spreadOdds: -112, openAwayML: +305, openHomeML: -385, time: "7:00 PM" },
  { sport: "NBA", away: "Lakers",   home: "Warriors",  awayML: +118, homeML: -138, spread: -2.0, spreadOdds: -110, openAwayML: +130, openHomeML: -152, time: "10:00 PM" },
  { sport: "NFL", away: "Bills",    home: "Chiefs",    awayML: +145, homeML: -168, spread: -3.5, spreadOdds: -110, openAwayML: +140, openHomeML: -162, time: "8:20 PM" },
  { sport: "NFL", away: "Eagles",   home: "49ers",     awayML: +105, homeML: -124, spread: -2.0, spreadOdds: -108, openAwayML: +112, openHomeML: -132, time: "4:25 PM" },
];

function formatOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function mlMovement(open: number, current: number): "up" | "down" | "flat" {
  const diff = Math.abs(current) - Math.abs(open);
  if (diff > 8) return "up";
  if (diff < -8) return "down";
  return "flat";
}

function MovementIcon({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "up") return <TrendingUp className="w-3 h-3 text-red-400" />;
  if (dir === "down") return <TrendingDown className="w-3 h-3 text-green-400" />;
  return <Minus className="w-3 h-3 text-gray-600" />;
}

function OddsChip({ entry }: { entry: OddsEntry }) {
  const awayDir = mlMovement(entry.openAwayML, entry.awayML);
  const homeDir = mlMovement(entry.openHomeML, entry.homeML);
  const bigMove = awayDir !== "flat" || homeDir !== "flat";

  return (
    <div
      className={`flex-shrink-0 flex items-center gap-3 px-4 py-2 rounded-lg border mx-1 transition-colors
        ${bigMove
          ? "bg-yellow-400/5 border-yellow-400/30"
          : "bg-gray-900 border-gray-800"}`}
    >
      {/* Sport badge */}
      <span className="text-[10px] font-mono font-bold text-gray-500 w-7">{entry.sport}</span>

      {/* Away */}
      <div className="flex items-center gap-1">
        <span className="text-sm text-gray-300 w-14 text-right font-medium">{entry.away}</span>
        <div className="flex flex-col items-center">
          <MovementIcon dir={awayDir} />
          <span className={`text-xs font-mono font-bold tabular-nums
            ${entry.awayML > 0 ? "text-blue-400" : "text-gray-300"}`}>
            {formatOdds(entry.awayML)}
          </span>
        </div>
      </div>

      {/* Spread */}
      <div className="flex flex-col items-center px-2 border-x border-gray-800">
        <span className="text-[10px] text-gray-600 font-mono">
          {entry.spread > 0 ? `+${entry.spread}` : entry.spread}
        </span>
        <span className="text-[10px] text-gray-600 font-mono">{formatOdds(entry.spreadOdds)}</span>
        <span className="text-[10px] text-gray-600">{entry.time}</span>
      </div>

      {/* Home */}
      <div className="flex items-center gap-1">
        <div className="flex flex-col items-center">
          <MovementIcon dir={homeDir} />
          <span className={`text-xs font-mono font-bold tabular-nums
            ${entry.homeML < 0 ? "text-gray-300" : "text-blue-400"}`}>
            {formatOdds(entry.homeML)}
          </span>
        </div>
        <span className="text-sm text-gray-300 w-14 font-medium">{entry.home}</span>
      </div>

      {bigMove && (
        <Zap className="w-3 h-3 text-yellow-400 animate-pulse flex-shrink-0" />
      )}
    </div>
  );
}

interface LiveOddsTickerProps {
  /** Speed in px/s — default 40 */
  speed?: number;
  /** Pause on hover — default true */
  pauseOnHover?: boolean;
}

export default function LiveOddsTicker({ speed = 40, pauseOnHover = true }: LiveOddsTickerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Simulate a line refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => setLastUpdate(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // CSS animation via inline style — duplicated track for seamless loop
  const duration = (SAMPLE_ODDS.length * 160) / speed; // ~160px per chip

  return (
    <div className="w-full overflow-hidden border-y border-gray-800 bg-gray-950">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-1 border-b border-gray-800/50">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] font-mono font-bold text-gray-500 tracking-widest uppercase">
            Live Odds
          </span>
        </div>
        <span className="text-[10px] text-gray-600 font-mono hidden sm:inline">
          Updated {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {" · "}Best available · <span className="text-green-400/70">↓ favourable move</span>{" · "}
          <span className="text-red-400/70">↑ line move against</span>
        </span>
        <span className="text-[10px] text-gray-600 font-mono sm:hidden">
          {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Scrolling track — touch + mouse to pause */}
      <div
        className="flex py-2"
        style={{
          animation: `ticker-scroll ${duration}s linear infinite`,
          animationPlayState: paused ? "paused" : "running",
          willChange: "transform",
        }}
        onMouseEnter={() => pauseOnHover && setPaused(true)}
        onMouseLeave={() => pauseOnHover && setPaused(false)}
        onTouchStart={() => pauseOnHover && setPaused(true)}
        onTouchEnd={() => pauseOnHover && setPaused(false)}
        ref={trackRef}
      >
        {/* Duplicate for seamless loop */}
        {[...SAMPLE_ODDS, ...SAMPLE_ODDS].map((entry, i) => (
          <OddsChip key={i} entry={entry} />
        ))}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
