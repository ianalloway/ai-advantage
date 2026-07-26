import { describe, expect, it } from "vitest";
import { analyzePortfolioRisk, positionCorrelation, type RiskPosition } from "./portfolioRisk";

function position(overrides: Partial<RiskPosition> & Pick<RiskPosition, "id">): RiskPosition {
  return {
    gameId: `game-${overrides.id}`,
    sport: "nba",
    sportLabel: "NBA",
    team: `Team ${overrides.id}`,
    opponent: `Opp ${overrides.id}`,
    side: "Home",
    stake: 20,
    modelProb: 0.56,
    americanOdds: -110,
    ...overrides,
  };
}

describe("positionCorrelation", () => {
  it("treats the same side of the same game as one position", () => {
    const a = position({ id: "a", gameId: "g1", team: "Lakers" });
    const b = position({ id: "b", gameId: "g1", team: "Lakers" });
    expect(positionCorrelation(a, b)).toBe(1);
  });

  it("treats opposite sides of one game as a hedge", () => {
    const a = position({ id: "a", gameId: "g1", team: "Lakers", side: "Home" });
    const b = position({ id: "b", gameId: "g1", team: "Celtics", side: "Away" });
    expect(positionCorrelation(a, b)).toBe(-1);
  });

  it("ranks same-sport above cross-sport correlation", () => {
    const a = position({ id: "a", gameId: "g1", sport: "nba" });
    const b = position({ id: "b", gameId: "g2", sport: "nba" });
    const c = position({ id: "c", gameId: "g3", sport: "nfl" });
    expect(positionCorrelation(a, b)).toBeGreaterThan(positionCorrelation(a, c));
  });
});

describe("analyzePortfolioRisk", () => {
  it("returns a zeroed report for an empty slate", () => {
    const report = analyzePortfolioRisk([], 1000);
    expect(report.positions).toBe(0);
    expect(report.totalStake).toBe(0);
    expect(report.warnings).toEqual([]);
    expect(report.correlationMultiple).toBe(1);
  });

  it("ignores positions with no stake", () => {
    const report = analyzePortfolioRisk(
      [position({ id: "a", stake: 25 }), position({ id: "b", stake: 0 })],
      1000,
    );
    expect(report.positions).toBe(1);
    expect(report.totalStake).toBe(25);
  });

  it("inflates risk when every position sits in one game", () => {
    const stacked = analyzePortfolioRisk(
      [
        position({ id: "a", gameId: "g1", team: "Lakers" }),
        position({ id: "b", gameId: "g1", team: "Lakers" }),
        position({ id: "c", gameId: "g1", team: "Lakers" }),
      ],
      1000,
    );
    const spread = analyzePortfolioRisk(
      [
        position({ id: "a", gameId: "g1", sport: "nba", team: "Lakers" }),
        position({ id: "b", gameId: "g2", sport: "nfl", team: "Chiefs" }),
        position({ id: "c", gameId: "g3", sport: "mlb", team: "Dodgers" }),
      ],
      1000,
    );

    expect(stacked.correlationMultiple).toBeGreaterThan(spread.correlationMultiple);
    expect(stacked.correlatedSigma).toBeGreaterThan(stacked.independentSigma);
    expect(spread.diversificationScore).toBeGreaterThan(stacked.diversificationScore);
  });

  it("never reports a negative sigma for a fully hedged book", () => {
    const report = analyzePortfolioRisk(
      [
        position({ id: "a", gameId: "g1", team: "Lakers", side: "Home" }),
        position({ id: "b", gameId: "g1", team: "Celtics", side: "Away" }),
      ],
      1000,
    );
    expect(report.correlatedSigma).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(report.correlatedSigma)).toBe(false);
    expect(report.correlationMultiple).toBeLessThan(1);
  });

  it("flags an over-limit team cluster and trims it back under the limit", () => {
    const report = analyzePortfolioRisk(
      [
        position({ id: "a", gameId: "g1", team: "Lakers", stake: 40 }),
        position({ id: "b", gameId: "g2", team: "Lakers", stake: 40 }),
      ],
      1000,
      "balanced",
    );

    const teamCluster = report.clusters.find((cluster) => cluster.key === "team:Lakers");
    expect(teamCluster?.bankrollPct).toBe(8);
    expect(teamCluster?.overLimit).toBe(true);
    expect(report.warnings.some((warning) => warning.code === "team:Lakers")).toBe(true);

    const trimmed = report.scaledPositions.reduce((sum, entry) => sum + entry.suggestedStake, 0);
    // 3% team limit on a 1000 bankroll.
    expect(trimmed).toBeLessThanOrEqual(30 + 1e-6);
    expect(report.haircutPct).toBeGreaterThan(0);
  });

  it("leaves a compliant slate untouched", () => {
    const report = analyzePortfolioRisk(
      [
        position({ id: "a", gameId: "g1", sport: "nba", team: "Lakers", stake: 10, americanOdds: -110 }),
        position({ id: "b", gameId: "g2", sport: "nfl", team: "Chiefs", stake: 10, americanOdds: 120 }),
      ],
      1000,
      "balanced",
    );

    expect(report.warnings).toEqual([]);
    expect(report.scaledPositions.every((entry) => entry.limitScale === 1)).toBe(true);
    expect(report.suggestedTotalStake).toBe(report.totalStake);
    expect(report.haircutPct).toBe(0);
  });

  it("tightens limits for a conservative profile", () => {
    const positions = [
      position({ id: "a", gameId: "g1", sport: "nba", team: "Lakers", stake: 25 }),
      position({ id: "b", gameId: "g2", sport: "nba", team: "Celtics", stake: 25 }),
      position({ id: "c", gameId: "g3", sport: "nba", team: "Heat", stake: 25 }),
    ];

    const conservative = analyzePortfolioRisk(positions, 1000, "conservative");
    const aggressive = analyzePortfolioRisk(positions, 1000, "aggressive");

    expect(conservative.warnings.length).toBeGreaterThan(aggressive.warnings.length);
    expect(conservative.suggestedTotalStake).toBeLessThan(aggressive.suggestedTotalStake);
  });

  it("does not call a single position a narrative", () => {
    const report = analyzePortfolioRisk([position({ id: "a", stake: 200, americanOdds: -150 })], 1000);
    const narrative = report.clusters.find((cluster) => cluster.dimension === "narrative");
    expect(narrative?.positions).toBe(1);
    expect(narrative?.overLimit).toBe(false);
  });

  it("flags a slate that leans entirely on favorites", () => {
    const report = analyzePortfolioRisk(
      [
        position({ id: "a", gameId: "g1", sport: "nba", team: "Lakers", stake: 8, americanOdds: -130 }),
        position({ id: "b", gameId: "g2", sport: "nfl", team: "Chiefs", stake: 8, americanOdds: -145 }),
        position({ id: "c", gameId: "g3", sport: "mlb", team: "Dodgers", stake: 8, americanOdds: -120 }),
      ],
      1000,
    );

    expect(report.warnings.some((warning) => warning.code === "narrative:favorite")).toBe(true);
  });

  it("keeps expected value signed with the edge", () => {
    const good = analyzePortfolioRisk([position({ id: "a", modelProb: 0.62, americanOdds: -110 })], 1000);
    const bad = analyzePortfolioRisk([position({ id: "a", modelProb: 0.4, americanOdds: -110 })], 1000);
    expect(good.expectedValue).toBeGreaterThan(0);
    expect(bad.expectedValue).toBeLessThan(0);
  });
});
