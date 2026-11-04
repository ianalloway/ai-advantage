/**
 * Production smoke: live odds integrity on aiadvantagesports.com.
 * Run: npm run test:smoke
 */
import { describe, expect, it } from "vitest";

/**
 * Retry a fetch against production a few times before giving up. Scheduled
 * smoke runs hit the live site from GitHub runners and occasionally hit a
 * transient connect-timeout while the site is healthy (same root cause as
 * PR #111 for billing-auth smoke).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastError;
}
import { analyzeGame } from "@/lib/predictions";
import {
  ageSeconds,
  hasSaneTwoWayMoneyline,
  isDateKey,
  isIsoTimestamp,
  isValidMoneyline,
  VALID_SPORTS,
  VALID_STATUS_STATES,
} from "@/lib/oddsValidation";

const BASE_URL = (process.env.SMOKE_BASE_URL || "https://aiadvantagesports.com").replace(/\/$/, "");
const FRESHNESS_MAX_SECONDS = Number(process.env.SMOKE_MAX_AGE_SECONDS || 900);

type SmokeGame = {
  id: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  status: { state: string; completed: boolean };
  marketSource?: string;
  marketAudit?: {
    source: string;
    stale: boolean;
    matchConfidence: number;
    fallbackReason?: string;
  };
  odds: null | {
    homeMoneyline: number;
    awayMoneyline: number;
    drawMoneyline?: number;
    homeMoneylineOpen?: number;
    awayMoneylineOpen?: number;
    homeMoneylineClose?: number;
    awayMoneylineClose?: number;
  };
};

type SmokePayload = {
  dateKey: string;
  updatedAt: string;
  games: SmokeGame[];
  providerStatus: Array<{
    oddsApiConfigured: boolean;
    oddsApiMatched: number;
    espnFallbackMatched: number;
    error?: string | null;
  }>;
};

async function fetchSportsLines(): Promise<{ status: number; payload: SmokePayload; cacheControl: string | null }> {
  const url = `${BASE_URL}/api/sports-lines?sports=nba,mlb,nfl,wc`;
  const response = await fetchWithRetry(url);
  const payload = (await response.json()) as SmokePayload;
  return {
    status: response.status,
    payload,
    cacheControl: response.headers.get("cache-control"),
  };
}

const SMOKE_SPORTS = ["nba", "mlb", "nfl", "wc"] as const;
const ESPN_SMOKE_PATHS: Record<(typeof SMOKE_SPORTS)[number], string> = {
  nba: "basketball/nba",
  mlb: "baseball/mlb",
  nfl: "football/nfl",
  wc: "soccer/fifa.world",
};
const LOOKAHEAD_DAYS = 7;

function addDays(dateKey: string, days: number) {
  const date = new Date(Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(4, 6)) - 1, Number(dateKey.slice(6, 8)) + days));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Ask ESPN directly whether anything is scheduled from today through the
 * board's lookahead window. Returns true when ESPN lists at least one game,
 * false only when every single-date scoreboard answered with zero events.
 * Any ESPN failure counts as "games may exist" so the strict assertions still
 * run: we only relax them when the slate is provably empty.
 */
