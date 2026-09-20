import { describe, expect, it } from "vitest";
import { americanToImpliedProb } from "./predictions";
import {
  STEAM_CENTS_THRESHOLD,
  STEAM_PTS_THRESHOLD,
  classifySteam,
  formatSteamBadge,
  formatSteamChip,
  formatSteamDeskBadge,
  formatSteamPath,
  openToNowMoveCents,
  openToNowMovePts,
  steamChipClassName,
  summarizeSteamDesk,
} from "./steamLens";

describe("openToNowMovePts / openToNowMoveCents", () => {
  it("treats shortening (-120 → -140) as positive pts (steam toward lean)", () => {
    const pts = openToNowMovePts(-120, -140);
    expect(pts).toBeGreaterThan(0);
    expect(pts).toBeCloseTo(
      (americanToImpliedProb(-140) - americanToImpliedProb(-120)) * 100,
    );
    expect(openToNowMoveCents(-120, -140)).toBe(-20);
  });

  it("treats lengthening (-110 → +100) as negative pts (steam against lean)", () => {
    const pts = openToNowMovePts(-110, 100);
    expect(pts).toBeLessThan(0);
    expect(openToNowMoveCents(-110, 100)).toBe(210);
  });
});

describe("classifySteam", () => {
  it("returns unknown when open or current is missing", () => {
    expect(classifySteam({}).classification).toBe("unknown");
    expect(classifySteam({ openOdds: -110 }).classification).toBe("unknown");
    expect(classifySteam({ currentOdds: -110 }).classification).toBe("unknown");
    expect(formatSteamBadge(classifySteam({ openOdds: -110 }))).toBeNull();
    expect(formatSteamChip(classifySteam({}))).toBeNull();
  });

  it("returns quiet for sub-threshold moves", () => {
    // -110 → -112 is 2 cents and ~0.4 pts — below both floors
    const result = classifySteam({ openOdds: -110, currentOdds: -112 });
    expect(Math.abs(result.moveCents ?? 0)).toBeLessThan(STEAM_CENTS_THRESHOLD);
    expect(Math.abs(result.movePts ?? 0)).toBeLessThan(STEAM_PTS_THRESHOLD);
    expect(result.classification).toBe("quiet");
    expect(formatSteamChip(result)).toBeNull();
  });

  it("flags steamed_toward when lean shortens past the cents threshold", () => {
    // Ticker band: ±8 American. -110 → -120 = 10 cents + ~2.2 pts
    const result = classifySteam({ openOdds: -110, currentOdds: -120 });
    expect(result.classification).toBe("steamed_toward");
    expect(result.movePts).toBeGreaterThan(STEAM_PTS_THRESHOLD);
    expect(Math.abs(result.moveCents ?? 0)).toBeGreaterThanOrEqual(STEAM_CENTS_THRESHOLD);
    expect(formatSteamChip(result)).toBe("STEAM");
    expect(formatSteamBadge(result)).toMatch(/Steam toward/);
    expect(formatSteamPath(result)).toContain("Open");
    expect(steamChipClassName(result.classification)).toContain("orange");
  });

  it("flags steamed_against when lean lengthens past the threshold", () => {
    // -150 → -130 = +20 cents, implied fell → reverse steam
    const result = classifySteam({ openOdds: -150, currentOdds: -130 });
    expect(result.classification).toBe("steamed_against");
    expect(result.movePts).toBeLessThan(0);
    expect(formatSteamChip(result)).toBe("REV");
    expect(formatSteamBadge(result)).toMatch(/Reverse steam/);
    expect(steamChipClassName(result.classification)).toContain("violet");
  });

  it("clears the cents floor at exactly ±8 American", () => {
    // +100 → +108: 8 cents; implied falls → reverse steam on the lean
    const result = classifySteam({ openOdds: 100, currentOdds: 108 });
    expect(Math.abs(result.moveCents ?? 0)).toBe(STEAM_CENTS_THRESHOLD);
    expect(result.movePts).toBeLessThan(0);
    expect(result.classification).toBe("steamed_against");
  });
});

describe("classifySteam direction on plus-money", () => {
  it("plus-money shortening (+200 → +150) is steam toward", () => {
    // Implied rose: 33.3% → 40%
    const result = classifySteam({ openOdds: 200, currentOdds: 150 });
    expect(result.movePts).toBeGreaterThan(0);
    expect(result.classification).toBe("steamed_toward");
  });

  it("plus-money lengthening (+150 → +200) is steam against", () => {
    const result = classifySteam({ openOdds: 150, currentOdds: 200 });
    expect(result.movePts).toBeLessThan(0);
    expect(result.classification).toBe("steamed_against");
  });
});

describe("summarizeSteamDesk", () => {
  it("returns empty zeros for an empty book", () => {
    const summary = summarizeSteamDesk([]);
    expect(summary).toEqual({
      sample: 0,
      known: 0,
      unknown: 0,
      steamedToward: 0,
      steamedAgainst: 0,
      quiet: 0,
      meanAbsMovePts: undefined,
      meanMovePts: undefined,
    });
    expect(formatSteamDeskBadge(summary)).toBe("No picks");
  });

  it("counts unknown when opens are missing", () => {
    const summary = summarizeSteamDesk([
      { currentOdds: -110 },
      { openOdds: -110 },
    ]);
    expect(summary.sample).toBe(2);
    expect(summary.unknown).toBe(2);
    expect(summary.known).toBe(0);
    expect(formatSteamDeskBadge(summary)).toBe("2 opens unknown");
  });

  it("aggregates mixed steam / reverse / quiet", () => {
    const summary = summarizeSteamDesk([
      { openOdds: -110, currentOdds: -125 }, // steam toward
      { openOdds: -150, currentOdds: -130 }, // reverse
      { openOdds: -110, currentOdds: -111 }, // quiet
      { openOdds: -105 }, // unknown
    ]);
    expect(summary.sample).toBe(4);
    expect(summary.steamedToward).toBe(1);
    expect(summary.steamedAgainst).toBe(1);
    expect(summary.quiet).toBe(1);
    expect(summary.unknown).toBe(1);
    expect(summary.known).toBe(3);
    expect(summary.meanAbsMovePts).toBeGreaterThan(0);
    expect(formatSteamDeskBadge(summary)).toMatch(/steam/);
    expect(formatSteamDeskBadge(summary)).toMatch(/reverse/);
    expect(formatSteamDeskBadge(summary)).toMatch(/quiet/);
  });
});
