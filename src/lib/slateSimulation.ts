/**
 * Slate simulation.
 *
 * The Kelly stress view asks what one bet does over many repeats. This asks the
 * question a bankroll actually faces: what does *tonight's whole slate*, bet at
 * these stakes, do over a month of similar nights — when the bets are not
 * independent. Correlated bets lose together, so the distribution of outcomes
 * is wider than any per-bet number implies.
 *
 * Outcomes are drawn through a one-factor Gaussian copula: a shared market
 * factor plus per-bet noise. It is an approximation, not a claim to know the
 * joint distribution of sporting results — but it is honest about the direction
 * correlation pushes risk, which treating the slate as independent is not.
 */

import { americanToDecimal } from "@/lib/predictions";
import { mulberry32 } from "@/lib/kellyStress";
import { positionCorrelation, type RiskPosition } from "@/lib/portfolioRisk";

export interface SlateSimulationInput {
  positions: RiskPosition[];
  bankroll: number;
  /** Nights of comparable action to simulate. */
  days?: number;
  paths?: number;
  seed?: number;
  /** Re-size stakes as the bankroll moves, rather than repeating fixed stakes. */
  compound?: boolean;
  /** Bankroll fraction below which a path counts as ruined. Default 0.2. */
  ruinThreshold?: number;
}

export interface SlateSimulationResult {
  paths: number;
  days: number;
  positions: number;
  startingBankroll: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  meanEnding: number;
  probProfitPct: number;
  medianMaxDrawdownPct: number;
  worstDrawdownPct: number;
  riskOfRuinPct: number;
  /** Expected profit from one night at these stakes. */
  dailyEv: number;
  /** Stake at risk on a single night. */
  dailyStake: number;
  /** Average pairwise correlation across the slate. */
  avgCorrelation: number;
  headline: string;
}

const EMPTY: SlateSimulationResult = {
  paths: 0,
  days: 0,
  positions: 0,
  startingBankroll: 0,
  p5: 0,
  p25: 0,
  p50: 0,
  p75: 0,
  p95: 0,
  meanEnding: 0,
  probProfitPct: 0,
  medianMaxDrawdownPct: 0,
  worstDrawdownPct: 0,
  riskOfRuinPct: 0,
  dailyEv: 0,
  dailyStake: 0,
  avgCorrelation: 0,
  headline: "No sized positions on the board to simulate.",
};

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

/**
 * Inverse standard normal CDF (Acklam's rational approximation). Good to about
 * 1e-9 across the range, which is far past what a simulation like this needs.
 */
