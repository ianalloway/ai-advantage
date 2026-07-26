import { americanToDecimal } from "@/lib/predictions";
import type { RiskProfile } from "@/lib/profile";

/**
 * Portfolio Risk View — slate-wide correlated exposure.
 *
 * A slate of individually-sized Kelly bets is not a portfolio. Three bets on the
 * same game, or six bets on the same night's favorites, are closer to one big bet
 * than to six small ones. This module groups the desk by team, game, sport, and
 * favorite/underdog narrative, prices the correlation between positions, and
 * returns a stake haircut that brings every cluster back under its limit.
 */

export interface RiskPosition {
  id: string;
  gameId: string;
  sport: string;
  sportLabel: string;
  /** Recommended side */
  team: string;
  opponent: string;
  side: "Home" | "Away" | "Draw";
  /** Suggested stake in bankroll currency */
  stake: number;
  modelProb: number;
  americanOdds: number;
}

export type ExposureDimension = "team" | "game" | "sport" | "narrative";

export interface ExposureCluster {
  key: string;
  label: string;
  dimension: ExposureDimension;
  positions: number;
  stake: number;
  bankrollPct: number;
  limitPct: number;
  overLimit: boolean;
}

export interface RiskWarning {
  code: string;
  severity: "high" | "medium";
  message: string;
}

export interface ScaledPosition {
  id: string;
  stake: number;
  /** Reduction forced by the cluster limits this position belongs to (0–1) */
  limitScale: number;
  suggestedStake: number;
}

export interface PortfolioRiskReport {
  bankroll: number;
  positions: number;
  totalStake: number;
  exposurePct: number;
  expectedValue: number;
  /** Stake-weighted 1σ P&L swing if positions were independent */
  independentSigma: number;
  /** Same, with the correlation matrix applied */
  correlatedSigma: number;
  /** correlatedSigma / independentSigma — above 1 means correlation is inflating risk */
  correlationMultiple: number;
  oneSigmaSwingPct: number;
  /** 0–100, from the Herfindahl index of game-level stake weights */
  diversificationScore: number;
  clusters: ExposureCluster[];
  topCluster: ExposureCluster | null;
  warnings: RiskWarning[];
  /** Blanket scale applied on top of the limit scale when correlation is elevated */
  correlationScale: number;
  scaledPositions: ScaledPosition[];
  suggestedTotalStake: number;
  /** Percentage of total stake the plan trims */
  haircutPct: number;
}

export interface RiskLimits {
  /** Max % of bankroll on one team */
  teamPct: number;
  /** Max % of bankroll on one game */
  gamePct: number;
  /** Max % of bankroll on one sport */
  sportPct: number;
  /** Max % of bankroll on the whole slate */
  totalPct: number;
  /** Max share of total stake pointed at one narrative before it is flagged */
  narrativeShare: number;
}

export const RISK_LIMITS: Record<RiskProfile, RiskLimits> = {
  conservative: { teamPct: 2, gamePct: 3, sportPct: 7, totalPct: 10, narrativeShare: 0.55 },
  balanced: { teamPct: 3, gamePct: 4, sportPct: 10, totalPct: 15, narrativeShare: 0.65 },
  aggressive: { teamPct: 5, gamePct: 6, sportPct: 15, totalPct: 25, narrativeShare: 0.75 },
};

/**
 * Any multi-bet slate carries some shared risk, so a haircut that fires at the
 * first sign of correlation would just shrink every plan. Only trim once
 * correlated sigma runs this far past the independent case.
 */
const CORRELATION_TOLERANCE = 1.25;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function narrativeOf(position: RiskPosition): { key: string; label: string } {
  if (position.side === "Draw") return { key: "draw", label: "Draw prices" };
  return position.americanOdds < 0
    ? { key: "favorite", label: "Favorites" }
    : { key: "underdog", label: "Underdogs" };
}

/**
 * Assumed correlation between two positions' outcomes.
 *
 * These are deliberately coarse — the point is to stop a desk from treating six
 * bets on one slate as six independent coin flips, not to claim a precise rho.
 */
export function positionCorrelation(a: RiskPosition, b: RiskPosition): number {
  if (a.id === b.id) return 1;

  if (a.gameId === b.gameId) {
    // Same side of the same game twice: effectively one position.
    if (a.team === b.team) return 1;
    // Opposite sides of the same game hedge each other.
    if (a.side !== b.side) return -1;
    return 0.6;
  }

  // A team appearing in two different games moves together across both.
  if (a.team === b.team) return 0.5;

  // Same league on the same slate shares refs, weather, market sentiment, and
  // whatever the model is currently getting wrong about that sport.
  if (a.sport === b.sport) return 0.15;

  return 0.05;
}

