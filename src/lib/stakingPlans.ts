/**
 * Staking plan replay.
 *
 * Picking winners and keeping the money are different problems. The same graded
 * history, staked flat, staked as a fixed percentage, or staked at Kelly, ends
 * in very different places — and the plan that maximises profit is rarely the
 * one that survives the drawdown. This replays the desk's own settled ledger
 * under each discipline so the choice is made on evidence.
 */

import { americanToDecimal, kellyCriterion } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { calibrationGapFor } from "@/lib/calibratedSizing";
import { buildCalibrationReport, type CalibrationSample } from "@/lib/calibration";

export type StakingPlanId = "flat" | "percent" | "kelly-quarter" | "kelly-half" | "calibrated";

export interface ReplayBet {
  modelProb: number;
  americanOdds: number;
  /** Only decided and pushed bets move a bankroll; anything else is skipped. */
  outcome: string;
}

export interface StakingPlanResult {
  plan: StakingPlanId;
  label: string;
  description: string;
  bets: number;
  startingBankroll: number;
  endingBankroll: number;
  profit: number;
  /** Profit over everything staked, in percent. */
  roiPct: number;
  /** Change in bankroll from start to finish, in percent. */
  growthPct: number;
  maxDrawdownPct: number;
  /** Bankroll fell below a workable stake and the replay stopped. */
  ruined: boolean;
  totalStaked: number;
  avgStake: number;
}

export interface ReplayOptions {
  bankroll?: number;
  /** Unit size for the flat plan, and step size for the percentage plan. */
  unitPct?: number;
  /** Settled bets the walk-forward calibration needs before it corrects anything. */
  calibrationMinSample?: number;
}

const PLAN_LABELS: Record<StakingPlanId, { label: string; description: string }> = {
  flat: { label: "Flat unit", description: "Same stake every bet, sized off the starting bankroll." },
  percent: { label: "Fixed percent", description: "A constant share of the current bankroll." },
  "kelly-quarter": { label: "Quarter Kelly", description: "Kelly on the model's probability, at a quarter stake." },
  "kelly-half": { label: "Half Kelly", description: "Kelly at a half stake — faster growth, deeper holes." },
  calibrated: {
    label: "Calibrated Kelly",
    description: "Quarter Kelly on the probability corrected by what had settled before each bet.",
  },
};

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function stakeFor(
  plan: StakingPlanId,
  bet: ReplayBet,
  bankroll: number,
  startingBankroll: number,
  unitPct: number,
  /** Calibration from bets settled BEFORE this one — never from this one. */
  priorSamples: CalibrationSample[],
  calibrationMinSample: number,
): number {
  const decimal = americanToDecimal(bet.americanOdds);

  if (plan === "flat") return startingBankroll * unitPct;
  if (plan === "percent") return bankroll * unitPct;
  if (plan === "kelly-quarter") return bankroll * kellyCriterion(bet.modelProb, decimal, 0.25);
  if (plan === "kelly-half") return bankroll * kellyCriterion(bet.modelProb, decimal, 0.5);

  // Walk-forward: a calibration fitted on the whole history would let this plan
  // bet with knowledge of results it could not have had, which is the fastest
  // way to make a staking backtest lie.
  const report =
    priorSamples.length >= calibrationMinSample
      ? buildCalibrationReport(priorSamples, { minSample: calibrationMinSample })
      : null;
  const { gapPts } = calibrationGapFor(bet.modelProb, report);
  const corrected = Math.min(Math.max(bet.modelProb - gapPts / 100, 0.01), 0.99);
  return bankroll * kellyCriterion(corrected, decimal, 0.25);
}

