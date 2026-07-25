import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Minus, TrendingDown, TrendingUp } from "lucide-react";
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
      className={`mx-5 flex shrink-0 items-center gap-2.5 border-r border-white/10 pr-10 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
        bigMove ? "text-amber-200" : "text-slate-400"
      }`}
    >
      <span className="font-semibold tracking-[0.16em] text-[#b9ff55]">{game.sportLabel}</span>
      <span className="text-slate-600">{game.status.state === "in" ? game.status.shortDetail : game.displayTime}</span>

      <div className="flex items-center gap-1.5">
        <span className="text-slate-300">{game.awayAbbr}</span>
        <MovementIcon dir={awayDir} />
        <span className="font-mono tabular-nums text-cyan-200">{formatOdds(game.odds.awayMoneyline)}</span>
      </div>

      <div className="flex items-center gap-2 text-slate-600">
        {game.odds.drawMoneyline !== undefined ? (
          <span>Draw <span className="font-mono tabular-nums text-slate-400">{formatOdds(game.odds.drawMoneyline)}</span></span>
        ) : (
          <>
            <span>{game.odds.spread !== undefined ? `${game.odds.spread > 0 ? "+" : ""}${game.odds.spread}` : "ML"}</span>
            <span>{game.odds.overUnder !== undefined ? `O/U ${game.odds.overUnder}` : game.bookmaker ?? "Live"}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono tabular-nums text-cyan-200">{formatOdds(game.odds.homeMoneyline)}</span>
        <MovementIcon dir={homeDir} />
        <span className="text-slate-300">{game.homeAbbr}</span>
      </div>
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
        const slate = await fetchLiveGamesForSports(["nba", "mlb", "nfl", "wc"]);
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
    <div className="relative flex h-8 w-full items-center overflow-hidden border-y border-[#b9ff55]/10 bg-[#0b1510]">
      <div className="relative z-10 flex h-full shrink-0 items-center gap-2 border-r border-[#b9ff55]/15 bg-[#0b1510] px-4 sm:px-6">
        <span className="h-1.5 w-1.5 rounded-full bg-[#b9ff55] shadow-[0_0_10px_rgba(185,255,85,0.8)] motion-safe:animate-pulse" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#b9ff55]">
          Models live
        </span>
      </div>

      <div className="sr-only" aria-live="polite">
        {hasError
          ? "Live market feed unavailable"
          : updatedAt
            ? `Live market feed updated at ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Live market feed syncing"}
      </div>

      {hasError ? (
        <div className="flex items-center gap-2 px-4 text-[10px] text-slate-500">
          <AlertCircle className="h-3.5 w-3.5" />
          Live odds temporarily unavailable
        </div>
      ) : games.length === 0 ? (
        <div className="px-4 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          Syncing the current market board
        </div>
      ) : (
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="live-odds-ticker-track flex"
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
        </div>
      )}

      <div className="relative z-10 hidden h-full shrink-0 items-center border-l border-white/10 bg-[#0b1510] px-5 text-[9px] uppercase tracking-[0.12em] text-slate-600 md:flex">
        {hasError
          ? "Feed offline"
          : updatedAt
            ? `Sync ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Syncing"}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .live-odds-ticker-track {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
