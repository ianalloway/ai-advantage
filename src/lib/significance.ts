/**
 * Is the edge real yet?
 *
 * A 58% win rate over 40 bets and a 58% win rate over 4,000 bets are different
 * claims, and only one of them is evidence. The desk already refuses to call a
 * thin segment a finding; this puts a number on it — the chance a record this
 * good would happen anyway from a coin that only breaks even, and how many more
 * bets it would take to know.
 */

import { americanToDecimal, americanToImpliedProb } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";

export interface SignificanceBet {
  americanOdds: number;
  /** Only decided bets carry information; pushes and pending rows are dropped. */
  outcome: string;
}

export type SignificanceVerdict = "significant" | "not-yet" | "losing" | "insufficient";

export interface SignificanceReport {
  bets: number;
  wins: number;
  losses: number;
  winRatePct: number;
  /** The win rate that merely breaks even at the prices actually taken. */
  breakevenWinRatePct: number;
  observedRoiPct: number;
  /** 95% Wilson score interval on the true win rate. */
  wilsonLowerPct: number;
  wilsonUpperPct: number;
  /** P(a break-even bettor does this well or better) — exact binomial, one-sided. */
  pValue: number;
  significant: boolean;
  /** Further bets needed at this rate before the result would clear the threshold. */
  betsNeeded?: number;
  verdict: SignificanceVerdict;
  headline: string;
}

export interface SignificanceOptions {
  /** Significance threshold. Default 0.05. */
  alpha?: number;
  /** Decided bets before a verdict is offered at all. Default 25. */
  minSample?: number;
}

const EMPTY: SignificanceReport = {
  bets: 0,
  wins: 0,
  losses: 0,
  winRatePct: 0,
  breakevenWinRatePct: 0,
  observedRoiPct: 0,
  wilsonLowerPct: 0,
  wilsonUpperPct: 0,
  pValue: 1,
  significant: false,
  verdict: "insufficient",
  headline: "No decided bets yet — significance needs graded results.",
};

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

/** Lanczos approximation of log Γ(x), used for exact binomial terms without overflow. */
export function logGamma(x: number): number {
  // Written in the exact form a double holds, so the literals round-trip.
  const coefficients = [
    76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155,
    0.001208650973866179, -0.000005395239384953,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let series = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    series += coefficients[j] / ++y;
  }
  return -tmp + Math.log((2.5066282746310007 * series) / x);
}

function logChoose(n: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * P(X >= k) for X ~ Binomial(n, p). Summed exactly rather than approximated —
 * the samples a betting ledger produces are exactly the sizes where the normal
 * approximation is least trustworthy.
 */
export function binomialTailProbability(k: number, n: number, p: number): number {
  if (n <= 0) return 1;
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  let total = 0;
  for (let i = k; i <= n; i++) {
    total += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(Math.max(total, 0), 1);
}

/** Wilson score interval — behaves at small samples where the normal interval does not. */
export function wilsonInterval(successes: number, n: number, z = 1.959964): { lower: number; upper: number } {
  if (n <= 0) return { lower: 0, upper: 1 };

  const phat = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const spread = z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));

  return {
    lower: Math.max(0, (centre - spread) / denominator),
    upper: Math.min(1, (centre + spread) / denominator),
  };
}

/**
 * Bets needed for a rate this far above break-even to clear the threshold.
 * Undefined when the observed rate is at or below break-even — no amount of
 * further betting makes a losing rate significant in the good direction.
 */
export function betsForSignificance(observedRate: number, breakevenRate: number, z = 1.644854): number | undefined {
  const lift = observedRate - breakevenRate;
  if (lift <= 0) return undefined;
  return Math.ceil((z * z * breakevenRate * (1 - breakevenRate)) / (lift * lift));
}

export function assessSignificance(
  bets: SignificanceBet[],
  options: SignificanceOptions = {},
): SignificanceReport {
  const alpha = options.alpha ?? 0.05;
  const minSample = options.minSample ?? 25;

  const decided = bets.filter(
    (bet) => isValidMoneyline(bet.americanOdds) && (bet.outcome === "won" || bet.outcome === "lost"),
  );
  if (decided.length === 0) return EMPTY;

  const wins = decided.filter((bet) => bet.outcome === "won").length;
  const losses = decided.length - wins;
  const n = decided.length;
  const winRate = wins / n;

  // Break-even is set by the prices actually taken, not by a flat -110 assumption.
  const breakevenRate =
    decided.reduce((sum, bet) => sum + americanToImpliedProb(bet.americanOdds), 0) / n;

  const profit = decided.reduce(
    (sum, bet) => sum + (bet.outcome === "won" ? americanToDecimal(bet.americanOdds) - 1 : -1),
    0,
  );

  const wilson = wilsonInterval(wins, n);
  const pValue = binomialTailProbability(wins, n, breakevenRate);
  const significant = n >= minSample && pValue < alpha && winRate > breakevenRate;
  const totalNeeded = betsForSignificance(winRate, breakevenRate);
  const betsNeeded =
    totalNeeded !== undefined && totalNeeded > n ? totalNeeded - n : significant ? undefined : totalNeeded;

  let verdict: SignificanceVerdict;
  if (n < minSample) {
    verdict = "insufficient";
  } else if (significant) {
    verdict = "significant";
  } else if (winRate <= breakevenRate) {
    verdict = "losing";
  } else {
    verdict = "not-yet";
  }

  return {
    bets: n,
    wins,
    losses,
    winRatePct: round(winRate * 100),
    breakevenWinRatePct: round(breakevenRate * 100),
    observedRoiPct: round((profit / n) * 100),
    wilsonLowerPct: round(wilson.lower * 100),
    wilsonUpperPct: round(wilson.upper * 100),
    pValue: Number(pValue.toFixed(5)),
    significant,
    betsNeeded: verdict === "significant" ? undefined : betsNeeded,
    verdict,
    headline: describeSignificance(verdict, n, minSample, pValue, betsNeeded),
  };
}

export function describeSignificance(
  verdict: SignificanceVerdict,
  bets: number,
  minSample: number,
  pValue: number,
  betsNeeded?: number,
): string {
  if (verdict === "insufficient") {
    return `${bets} decided ${bets === 1 ? "bet" : "bets"} — ${minSample} is the floor before any of this is worth reading.`;
  }
  if (verdict === "significant") {
    return `A break-even bettor produces a record this good ${(pValue * 100).toFixed(1)}% of the time. That is past the threshold: the edge is showing up in the results.`;
  }
  if (verdict === "losing") {
    return "The win rate is at or below what these prices need to break even. There is no edge here to test yet.";
  }
  const more = betsNeeded !== undefined ? ` About ${betsNeeded} more bets at this rate would settle it.` : "";
  return `A break-even bettor produces a record this good ${(pValue * 100).toFixed(1)}% of the time — not yet distinguishable from luck.${more}`;
}

/** Ledger rows in the shape this assessment consumes. */
export function significanceBetsFromLedger(
  entries: Array<{ entryOdds: number; ledgerOutcome: string }>,
): SignificanceBet[] {
  return entries.map((entry) => ({ americanOdds: entry.entryOdds, outcome: entry.ledgerOutcome }));
}
