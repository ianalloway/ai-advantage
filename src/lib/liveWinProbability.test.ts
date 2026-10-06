import { describe, expect, it } from "vitest";
import {
  fractionRemaining,
  liveEdgePts,
  liveWinProbability,
  parseClockSeconds,
  REGULATION,
  type LiveGameState,
} from "./liveWinProbability";

const game = (overrides: Partial<LiveGameState> = {}): LiveGameState => ({
  sport: "nba",
  homeScore: 50,
  awayScore: 50,
  period: 3,
  clock: "6:00",
  state: "in",
  ...overrides,
});

describe("parseClockSeconds", () => {
  it("reads a display clock", () => {
    expect(parseClockSeconds("5:23")).toBe(323);
    expect(parseClockSeconds("12:00")).toBe(720);
    expect(parseClockSeconds("0:04")).toBe(4);
  });

  it("tolerates tenths on the clock", () => {
    expect(parseClockSeconds("0:04.7")).toBe(4);
  });

  it("returns undefined for anything it cannot read", () => {
    expect(parseClockSeconds(undefined)).toBeUndefined();
    expect(parseClockSeconds("End of 3rd")).toBeUndefined();
    expect(parseClockSeconds("5:99")).toBeUndefined();
  });
});

describe("fractionRemaining", () => {
  it("is 1 before tip and 0 at the final whistle", () => {
    expect(fractionRemaining(game({ state: "pre" }))).toBe(1);
    expect(fractionRemaining(game({ state: "post" }))).toBe(0);
  });

  it("counts the rest of this period plus the periods after it", () => {
    // 6:00 left in the 3rd of four 12-minute quarters: 6 + 12 = 18 of 48.
    expect(fractionRemaining(game({ period: 3, clock: "6:00" }))).toBeCloseTo(18 / 48, 6);
  });

  it("falls as the game goes on", () => {
    const early = fractionRemaining(game({ period: 1, clock: "10:00" }));
    const late = fractionRemaining(game({ period: 4, clock: "2:00" }));
    expect(early).toBeGreaterThan(late);
  });

  it("treats overtime as a short tail after regulation", () => {
    const overtime = fractionRemaining(game({ period: 5, clock: "3:00" }));

    expect(overtime).toBeGreaterThan(0);
    // Less than a whole fourth quarter still to play. It is not less than the
    // same clock in regulation — three minutes left is three minutes left.
    expect(overtime).toBeLessThan(fractionRemaining(game({ period: 4, clock: "12:00" })));
    expect(overtime).toBeCloseTo(fractionRemaining(game({ period: 4, clock: "3:00" })), 6);
  });

  it("counts innings for a sport with no clock", () => {
    // Top of the 7th of nine: three innings left.
    expect(fractionRemaining(game({ sport: "mlb", period: 7, clock: undefined }))).toBeCloseTo(3 / 9, 6);
    expect(REGULATION.mlb.periodSeconds).toBeUndefined();
  });

  it("assumes a full period when the clock is unreadable", () => {
    expect(fractionRemaining(game({ period: 4, clock: "End of 3rd" }))).toBeCloseTo(12 / 48, 6);
  });
});

describe("liveWinProbability", () => {
  it("is a coin flip when level with the game wide open", () => {
    const result = liveWinProbability(game({ homeScore: 40, awayScore: 40, period: 2, clock: "6:00" }));

    expect(result.applicable).toBe(true);
    expect(result.homeWinProb).toBeCloseTo(0.5, 2);
    expect(result.awayWinProb).toBeCloseTo(0.5, 2);
  });

  it("converges on the leader as the clock runs out", () => {
    const early = liveWinProbability(game({ homeScore: 55, awayScore: 50, period: 1, clock: "6:00" }));
    const late = liveWinProbability(game({ homeScore: 55, awayScore: 50, period: 4, clock: "0:30" }));

    expect(late.homeWinProb).toBeGreaterThan(early.homeWinProb);
    expect(late.homeWinProb).toBeGreaterThan(0.95);
  });

  it("keeps a late deficit alive rather than rounding it away", () => {
    const result = liveWinProbability(game({ homeScore: 48, awayScore: 52, period: 4, clock: "3:00" }));

    expect(result.homeWinProb).toBeGreaterThan(0.05);
    expect(result.homeWinProb).toBeLessThan(0.4);
  });

  it("gives the same lead more weight in a low-scoring sport", () => {
    const basketball = liveWinProbability(game({ sport: "nba", homeScore: 53, awayScore: 50, period: 4, clock: "5:00" }));
    const baseball = liveWinProbability(game({ sport: "mlb", homeScore: 3, awayScore: 0, period: 8, clock: undefined }));

    // Three runs in the 8th is a bigger lead than three points in the 4th.
    expect(baseball.homeWinProb).toBeGreaterThan(basketball.homeWinProb);
  });

  it("carries the pregame lean over the time still to play", () => {
    const neutral = liveWinProbability(game({ homeScore: 40, awayScore: 40, period: 1, clock: "6:00" }));
    const favoured = liveWinProbability(
      game({ homeScore: 40, awayScore: 40, period: 1, clock: "6:00" }),
      { pregameHomeProb: 0.7 },
    );

    expect(favoured.homeWinProb).toBeGreaterThan(neutral.homeWinProb);
  });

  it("settles to certainty once the game is final", () => {
    expect(liveWinProbability(game({ state: "post", homeScore: 100, awayScore: 92 })).homeWinProb).toBe(1);
    expect(liveWinProbability(game({ state: "post", homeScore: 92, awayScore: 100 })).homeWinProb).toBe(0);
  });

  it("calls a level game at full time extra time, not a win", () => {
    const result = liveWinProbability(game({ state: "post", homeScore: 100, awayScore: 100 }));

    expect(result.homeWinProb).toBe(0.5);
    expect(result.note).toContain("extra time");
  });

  it("declines a game that has not started and a three-way market", () => {
    expect(liveWinProbability(game({ state: "pre" })).applicable).toBe(false);
    expect(liveWinProbability(game({ sport: "wc" })).applicable).toBe(false);
    expect(liveWinProbability(game({ sport: "wc" })).note).toContain("draw");
  });

  it("declines without a usable score", () => {
    expect(liveWinProbability(game({ homeScore: Number.NaN })).applicable).toBe(false);
  });

  it("always has the two sides summing to one", () => {
    const result = liveWinProbability(game({ homeScore: 61, awayScore: 55, period: 3, clock: "4:12" }));
    expect(result.homeWinProb + result.awayWinProb).toBeCloseTo(1, 4);
  });
});

describe("liveEdgePts", () => {
  it("is positive when the model rates the side above the live price", () => {
    // 60% against a +120 price (45.5% break-even).
    expect(liveEdgePts(0.6, 120)!).toBeGreaterThan(10);
  });

  it("is negative when the live price is ahead of the model", () => {
    expect(liveEdgePts(0.5, -200)!).toBeLessThan(0);
  });

  it("is undefined without a usable price", () => {
    expect(liveEdgePts(0.6, 0)).toBeUndefined();
  });
});
