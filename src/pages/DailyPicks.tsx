import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowRight,
  Calendar,
  ChevronLeft,
  Crown,
  Flame,
  Lock,
  Radar,
  RefreshCw,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import CryptoPaymentModal, { type UnlockType } from "@/components/CryptoPaymentModal";
import { isPremiumUser } from "@/lib/stripe";
import { analyzeGame, formatEdge, formatOdds, formatProb, type GamePrediction } from "@/lib/predictions";
import { fetchLiveGamesForSports, type LiveMarketGame } from "@/lib/liveSports";

interface PickEntry {
  game: LiveMarketGame;
  prediction: GamePrediction;
  score: number;
}

function getStatusClasses(state: LiveMarketGame["status"]["state"]) {
  if (state === "in") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (state === "post") return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
  return "border-sky-400/30 bg-sky-400/10 text-sky-300";
}

function PickCard({
  entry,
  locked,
  onUnlock,
}: {
  entry: PickEntry;
  locked: boolean;
  onUnlock: () => void;
}) {
  const { game, prediction } = entry;
  const winnerIsHome = prediction.predictedWinner === game.homeTeam;
  const winnerOdds = winnerIsHome ? prediction.homeOdds : prediction.awayOdds;
  const winnerEdge = winnerIsHome ? prediction.homeEdge : prediction.awayEdge;
  const winnerProb = winnerIsHome ? prediction.homeProb : prediction.awayProb;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_42%),linear-gradient(180deg,rgba(9,13,24,0.98),rgba(5,8,18,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-brand-400/30 bg-brand-400/10 text-[11px] tracking-[0.24em] text-brand-300">
            {game.sportLabel}
          </Badge>
          <div className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(game.status.state)}`}>
            {game.status.shortDetail}
          </div>
          {game.bookmaker ? (
            <span className="text-xs text-zinc-500">via {game.bookmaker}</span>
          ) : null}
        </div>
        <div className="text-xs text-zinc-500">
          {game.displayTime}
          {game.broadcast ? ` · ${game.broadcast}` : ""}
        </div>
      </div>

      <div className="grid gap-5 pt-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                side: "away",
                name: game.awayTeam,
                abbr: game.awayAbbr,
                logo: game.awayLogo,
                score: game.awayScore,
                odds: game.odds?.awayMoneyline,
              },
              {
                side: "home",
                name: game.homeTeam,
                abbr: game.homeAbbr,
                logo: game.homeLogo,
                score: game.homeScore,
                odds: game.odds?.homeMoneyline,
              },
            ].map((team) => (
              <div key={team.side} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {team.logo ? (
                      <img src={team.logo} alt={team.name} className="h-10 w-10 rounded-full bg-white/5 object-contain p-1" />
                    ) : null}
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{team.side}</div>
                      <div className="text-base font-semibold text-white">{team.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-white">{team.score ?? "-"}</div>
                    <div className="font-mono text-xs text-sky-300">{team.odds !== undefined ? formatOdds(team.odds) : "No line"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Spread</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {game.odds?.spread !== undefined ? `${game.odds.spread > 0 ? "+" : ""}${game.odds.spread}` : "Pending"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Total</div>
              <div className="mt-1 text-lg font-semibold text-white">{game.odds?.overUnder ?? "Pending"}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Model Lean</div>
              <div className="mt-1 text-lg font-semibold text-brand-300">{prediction.predictedWinner}</div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-white/8 bg-black/30 p-4">
          {locked ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,rgba(5,8,18,0.55),rgba(5,8,18,0.92))] backdrop-blur-sm">
              <Lock className="h-7 w-7 text-yellow-300" />
              <p className="max-w-[16rem] text-center text-sm text-zinc-300">
                Live edge, Kelly sizing, and full recommendation are locked behind the premium board.
              </p>
              <Button
                onClick={onUnlock}
                className="bg-gradient-to-r from-yellow-400 to-orange-400 font-semibold text-black hover:from-yellow-300 hover:to-orange-300"
              >
                Unlock live board
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : null}

          <div className={locked ? "blur-[6px]" : ""}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Recommended side</div>
                <div className="mt-1 text-2xl font-bold text-emerald-300">{prediction.predictedWinner}</div>
                <div className="mt-1 font-mono text-sm text-zinc-400">Moneyline {formatOdds(winnerOdds)}</div>
              </div>
              {prediction.valueBet ? (
                <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  Value bet
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Win probability</div>
                <div className="mt-1 text-xl font-semibold text-white">{formatProb(winnerProb)}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Market edge</div>
                <div className={`mt-1 text-xl font-semibold ${winnerEdge >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {formatEdge(winnerEdge)}
                </div>
              </div>
            </div>

            {prediction.valueBet ? (
              <div className="mt-4 rounded-2xl border border-brand-400/20 bg-brand-400/10 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-brand-200/80">Kelly sizing</div>
                    <div className="mt-1 text-base font-semibold text-white">${prediction.valueBet.suggestedBet.toFixed(0)} suggested stake</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-brand-300">{(prediction.valueBet.kellyPct * 100).toFixed(1)}%</div>
                    <div className="text-xs text-zinc-400">fractional Kelly</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-zinc-400">
                Model lean is posted, but the current moneyline does not clear the edge threshold for a value bet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DailyPicks() {
  const navigate = useNavigate();
  const [premium, setPremium] = useState(isPremiumUser());
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [cryptoUnlockType] = useState<UnlockType>("big-game");
  const [games, setGames] = useState<LiveMarketGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const slate = await fetchLiveGamesForSports(["nba", "mlb", "nfl"]);
        if (cancelled) return;
        setGames(slate);
        setUpdatedAt(new Date());
        setHasError(false);
      } catch {
        if (cancelled) return;
        setHasError(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    const intervalId = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const analyzedGames = useMemo<PickEntry[]>(() => {
    return games
      .filter((game) => game.odds)
      .map((game) => {
        const prediction = analyzeGame(
          game.homeTeam,
          game.awayTeam,
          game.sport,
          1000,
          3,
          0.25,
          {
            id: game.id,
            bookmaker: game.bookmaker,
            commenceTime: game.date,
            homeOdds: game.odds!.homeMoneyline,
            awayOdds: game.odds!.awayMoneyline,
          },
        );

        return {
          game,
          prediction,
          score: (prediction.valueBet?.edge ?? 0) + prediction.confidence * 10,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [games]);

  const freePicks = analyzedGames.slice(0, 3);
  const premiumPicks = analyzedGames.slice(3);
  const liveGames = games.filter((game) => game.status.state === "in").length;
  const valueBets = analyzedGames.filter((entry) => entry.prediction.valueBet).length;
  const sportsShown = Array.from(new Set(games.map((game) => game.sportLabel)));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_30%),linear-gradient(180deg,#030611,#070d1a_45%,#030611)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={() => navigate("/") }>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Trophy className="h-5 w-5 text-yellow-300" />
            Daily Picks
          </div>
          <div className="w-16" />
        </div>

        <div className="grid gap-8 py-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-300">
                <Radar className="h-3.5 w-3.5" />
                Live market board
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              {updatedAt ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Updated {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              ) : null}
            </div>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
              Actual games. Actual lines. No made-up Tuesday-night masterpiece.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              This board refreshes from the current ESPN slate and market data, then overlays your model lean, edge, and bankroll sizing where a real line exists.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { label: "Games on board", value: String(games.length), tone: "text-white", icon: Activity },
              { label: "Live right now", value: String(liveGames), tone: "text-emerald-300", icon: Zap },
              { label: "Value bets", value: String(valueBets), tone: "text-brand-300", icon: Target },
            ].map(({ label, value, tone, icon: Icon }) => (
              <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <Icon className={`h-4 w-4 ${tone}`} />
                <div className={`mt-3 text-3xl font-bold ${tone}`}>{value}</div>
                <div className="mt-1 text-sm text-zinc-500">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-2">
          {sportsShown.map((sport) => (
            <span key={sport} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
              {sport}
            </span>
          ))}
          {!premium ? (
            <Button
              size="sm"
              className="ml-auto bg-gradient-to-r from-yellow-400 to-orange-400 font-semibold text-black hover:from-yellow-300 hover:to-orange-300"
              onClick={() => setShowCryptoModal(true)}
            >
              <Flame className="mr-1.5 h-3.5 w-3.5" />
              Unlock the full board
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-400">
            Syncing the live board...
          </div>
        ) : hasError ? (
          <div className="rounded-[28px] border border-red-400/20 bg-red-400/10 p-8 text-center text-red-200">
            The live feed is temporarily unavailable. Reload in a minute and it should come back.
          </div>
        ) : analyzedGames.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-400">
            There are no current games with posted lines right now. The site is intentionally showing an empty board instead of inventing one.
          </div>
        ) : (
          <div className="space-y-10">
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Star className="h-4 w-4 text-emerald-300" />
                <h2 className="text-xl font-bold">Open board</h2>
                <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                  {freePicks.length} visible
                </Badge>
              </div>
              <div className="space-y-5">
                {freePicks.map((entry) => (
                  <PickCard key={entry.game.id} entry={entry} locked={false} onUnlock={() => setShowCryptoModal(true)} />
                ))}
              </div>
            </section>

            {premiumPicks.length > 0 ? (
              <section>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-yellow-300" />
                    <h2 className="text-xl font-bold">Premium board</h2>
                    <Badge variant="outline" className="border-yellow-400/30 bg-yellow-400/10 text-yellow-300">
                      {premium ? `${premiumPicks.length} unlocked` : `${premiumPicks.length} locked`}
                    </Badge>
                  </div>
                  {!premium ? (
                    <div className="text-sm text-zinc-500">Edge sizing, stronger spots, and the rest of the slate</div>
                  ) : null}
                </div>
                <div className="space-y-5">
                  {premiumPicks.map((entry) => (
                    <PickCard key={entry.game.id} entry={entry} locked={!premium} onUnlock={() => setShowCryptoModal(true)} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <CryptoPaymentModal
        open={showCryptoModal}
        onOpenChange={setShowCryptoModal}
        unlockType={cryptoUnlockType}
        onSuccess={() => setPremium(true)}
      />
    </div>
  );
}
