import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyzeGame, formatEdge, formatOdds, type Sport } from "@/lib/predictions";
import { createExecutionBoardEntry, type ExecutionBoardEntry } from "@/lib/executionBoard";
import { fetchLiveGamesForSports, type LiveMarketGame } from "@/lib/liveSports";
import {
  Activity,
  AlertCircle,
  ChevronLeft,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Target,
  Trophy,
} from "lucide-react";

const SPORTS: Array<Sport> = ["nba", "nfl", "mlb"];
const BANKROLL = 1000;
const MIN_EDGE = 3;
const KELLY_FRACTION = 0.25;

type SportFilter = "ALL" | "NBA" | "NFL" | "MLB";

function getOutcomeClasses(outcome: ExecutionBoardEntry["ledgerOutcome"]) {
  switch (outcome) {
    case "won":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    case "lost":
      return "border-red-400/30 bg-red-400/10 text-red-300";
    case "push":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
    default:
      return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  }
}

function formatClv(value?: number) {
  if (value === undefined) return "Pending";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} pts`;
}

function formatStake(value: number) {
  return `$${value.toFixed(0)}`;
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [games, setGames] = useState<LiveMarketGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const slate = await fetchLiveGamesForSports(SPORTS);
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

  const entries = useMemo(() => {
    return games
      .filter((game) => game.odds)
      .map((game) => {
        const prediction = analyzeGame(
          game.homeTeam,
          game.awayTeam,
          game.sport,
          BANKROLL,
          MIN_EDGE,
          KELLY_FRACTION,
          {
            id: game.id,
            bookmaker: game.bookmaker,
            commenceTime: game.date,
            homeOdds: game.odds!.homeMoneyline,
            awayOdds: game.odds!.awayMoneyline,
            homeOpenOdds: game.odds!.homeMoneylineOpen,
            awayOpenOdds: game.odds!.awayMoneylineOpen,
            isLive: game.status.state === "in",
          },
        );

        return createExecutionBoardEntry(game, prediction);
      })
      .filter((entry): entry is ExecutionBoardEntry => Boolean(entry))
      .sort((a, b) => b.score - a.score);
  }, [games]);

  const filteredEntries = useMemo(() => {
    if (sportFilter === "ALL") return entries;
    return entries.filter((entry) => entry.sportLabel === sportFilter);
  }, [entries, sportFilter]);

  const stats = useMemo(() => {
    const settled = filteredEntries.filter((entry) => entry.ledgerOutcome !== "pending");
    const clvEntries = filteredEntries.filter((entry) => entry.closeLineValue !== undefined);
    const avgExecEdge = filteredEntries.length
      ? filteredEntries.reduce((sum, entry) => sum + entry.executionAdjustedEdge, 0) / filteredEntries.length
      : 0;
    const avgScore = filteredEntries.length
      ? filteredEntries.reduce((sum, entry) => sum + entry.score, 0) / filteredEntries.length
      : 0;
    const avgClv = clvEntries.length
      ? clvEntries.reduce((sum, entry) => sum + (entry.closeLineValue ?? 0), 0) / clvEntries.length
      : undefined;
    const totalSuggestedStake = filteredEntries.reduce((sum, entry) => sum + entry.suggestedStake, 0);
    const wins = settled.filter((entry) => entry.ledgerOutcome === "won").length;

    return {
      tracked: filteredEntries.length,
      settled: settled.length,
      wins,
      avgExecEdge,
      avgScore,
      avgClv,
      totalSuggestedStake,
    };
  }, [filteredEntries]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_30%),linear-gradient(180deg,#030611,#070d1a_45%,#030611)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={() => navigate("/") }>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="h-5 w-5 text-brand-300" />
            Proof Ledger
          </div>
          <div className="w-16" />
        </div>

        <div className="grid gap-8 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/10 px-3 py-1 text-brand-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Execution Board ledger
              </span>
              {updatedAt ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Updated {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                <Clock3 className="h-3.5 w-3.5" />
                Only tracked entries with real prices
              </span>
            </div>

            <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
              The fake leaderboard is gone. This is the real execution ledger.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400 sm:text-lg">
              Every row here cleared the execution-adjusted threshold, carries a real market price, and shows what the model saw, what the market offered, and whether the number held up.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Target className="h-4 w-4 text-yellow-300" />
              Board scoring logic
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Score ranks opportunities by execution-adjusted edge first, then confidence, Kelly stake, market movement, timing, and close-line proof.
            </p>
            <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4 font-mono text-xs text-zinc-300">
              score = exec edge x 4.8 + raw edge x 1.7 + confidence + Kelly + timing + market move + CLV - penalties
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Positive CLV means the tracked number beat the close. No invented lifetime units. No anonymous avatars pretending to print money.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Tracked entries</div>
            <div className="mt-2 text-3xl font-black text-white">{stats.tracked}</div>
            <div className="mt-1 text-sm text-zinc-400">Current board rows with real prices and model support.</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Average exec edge</div>
            <div className="mt-2 text-3xl font-black text-brand-300">{formatEdge(stats.avgExecEdge)}</div>
            <div className="mt-1 text-sm text-zinc-400">Adjusted for timing, price movement, and execution quality.</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Average board score</div>
            <div className="mt-2 text-3xl font-black text-yellow-300">{stats.avgScore.toFixed(1)}</div>
            <div className="mt-1 text-sm text-zinc-400">A higher score means stronger execution context, not louder marketing.</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Close-line proof</div>
            <div className="mt-2 text-3xl font-black text-emerald-300">{stats.avgClv !== undefined ? formatClv(stats.avgClv) : "Pending"}</div>
            <div className="mt-1 text-sm text-zinc-400">Settled rows: {stats.settled}. Wins: {stats.wins}. Tracked stake: {formatStake(stats.totalSuggestedStake)}.</div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(["ALL", "NBA", "NFL", "MLB"] as SportFilter[]).map((sport) => (
              <Button
                key={sport}
                size="sm"
                variant={sportFilter === sport ? "default" : "outline"}
                className={sportFilter === sport ? "bg-brand-600 text-white" : "border-white/10 text-zinc-400"}
                onClick={() => setSportFilter(sport)}
              >
                {sport}
              </Button>
            ))}
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500">
            Ledger only lists entries that clear the current execution threshold.
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
          {isLoading ? (
            <div className="flex min-h-[18rem] items-center justify-center text-sm text-zinc-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading live execution ledger...
            </div>
          ) : hasError ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertCircle className="h-8 w-8 text-red-300" />
              <p className="max-w-lg text-sm leading-6 text-zinc-400">
                The live market feed is unavailable right now, so the ledger is staying honest and showing nothing instead of inventing a board.
              </p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 px-6 text-center">
              <Activity className="h-8 w-8 text-brand-300" />
              <p className="max-w-lg text-sm leading-6 text-zinc-400">
                No games currently clear the execution-adjusted threshold for this filter. That is a pass signal, not a content problem.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-black/20 text-left text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                    <th className="px-4 py-4">Game</th>
                    <th className="px-4 py-4">Side</th>
                    <th className="px-4 py-4">Entry</th>
                    <th className="px-4 py-4">Model</th>
                    <th className="px-4 py-4">Raw</th>
                    <th className="px-4 py-4">Exec</th>
                    <th className="px-4 py-4">Score</th>
                    <th className="px-4 py-4">Window</th>
                    <th className="px-4 py-4">Proof</th>
                    <th className="px-4 py-4">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-white/8 align-top transition-colors hover:bg-white/[0.03]">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-white">{entry.eventLabel}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>{entry.displayTime}</span>
                          <span>·</span>
                          <span>{entry.sportLabel}</span>
                          {entry.bookmaker ? (
                            <>
                              <span>·</span>
                              <span>{entry.bookmaker}</span>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-brand-300">{entry.recommendedSide}</div>
                        <div className="mt-1 text-xs text-zinc-500">{entry.sideLocation} side vs {entry.opposingSide}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-sm text-white">
                        <div>{formatOdds(entry.entryOdds)}</div>
                        <div className="mt-1 text-xs text-zinc-500">Open {entry.openOdds !== undefined ? formatOdds(entry.openOdds) : "Pending"}</div>
                        <div className="text-xs text-zinc-500">Close {entry.closeOdds !== undefined ? formatOdds(entry.closeOdds) : "Pending"}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-mono text-white">{(entry.modelProb * 100).toFixed(1)}%</div>
                        <div className="mt-1 text-xs text-zinc-500">Implied {(entry.impliedProb * 100).toFixed(1)}%</div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-emerald-300">{formatEdge(entry.rawEdge)}</td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-brand-300">{formatEdge(entry.executionAdjustedEdge)}</div>
                        <div className="mt-1 text-xs text-zinc-500">Stake {formatStake(entry.suggestedStake)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-mono text-yellow-300">{entry.score.toFixed(1)}</div>
                        <div className="mt-1 text-xs text-zinc-500">Kelly {(entry.kellyPct * 100).toFixed(1)}%</div>
                      </td>
                      <td className="px-4 py-4 text-zinc-300">{entry.executionWindow}</td>
                      <td className="px-4 py-4">
                        <div className={`font-mono ${entry.closeLineValue !== undefined && entry.closeLineValue > 0 ? "text-emerald-300" : "text-zinc-300"}`}>
                          {formatClv(entry.closeLineValue)}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">Open move {entry.openToCurrentDelta > 0 ? "+" : ""}{entry.openToCurrentDelta.toFixed(3)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className={getOutcomeClasses(entry.ledgerOutcome)}>
                          {entry.ledgerOutcome}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Trophy className="h-4 w-4 text-yellow-300" />
              What counts as proof here
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              A ledger row exists only when a live game has a real market price, the model clears the execution threshold, and the entry can be tied to an explicit side, line, and timing window. That is the standard. Everything else stays off the board.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Activity className="h-4 w-4 text-brand-300" />
              Next proof layer
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              The next step is persisting alert time, entry time, and final close for every surfaced bet so this ledger can grow from an honest live board into a full historical audit trail.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
