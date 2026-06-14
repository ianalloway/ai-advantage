import { describe, it, expect } from "vitest";
import { gradeOutcome, buildPendingEntry, mergeIngest, type FeedGame, type LedgerRow } from "./ledgerSettlement";

describe("gradeOutcome", () => {
  it("grades 2-way moneylines, treating a tie as a push", () => {
    expect(gradeOutcome("mlb", 9, 6, "Home")).toBe("won");
    expect(gradeOutcome("mlb", 6, 9, "Home")).toBe("lost");
    expect(gradeOutcome("mlb", 6, 9, "Away")).toBe("won");
    expect(gradeOutcome("nba", 5, 5, "Home")).toBe("push");
  });

  it("grades the 3-way soccer market: a draw makes a moneyline lose, not push", () => {
    expect(gradeOutcome("wc", 1, 1, "Home")).toBe("lost");
    expect(gradeOutcome("wc", 1, 1, "Away")).toBe("lost");
    expect(gradeOutcome("wc", 1, 1, "Draw")).toBe("won");
    expect(gradeOutcome("wc", 2, 1, "Draw")).toBe("lost");
    expect(gradeOutcome("wc", 2, 1, "Home")).toBe("won");
  });
});

function feedGame(overrides: Partial<FeedGame> = {}): FeedGame {
  return {
    id: "401",
    sport: "mlb",
    sportLabel: "MLB",
    homeTeam: "New York Yankees",
    awayTeam: "Boston Red Sox",
    bookmaker: "DraftKings",
    status: { state: "pre" },
    odds: { homeMoneyline: -120, awayMoneyline: 100 },
    ...overrides,
  };
}

describe("buildPendingEntry", () => {
  it("never records a game that is already final (no hindsight)", () => {
    expect(buildPendingEntry(feedGame({ status: { state: "post" } }), "now")).toBeNull();
  });

  it("returns null when there is no line", () => {
    expect(buildPendingEntry(feedGame({ odds: null }), "now")).toBeNull();
  });
});

describe("mergeIngest", () => {
  const row = (id: string, extra: Partial<LedgerRow> = {}): LedgerRow => ({
    id,
    eventLabel: "Boston Red Sox at New York Yankees",
    sportLabel: "MLB",
    recommendedSide: "New York Yankees",
    executionWindow: "Today",
    entryOdds: -120,
    executionAdjustedEdge: 5,
    ledgerOutcome: "pending",
    firstSeenAt: "2026-06-13T00:00:00.000Z",
    lastSeenAt: "2026-06-13T00:00:00.000Z",
    snapshotCount: 1,
    accessTier: "free",
    ...extra,
  });

  it("dedupes by id and bumps the snapshot count instead of duplicating", () => {
    const merged = mergeIngest([row("401:NYY")], [row("401:NYY")], "2026-06-13T01:00:00.000Z");
    expect(merged).toHaveLength(1);
    expect(merged[0].snapshotCount).toBe(2);
  });

  it("never reverts an already-settled outcome on re-ingest", () => {
    const settled = row("401:NYY", { ledgerOutcome: "won" });
    const merged = mergeIngest([settled], [row("401:NYY")], "2026-06-13T01:00:00.000Z");
    expect(merged[0].ledgerOutcome).toBe("won");
  });

  it("filters probe/test rows out of the public ledger", () => {
    const merged = mergeIngest([row("probe-1", { eventLabel: "Backend Probe" })], [row("401:NYY")], "now");
    expect(merged.map((r) => r.id)).toEqual(["401:NYY"]);
  });
});
