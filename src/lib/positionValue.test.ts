import { describe, expect, it } from "vitest";
import { summarizeOpenPositions, valueOpenPosition } from "./positionValue";

describe("valueOpenPosition", () => {
  it("marks a ticket to the live probability", () => {
    // $100 at +150 returns $250 if it lands; at 60% that is worth $150.
    const value = valueOpenPosition({ stake: 100, americanOdds: 150, liveProb: 0.6 });

    expect(value.applicable).toBe(true);
    expect(value.potentialReturn).toBeCloseTo(250, 2);
    expect(value.fairValue).toBeCloseTo(150, 2);
    expect(value.unrealisedPnl).toBeCloseTo(50, 2);
    expect(value.expectedRoiPct).toBeCloseTo(50, 1);
  });

  it("shows a ticket under water when the game has gone against it", () => {
    const value = valueOpenPosition({ stake: 100, americanOdds: 150, liveProb: 0.2 });

    expect(value.fairValue).toBeCloseTo(50, 2);
    expect(value.unrealisedPnl).toBeLessThan(0);
    expect(value.expectedRoiPct).toBeLessThan(0);
  });

  it("says to lock when the certain number beats holding", () => {
    // The side is now a heavy favourite, so laying it off is cheap.
    const value = valueOpenPosition({
      stake: 100,
      americanOdds: 150,
      liveProb: 0.5,
      oppositeOdds: 150,
    });

    expect(value.lockedValue).toBeDefined();
    expect(value.lockedValue!).toBeGreaterThanOrEqual(value.fairValue);
    expect(value.recommendation).toBe("lock");
    expect(value.note).toContain("for certain");
  });

  it("says to hold when the live model rates it above the lock", () => {
    const value = valueOpenPosition({
      stake: 100,
      americanOdds: 150,
      liveProb: 0.9,
      oppositeOdds: -400,
    });

    expect(value.fairValue).toBeGreaterThan(value.lockedValue!);
    expect(value.recommendation).toBe("hold");
    expect(value.evGiveUp!).toBeGreaterThan(0);
  });

  it("reports the probability where holding and locking are worth the same", () => {
    const value = valueOpenPosition({
      stake: 100,
      americanOdds: 150,
      liveProb: 0.7,
      oppositeOdds: -200,
    });

    expect(value.breakEvenProb).toBeDefined();
    expect(value.breakEvenProb!).toBeGreaterThan(0);
    expect(value.breakEvenProb!).toBeLessThan(1);
    expect(value.note).toContain("Holding only beats locking above");
  });

  it("agrees with its own break-even: above it holds, below it locks", () => {
    const common = { stake: 100, americanOdds: 150, oppositeOdds: -200 };
    const reference = valueOpenPosition({ ...common, liveProb: 0.5 });
    const threshold = reference.breakEvenProb!;

    expect(valueOpenPosition({ ...common, liveProb: threshold + 0.05 }).recommendation).toBe("hold");
    expect(valueOpenPosition({ ...common, liveProb: threshold - 0.05 }).recommendation).toBe("lock");
  });

  it("values a ticket with no opposing price but offers no lock", () => {
    const value = valueOpenPosition({ stake: 100, americanOdds: 150, liveProb: 0.6 });

    expect(value.applicable).toBe(true);
    expect(value.recommendation).toBe("no-market");
    expect(value.lockedValue).toBeUndefined();
    expect(value.note).toContain("nothing to lock it with");
  });

  it("declines junk inputs", () => {
    expect(valueOpenPosition({ stake: 0, americanOdds: 150, liveProb: 0.6 }).applicable).toBe(false);
    expect(valueOpenPosition({ stake: 100, americanOdds: 0, liveProb: 0.6 }).applicable).toBe(false);
    expect(valueOpenPosition({ stake: 100, americanOdds: 150, liveProb: Number.NaN }).applicable).toBe(false);
    expect(valueOpenPosition({ stake: 100, americanOdds: 150, liveProb: 1.4 }).applicable).toBe(false);
  });
});

describe("summarizeOpenPositions", () => {
  it("adds up stake at risk, value, and what is under water", () => {
    const summary = summarizeOpenPositions([
      valueOpenPosition({ stake: 100, americanOdds: 150, liveProb: 0.6 }),
      valueOpenPosition({ stake: 50, americanOdds: -110, liveProb: 0.2 }),
    ]);

    expect(summary.positions).toBe(2);
    expect(summary.stakeAtRisk).toBeCloseTo(150, 2);
    expect(summary.underwater).toBe(1);
    expect(summary.unrealisedPnl).toBeCloseTo(summary.fairValue - summary.stakeAtRisk, 2);
  });

  it("ignores positions it could not value", () => {
    const summary = summarizeOpenPositions([
      valueOpenPosition({ stake: 100, americanOdds: 150, liveProb: 0.6 }),
      valueOpenPosition({ stake: 100, americanOdds: 0, liveProb: 0.6 }),
    ]);

    expect(summary.positions).toBe(1);
    expect(summary.stakeAtRisk).toBeCloseTo(100, 2);
  });

  it("returns zeros for an empty book", () => {
    const summary = summarizeOpenPositions([]);

    expect(summary.positions).toBe(0);
    expect(summary.stakeAtRisk).toBe(0);
    expect(summary.unrealisedPnl).toBe(0);
  });
});
