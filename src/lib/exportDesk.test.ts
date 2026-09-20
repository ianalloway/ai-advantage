import { describe, expect, it } from "vitest";
import { deskRowsFromPicks, toCsv } from "./exportDesk";
import { closeLineValuePts } from "./linePath";

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = toCsv([{ event: 'A, "B"', edge: 3.2 }]);
    expect(csv).toContain('"A, ""B"""');
    expect(csv.split("\n")[0]).toBe("event,edge");
  });
});

describe("deskRowsFromPicks", () => {
  const pick = {
    game: {
      id: "nba-1",
      sport: "nba",
      homeTeam: "Boston Celtics",
      awayTeam: "Miami Heat",
      date: "2026-01-02T00:00:00Z",
      bookmaker: "DraftKings",
      odds: {
        homeMoneyline: -110,
        awayMoneyline: -110,
      },
    },
    prediction: {
      predictedWinner: "Boston Celtics",
      confidence: 0.58,
      executionAdjustedEdge: 4.2,
      valueBet: {
        team: "Boston Celtics",
        location: "Home",
        odds: -110,
        modelProb: 0.56,
        rawEdge: 3.62,
        executionAdjustedEdge: 4.2,
        kellyPct: 0.03,
        suggestedBet: 30,
      },
    },
  };

  it("carries the no-vig fair reference alongside the posted price", () => {
    const [row] = deskRowsFromPicks([pick]);

    expect(row.marketHoldPct).toBeCloseTo(4.545, 2);
    expect(row.fairProb).toBeCloseTo(0.5, 4);
    expect(row.fairOdds).toBe(-100);
    expect(row.disagreementPts).toBeCloseTo(6, 1);
    // Net of vig is edge against the price actually on offer.
    expect(row.netEdgeAfterVig).toBeCloseTo(3.62, 1);
  });

  it("leaves the fair columns blank when there is no priced market", () => {
    const [row] = deskRowsFromPicks([{ ...pick, game: { ...pick.game, odds: null } }]);

    expect(row.marketHoldPct).toBe("");
    expect(row.fairOdds).toBe("");
    expect(row.netEdgeAfterVig).toBe("");
  });

  it("adds clvPts when entry and close are known", () => {
    const rows = deskRowsFromPicks([
      {
        game: {
          id: "g1",
          sport: "nba",
          homeTeam: "Lakers",
          awayTeam: "Celtics",
          date: "2026-03-15T00:00:00.000Z",
          odds: {
            homeMoneyline: -140,
            awayMoneyline: 120,
            homeMoneylineClose: -150,
            awayMoneylineClose: 130,
          },
        },
        prediction: {
          predictedWinner: "Lakers",
          confidence: 0.6,
          executionAdjustedEdge: 4.2,
          valueBet: {
            team: "Lakers",
            location: "Home",
            odds: -130,
            modelProb: 0.62,
            rawEdge: 5,
            executionAdjustedEdge: 4.2,
            kellyPct: 0.03,
            suggestedBet: 30,
          },
        },
      },
    ]);

    expect(rows[0]!.clvPts).toBe(Number(closeLineValuePts(-130, -150).toFixed(3)));
  });

  it("leaves clvPts blank when close is pending", () => {
    const rows = deskRowsFromPicks([
      {
        game: {
          id: "g2",
          sport: "nba",
          homeTeam: "Lakers",
          awayTeam: "Celtics",
          date: "2026-03-15T00:00:00.000Z",
          odds: {
            homeMoneyline: -110,
            awayMoneyline: -110,
          },
        },
        prediction: {
          predictedWinner: "Lakers",
          confidence: 0.55,
          executionAdjustedEdge: 2,
          valueBet: null,
        },
      },
    ]);

    expect(rows[0]!.clvPts).toBe("");
    expect(rows[0]!.entryOdds).toBe(-110);
  });
});
