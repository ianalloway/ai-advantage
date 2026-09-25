import { describe, expect, it } from "vitest";
import {
  preferredPlan,
  replayBetsFromLedger,
  replayStakingPlan,
  replayStakingPlans,
  type ReplayBet,
} from "./stakingPlans";

const bet = (outcome: string, modelProb = 0.58, americanOdds = -110): ReplayBet => ({
  modelProb,
  americanOdds,
  outcome,
});

/** Alternating sequence with a real edge: 6 wins, 4 losses at even money. */
const winningRun: ReplayBet[] = [
  ...Array.from({ length: 6 }, () => bet("won", 0.58, 100)),
  ...Array.from({ length: 4 }, () => bet("lost", 0.58, 100)),
];

describe("replayStakingPlan", () => {
  it("stakes the same amount every bet on the flat plan", () => {
    const result = replayStakingPlan("flat", winningRun, { bankroll: 1000, unitPct: 0.01 });

    expect(result.bets).toBe(10);
    expect(result.avgStake).toBeCloseTo(10, 6);
    expect(result.totalStaked).toBeCloseTo(100, 6);
    // Six wins and four losses at even money on $10 units.
    expect(result.profit).toBeCloseTo(20, 6);
  });

  it("compounds the percentage plan off the running bankroll", () => {
    const flat = replayStakingPlan("flat", winningRun, { bankroll: 1000, unitPct: 0.01 });
    const percent = replayStakingPlan("percent", winningRun, { bankroll: 1000, unitPct: 0.01 });

    // Stakes grow while the bankroll is winning, so more is risked overall.
    expect(percent.avgStake).toBeGreaterThan(flat.avgStake);
    // Terminal wealth is the geometric product, independent of bet order.
    expect(percent.endingBankroll).toBeCloseTo(1000 * 1.01 ** 6 * 0.99 ** 4, 2);
  });

  it("shows the volatility drag: the same record compounds to less than flat", () => {
    const flat = replayStakingPlan("flat", winningRun, { bankroll: 1000, unitPct: 0.01 });
    const percent = replayStakingPlan("percent", winningRun, { bankroll: 1000, unitPct: 0.01 });

    // Identical bets and an identical 6-4 record, yet compounding a fixed
    // fraction lands below flat staking — losses shrink the base that wins
    // then have to rebuild. This is the point of replaying the plans.
    expect(percent.endingBankroll).toBeLessThan(flat.endingBankroll);
  });

  it("stakes more at half Kelly than at quarter Kelly", () => {
    const quarter = replayStakingPlan("kelly-quarter", winningRun, { bankroll: 1000 });
    const half = replayStakingPlan("kelly-half", winningRun, { bankroll: 1000 });

    expect(half.avgStake).toBeGreaterThan(quarter.avgStake);
    expect(half.maxDrawdownPct).toBeGreaterThanOrEqual(quarter.maxDrawdownPct);
  });

  it("leaves the bankroll untouched on a push", () => {
    const result = replayStakingPlan("flat", [bet("push"), bet("push")], { bankroll: 1000 });

    expect(result.bets).toBe(2);
    expect(result.endingBankroll).toBe(1000);
    expect(result.profit).toBe(0);
  });

  it("skips pending rows and unusable prices", () => {
    const result = replayStakingPlan("flat", [
      bet("won", 0.58, 100),
      bet("pending"),
      { modelProb: 0.6, americanOdds: 0, outcome: "won" },
      { modelProb: Number.NaN, americanOdds: -110, outcome: "lost" },
    ], { bankroll: 1000 });

    expect(result.bets).toBe(1);
  });

  it("marks a wiped-out bankroll as ruined instead of compounding dust", () => {
    const losses = Array.from({ length: 60 }, () => bet("lost", 0.9, 100));
    const result = replayStakingPlan("percent", losses, { bankroll: 1000, unitPct: 0.5 });

    expect(result.ruined).toBe(true);
    expect(result.endingBankroll).toBeLessThan(1000 * 0.01);
    expect(result.bets).toBeLessThan(losses.length);
  });

  it("reports the worst peak-to-trough fall", () => {
    const sequence = [bet("won", 0.58, 100), ...Array.from({ length: 5 }, () => bet("lost", 0.58, 100))];
    const result = replayStakingPlan("flat", sequence, { bankroll: 1000, unitPct: 0.05 });

    // Peaks at 1050 then loses five $50 units down to 800.
    expect(result.maxDrawdownPct).toBeCloseTo(23.8, 0);
  });

  it("returns a zeroed result for an empty history", () => {
    const result = replayStakingPlan("kelly-quarter", [], { bankroll: 1000 });

    expect(result.bets).toBe(0);
    expect(result.endingBankroll).toBe(1000);
    expect(result.roiPct).toBe(0);
    expect(result.ruined).toBe(false);
  });
});