async function espnHasScheduledGames(dateKey: string): Promise<boolean> {
  const checks = SMOKE_SPORTS.flatMap((sport) =>
    Array.from({ length: LOOKAHEAD_DAYS + 1 }, (_, offset) =>
      `https://site.api.espn.com/apis/site/v2/sports/${ESPN_SMOKE_PATHS[sport]}/scoreboard?dates=${addDays(dateKey, offset)}`,
    ),
  );
  const results = await Promise.allSettled(
    checks.map(async (url) => {
      const response = await fetchWithRetry(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const body = (await response.json()) as { events?: unknown[] };
      if (!Array.isArray(body.events)) throw new Error(`no events array: ${url}`);
      return body.events.length;
    }),
  );
  return results.some((result) => result.status === "rejected" || result.value > 0);
}

describe("production sports-lines smoke", () => {
  it("returns a fresh ESPN-default board with valid moneylines", async () => {
    const { status, payload, cacheControl } = await fetchSportsLines();

    expect(status).toBe(200);
    expect(isDateKey(payload.dateKey)).toBe(true);
    expect(isIsoTimestamp(payload.updatedAt)).toBe(true);
    expect(ageSeconds(payload.updatedAt)).toBeLessThan(FRESHNESS_MAX_SECONDS);
    expect(Array.isArray(payload.games)).toBe(true);
    expect(payload.providerStatus.length).toBeGreaterThanOrEqual(1);
    expect(cacheControl ?? "").toMatch(/max-age=/i);

    for (const provider of payload.providerStatus) {
      expect(provider.oddsApiConfigured).toBe(false);
      expect(provider.oddsApiMatched).toBe(0);
      expect(provider.error == null || provider.error === "").toBe(true);
    }

    const ids = new Set<string>();
    let withOdds = 0;

    for (const game of payload.games) {
      expect(game.id).toBeTruthy();
      expect(ids.has(game.id)).toBe(false);
      ids.add(game.id);

      expect(VALID_SPORTS).toContain(game.sport);
      expect(game.homeTeam).toBeTruthy();
      expect(game.awayTeam).toBeTruthy();
      expect(game.homeTeam).not.toBe(game.awayTeam);
      expect(VALID_STATUS_STATES).toContain(game.status.state);
      expect(Number.isFinite(Date.parse(game.date))).toBe(true);
      expect(game.marketAudit).toBeTruthy();
      expect(typeof game.marketAudit!.matchConfidence).toBe("number");

      if (!game.odds) {
        expect(game.marketAudit!.source).toBe("none");
        expect(game.marketAudit!.fallbackReason).toBeTruthy();
        continue;
      }

      withOdds += 1;
      expect(game.marketSource).toBe("espn-fallback");
      expect(game.marketAudit!.source).toBe("espn-fallback");
      expect(game.marketAudit!.stale).toBe(false);
      expect(hasSaneTwoWayMoneyline(game.odds.homeMoneyline, game.odds.awayMoneyline)).toBe(true);

      for (const price of [
        game.odds.homeMoneylineOpen,
        game.odds.awayMoneylineOpen,
        game.odds.homeMoneylineClose,
        game.odds.awayMoneylineClose,
        game.odds.drawMoneyline,
      ]) {
        if (price !== undefined) expect(isValidMoneyline(price)).toBe(true);
      }

      if (game.sport === "wc") {
        expect(isValidMoneyline(game.odds.drawMoneyline)).toBe(true);
      }
    }

    const espnMatched = payload.providerStatus.reduce((sum, p) => sum + (p.espnFallbackMatched || 0), 0);
    expect(espnMatched).toBe(withOdds);

    if (withOdds === 0 && payload.games.length === 0 && !(await espnHasScheduledGames(payload.dateKey))) {
      // Genuinely empty slate: ESPN itself lists no games today or in the
      // lookahead window, so an empty board is correct. Anything else (ESPN
      // has games but the board is empty or unpriced) still fails below.
      console.warn(`sports-lines smoke: ESPN lists no games ${payload.dateKey} +${LOOKAHEAD_DAYS}d; empty board accepted.`);
      return;
    }
    expect(withOdds).toBeGreaterThan(0);
  }, 60000);

  it("feeds Daily Picks analysis without throwing on live lines", async () => {
    const { payload } = await fetchSportsLines();
    const priced = payload.games.filter((game) => game.odds);

    if (priced.length === 0 && payload.games.length === 0 && !(await espnHasScheduledGames(payload.dateKey))) {
      console.warn(`sports-lines smoke: no scheduled games ${payload.dateKey} +${LOOKAHEAD_DAYS}d; Daily Picks has nothing to analyze.`);
      return;
    }
    expect(priced.length).toBeGreaterThan(0);

    for (const game of priced.slice(0, 8)) {
      const prediction = analyzeGame(game.homeTeam, game.awayTeam, game.sport as "nba" | "nfl" | "mlb" | "wc", 1000, 3, 0.25, {
        id: game.id,
        commenceTime: game.date,
        homeOdds: game.odds!.homeMoneyline,
        awayOdds: game.odds!.awayMoneyline,
        drawOdds: game.odds!.drawMoneyline,
        homeOpenOdds: game.odds!.homeMoneylineOpen,
        awayOpenOdds: game.odds!.awayMoneylineOpen,
        isLive: game.status.state === "in",
      });

      expect(prediction.homeTeam).toBe(game.homeTeam);
      expect(prediction.awayTeam).toBe(game.awayTeam);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      // Value bets are optional; honesty check is that we never invent odds.
      if (prediction.valueBet) {
        expect(isValidMoneyline(prediction.valueBet.odds)).toBe(true);
      }
    }
  }, 60000);

  it("serves Daily Picks HTML shell", async () => {
    const response = await fetchWithRetry(`${BASE_URL}/daily-picks`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.toLowerCase()).toContain("ai advantage");
    expect(html).toMatch(/root|daily/i);
  }, 20000);
});