export function replayStakingPlan(
  plan: StakingPlanId,
  bets: ReplayBet[],
  options: ReplayOptions = {},
): StakingPlanResult {
  const startingBankroll = options.bankroll ?? 1000;
  const unitPct = options.unitPct ?? 0.01;
  const usable = bets.filter(
    (bet) =>
      isValidMoneyline(bet.americanOdds) &&
      Number.isFinite(bet.modelProb) &&
      (bet.outcome === "won" || bet.outcome === "lost" || bet.outcome === "push"),
  );

  const calibrationMinSample = options.calibrationMinSample ?? 20;
  const priorSamples: CalibrationSample[] = [];

  let bankroll = startingBankroll;
  let peak = startingBankroll;
  let maxDrawdown = 0;
  let totalStaked = 0;
  let placed = 0;
  let ruined = false;

  for (const bet of usable) {
    // A bankroll too small to place a meaningful bet is a dead account, not a
    // plan that quietly keeps compounding fractions of a cent.
    if (bankroll < startingBankroll * 0.01) {
      ruined = true;
      break;
    }

    const stake = Math.min(
      stakeFor(plan, bet, bankroll, startingBankroll, unitPct, priorSamples, calibrationMinSample),
      bankroll,
    );

    // The bet joins the calibration history whether or not it was staked — it
    // settled, so it is evidence for the bets that come after it.
    if (bet.outcome === "won" || bet.outcome === "lost") {
      priorSamples.push({ predictedProb: bet.modelProb, won: bet.outcome === "won" });
    }

    if (stake <= 0) continue;

    placed += 1;
    totalStaked += stake;

    if (bet.outcome === "won") {
      bankroll += stake * (americanToDecimal(bet.americanOdds) - 1);
    } else if (bet.outcome === "lost") {
      bankroll -= stake;
    }

    peak = Math.max(peak, bankroll);
    if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, (peak - bankroll) / peak);
    }
  }

  const profit = bankroll - startingBankroll;

  return {
    plan,
    label: PLAN_LABELS[plan].label,
    description: PLAN_LABELS[plan].description,
    bets: placed,
    startingBankroll: round(startingBankroll),
    endingBankroll: round(bankroll),
    profit: round(profit),
    roiPct: totalStaked > 0 ? round((profit / totalStaked) * 100) : 0,
    growthPct: startingBankroll > 0 ? round((profit / startingBankroll) * 100) : 0,
    maxDrawdownPct: round(maxDrawdown * 100, 1),
    ruined,
    totalStaked: round(totalStaked),
    avgStake: placed > 0 ? round(totalStaked / placed) : 0,
  };
}

export const STAKING_PLANS: StakingPlanId[] = [
  "flat",
  "percent",
  "kelly-quarter",
  "kelly-half",
  "calibrated",
];

export function replayStakingPlans(bets: ReplayBet[], options: ReplayOptions = {}): StakingPlanResult[] {
  return STAKING_PLANS.map((plan) => replayStakingPlan(plan, bets, options));
}

/**
 * The plan a bankroll should actually run. Growth alone picks whatever was
 * luckiest and most levered, so a plan is only preferred over a steadier one
 * when it grows faster *and* does not deepen the worst hole materially.
 */
export function preferredPlan(results: StakingPlanResult[]): StakingPlanResult | null {
  const live = results.filter((result) => result.bets > 0 && !result.ruined);
  if (live.length === 0) return null;

  return live.reduce((best, candidate) => {
    if (candidate.growthPct > best.growthPct && candidate.maxDrawdownPct <= best.maxDrawdownPct + 5) {
      return candidate;
    }
    return best;
  });
}

/** Turn ledger rows into the sequence a replay consumes, oldest bet first. */
export function replayBetsFromLedger(
  entries: Array<{ modelProb: number; entryOdds: number; ledgerOutcome: string; commenceTime?: string }>,
): ReplayBet[] {
  return entries
    .filter((entry) => entry.ledgerOutcome !== "pending")
    .slice()
    .sort((a, b) => new Date(a.commenceTime ?? 0).getTime() - new Date(b.commenceTime ?? 0).getTime())
    .map((entry) => ({
      modelProb: entry.modelProb,
      americanOdds: entry.entryOdds,
      outcome: entry.ledgerOutcome,
    }));
}