/** 1σ of a single position's P&L: stake * decimalOdds * sqrt(p(1-p)). */
function positionSigma(position: RiskPosition): number {
  const p = clamp(position.modelProb, 0.01, 0.99);
  const decimal = americanToDecimal(position.americanOdds);
  return Math.abs(position.stake) * decimal * Math.sqrt(p * (1 - p));
}

function positionEv(position: RiskPosition): number {
  const p = clamp(position.modelProb, 0.01, 0.99);
  const profitMultiple = americanToDecimal(position.americanOdds) - 1;
  return position.stake * (p * profitMultiple - (1 - p));
}

function buildClusters(
  positions: RiskPosition[],
  bankroll: number,
  limits: RiskLimits,
  totalStake: number,
): ExposureCluster[] {
  const buckets = new Map<string, { label: string; dimension: ExposureDimension; stake: number; positions: number }>();

  const add = (key: string, label: string, dimension: ExposureDimension, stake: number) => {
    const existing = buckets.get(key);
    if (existing) {
      existing.stake += stake;
      existing.positions += 1;
      return;
    }
    buckets.set(key, { label, dimension, stake, positions: 1 });
  };

  for (const position of positions) {
    const narrative = narrativeOf(position);
    add(`team:${position.team}`, position.team, "team", position.stake);
    add(`game:${position.gameId}`, `${position.team} vs ${position.opponent}`, "game", position.stake);
    add(`sport:${position.sport}`, position.sportLabel, "sport", position.stake);
    add(`narrative:${narrative.key}`, narrative.label, "narrative", position.stake);
  }

  const limitFor = (dimension: ExposureDimension) => {
    if (dimension === "team") return limits.teamPct;
    if (dimension === "game") return limits.gamePct;
    if (dimension === "sport") return limits.sportPct;
    // Narrative is a share of the slate, expressed against bankroll for display.
    return round(limits.narrativeShare * (totalStake / bankroll) * 100);
  };

  return Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const bankrollPct = round((bucket.stake / bankroll) * 100);
      const limitPct = limitFor(bucket.dimension);
      return {
        key,
        label: bucket.label,
        dimension: bucket.dimension,
        positions: bucket.positions,
        stake: round(bucket.stake),
        bankrollPct,
        limitPct,
        // A one-position narrative bucket is just the bet itself, not a theme.
        overLimit: bankrollPct > limitPct + 1e-9 && !(bucket.dimension === "narrative" && bucket.positions < 3),
      };
    })
    .sort((a, b) => b.stake - a.stake);
}

function buildWarnings(
  clusters: ExposureCluster[],
  exposurePct: number,
  limits: RiskLimits,
  correlationMultiple: number,
  positionCount: number,
): RiskWarning[] {
  const warnings: RiskWarning[] = [];

  if (exposurePct > limits.totalPct) {
    warnings.push({
      code: "total-exposure",
      severity: "high",
      message: `Slate risks ${exposurePct.toFixed(1)}% of bankroll against a ${limits.totalPct}% ceiling.`,
    });
  }

  for (const cluster of clusters.filter((entry) => entry.overLimit)) {
    if (cluster.dimension === "narrative") {
      warnings.push({
        code: cluster.key,
        severity: "medium",
        message: `${cluster.positions} positions lean ${cluster.label.toLowerCase()} — one market read is driving the slate.`,
      });
      continue;
    }
    warnings.push({
      code: cluster.key,
      severity: cluster.dimension === "sport" ? "medium" : "high",
      message: `${cluster.label} carries ${cluster.bankrollPct.toFixed(1)}% of bankroll, over the ${cluster.limitPct}% ${cluster.dimension} limit.`,
    });
  }

  if (positionCount > 1 && correlationMultiple > CORRELATION_TOLERANCE) {
    warnings.push({
      code: "correlation",
      severity: "high",
      message: `Correlated risk is ${correlationMultiple.toFixed(2)}× the independent case — these bets lose together.`,
    });
  }

  return warnings;
}

