// Shared logic for the scheduled execution-ledger settlement job.
//
// Closes the proof loop: ingest qualifying value bets from the live feed as
// pending rows, then grade any whose games are final against ESPN box scores
// (won / lost / push). Pure and dependency-light so it can be unit-tested
// offline and reused by the Netlify scheduled function.
import { analyzeGame, type Sport } from "../../src/lib/predictions";

export type LedgerOutcome = "pending" | "won" | "lost" | "push";
export type SideLocation = "Home" | "Away" | "Draw";

export interface LedgerRow {
  id: string;
  eventLabel: string;
  sportLabel: string;
  recommendedSide: string;
  executionWindow: string;
  entryOdds: number;
  executionAdjustedEdge: number;
  ledgerOutcome: LedgerOutcome;
  bookmaker?: string;
  // Settlement metadata (extra fields, preserved by the ledger store).
  gameId?: string;
  sport?: Sport;
  sideLocation?: SideLocation;
  firstSeenAt: string;
  lastSeenAt: string;
  snapshotCount: number;
  accessTier: "free" | "event" | "premium";
}

export interface FeedGame {
  id: string;
  sport: Sport;
  sportLabel: string;
  homeTeam: string;
  awayTeam: string;
  bookmaker?: string;
  status: { state: "pre" | "in" | "post" };
  odds: null | {
    homeMoneyline: number;
    awayMoneyline: number;
    drawMoneyline?: number;
    homeMoneylineOpen?: number;
    awayMoneylineOpen?: number;
  };
}

export interface GameFinal {
  completed: boolean;
  homeScore: number;
  awayScore: number;
}

const ESPN_PATHS: Record<Sport, string> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
  mlb: "baseball/mlb",
  wc: "soccer/fifa.world",
};

const MAX_ROWS = 500;
const PROBE_ID = /^probe-|^test-/i;
const PROBE_LABEL = /backend probe|test row/i;

// 3-way aware grading: a draw makes a moneyline LOSE (not push); a Draw bet wins
// on level scores. Mirrors gradeOutcome in src/lib/executionBoard.ts.
export function gradeOutcome(
  sport: Sport,
  homeScore: number,
  awayScore: number,
  sideLocation: SideLocation,
): Exclude<LedgerOutcome, "pending"> {
  const level = homeScore === awayScore;
  if (sideLocation === "Draw") return level ? "won" : "lost";
  if (level) return sport === "wc" ? "lost" : "push";
  const winner = homeScore > awayScore ? "Home" : "Away";
  return winner === sideLocation ? "won" : "lost";
}

export async function fetchEspnFinal(sport: Sport, gameId: string): Promise<GameFinal | null> {
  const path = ESPN_PATHS[sport];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${gameId}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      header?: { competitions?: Array<{ status?: { type?: { completed?: boolean } }; competitors?: Array<{ homeAway?: string; score?: string | number }> }> };
    };
    const comp = data.header?.competitions?.[0];
    const completed = Boolean(comp?.status?.type?.completed);
    const home = comp?.competitors?.find((c) => c.homeAway === "home");
    const away = comp?.competitors?.find((c) => c.homeAway === "away");
    const homeScore = Number(home?.score);
    const awayScore = Number(away?.score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
    return { completed, homeScore, awayScore };
  } catch {
    return null;
  }
}

