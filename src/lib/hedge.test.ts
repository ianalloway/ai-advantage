import { describe, expect, it } from "vitest";
import { calculateHedge, formatHedgeVerdict, hedgeBranches, partialHedge } from "./hedge";

describe("calculateHedge", () => {
  it("equalises both branches at the hedge stake", () => {
    const result = calculateHedge({ entryOdds: 200, stake: 100, hedgeOdds: -110 });

    // $100 at +200 returns $300; hedging that at -110 needs 300 / 1.909... = $157.14.
    expect(result.hedgeStake).toBeCloseTo(157.14, 2);
    expect(result.profitIfOriginalWins).toBeCloseTo(result.profitIfHedgeWins, 1);
    expect(result.lockedProfit).toBeCloseTo(42.86, 2);
    expect(result.isArb).toBe(true);
  });

  it("locks a loss when the line moved against the ticket", () => {
    const result = calculateHedge({ entryOdds: -110, stake: 100, hedgeOdds: -200 });

    expect(result.lockedProfit).toBeLessThan(0);
    expect(result.isArb).toBe(false);
    expect(result.lockedRoi).toBeLessThan(0);
  });

  it("returns the original stake plus the lock as a synthetic cash-out", () => {
    const result = calculateHedge({ entryOdds: 200, stake: 100, hedgeOdds: -110 });
    expect(result.syntheticCashOut).toBeCloseTo(100 + result.lockedProfit, 2);
  });

  it("sizes the insurance hedge to return the original risk", () => {
    const result = calculateHedge({ entryOdds: 150, stake: 100, hedgeOdds: 100 });
    // At +100 you need exactly $100 back to cover a $100 ticket.
    expect(result.insuranceStake).toBeCloseTo(100, 2);
  });

  it("says let it ride when hedging would burn a positive expected value", () => {
    const result = calculateHedge({ entryOdds: -110, stake: 100, hedgeOdds: -200, modelProb: 0.7 });

    expect(result.holdEv).toBeGreaterThan(0);
    expect(result.verdict).toBe("let-it-ride");
    expect(result.evGiveUp).toBeGreaterThan(0);
  });

  it("says lock it when the guarantee beats the model's expected value", () => {
    const result = calculateHedge({ entryOdds: 200, stake: 100, hedgeOdds: -110, modelProb: 0.2 });

    expect(result.holdEv).toBeLessThan(result.lockedProfit);
    expect(result.verdict).toBe("hedge");
  });

  it("suggests a partial hedge when the lock is profitable but costs expected value", () => {
    const result = calculateHedge({ entryOdds: 200, stake: 100, hedgeOdds: -110, modelProb: 0.6 });

    expect(result.lockedProfit).toBeGreaterThan(0);
    expect(result.holdEv).toBeGreaterThan(result.lockedProfit);
    expect(result.verdict).toBe("partial");
  });

  it("refuses to price junk inputs", () => {
    expect(calculateHedge({ entryOdds: 0, stake: 100, hedgeOdds: -110 }).verdict).toBe("unavailable");
    expect(calculateHedge({ entryOdds: 150, stake: 0, hedgeOdds: -110 }).verdict).toBe("unavailable");
    expect(calculateHedge({ entryOdds: 150, stake: 100, hedgeOdds: Number.NaN }).verdict).toBe("unavailable");
  });
});

describe("hedgeBranches", () => {
  it("returns the unhedged ticket at a zero hedge stake", () => {
    const branches = hedgeBranches({ entryOdds: 150, stake: 100, hedgeOdds: -120 }, 0);
    expect(branches.ifOriginalWins).toBeCloseTo(150, 2);
    expect(branches.ifHedgeWins).toBeCloseTo(-100, 2);
  });
});

describe("partialHedge", () => {
  it("interpolates between no hedge and a full lock", () => {
    const input = { entryOdds: 200, stake: 100, hedgeOdds: -110, modelProb: 0.6 };
    const none = partialHedge(input, 0);
    const half = partialHedge(input, 0.5);
    const full = partialHedge(input, 1);

    expect(none.hedgeStake).toBe(0);
    expect(half.hedgeStake).toBeCloseTo(full.hedgeStake / 2, 2);
    expect(half.worstCase).toBeGreaterThan(none.worstCase);
    expect(full.ifOriginalWins).toBeCloseTo(full.ifHedgeWins, 1);
  });

  it("clamps the fraction into 0–1", () => {
    const input = { entryOdds: 200, stake: 100, hedgeOdds: -110 };
    expect(partialHedge(input, -5).fraction).toBe(0);
    expect(partialHedge(input, 9).fraction).toBe(1);
  });

  it("gives an unpriceable market a zeroed result", () => {
    expect(partialHedge({ entryOdds: 0, stake: 100, hedgeOdds: -110 }, 0.5).hedgeStake).toBe(0);
  });
});

describe("formatHedgeVerdict", () => {
  it("labels each verdict", () => {
    expect(formatHedgeVerdict("hedge")).toBe("Lock it");
    expect(formatHedgeVerdict("partial")).toBe("Partial hedge");
    expect(formatHedgeVerdict("let-it-ride")).toBe("Let it ride");
    expect(formatHedgeVerdict("unavailable")).toBe("Not priceable");
  });
});