describe("calibrated plan", () => {
  it("only corrects with what had settled before each bet", () => {
    // A model that says 58% and loses every time. Plain Kelly keeps staking off
    // the stated number; the calibrated plan learns from the settled bets and
    // shrinks — but only after enough of them have settled.
    const losses = Array.from({ length: 60 }, () => bet("lost", 0.58, 100));

    const plain = replayStakingPlan("kelly-quarter", losses, { bankroll: 1000 });
    const calibrated = replayStakingPlan("calibrated", losses, { bankroll: 1000, calibrationMinSample: 20 });

    expect(calibrated.endingBankroll).toBeGreaterThan(plain.endingBankroll);
    expect(calibrated.totalStaked).toBeLessThan(plain.totalStaked);
  });

  it("cannot see results it had not settled yet", () => {
    // The first bets run before any calibration exists, so they must be staked
    // exactly as quarter Kelly would stake them.
    const short = Array.from({ length: 5 }, () => bet("lost", 0.58, 100));

    const plain = replayStakingPlan("kelly-quarter", short, { bankroll: 1000 });
    const calibrated = replayStakingPlan("calibrated", short, { bankroll: 1000, calibrationMinSample: 20 });

    expect(calibrated.endingBankroll).toBeCloseTo(plain.endingBankroll, 6);
    expect(calibrated.totalStaked).toBeCloseTo(plain.totalStaked, 6);
  });

  it("does not flatter itself on a history it was fitted to", () => {
    // Both bands look +EV at even money on the stated probability, so Kelly
    // stakes both. Only one of them actually wins. An in-sample fit would skip
    // every loser from the first bet; walk-forward has to pay for the early
    // ones before it can learn to stop.
    const mixed = Array.from({ length: 40 }, (_, index) =>
      index % 2 === 0 ? bet("won", 0.62, 100) : bet("lost", 0.55, 100),
    );

    const calibrated = replayStakingPlan("calibrated", mixed, { bankroll: 1000, calibrationMinSample: 20 });

    // It still places the early losers, so it cannot come through untouched.
    expect(calibrated.bets).toBeGreaterThan(20);
    expect(calibrated.maxDrawdownPct).toBeGreaterThan(0);
  });
});

describe("replayStakingPlans", () => {
  it("replays every plan over the same history", () => {
    const results = replayStakingPlans(winningRun, { bankroll: 1000 });

    expect(results).toHaveLength(5);
    expect(new Set(results.map((result) => result.plan)).size).toBe(5);
    expect(results.every((result) => result.startingBankroll === 1000)).toBe(true);
  });
});

describe("preferredPlan", () => {
  it("does not reward extra growth bought with a much deeper hole", () => {
    const steady = replayStakingPlan("flat", winningRun, { bankroll: 1000 });
    const reckless = {
      ...steady,
      plan: "kelly-half" as const,
      growthPct: steady.growthPct + 40,
      maxDrawdownPct: steady.maxDrawdownPct + 30,
    };

    expect(preferredPlan([steady, reckless])?.plan).toBe("flat");
  });

  it("prefers the faster plan when the drawdown is comparable", () => {
    const steady = replayStakingPlan("flat", winningRun, { bankroll: 1000 });
    const better = { ...steady, plan: "percent" as const, growthPct: steady.growthPct + 10 };

    expect(preferredPlan([steady, better])?.plan).toBe("percent");
  });

  it("ignores ruined plans and empty histories", () => {
    const ruined = { ...replayStakingPlan("flat", winningRun, {}), ruined: true, growthPct: 500 };
    const alive = replayStakingPlan("flat", winningRun, {});

    expect(preferredPlan([ruined, alive])?.ruined).toBe(false);
    expect(preferredPlan([])).toBeNull();
  });
});

describe("replayBetsFromLedger", () => {
  it("drops pending rows and replays oldest first", () => {
    const bets = replayBetsFromLedger([
      { modelProb: 0.6, entryOdds: -110, ledgerOutcome: "won", commenceTime: "2026-02-02T00:00:00Z" },
      { modelProb: 0.55, entryOdds: 120, ledgerOutcome: "lost", commenceTime: "2026-01-01T00:00:00Z" },
      { modelProb: 0.7, entryOdds: -130, ledgerOutcome: "pending", commenceTime: "2026-03-01T00:00:00Z" },
    ]);

    expect(bets).toHaveLength(2);
    expect(bets[0].americanOdds).toBe(120);
    expect(bets[1].americanOdds).toBe(-110);
  });
});