export function inverseNormalCdf(p: number): number {
  const probability = Math.min(Math.max(p, 1e-9), 1 - 1e-9);

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const low = 0.02425;
  const high = 1 - low;

  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (probability > high) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  const q = probability - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/** Average correlation of each position with the rest of the slate. */
export function correlationLoadings(positions: RiskPosition[]): number[] {
  if (positions.length < 2) return positions.map(() => 0);

  return positions.map((position, index) => {
    const others = positions.filter((_, otherIndex) => otherIndex !== index);
    const total = others.reduce((sum, other) => sum + positionCorrelation(position, other), 0);
    return Math.min(Math.max(total / others.length, 0), 0.95);
  });
}

export function simulateSlate(input: SlateSimulationInput): SlateSimulationResult {
  const positions = input.positions.filter(
    (position) => position.stake > 0 && position.modelProb > 0 && position.modelProb < 1,
  );
  if (positions.length === 0 || input.bankroll <= 0) return EMPTY;

  const days = Math.max(1, Math.min(input.days ?? 30, 365));
  const paths = Math.max(100, Math.min(input.paths ?? 2000, 20000));
  const ruinThreshold = input.ruinThreshold ?? 0.2;
  const compound = input.compound ?? true;

  const loadings = correlationLoadings(positions);
  const thresholds = positions.map((position) => inverseNormalCdf(position.modelProb));
  const profitMultiples = positions.map((position) => americanToDecimal(position.americanOdds) - 1);
  const dailyStake = positions.reduce((sum, position) => sum + position.stake, 0);
  const dailyEv = positions.reduce(
    (sum, position, index) =>
      sum + position.modelProb * position.stake * profitMultiples[index] - (1 - position.modelProb) * position.stake,
    0,
  );

  const avgCorrelation = loadings.reduce((sum, loading) => sum + loading, 0) / loadings.length;
  const rng = mulberry32(input.seed ?? Math.round(dailyStake * 1000 + positions.length));

  // Box-Muller, buffering the second normal each call produces.
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };

  const endings: number[] = [];
  const drawdowns: number[] = [];
  let profitable = 0;
  let ruinedPaths = 0;
  let endingSum = 0;

  for (let path = 0; path < paths; path++) {
    let bankroll = input.bankroll;
    let peak = bankroll;
    let pathDrawdown = 0;
    let ruined = false;

    for (let day = 0; day < days; day++) {
      if (bankroll <= input.bankroll * ruinThreshold) {
        ruined = true;
        break;
      }

      const scale = compound ? bankroll / input.bankroll : 1;
      // Never risk more in a night than the bankroll holds.
      const cappedScale = Math.min(scale, bankroll / Math.max(dailyStake, 1e-9));
      const marketFactor = normal();
      let dayProfit = 0;

      for (let i = 0; i < positions.length; i++) {
        const loading = loadings[i];
        const latent = Math.sqrt(loading) * marketFactor + Math.sqrt(1 - loading) * normal();
        const stake = positions[i].stake * cappedScale;
        dayProfit += latent <= thresholds[i] ? stake * profitMultiples[i] : -stake;
      }

      bankroll += dayProfit;
      peak = Math.max(peak, bankroll);
      if (peak > 0) {
        pathDrawdown = Math.max(pathDrawdown, (peak - bankroll) / peak);
      }
    }

    if (ruined) ruinedPaths += 1;
    if (bankroll > input.bankroll) profitable += 1;
    endings.push(bankroll);
    drawdowns.push(pathDrawdown);
    endingSum += bankroll;
  }

  endings.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  const quantile = (values: number[], q: number) =>
    values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))];

  const p50 = quantile(endings, 0.5);
  // Round once, here, and report the same numbers everywhere — rounding the
  // headline and the badge separately makes them disagree at the boundary.
  const riskOfRuinPct = round((ruinedPaths / paths) * 100, 2);
  const probProfitPct = round((profitable / paths) * 100, 1);
  const medianMaxDrawdownPct = round(quantile(drawdowns, 0.5) * 100, 1);

  return {
    paths,
    days,
    positions: positions.length,
    startingBankroll: round(input.bankroll),
    p5: round(quantile(endings, 0.05)),
    p25: round(quantile(endings, 0.25)),
    p50: round(p50),
    p75: round(quantile(endings, 0.75)),
    p95: round(quantile(endings, 0.95)),
    meanEnding: round(endingSum / paths),
    probProfitPct,
    medianMaxDrawdownPct,
    worstDrawdownPct: round(drawdowns[drawdowns.length - 1] * 100, 1),
    riskOfRuinPct,
    dailyEv: round(dailyEv),
    dailyStake: round(dailyStake),
    avgCorrelation: round(avgCorrelation, 3),
    headline: describeSlateSimulation(days, probProfitPct, riskOfRuinPct, medianMaxDrawdownPct),
  };
}

export function describeSlateSimulation(
  days: number,
  probProfitPct: number,
  riskOfRuinPct: number,
  medianDrawdownPct: number,
): string {
  const base = `Over ${days} nights of comparable action, ${probProfitPct.toFixed(0)}% of paths finish ahead, with a typical worst drawdown of ${medianDrawdownPct.toFixed(0)}%.`;
  if (riskOfRuinPct >= 1) {
    return `${base} ${riskOfRuinPct.toFixed(1)}% of paths are wiped out — these stakes are too big for this bankroll.`;
  }
  return `${base} Ruin is rare at these stakes.`;
}
