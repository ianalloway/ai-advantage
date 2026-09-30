import { describe, expect, it } from "vitest";
import { americanToImpliedProb } from "./predictions";
import { probToAmericanOdds } from "./devig";
import {
  driftSamplesFromLedger,
  fitCloseDrift,
  formatCloseRecommendation,
  projectClose,
  type DriftSample,
} from "./closeForecast";

/**
 * Build a synthetic archive where a known share of each open-to-now move
 * carries on into the close, so the fit has a right answer to recover.
 */
function archive(carryThrough: number, count = 60, noisePts = 0): DriftSample[] {
  return Array.from({ length: count }, (_, index) => {
    const openProb = 0.4 + (index % 10) * 0.02;
    const movePts = ((index % 7) - 3) * 0.8;
    const nowProb = openProb + movePts / 100;
    const noise = noisePts === 0 ? 0 : (((index * 37) % 11) - 5) * (noisePts / 5);
    const closeProb = nowProb + (movePts * carryThrough + noise) / 100;
    return {
      openOdds: probToAmericanOdds(openProb),
      nowOdds: probToAmericanOdds(nowProb),
      closeOdds: probToAmericanOdds(closeProb),
    };
  });
}

describe("fitCloseDrift", () => {
  it("recovers a momentum relationship from the archive", () => {
    const fit = fitCloseDrift(archive(0.5));

    expect(fit.usable).toBe(true);
    expect(fit.slope).toBeGreaterThan(0.3);
    expect(fit.rSquared).toBeGreaterThan(0.5);
    expect(fit.note).toContain("carried on into the close");
  });

  it("recovers a mean-reverting relationship", () => {
    const fit = fitCloseDrift(archive(-0.4));

    expect(fit.usable).toBe(true);
    expect(fit.slope).toBeLessThan(0);
    expect(fit.note).toContain("given back");
  });

  it("refuses to fit a thin archive", () => {
    const fit = fitCloseDrift(archive(0.5, 10), { minSample: 30 });

    expect(fit.usable).toBe(false);
    expect(fit.sample).toBe(10);
    expect(fit.note).toContain("30 are needed");
  });

  it("refuses to project when the archive explains nothing", () => {
    // Pure noise: the close has no relationship to the move so far.
    const noise: DriftSample[] = Array.from({ length: 60 }, (_, index) => {
      const openProb = 0.45 + (index % 5) * 0.01;
      const nowProb = openProb + (((index % 7) - 3) * 0.8) / 100;
      const closeProb = nowProb + ((((index * 17) % 13) - 6) * 0.9) / 100;
      return {
        openOdds: probToAmericanOdds(openProb),
        nowOdds: probToAmericanOdds(nowProb),
        closeOdds: probToAmericanOdds(closeProb),
      };
    });

    const fit = fitCloseDrift(noise, { minRSquared: 0.2 });
    expect(fit.usable).toBe(false);
    expect(fit.note).toContain("Treat the number in front of you as the number");
  });

  it("refuses to fit when every line moved identically", () => {
    const flat: DriftSample[] = Array.from({ length: 40 }, () => ({
      openOdds: -110,
      nowOdds: -120,
      closeOdds: -130,
    }));

    const fit = fitCloseDrift(flat);
    expect(fit.usable).toBe(false);
    expect(fit.note).toContain("nothing to fit against");
  });

  it("ignores rows with unusable prices", () => {
    const fit = fitCloseDrift([...archive(0.5, 40), { openOdds: 0, nowOdds: -110, closeOdds: -120 }]);
    expect(fit.sample).toBe(40);
  });
});

describe("projectClose", () => {
  const fit = fitCloseDrift(archive(0.5));

  it("says take the number when the move is projected to keep shortening it", () => {
    // The line has already moved against the bettor, and moves carry on.
    const now = probToAmericanOdds(0.56);
    const open = probToAmericanOdds(0.5);
    const projection = projectClose(fit, { openOdds: open, nowOdds: now });

    expect(projection.expectedClvPts).toBeGreaterThan(0);
    expect(projection.recommendation).toBe("take-now");
    expect(americanToImpliedProb(projection.projectedCloseOdds!)).toBeGreaterThan(0.56 - 0.01);
  });

  it("says it can wait when the price is projected to get longer", () => {
    const now = probToAmericanOdds(0.44);
    const open = probToAmericanOdds(0.5);
    const projection = projectClose(fit, { openOdds: open, nowOdds: now });

    expect(projection.expectedClvPts).toBeLessThan(0);
    expect(projection.recommendation).toBe("can-wait");
    expect(projection.rationale).toContain("risk that it does not");
  });

  it("carries the fit's own error as the projection band", () => {
    const projection = projectClose(fit, {
      openOdds: probToAmericanOdds(0.5),
      nowOdds: probToAmericanOdds(0.55),
    });

    expect(projection.lowPts).toBeLessThan(projection.projectedMovePts);
    expect(projection.highPts).toBeGreaterThan(projection.projectedMovePts);
  });

  it("projects nothing from an unusable fit", () => {
    const thin = fitCloseDrift(archive(0.5, 5), { minSample: 30 });
    const projection = projectClose(thin, { openOdds: -110, nowOdds: -130 });

    expect(projection.recommendation).toBe("no-signal");
    expect(projection.expectedClvPts).toBe(0);
    expect(projection.projectedCloseOdds).toBeUndefined();
  });

  it("projects nothing without an opening price", () => {
    const projection = projectClose(fit, { nowOdds: -130 });

    expect(projection.recommendation).toBe("no-signal");
    expect(projection.rationale).toContain("No opening price");
  });

  it("stays quiet when the projected move is within a quarter point", () => {
    const flat = probToAmericanOdds(0.5);
    const projection = projectClose(fit, { openOdds: flat, nowOdds: flat });

    expect(projection.recommendation).toBe("no-signal");
    expect(Math.abs(projection.expectedClvPts)).toBeLessThan(0.25);
  });
});

describe("driftSamplesFromLedger", () => {
  it("keeps only rows with a full open-to-close path", () => {
    const samples = driftSamplesFromLedger([
      { openOdds: -110, entryOdds: -120, closeOdds: -130 },
      { entryOdds: -120, closeOdds: -130 },
      { openOdds: -110, entryOdds: -120 },
    ]);

    expect(samples).toHaveLength(1);
    expect(samples[0].nowOdds).toBe(-120);
  });
});

describe("formatCloseRecommendation", () => {
  it("labels each recommendation", () => {
    expect(formatCloseRecommendation("take-now")).toBe("Take the number");
    expect(formatCloseRecommendation("can-wait")).toBe("Can wait");
    expect(formatCloseRecommendation("no-signal")).toBe("No drift signal");
  });
});
