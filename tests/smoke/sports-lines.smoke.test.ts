/**
 * Production smoke: live odds integrity on aiadvantagesports.com.
 * Run: npm run test:smoke
 */
import { describe, expect, it } from "vitest";
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
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const payload = (await response.json()) as SmokePayload;
  return {
    status: response.status,
    payload,
    cacheControl: response.headers.get("cache-control"),
  };
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
    expect(withOdds).toBeGreaterThan(0);
  }, 30000);

  it("feeds Daily Picks analysis without throwing on live lines", async () => {
    const { payload } = await fetchSportsLines();
    const priced = payload.games.filter((game) => game.odds);

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
  }, 30000);

  it("serves Daily Picks HTML shell", async () => {
    const response = await fetch(`${BASE_URL}/daily-picks`, { signal: AbortSignal.timeout(15000) });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.toLowerCase()).toContain("ai advantage");
    expect(html).toMatch(/root|daily/i);
  }, 20000);
});
