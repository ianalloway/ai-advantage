import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Minus, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { fetchLiveGamesForSports, type LiveMarketGame } from "@/lib/liveSports";

function formatOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function movement(open?: number, current?: number): "up" | "down" | "flat" {
  if (open === undefined || current === undefined) return "flat";
  if (current > open + 8) return "up";
  if (current < open - 8) return "down";
  return "flat";
}

function MovementIcon({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "up") return <TrendingUp className="h-3 w-3 text-red-400" />;
  if (dir === "down") return <TrendingDown className="h-3 w-3 text-emerald-400" />;
  return <Minus className="h-3 w-3 text-zinc-600" />;
}

function OddsChip({ game }: { game: LiveMarketGame }) {
  if (!game.odds) return null;

  const awayDir = movement(game.odds.awayMoneylineOpen, game.odds.awayMoneyline);
  const homeDir = movement(game.odds.homeMoneylineOpen, game.odds.homeMoneyline);
  const bigMove = awayDir !== "flat" || homeDir !== "flat";

  return (
    <div
      className={`mx-1.5 flex shrink-0 items-center gap-3 rounded-full border px-4 py-2 transition-colors ${
        bigMove
          ? "border-yellow-400/30 bg-yellow-400/8"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-300/80">{game.sportLabel}</span>
        <span className="text-[11px] text-zinc-500">{game.status.state === "in" ? game.status.shortDetail : game.displayTime}</span>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-zinc-200">
        <span className="font-medium text-zinc-300">{game.awayAbbr}</span>
        <MovementIcon dir={awayDir} />
        <span className="font-mono tabular-nums text-sky-300">{formatOdds(game.odds.awayMoneyline)}</span>
      </div>

      <div className="flex items-center gap-2 border-x border-white/10 px-3 text-[11px] text-zinc-500">
        <span>{game.odds.spread !== undefined ? `${game.odds.spread > 0 ? "+" : ""}${game.odds.spread}` : "ML"}</span>
        <span>{game.odds.overUnder !== undefined ? `O/U ${game.odds.overUnder}` : game.bookmaker ?? "Live"}</span>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-zinc-200">
        <span className="font-mono tabular-nums text-sky-300">{formatOdds(game.odds.homeMoneyline)}</span>
        <MovementIcon dir={homeDir} />
        <span className="font-medium text-zinc-300">{game.homeAbbr}</span>
      </div>

      {bigMove ? <Zap className="h-3.5 w-3.5 text-yellow-300" /> : null}
    </div>
  );
}

interface LiveOddsTickerProps {
  speed?: number;
  pauseOnHover?: boolean;
}

export default function LiveOddsTicker({ speed = 40, pauseOnHover = true }: LiveOddsTickerProps) {
  const [paused, setPaused] = useState(false);
  const [games, setGames] = useState<LiveMarketGame[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const slate = await fetchLiveGamesForSports(["nba", "mlb", "nfl"]);
        if (cancelled) return;
        setGames(slate.filter((game) => game.odds));
        setUpdatedAt(new Date());
        setHasError(false);
      } catch {
        if (cancelled) return;
        setHasError(true);
      }
    };

    void load();
    const intervalId = window.setInterval(load, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const tickerItems = useMemo(() => [...games, ...games], [games]);
  const duration = Math.max((Math.max(games.length, 4) * 170) / speed, 20);

  return (
    <div className="w-full overflow-hidden border-y border-white/10 bg-[#050816]">
      <div className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Live Market Feed</span>
        </div>
        <span className="text-[10px] text-zinc-500">
          {hasError
            ? "Feed temporarily unavailable"
            : updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "Syncing live board"}
        </span>
      </div>

      {hasError ? (
        <div className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-zinc-500">
          <AlertCircle className="h-3.5 w-3.5" />
          Live odds are having a moment. Reload soon.
        </div>
      ) : games.length === 0 ? (
        <div className="px-4 py-3 text-xs text-zinc-500">No current lines available right now.</div>
      ) : (
        <div
          className="flex py-2.5"
          style={{
            animation: `ticker-scroll ${duration}s linear infinite`,
            animationPlayState: paused ? "paused" : "running",
            willChange: "transform",
          }}
          onMouseEnter={() => pauseOnHover && setPaused(true)}
          onMouseLeave={() => pauseOnHover && setPaused(false)}
        >
          {tickerItems.map((game, index) => (
            <OddsChip key={`${game.id}-${index}`} game={game} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
