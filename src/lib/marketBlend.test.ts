import { describe, expect, it } from "vitest";
import {
  blendProbability,
  blendSamplesFromLedger,
  brierAtWeight,
  fitBlendWeight,
  type BlendSample,
} from "./marketBlend";

/**
 * Build a history where outcomes are generated from a known true probability,
 * and the model and the price each see a distorted version of it.
 */
function history({
  count,
  modelBias,
  marketBias,
}: {
  count: number;
  modelBias: number;
  marketBias: number;
}): BlendSample[] {
  return Array.from({ length: count }, (_, index) => {
    const trueProb = 0.35 + ((index * 7) % 11) * 0.03;
    // Deterministic outcomes that land at the true rate over the run.
    const won = ((index * 13) % 100) / 100 < trueProb;
    return {
      modelProb: Math.min(Math.max(trueProb + modelBias, 0.02), 0.98),
      marketProb: Math.min(Math.max(trueProb + marketBias, 0.02), 0.98),
      won,
    };
  });
}

describe("blendProbability", () => {
  it("returns the model at weight 1 and the price at weight 0", () => {
    expect(blendProbability(0.7, 0.5, 1)).toBeCloseTo(0.7, 6);
    expect(blendProbability(0.7, 0.5, 0)).toBeCloseTo(0.5, 6);
  });

  it("interpolates in between and clamps the weight", () => {
    expect(blendProbability(0.7, 0.5, 0.5)).toBeCloseTo(0.6, 6);
    expect(blendProbability(0.7, 0.5, 9)).toBeCloseTo(0.7, 6);
    expect(blendProbability(0.7, 0.5, -3)).toBeCloseTo(0.5, 6);
  });
});

describe("brierAtWeight", () => {
  it("is zero for a perfect forecast and one for a perfectly wrong one", () => {
    expect(brierAtWeight([{ modelProb: 0.999, marketProb: 0.999, won: true }], 1)).toBeCloseTo(0, 3);
    expect(brierAtWeight([{ modelProb: 0.001, marketProb: 0.001, won: true }], 1)).toBeCloseTo(1, 2);
  });

  it("is zero for an empty history rather than NaN", () => {
    expect(brierAtWeight([], 0.5)).toBe(0);
  });
});

describe("fitBlendWeight", () => {
  it("leans on the model when the model is the accurate view", () => {
    const fit = fitBlendWeight(history({ count: 200, modelBias: 0, marketBias: 0.15 }));

    expect(fit.usable).toBe(true);
    expect(fit.weight).toBeGreaterThan(0.6);
    expect(fit.modelBrier).toBeLessThan(fit.marketBrier);
  });

  it("leans on the price when the price is the accurate view", () => {
    const fit = fitBlendWeight(history({ count: 200, modelBias: 0.15, marketBias: 0 }));

    expect(fit.weight).toBeLessThan(0.4);
    expect(fit.marketBrier).toBeLessThan(fit.modelBrier);
    expect(fit.note).toContain("price");
  });

  it("never scores the fitted weight worse than either pure view in sample", () => {
    const fit = fitBlendWeight(history({ count: 200, modelBias: 0.08, marketBias: -0.08 }));

    expect(fit.blendBrier).toBeLessThanOrEqual(fit.modelBrier + 1e-9);
    expect(fit.blendBrier).toBeLessThanOrEqual(fit.marketBrier + 1e-9);
  });

  it("judges the weight on rows it was never fitted to", () => {
    const fit = fitBlendWeight(history({ count: 200, modelBias: 0.1, marketBias: -0.1 }), {
      holdoutFraction: 0.3,
    });

    expect(fit.holdoutSample).toBe(60);
    expect(fit.holdoutBlendBrier).toBeDefined();
    expect(fit.holdoutModelBrier).toBeDefined();
    expect(fit.holdoutMarketBrier).toBeDefined();
  });

  it("refuses to fit a thin history", () => {
    const fit = fitBlendWeight(history({ count: 10, modelBias: 0, marketBias: 0.1 }), { minSample: 40 });

    expect(fit.usable).toBe(false);
    expect(fit.weight).toBe(0);
    expect(fit.note).toContain("40 are needed");
  });

  it("says plainly when the fitted weight did not hold up out of sample", () => {
    // Model and price are equally wrong in the same direction, so no blend helps.
    const fit = fitBlendWeight(history({ count: 120, modelBias: 0.12, marketBias: 0.12 }));

    expect(fit.improvedOutOfSample).toBe(false);
    expect(fit.note).toContain("unproven");
  });

  it("drops rows with unusable probabilities", () => {
    const fit = fitBlendWeight([
      ...history({ count: 60, modelBias: 0, marketBias: 0.1 }),
      { modelProb: Number.NaN, marketProb: 0.5, won: true },
      { modelProb: 0.5, marketProb: 0, won: false },
      { modelProb: 1, marketProb: 0.5, won: true },
    ]);

    expect(fit.sample).toBe(60);
  });
});

describe("blendSamplesFromLedger", () => {
  it("keeps graded rows, drops the rest, and orders oldest first", () => {
    const samples = blendSamplesFromLedger([
      { modelProb: 0.6, impliedProb: 0.55, ledgerOutcome: "won", commenceTime: "2026-03-01T00:00:00Z" },
      { modelProb: 0.5, impliedProb: 0.52, ledgerOutcome: "lost", commenceTime: "2026-01-01T00:00:00Z" },
      { modelProb: 0.7, impliedProb: 0.6, ledgerOutcome: "pending", commenceTime: "2026-02-01T00:00:00Z" },
      { modelProb: 0.7, impliedProb: 0.6, ledgerOutcome: "push", commenceTime: "2026-02-01T00:00:00Z" },
    ]);

    expect(samples).toHaveLength(2);
    expect(samples[0].won).toBe(false);
    expect(samples[1].won).toBe(true);
  });
});
