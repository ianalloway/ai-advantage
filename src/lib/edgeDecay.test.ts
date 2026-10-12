import { describe, expect, it } from "vitest";
import { buildEdgeDecayReport, twoProportionPValue, type DecaySource } from "./edgeDecay";

/** A run of bets at even money with a given win rate, dated in order. */
function run(count: number, winRate: number, startDay: number, closeLineValue?: number): DecaySource[] {
  const wins = Math.round(count * winRate);
  return Array.from({ length: count }, (_, index) => ({
    entryOdds: 100,
    ledgerOutcome: index < wins ? "won" : "lost",
    commenceTime: new Date(Date.UTC(2026, 0, 1) + (startDay + index) * 86400000).toISOString(),
    closeLineValue,
  }));
}

describe("twoProportionPValue", () => {
  it("is near 1 for identical rates", () => {
    expect(twoProportionPValue(30, 60, 30, 60)).toBeCloseTo(1, 6);
  });

  it("falls as the two rates separate", () => {
    const close = twoProportionPValue(32, 60, 30, 60);
    const far = twoProportionPValue(48, 60, 24, 60);

    expect(close).toBeGreaterThan(far);
    expect(far).toBeLessThan(0.01);
  });

  it("is 1 for an empty side", () => {
    expect(twoProportionPValue(0, 0, 10, 20)).toBe(1);
  });
});

describe("buildEdgeDecayReport", () => {
  it("calls a steady record holding", () => {
    const report = buildEdgeDecayReport([...run(60, 0.58, 0), ...run(60, 0.58, 60)]);

    expect(report.verdict).toBe("holding");
    expect(Math.abs(report.deltaRoiPts)).toBeLessThan(3);
    expect(report.headline).toContain("No evidence the edge is going away");
  });

  it("flags a model whose recent half has fallen apart", () => {
    const report = buildEdgeDecayReport([...run(80, 0.65, 0), ...run(80, 0.40, 80)]);

    expect(report.verdict).toBe("decaying");
    expect(report.deltaRoiPts).toBeLessThan(0);
    expect(report.pValue).toBeLessThan(0.05);
    expect(report.headline).toContain("Treat the lifetime number as history");
  });

  it("flags a model that has got better", () => {
    const report = buildEdgeDecayReport([...run(80, 0.40, 0), ...run(80, 0.65, 80)]);

    expect(report.verdict).toBe("improving");
    expect(report.deltaRoiPts).toBeGreaterThan(0);
    expect(report.headline).toContain("getting stronger");
  });

  it("withholds a verdict until both halves are deep enough", () => {
    const report = buildEdgeDecayReport([...run(10, 0.7, 0), ...run(10, 0.3, 10)], { minPerHalf: 20 });

    expect(report.verdict).toBe("insufficient");
    expect(report.pValue).toBe(1);
    // Windows still render, for shape.
    expect(report.windows.length).toBeGreaterThan(0);
  });

  it("will not call a big swing decay when the sample cannot support it", () => {
    // A large drop, but on a sample where noise explains it.
    const report = buildEdgeDecayReport([...run(22, 0.59, 0), ...run(22, 0.45, 22)], { minPerHalf: 20 });

    expect(report.deltaRoiPts).toBeLessThan(0);
    expect(report.pValue).toBeGreaterThan(0.05);
    expect(report.verdict).toBe("holding");
  });

  it("splits the history into windows in chronological order", () => {
    const report = buildEdgeDecayReport([...run(40, 0.7, 0), ...run(40, 0.3, 40)], { windows: 4 });

    expect(report.windows).toHaveLength(4);
    expect(report.windows[0].roiPct).toBeGreaterThan(report.windows[3].roiPct);
    expect(new Date(report.windows[0].from!).getTime()).toBeLessThan(
      new Date(report.windows[3].from!).getTime(),
    );
  });

  it("sorts rows that arrive out of order before cutting them", () => {
    const ordered = [...run(60, 0.65, 0), ...run(60, 0.45, 60)];
    const shuffled = [...ordered].reverse();

    const fromOrdered = buildEdgeDecayReport(ordered);
    const fromShuffled = buildEdgeDecayReport(shuffled);

    expect(fromShuffled.earlyRoiPct).toBeCloseTo(fromOrdered.earlyRoiPct, 6);
    expect(fromShuffled.recentRoiPct).toBeCloseTo(fromOrdered.recentRoiPct, 6);
  });

  it("averages close-line value per window where it exists", () => {
    const report = buildEdgeDecayReport([...run(40, 0.6, 0, 1.5), ...run(40, 0.6, 40, -0.5)]);

    expect(report.windows[0].avgClvPts).toBeCloseTo(1.5, 3);
    expect(report.windows[report.windows.length - 1].avgClvPts).toBeCloseTo(-0.5, 3);
  });

  it("keeps pushes as bets but out of the win rate", () => {
    const withPush: DecaySource[] = [
      ...run(40, 0.6, 0),
      { entryOdds: 100, ledgerOutcome: "push", commenceTime: new Date(Date.UTC(2026, 3, 1)).toISOString() },
      ...run(40, 0.6, 100),
    ];
    const report = buildEdgeDecayReport(withPush);

    expect(report.totalSettled).toBe(81);
  });

  it("ignores pending rows and junk prices", () => {
    const report = buildEdgeDecayReport([
      ...run(40, 0.6, 0),
      { entryOdds: 100, ledgerOutcome: "pending" },
      { entryOdds: 0, ledgerOutcome: "won" },
    ]);

    expect(report.totalSettled).toBe(40);
  });

  it("returns an empty report rather than NaN with nothing graded", () => {
    const report = buildEdgeDecayReport([]);

    expect(report.totalSettled).toBe(0);
    expect(report.verdict).toBe("insufficient");
    expect(report.windows).toEqual([]);
  });
});
