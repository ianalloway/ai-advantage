import { describe, expect, it } from "vitest";
import {
  assessSignificance,
  betsForSignificance,
  binomialTailProbability,
  logGamma,
  significanceBetsFromLedger,
  wilsonInterval,
  type SignificanceBet,
} from "./significance";

function bets(wins: number, losses: number, americanOdds = -110): SignificanceBet[] {
  return [
    ...Array.from({ length: wins }, () => ({ americanOdds, outcome: "won" })),
    ...Array.from({ length: losses }, () => ({ americanOdds, outcome: "lost" })),
  ];
}

describe("logGamma", () => {
  it("matches known factorials", () => {
    // Γ(n) = (n-1)!
    expect(Math.exp(logGamma(5))).toBeCloseTo(24, 6);
    expect(Math.exp(logGamma(6))).toBeCloseTo(120, 5);
  });

  it("stays finite for large inputs where factorials overflow", () => {
    expect(Number.isFinite(logGamma(1000))).toBe(true);
  });
});

describe("binomialTailProbability", () => {
  it("matches a hand-computable coin flip", () => {
    // P(X >= 2) for 3 fair flips = 4/8.
    expect(binomialTailProbability(2, 3, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("is 1 when asking for at least zero successes", () => {
    expect(binomialTailProbability(0, 10, 0.3)).toBe(1);
  });

  it("is 0 when asking for more successes than trials", () => {
    expect(binomialTailProbability(11, 10, 0.3)).toBe(0);
  });

  it("falls as the bar rises", () => {
    const low = binomialTailProbability(30, 100, 0.5);
    const high = binomialTailProbability(70, 100, 0.5);
    expect(low).toBeGreaterThan(high);
    expect(high).toBeLessThan(0.0001);
  });

  it("stays inside [0, 1] for a large sample", () => {
    const p = binomialTailProbability(520, 1000, 0.5);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});

describe("wilsonInterval", () => {
  it("brackets the observed rate", () => {
    const { lower, upper } = wilsonInterval(55, 100);
    expect(lower).toBeLessThan(0.55);
    expect(upper).toBeGreaterThan(0.55);
  });

  it("narrows as the sample grows", () => {
    const small = wilsonInterval(11, 20);
    const large = wilsonInterval(550, 1000);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });

  it("stays inside [0, 1] at the extremes", () => {
    expect(wilsonInterval(0, 10).lower).toBe(0);
    expect(wilsonInterval(10, 10).upper).toBeCloseTo(1, 10);
    expect(wilsonInterval(0, 0).lower).toBe(0);
  });
});

describe("betsForSignificance", () => {
  it("needs fewer bets for a bigger edge", () => {
    const small = betsForSignificance(0.54, 0.5238)!;
    const big = betsForSignificance(0.6, 0.5238)!;
    expect(big).toBeLessThan(small);
  });

  it("is undefined when the rate is not above break-even", () => {
    expect(betsForSignificance(0.5, 0.5238)).toBeUndefined();
    expect(betsForSignificance(0.5238, 0.5238)).toBeUndefined();
  });
});

describe("assessSignificance", () => {
  it("withholds a verdict below the sample floor", () => {
    const report = assessSignificance(bets(8, 2), { minSample: 25 });

    expect(report.verdict).toBe("insufficient");
    expect(report.significant).toBe(false);
    expect(report.headline).toContain("floor");
  });

  it("calls a strong record over a real sample significant", () => {
    const report = assessSignificance(bets(360, 240), { minSample: 25 });

    // 60% at -110 against a 52.4% break-even, over 600 bets.
    expect(report.winRatePct).toBeCloseTo(60, 1);
    expect(report.breakevenWinRatePct).toBeCloseTo(52.38, 1);
    expect(report.pValue).toBeLessThan(0.001);
    expect(report.verdict).toBe("significant");
    expect(report.betsNeeded).toBeUndefined();
  });

  it("refuses to crown a good rate on a thin sample", () => {
    const report = assessSignificance(bets(18, 12), { minSample: 25 });

    // 60% again, but over 30 bets rather than 600.
    expect(report.winRatePct).toBeCloseTo(60, 1);
    expect(report.verdict).toBe("not-yet");
    expect(report.pValue).toBeGreaterThan(0.05);
    expect(report.betsNeeded).toBeGreaterThan(0);
    expect(report.headline).toContain("not yet distinguishable from luck");
  });

  it("says plainly when there is no edge to test", () => {
    const report = assessSignificance(bets(40, 60), { minSample: 25 });

    expect(report.verdict).toBe("losing");
    expect(report.betsNeeded).toBeUndefined();
    expect(report.headline).toContain("no edge here");
  });

  it("sets break-even from the prices actually taken", () => {
    const cheap = assessSignificance(bets(30, 30, -110));
    const long = assessSignificance(bets(30, 30, 200));

    expect(cheap.breakevenWinRatePct).toBeCloseTo(52.38, 1);
    expect(long.breakevenWinRatePct).toBeCloseTo(33.33, 1);
    // The same 50% record is a loser at -110 and a winner at +200.
    expect(cheap.observedRoiPct).toBeLessThan(0);
    expect(long.observedRoiPct).toBeGreaterThan(0);
  });

  it("brackets the win rate with a Wilson interval", () => {
    const report = assessSignificance(bets(55, 45));

    expect(report.wilsonLowerPct).toBeLessThan(report.winRatePct);
    expect(report.wilsonUpperPct).toBeGreaterThan(report.winRatePct);
  });

  it("drops pushes, pending rows, and junk prices", () => {
    const report = assessSignificance([
      ...bets(5, 5),
      { americanOdds: -110, outcome: "push" },
      { americanOdds: -110, outcome: "pending" },
      { americanOdds: 0, outcome: "won" },
    ]);

    expect(report.bets).toBe(10);
  });

  it("returns an empty report rather than NaN with nothing decided", () => {
    const report = assessSignificance([]);

    expect(report.bets).toBe(0);
    expect(report.pValue).toBe(1);
    expect(report.verdict).toBe("insufficient");
  });
});

describe("significanceBetsFromLedger", () => {
  it("maps ledger rows onto the assessed shape", () => {
    expect(
      significanceBetsFromLedger([{ entryOdds: -120, ledgerOutcome: "won" }]),
    ).toEqual([{ americanOdds: -120, outcome: "won" }]);
  });
});