export function analyzePortfolioRisk(
  positions: RiskPosition[],
  bankroll: number,
  riskProfile: RiskProfile = "balanced",
  limitOverrides?: Partial<RiskLimits>,
): PortfolioRiskReport {
  const limits = { ...RISK_LIMITS[riskProfile], ...limitOverrides };
  const safeBankroll = Math.max(bankroll, 1);
  const priced = positions.filter((position) => position.stake > 0);

  if (priced.length === 0) {
    return {
      bankroll: safeBankroll,
      positions: 0,
      totalStake: 0,
      exposurePct: 0,
      expectedValue: 0,
      independentSigma: 0,
      correlatedSigma: 0,
      correlationMultiple: 1,
      oneSigmaSwingPct: 0,
      diversificationScore: 0,
      clusters: [],
      topCluster: null,
      warnings: [],
      correlationScale: 1,
      scaledPositions: [],
      suggestedTotalStake: 0,
      haircutPct: 0,
    };
  }

  const totalStake = priced.reduce((sum, position) => sum + position.stake, 0);
  const exposurePct = (totalStake / safeBankroll) * 100;
  const expectedValue = priced.reduce((sum, position) => sum + positionEv(position), 0);

  const sigmas = priced.map(positionSigma);
  const independentSigma = Math.sqrt(sigmas.reduce((sum, sigma) => sum + sigma * sigma, 0));

  // Portfolio variance = ΣΣ rho(i,j) * sigma(i) * sigma(j). The heuristic rho table
  // is not guaranteed positive semi-definite, so a hedged book can drive this below
  // zero — floor it at zero rather than reporting an imaginary sigma.
  let variance = 0;
  for (let i = 0; i < priced.length; i++) {
    for (let j = 0; j < priced.length; j++) {
      variance += positionCorrelation(priced[i], priced[j]) * sigmas[i] * sigmas[j];
    }
  }
  const correlatedSigma = Math.sqrt(Math.max(variance, 0));
  const correlationMultiple = independentSigma > 0 ? correlatedSigma / independentSigma : 1;

  const clusters = buildClusters(priced, safeBankroll, limits, totalStake);

  // Diversification reads game-level weights: two bets inside one game are one bet.
  const gameClusters = clusters.filter((cluster) => cluster.dimension === "game");
  const herfindahl = gameClusters.reduce((sum, cluster) => {
    const weight = cluster.stake / totalStake;
    return sum + weight * weight;
  }, 0);
  const diversificationScore = Math.round(clamp((1 - herfindahl) * 100, 0, 100));

  const warnings = buildWarnings(clusters, exposurePct, limits, correlationMultiple, priced.length);

  const clusterByKey = new Map(clusters.map((cluster) => [cluster.key, cluster]));
  const totalLimitStake = (limits.totalPct / 100) * safeBankroll;

  const scaledPositions: ScaledPosition[] = priced.map((position) => {
    const keys = [`team:${position.team}`, `game:${position.gameId}`, `sport:${position.sport}`];
    let limitScale = totalStake > totalLimitStake ? totalLimitStake / totalStake : 1;

    for (const key of keys) {
      const cluster = clusterByKey.get(key);
      if (!cluster || !cluster.overLimit || cluster.stake <= 0) continue;
      limitScale = Math.min(limitScale, ((cluster.limitPct / 100) * safeBankroll) / cluster.stake);
    }

    limitScale = clamp(limitScale, 0, 1);
    return {
      id: position.id,
      stake: round(position.stake),
      limitScale: round(limitScale, 4),
      suggestedStake: round(position.stake * limitScale),
    };
  });

  // Correlation haircut rides on top of the limit scale so both reductions stay
  // separately explainable on the card. It scales back toward the tolerance, not
  // toward zero correlation — a slate of independent bets is not the target.
  const correlationScale =
    correlationMultiple > CORRELATION_TOLERANCE
      ? round(clamp(CORRELATION_TOLERANCE / correlationMultiple, 0.6, 1), 4)
      : 1;
  const suggestedTotalStake = round(
    scaledPositions.reduce((sum, position) => sum + position.suggestedStake, 0) * correlationScale,
  );

  return {
    bankroll: safeBankroll,
    positions: priced.length,
    totalStake: round(totalStake),
    exposurePct: round(exposurePct),
    expectedValue: round(expectedValue),
    independentSigma: round(independentSigma),
    correlatedSigma: round(correlatedSigma),
    correlationMultiple: round(correlationMultiple, 3),
    oneSigmaSwingPct: round((correlatedSigma / safeBankroll) * 100),
    diversificationScore,
    clusters,
    topCluster: clusters.find((cluster) => cluster.dimension !== "narrative") ?? null,
    warnings,
    correlationScale,
    scaledPositions,
    suggestedTotalStake,
    haircutPct: totalStake > 0 ? round(clamp((1 - suggestedTotalStake / totalStake) * 100, 0, 100), 1) : 0,
  };
}
