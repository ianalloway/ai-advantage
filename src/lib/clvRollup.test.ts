import { describe, expect, it } from "vitest";
import {
  entryClvPts,
  formatClvBookBadge,
  rollingClvWindows,
  summarizeClv,
} from "./clvRollup";
import { closeLineValuePts } from "./linePath";

describe("summarizeClv", () => {
  it("returns empty zeros for an empty book", () => {
    const summary = summarizeClv([]);
    expect(summary).toEqual({
      sample: 0,
      settled: 0,
      pending: 0,
      beat: 0,
      lost: 0,
      push: 0,
      beatRate: undefined,
      lostRate: undefined,
      pushRate: undefined,
      meanClvPts: undefined,
      medianClvPts: undefined,
    });
    expect(formatClvBookBadge(summary)).toBe("No picks");
  });

  it("treats missing close (or entry) as pending-only", () => {
    const summary = summarizeClv([
      { entryOdds: -110 },
      { entryOdds: -120, closeOdds: undefined },
      { closeOdds: -130 },
    ]);
    expect(summary.sample).toBe(3);
    expect(summary.pending).toBe(3);
    expect(summary.settled).toBe(0);
    expect(summary.meanClvPts).toBeUndefined();
    expect(summary.beatRate).toBeUndefined();
    expect(formatClvBookBadge(summary)).toBe("3 closes pending");
  });

  it("aggregates mixed beat / lost / push with mean and median", () => {
    // -120 entry → -140 close is beat (positive CLV)
    // -110 entry → -100 close is lost (negative CLV)
    // identical odds → push (~0)
    const beatPts = closeLineValuePts(-120, -140);
    const lostPts = closeLineValuePts(-110, -100);
    const pushPts = closeLineValuePts(-110, -110);

    const summary = summarizeClv([
      { entryOdds: -120, closeOdds: -140, sport: "nba" },
      { entryOdds: -110, closeOdds: -100, sport: "nfl" },
      { entryOdds: -110, closeOdds: -110, sport: "mlb" },
      { entryOdds: -105 }, // pending
    ]);

    expect(summary.sample).toBe(4);
    expect(summary.settled).toBe(3);
    expect(summary.pending).toBe(1);
    expect(summary.beat).toBe(1);
    expect(summary.lost).toBe(1);
    expect(summary.push).toBe(1);
    expect(summary.beatRate).toBeCloseTo(1 / 3);
    expect(summary.lostRate).toBeCloseTo(1 / 3);
    expect(summary.pushRate).toBeCloseTo(1 / 3);
    expect(summary.meanClvPts).toBeCloseTo((beatPts + lostPts + pushPts) / 3);
    expect(summary.medianClvPts).toBeCloseTo(pushPts);
    expect(entryClvPts({ entryOdds: -120, closeOdds: -140 })).toBeCloseTo(beatPts);
    expect(formatClvBookBadge(summary)).toMatch(/beat/);
    expect(formatClvBookBadge(summary)).toContain("1 pending");
  });
});

describe("rollingClvWindows", () => {
  it("filters dated entries into rolling windows ending at asOf", () => {
    const asOf = new Date("2026-03-15T12:00:00.000Z");
    const entries = [
      { entryOdds: -120, closeOdds: -140, date: "2026-03-15T10:00:00.000Z" }, // 1d + 7d
      { entryOdds: -110, closeOdds: -100, date: "2026-03-10T10:00:00.000Z" }, // 7d only
      { entryOdds: -105, closeOdds: -115, date: "2026-02-20T10:00:00.000Z" }, // outside 7d
      { entryOdds: -110, closeOdds: -130 }, // no date — excluded from windows
    ];

    const [d1, d7] = rollingClvWindows(entries, [1, 7], asOf);
    expect(d1!.label).toBe("1d");
    expect(d1!.sample).toBe(1);
    expect(d1!.beat).toBe(1);
    expect(d7!.label).toBe("7d");
    expect(d7!.sample).toBe(2);
    expect(d7!.beat).toBe(1);
    expect(d7!.lost).toBe(1);
  });

  it("skips unparseable dates and returns empty slices when nothing qualifies", () => {
    const asOf = new Date("2026-03-15T12:00:00.000Z");
    const [slice] = rollingClvWindows(
      [{ entryOdds: -110, closeOdds: -120, date: "not-a-date" }],
      [7],
      asOf,
    );
    expect(slice!.sample).toBe(0);
    expect(slice!.settled).toBe(0);
  });
});
