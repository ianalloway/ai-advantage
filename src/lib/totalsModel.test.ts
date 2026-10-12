import { describe, expect, it } from "vitest";
import { getTeamStats } from "./predictions";
import {
  ASSUMED_TOTAL_ODDS,
  overProbability,
  predictTotal,
  projectScores,
  SPORT_TOTAL_SD,
} from "./totalsModel";

const NBA_TEAM_NAMES = Object.keys(getTeamStats("nba"));
const [HOME, AWAY] = NBA_TEAM_NAMES;

describe("projectScores", () => {
  it("projects each side from what it scores and what the other concedes", () => {
    const projected = projectScores("nba", HOME, AWAY);

    expect(projected.total).toBeCloseTo(projected.home + projected.away, 2);
    // An NBA game lands somewhere sane rather than at a default.
    expect(projected.total).toBeGreaterThan(180);
    expect(projected.total).toBeLessThan(260);
  });

  it("falls back to league-average stats for an unknown team", () => {
    const known = projectScores("nba", HOME, AWAY);
    const unknown = projectScores("nba", "Springfield Isotopes", "Shelbyville Shelbyvillians");

    expect(unknown.total).toBeGreaterThan(0);
    expect(unknown.total).not.toBeCloseTo(known.total, 6);
  });
});

describe("overProbability", () => {
  it("is a coin flip when the model lands exactly on the line", () => {
    expect(overProbability(220, 220, "nba")).toBeCloseTo(0.5, 6);
  });

  it("rises as the projection climbs above the line", () => {
    const near = overProbability(222, 220, "nba");
    const far = overProbability(235, 220, "nba");

    expect(near).toBeGreaterThan(0.5);
    expect(far).toBeGreaterThan(near);
  });

  it("treats the same gap as bigger in a low-scoring sport", () => {
    // Three runs clear of a baseball total is far more than three points in the NBA.
    expect(overProbability(11, 8, "mlb")).toBeGreaterThan(overProbability(223, 220, "nba"));
    expect(SPORT_TOTAL_SD.mlb).toBeLessThan(SPORT_TOTAL_SD.nba);
  });
});

describe("predictTotal", () => {
  const base = { sport: "nba" as const, homeTeam: HOME, awayTeam: AWAY };

  it("takes the over when the line is set well below the projection", () => {
    const projected = projectScores("nba", HOME, AWAY);
    const result = predictTotal({ ...base, postedTotal: projected.total - 15 });

    expect(result.applicable).toBe(true);
    expect(result.side).toBe("over");
    expect(result.lineDifference).toBeGreaterThan(0);
    expect(result.edgePts).toBeGreaterThan(0);
    expect(result.kellyPct).toBeGreaterThan(0);
  });

  it("takes the under when the line is set well above the projection", () => {
    const projected = projectScores("nba", HOME, AWAY);
    const result = predictTotal({ ...base, postedTotal: projected.total + 15 });

    expect(result.side).toBe("under");
    expect(result.lineDifference).toBeLessThan(0);
    expect(result.underProb).toBeGreaterThan(result.overProb);
  });

  it("passes when the posted line sits on the projection", () => {
    const projected = projectScores("nba", HOME, AWAY);
    const result = predictTotal({ ...base, postedTotal: projected.total });

    expect(result.side).toBe("pass");
    expect(result.kellyPct).toBe(0);
    expect(result.suggestedStake).toBe(0);
    expect(result.note).toContain("not far enough from the line");
  });

  it("keeps the two sides summing to one", () => {
    const result = predictTotal({ ...base, postedTotal: 221.5 });
    expect(result.overProb + result.underProb).toBeCloseTo(1, 4);
  });

  it("says when it is pricing against an assumed number", () => {
    const assumed = predictTotal({ ...base, postedTotal: 210 });
    const priced = predictTotal({ ...base, postedTotal: 210, overOdds: -105, underOdds: -115 });

    expect(assumed.priceAssumed).toBe(true);
    expect(assumed.note).toContain("standard -110");
    expect(priced.priceAssumed).toBe(false);
    expect(priced.note).not.toContain("standard -110");
    expect(ASSUMED_TOTAL_ODDS).toBe(-110);
  });

  it("uses a real price when the feed supplies one", () => {
    const cheap = predictTotal({ sport: "nba", homeTeam: HOME, awayTeam: AWAY, postedTotal: 210, overOdds: 120, underOdds: -140 });
    const standard = predictTotal({ sport: "nba", homeTeam: HOME, awayTeam: AWAY, postedTotal: 210 });

    // A longer price on the same side is more edge, not less.
    expect(cheap.edgePts).toBeGreaterThan(standard.edgePts);
  });

  it("respects the minimum edge before recommending a side", () => {
    const projected = projectScores("nba", HOME, AWAY);
    const loose = predictTotal({ ...base, postedTotal: projected.total - 4, minEdgePts: 1 });
    const strict = predictTotal({ ...base, postedTotal: projected.total - 4, minEdgePts: 25 });

    expect(loose.side).toBe("over");
    expect(strict.side).toBe("pass");
  });

  it("scales the stake with the bankroll", () => {
    const projected = projectScores("nba", HOME, AWAY);
    const small = predictTotal({ ...base, postedTotal: projected.total - 15, bankroll: 1000 });
    const large = predictTotal({ ...base, postedTotal: projected.total - 15, bankroll: 5000 });

    expect(large.suggestedStake).toBeCloseTo(small.suggestedStake * 5, 1);
  });

  it("declines a three-way sport and a missing line", () => {
    expect(predictTotal({ sport: "wc", homeTeam: "Brazil", awayTeam: "France", postedTotal: 2.5 }).applicable).toBe(false);
    expect(predictTotal({ ...base, postedTotal: 0 }).applicable).toBe(false);
    expect(predictTotal({ ...base, postedTotal: Number.NaN }).applicable).toBe(false);
  });
});
