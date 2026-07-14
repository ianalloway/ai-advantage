import { describe, expect, it } from "vitest";
import { createExecutionBoardEntry, gradeOutcome, scoreExecutionBoardEntry } from "./executionBoard";
import type { LiveMarketGame } from "./liveSports";
import type { ExecutionFactors, GamePrediction, ValueBet } from "./predictions";

const factors: ExecutionFactors = {
  calibrationFactor: 1,
  clvFactor: 1,
  timingFactor: 1,
  marketDislocationFactor: 1,
  liquidityFactor: 1,
  correlationPenalty: 0,
  newsVolatilityPenalty: 0,
  executionWindow: "Today",
  openToCurrentDelta: 0,
};

function stubPrediction(valueBet: ValueBet | null): GamePrediction {
  return {
    sport: "nba",
    homeTeam: "Boston Celtics",
    awayTeam: "New York Knicks",
    homeProb: 0.55,
    awayProb: 0.45,
    homeOdds: -120,
    awayOdds: 100,
    homeImpliedProb: 0.545,
    awayImpliedProb: 0.5,
    homeEdge: 4,
    awayEdge: -2,
    homeExecutionEdge: 3.2,
    awayExecutionEdge: -2,
    predictedWinner: "Boston Celtics",
    predictedWinnerOdds: -120,
    predictedWinnerProb: 0.55,
    predictedWinnerEdge: 4,
    predictedWinnerExecutionEdge: 3.2,
    confidence: 0.55,
    executionAdjustedEdge: valueBet?.executionAdjustedEdge ?? 0,
    executionFactors: factors,
    valueBet,
    bookmaker: "DraftKings",
  };
}

function stubGame(overrides: Partial<LiveMarketGame> = {}): LiveMarketGame {
  return {
    id: "g1",
    sport: "nba",
    sportLabel: "NBA",
    date: "2026-07-14T23:00:00.000Z",
    displayTime: "7:00 PM",
    status: { state: "pre", shortDetail: "Scheduled", detail: "Scheduled", completed: false },
    homeTeam: "Boston Celtics",
    awayTeam: "New York Knicks",
    homeAbbr: "BOS",
    awayAbbr: "NYK",
    bookmaker: "DraftKings",
    marketSource: "espn-fallback",
    odds: {
      homeMoneyline: -120,
      awayMoneyline: 100,
      homeMoneylineOpen: -110,
      awayMoneylineOpen: -110,
      homeMoneylineClose: -130,
      awayMoneylineClose: 110,
    },
    ...overrides,
  };
}

describe("executionBoard", () => {
  it("grades two-way ties as push and soccer draws as win/loss", () => {
    expect(gradeOutcome("nba", 100, 100, "Boston", "Home")).toBe("push");
    expect(gradeOutcome("wc", 1, 1, "Draw", "Draw")).toBe("won");
    expect(gradeOutcome("wc", 1, 1, "France", "Home")).toBe("lost");
  });

  it("scores CLV positively when close shortens past the entry", () => {
    const withClv = scoreExecutionBoardEntry({
      rawEdge: 4,
      executionAdjustedEdge: 3.5,
      confidence: 0.58,
      kellyPct: 0.02,
      openToCurrentDelta: 0,
      closeLineValue: 3,
      factors,
    });
    const without = scoreExecutionBoardEntry({
      rawEdge: 4,
      executionAdjustedEdge: 3.5,
      confidence: 0.58,
      kellyPct: 0.02,
      openToCurrentDelta: 0,
      closeLineValue: undefined,
      factors,
    });
    expect(withClv).toBeGreaterThan(without);
  });

  it("creates board entries with close-line value from open/close history", () => {
    const prediction = stubPrediction({
      team: "Boston Celtics",
      location: "Home",
      modelProb: 0.58,
      impliedProb: 0.545,
      odds: -120,
      edge: 3.5,
      rawEdge: 3.5,
      executionAdjustedEdge: 3.2,
      kellyPct: 0.02,
      suggestedBet: 20,
    });
    const entry = createExecutionBoardEntry(stubGame(), prediction);
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("g1:Boston Celtics");
    expect(entry!.openOdds).toBe(-110);
    expect(entry!.closeOdds).toBe(-130);
    // Closing shorter than entry (-120 → -130) is positive CLV in our convention.
    expect(entry!.closeLineValue).toBeGreaterThan(0);
  });

  it("skips board rows without a value bet or odds", () => {
    expect(createExecutionBoardEntry(stubGame(), stubPrediction(null))).toBeNull();
    expect(
      createExecutionBoardEntry(
        stubGame({ odds: null }),
        stubPrediction({
          team: "Boston Celtics",
          location: "Home",
          modelProb: 0.58,
          impliedProb: 0.545,
          odds: -120,
          edge: 3.5,
          rawEdge: 3.5,
          executionAdjustedEdge: 3.2,
          kellyPct: 0.02,
          suggestedBet: 20,
        }),
      ),
    ).toBeNull();
  });
});
