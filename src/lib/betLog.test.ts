import { describe, expect, it } from "vitest";
import {
  betLogRows,
  betProfit,
  createBetLogEntry,
  executionPts,
  settleBetLogEntry,
  summarizeBetLog,
  type BetLogEntry,
} from "./betLog";

const entry = (overrides: Partial<BetLogEntry> = {}): BetLogEntry => ({
  id: "nba-1:Celtics:2026-01-02T00:00:00Z",
  gameId: "nba-1",
  sport: "nba",
  sportLabel: "NBA",
  eventLabel: "Heat at Celtics",
  side: "Celtics",
  sideLocation: "Home",
  americanOdds: -110,
  stake: 100,
  outcome: "pending",
  placedAt: "2026-01-02T00:00:00Z",
  ...overrides,
});

describe("betProfit", () => {
  it("pays the price on a win", () => {
    expect(betProfit(entry({ outcome: "won", americanOdds: 150, stake: 100 }))).toBeCloseTo(150, 2);
    expect(betProfit(entry({ outcome: "won", americanOdds: -110, stake: 110 }))).toBeCloseTo(100, 2);
  });

  it("loses the stake on a loss", () => {
    expect(betProfit(entry({ outcome: "lost", stake: 75 }))).toBe(-75);
  });

  it("returns nothing on a push, a void, or a pending ticket", () => {
    expect(betProfit(entry({ outcome: "push" }))).toBe(0);
    expect(betProfit(entry({ outcome: "void" }))).toBe(0);
    expect(betProfit(entry({ outcome: "pending" }))).toBe(0);
  });

  it("refuses to invent a payout from a junk price", () => {
    expect(betProfit(entry({ outcome: "won", americanOdds: 0 }))).toBe(0);
  });
});

describe("executionPts", () => {
  it("is positive when the price beat the desk's quote", () => {
    // +120 is a longer price than the -110 the board was showing.
    expect(executionPts(120, -110)).toBeGreaterThan(0);
  });

  it("is negative when the price was worse than the board", () => {
    expect(executionPts(-130, -110)).toBeLessThan(0);
  });

  it("is undefined without a comparable desk price", () => {
    expect(executionPts(-110)).toBeUndefined();
    expect(executionPts(-110, 0)).toBeUndefined();
  });
});

describe("createBetLogEntry", () => {
  it("starts pending and keeps the desk's quote for comparison", () => {
    const created = createBetLogEntry({
      gameId: "nba-1",
      sport: "nba",
      sportLabel: "NBA",
      eventLabel: "Heat at Celtics",
      side: "Celtics",
      sideLocation: "Home",
      americanOdds: -105,
      stake: 50,
      deskOdds: -110,
      placedAt: "2026-01-02T00:00:00Z",
    });

    expect(created.outcome).toBe("pending");
    expect(created.deskOdds).toBe(-110);
    expect(created.id).toContain("nba-1");
    expect(created.settledAt).toBeUndefined();
  });
});

describe("settleBetLogEntry", () => {
  it("stamps a settled time and can record the close", () => {
    const settled = settleBetLogEntry(entry(), "won", -130);

    expect(settled.outcome).toBe("won");
    expect(settled.closeOdds).toBe(-130);
    expect(settled.settledAt).toBeDefined();
  });

  it("clears the settled stamp when a bet is put back to pending", () => {
    const settled = settleBetLogEntry(entry({ outcome: "lost", settledAt: "2026-01-03T00:00:00Z" }), "pending");
    expect(settled.settledAt).toBeUndefined();
  });
});

describe("summarizeBetLog", () => {
  it("reports realised profit and ROI over settled bets only", () => {
    const summary = summarizeBetLog([
      entry({ id: "1", outcome: "won", americanOdds: 100, stake: 100 }),
      entry({ id: "2", outcome: "lost", stake: 100 }),
      entry({ id: "3", outcome: "pending", stake: 50 }),
    ]);

    expect(summary.logged).toBe(3);
    expect(summary.settled).toBe(2);
    expect(summary.pending).toBe(1);
    expect(summary.netProfit).toBe(0);
    expect(summary.roiPct).toBe(0);
    expect(summary.staked).toBe(250);
    expect(summary.openRisk).toBe(50);
  });

  it("excludes pushes from the win rate", () => {
    const summary = summarizeBetLog([
      entry({ id: "1", outcome: "won" }),
      entry({ id: "2", outcome: "lost" }),
      entry({ id: "3", outcome: "push" }),
    ]);

    // One win from two decided bets, not from three settled ones.
    expect(summary.winRatePct).toBe(50);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
  });

  it("averages execution against the desk and close-line value", () => {
    const summary = summarizeBetLog([
      entry({ id: "1", americanOdds: 120, deskOdds: -110, closeOdds: 100, outcome: "won" }),
      entry({ id: "2", americanOdds: -120, deskOdds: -110, closeOdds: -140, outcome: "lost" }),
    ]);

    expect(summary.avgExecutionPts).toBeDefined();
    expect(summary.clvSample).toBe(2);
    // Both tickets were taken at a longer number than the close.
    expect(summary.beatCloseRatePct).toBe(100);
    expect(summary.avgClvPts!).toBeGreaterThan(0);
  });

  it("leaves CLV undefined until a close is recorded", () => {
    const summary = summarizeBetLog([entry({ outcome: "won" })]);

    expect(summary.avgClvPts).toBeUndefined();
    expect(summary.beatCloseRatePct).toBeUndefined();
    expect(summary.clvSample).toBe(0);
  });

  it("tracks the best and worst tickets", () => {
    const summary = summarizeBetLog([
      entry({ id: "1", outcome: "won", americanOdds: 300, stake: 100 }),
      entry({ id: "2", outcome: "lost", stake: 200 }),
    ]);

    expect(summary.biggestWin).toBeCloseTo(300, 2);
    expect(summary.biggestLoss).toBe(-200);
  });

  it("returns a zeroed summary for an empty log", () => {
    const summary = summarizeBetLog([]);

    expect(summary.logged).toBe(0);
    expect(summary.netProfit).toBe(0);
    expect(summary.roiPct).toBe(0);
    expect(summary.winRatePct).toBe(0);
    expect(summary.biggestWin).toBe(0);
  });
});

describe("betLogRows", () => {
  it("exports the price actually got beside the desk's quote and the close", () => {
    const [row] = betLogRows([
      entry({ americanOdds: 120, deskOdds: -110, closeOdds: 100, outcome: "won", stake: 100 }),
    ]);

    expect(row.entryOdds).toBe(120);
    expect(row.deskOdds).toBe(-110);
    expect(Number(row.executionPts)).toBeGreaterThan(0);
    expect(Number(row.clvPts)).toBeGreaterThan(0);
    expect(row.profit).toBeCloseTo(120, 2);
  });

  it("leaves comparison columns blank when there is nothing to compare", () => {
    const [row] = betLogRows([entry()]);

    expect(row.deskOdds).toBe("");
    expect(row.executionPts).toBe("");
    expect(row.clvPts).toBe("");
    expect(row.profit).toBe(0);
  });
});
