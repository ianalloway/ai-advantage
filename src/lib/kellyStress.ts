import { americanToDecimal } from "@/lib/predictions";

export interface KellyStressInput {
  winProb: number;
  americanOdds: number;
  /** Fraction of bankroll staked (0–1), e.g. Kelly pct */
  stakeFraction: number;
  bankroll: number;
  paths?: number;
  /** Deterministic seed for reproducible UI/tests */
  seed?: number;
}

export interface KellyStressResult {
  paths: number;
  p10Bankroll: number;
  p50Bankroll: number;
  p90Bankroll: number;
  maxDrawdownPct: number;
  ruinRate: number;
  expectedBankroll: number;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Short Monte Carlo stress of a single Kelly stake over repeated independent trials
 * at the same price/prob — variance honesty beside the stake number.
 */
export function stressKellyStake(input: KellyStressInput): KellyStressResult {
  const paths = Math.max(100, Math.min(input.paths ?? 5000, 20000));
  const trials = 40;
  const stakeFraction = Math.max(0, Math.min(input.stakeFraction, 1));
  const winProb = Math.max(0.01, Math.min(input.winProb, 0.99));
  const decimal = americanToDecimal(input.americanOdds);
  const profitMultiple = decimal - 1;
  const rng = mulberry32(input.seed ?? Math.floor(winProb * 1e6 + input.americanOdds * 100));

  const endings: number[] = [];
  let ruinCount = 0;
  let maxDd = 0;
  let expectedSum = 0;

  for (let p = 0; p < paths; p++) {
    let bankroll = input.bankroll;
    let peak = bankroll;
    let pathMaxDd = 0;

    for (let i = 0; i < trials; i++) {
      const stake = bankroll * stakeFraction;
      if (stake < 0.01 || bankroll < 1) {
        ruinCount += 1;
        bankroll = 0;
        break;
      }
      if (rng() < winProb) {
        bankroll += stake * profitMultiple;
      } else {
        bankroll -= stake;
      }
      peak = Math.max(peak, bankroll);
      if (peak > 0) {
        pathMaxDd = Math.max(pathMaxDd, (peak - bankroll) / peak);
      }
    }

    endings.push(bankroll);
    expectedSum += bankroll;
    maxDd = Math.max(maxDd, pathMaxDd);
  }

  endings.sort((a, b) => a - b);
  const at = (q: number) => endings[Math.min(endings.length - 1, Math.floor(q * (endings.length - 1)))];

  return {
    paths,
    p10Bankroll: Number(at(0.1).toFixed(2)),
    p50Bankroll: Number(at(0.5).toFixed(2)),
    p90Bankroll: Number(at(0.9).toFixed(2)),
    maxDrawdownPct: Number((maxDd * 100).toFixed(1)),
    ruinRate: Number(((ruinCount / paths) * 100).toFixed(1)),
    expectedBankroll: Number((expectedSum / paths).toFixed(2)),
  };
}
