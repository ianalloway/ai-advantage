import { describe, expect, it } from "vitest";
import { buildSegmentReport, type SegmentSource } from "./segments";

const row = (overrides: Partial<SegmentSource> = {}): SegmentSource => ({
  sportLabel: "NBA",
  entryOdds: -110,
  executionAdjustedEdge: 4,
  executionWindow: "Today",
  ledgerOutcome: "won",
  ...overrides,
});

function many(count: number, overrides: Partial<SegmentSource> = {}): SegmentSource[] {
  return Array.from({ length: count }, () => row(overrides));
}

describe("buildSegmentReport", () => {
  it("splits the ledger across sport, edge band, side, and window", () => {
    const report = buildSegmentReport([
      row({ sportLabel: "NBA", entryOdds: -150, executionAdjustedEdge: 6, executionWindow: "Today" }),
      row({ sportLabel: "NFL", entryOdds: 140, executionAdjustedEdge: 9, executionWindow: "Final hour" }),
    ]);

    expect(report.dimensions.sport.map((segment) => segment.label).sort()).toEqual(["NBA", "NFL"]);
    expect(report.dimensions.side.map((segment) => segment.label).sort()).toEqual(["Favorites", "Underdogs"]);
    expect(report.dimensions.edge.map((segment) => segment.label).sort()).toEqual(["5–8%", "8%+"]);
    expect(report.dimensions.window.map((segment) => segment.label).sort()).toEqual(["Final hour", "Today"]);
  });

  it("computes unit profit and ROI at the recorded price", () => {
    const report = buildSegmentReport([
      row({ ledgerOutcome: "won", entryOdds: 100 }),
      row({ ledgerOutcome: "lost", entryOdds: 100 }),
      row({ ledgerOutcome: "won", entryOdds: 100 }),
    ]);

    const nba = report.dimensions.sport[0];
    // +1, -1, +1 units over three staked units.
    expect(nba.unitsProfit).toBeCloseTo(1, 6);
    expect(nba.roiPct).toBeCloseTo(33.33, 1);
    expect(nba.winRatePct).toBeCloseTo(66.67, 1);
  });

  it("counts a push as a bet but not as turnover", () => {
    const report = buildSegmentReport([
      row({ ledgerOutcome: "won", entryOdds: 100 }),
      row({ ledgerOutcome: "push" }),
    ]);

    const nba = report.dimensions.sport[0];
    expect(nba.bets).toBe(2);
    expect(nba.pushes).toBe(1);
    // One unit staked, one unit won.
    expect(nba.roiPct).toBeCloseTo(100, 6);
    // A push decides nothing, so it stays out of the win rate.
    expect(nba.winRatePct).toBe(100);
  });

  it("refuses to call a thin segment reliable", () => {
    const report = buildSegmentReport(many(5, { sportLabel: "MLB" }), { minSample: 15 });

    expect(report.dimensions.sport[0].reliable).toBe(false);
    expect(report.best).toBeNull();
    expect(report.worst).toBeNull();
    expect(report.headline).toContain("none of them is a finding");
  });

  it("picks best and worst from reliable segments only", () => {
    const report = buildSegmentReport(
      [
        ...many(20, { sportLabel: "NBA", ledgerOutcome: "won", entryOdds: 100 }),
        ...many(20, { sportLabel: "NFL", ledgerOutcome: "lost", entryOdds: 100 }),
        // A tiny segment with a spectacular record that must not win the headline.
        ...many(2, { sportLabel: "MLB", ledgerOutcome: "won", entryOdds: 900 }),
      ],
      { minSample: 15 },
    );

    expect(report.best?.label).toBe("NBA");
    expect(report.worst?.label).toBe("NFL");
    expect(report.headline).toContain("NBA");
  });

  it("averages close-line value where a close exists", () => {
    const report = buildSegmentReport([
      row({ closeLineValue: 2 }),
      row({ closeLineValue: -1 }),
      row({}),
    ]);

    const nba = report.dimensions.sport[0];
    expect(nba.avgClvPts).toBeCloseTo(0.5, 6);
    expect(nba.beatCloseRatePct).toBe(50);
  });

  it("leaves CLV undefined when no close was recorded", () => {
    const report = buildSegmentReport(many(3));

    expect(report.dimensions.sport[0].avgClvPts).toBeUndefined();
    expect(report.dimensions.sport[0].beatCloseRatePct).toBeUndefined();
  });

  it("ignores pending rows and junk prices", () => {
    const report = buildSegmentReport([
      row({ ledgerOutcome: "pending" }),
      row({ entryOdds: 0 }),
      row({ ledgerOutcome: "won" }),
    ]);

    expect(report.totalSettled).toBe(1);
  });

  it("sorts each dimension by ROI", () => {
    const report = buildSegmentReport([
      ...many(3, { sportLabel: "NBA", ledgerOutcome: "lost" }),
      ...many(3, { sportLabel: "NFL", ledgerOutcome: "won", entryOdds: 100 }),
    ]);

    expect(report.dimensions.sport[0].label).toBe("NFL");
    expect(report.dimensions.sport[0].roiPct).toBeGreaterThan(report.dimensions.sport[1].roiPct);
  });

  it("says so plainly when nothing has settled", () => {
    const report = buildSegmentReport([]);

    expect(report.totalSettled).toBe(0);
    expect(report.headline).toContain("Nothing has settled yet");
    expect(report.dimensions.sport).toEqual([]);
  });
});