// Turn a feed game into a pending ledger row if the model flags a value bet.
// Only forward-looking entries (pre-game or live) are recorded — never a game
// that is already final, so the ledger can't book hindsight winners.
export function buildPendingEntry(game: FeedGame, now: string): LedgerRow | null {
  if (!game.odds || game.status.state === "post") return null;
  const prediction = analyzeGame(game.homeTeam, game.awayTeam, game.sport, 1000, 3, 0.25, {
    id: game.id,
    bookmaker: game.bookmaker,
    homeOdds: game.odds.homeMoneyline,
    awayOdds: game.odds.awayMoneyline,
    drawOdds: game.odds.drawMoneyline,
    homeOpenOdds: game.odds.homeMoneylineOpen,
    awayOpenOdds: game.odds.awayMoneylineOpen,
    isLive: game.status.state === "in",
  });
  const bet = prediction.valueBet;
  if (!bet) return null;

  return {
    id: `${game.id}:${bet.team}`,
    eventLabel: `${game.awayTeam} at ${game.homeTeam}`,
    sportLabel: game.sportLabel,
    recommendedSide: bet.team,
    executionWindow: prediction.executionFactors.executionWindow,
    entryOdds: bet.odds,
    executionAdjustedEdge: bet.executionAdjustedEdge,
    ledgerOutcome: "pending",
    bookmaker: game.bookmaker,
    gameId: game.id,
    sport: game.sport,
    sideLocation: bet.location,
    firstSeenAt: now,
    lastSeenAt: now,
    snapshotCount: 1,
    accessTier: "free",
  };
}

// Merge freshly ingested entries into existing rows, preserving the original
// entry timestamp/odds and never reverting an already-settled outcome.
export function mergeIngest(existing: LedgerRow[], ingested: LedgerRow[], now: string): LedgerRow[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const entry of ingested) {
    const prev = byId.get(entry.id);
    if (prev) {
      byId.set(entry.id, {
        ...prev,
        lastSeenAt: now,
        snapshotCount: (prev.snapshotCount ?? 0) + 1,
        // Keep the locked-in entry odds/edge and any settled result.
      });
    } else {
      byId.set(entry.id, entry);
    }
  }
  return Array.from(byId.values())
    .filter((row) => !PROBE_ID.test(row.id) && !PROBE_LABEL.test(row.eventLabel))
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, MAX_ROWS);
}

// Derive the side location for legacy rows that predate the stored metadata.
function inferSideLocation(row: LedgerRow): SideLocation | null {
  if (row.sideLocation) return row.sideLocation;
  if (row.recommendedSide === "Draw") return "Draw";
  // eventLabel is "<away> at <home>"
  const [away, home] = row.eventLabel.split(" at ").map((s) => s.trim());
  if (row.recommendedSide === home) return "Home";
  if (row.recommendedSide === away) return "Away";
  return null;
}

function sportForRow(row: LedgerRow): Sport | null {
  if (row.sport) return row.sport;
  const label = row.sportLabel?.toLowerCase();
  if (label === "nba" || label === "nfl" || label === "mlb" || label === "wc") return label;
  return null;
}

export interface SettlementDeps {
  fetchFeed: () => Promise<FeedGame[]>;
  fetchFinal: (sport: Sport, gameId: string) => Promise<GameFinal | null>;
  now?: () => string;
}

export interface SettlementResult {
  rows: LedgerRow[];
  ingested: number;
  settled: number;
  pending: number;
}

// One settlement pass: ingest current value bets, then grade finished pending rows.
export async function runSettlement(existing: LedgerRow[], deps: SettlementDeps): Promise<SettlementResult> {
  const now = (deps.now ?? (() => new Date().toISOString()))();

  let feedGames: FeedGame[];
  try {
    feedGames = await deps.fetchFeed();
  } catch {
    feedGames = [];
  }
  const ingested = feedGames
    .map((game) => buildPendingEntry(game, now))
    .filter((row): row is LedgerRow => row !== null);

  let rows = mergeIngest(existing, ingested, now);

  let settledCount = 0;
  rows = await Promise.all(
    rows.map(async (row) => {
      if (row.ledgerOutcome !== "pending") return row;
      const sport = sportForRow(row);
      const gameId = row.gameId ?? row.id.split(":")[0];
      const location = inferSideLocation(row);
      if (!sport || !gameId || !location) return row;
      const final = await deps.fetchFinal(sport, gameId);
      if (!final || !final.completed) return row;
      settledCount += 1;
      return { ...row, ledgerOutcome: gradeOutcome(sport, final.homeScore, final.awayScore, location) };
    }),
  );

  return {
    rows,
    ingested: ingested.length,
    settled: settledCount,
    pending: rows.filter((row) => row.ledgerOutcome === "pending").length,
  };
}
