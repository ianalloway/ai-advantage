/**
 * In-game win probability.
 *
 * The board already shows live games with live prices, and has nothing to say
 * about them: every probability on the desk is a pregame number. This prices a
 * game in progress from the only two things that matter once it starts — the
 * lead, and how much time is left to erase it.
 *
 * The model treats the remaining margin as a diffusion: what is still to come is
 * normally distributed, with a spread that shrinks as the clock runs down. That
 * is the standard approximation, and it is deliberately blind to possession,
 * fouls, pitching changes and who has the ball. It is a probability, not a
 * broadcast graphic.
 */

import { isThreeWaySport, type Sport } from "@/lib/predictions";
import { isValidMoneyline } from "@/lib/oddsValidation";
import { americanToImpliedProb } from "@/lib/predictions";
import { normalCdf, probToSpread, SPORT_MARGIN_SD } from "@/lib/spreadTranslation";

interface RegulationShape {
  periods: number;
  /** Seconds in one period, or undefined for a sport without a clock. */
  periodSeconds?: number;
  /** Seconds in one overtime period. */
  overtimeSeconds?: number;
}

export const REGULATION: Record<Sport, RegulationShape> = {
  nba: { periods: 4, periodSeconds: 720, overtimeSeconds: 300 },
  nfl: { periods: 4, periodSeconds: 900, overtimeSeconds: 600 },
  // Baseball has no clock; the inning is the unit of time remaining.
  mlb: { periods: 9 },
  wc: { periods: 2, periodSeconds: 2700, overtimeSeconds: 900 },
};

export interface LiveGameState {
  sport: Sport;
  homeScore: number;
  awayScore: number;
  period?: number;
  /** Display clock counting down within the period, e.g. "5:23". */
  clock?: string;
  state: "pre" | "in" | "post";
}

export interface LiveWinProbability {
  applicable: boolean;
  homeWinProb: number;
  awayWinProb: number;
  /** Share of the game still to be played, 0 at the final whistle. */
  fractionRemaining: number;
  /** Lead from the home side's perspective. */
  margin: number;
  note: string;
}

const NOT_APPLICABLE = (note: string): LiveWinProbability => ({
  applicable: false,
  homeWinProb: 0,
  awayWinProb: 0,
  fractionRemaining: 1,
  margin: 0,
  note,
});

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

/** Seconds left in the period from a display clock. Returns undefined if unreadable. */
export function parseClockSeconds(clock?: string): number | undefined {
  if (!clock) return undefined;
  const match = clock.trim().match(/^(\d+):(\d{1,2})(?:\.\d+)?$/);
  if (!match) return undefined;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return undefined;
  return minutes * 60 + seconds;
}

/**
 * Share of the game still to play. Clock sports count seconds; baseball counts
 * innings, which is coarser but is the only unit it has.
 */
export function fractionRemaining(state: LiveGameState): number {
  const shape = REGULATION[state.sport];
  if (state.state === "pre") return 1;
  if (state.state === "post") return 0;

  const period = state.period ?? 1;

  // Overtime: regulation is spent, and only the extra period is left to run.
  if (period > shape.periods) {
    if (!shape.periodSeconds || !shape.overtimeSeconds) return 0.05;
    const left = parseClockSeconds(state.clock) ?? shape.overtimeSeconds;
    return clamp(left / (shape.periods * shape.periodSeconds), 0, 1);
  }

  if (!shape.periodSeconds) {
    // Innings: the half-inning is not modelled, so this is deliberately coarse.
    const inningsLeft = Math.max(0, shape.periods - period + 1);
    return clamp(inningsLeft / shape.periods, 0, 1);
  }

  const secondsLeftInPeriod = parseClockSeconds(state.clock) ?? shape.periodSeconds;
  const periodsAfterThis = Math.max(0, shape.periods - period);
  const totalSeconds = shape.periods * shape.periodSeconds;
  return clamp((secondsLeftInPeriod + periodsAfterThis * shape.periodSeconds) / totalSeconds, 0, 1);
}

export function liveWinProbability(
  state: LiveGameState,
  options: { pregameHomeProb?: number } = {},
): LiveWinProbability {
  if (isThreeWaySport(state.sport)) {
    return NOT_APPLICABLE("A market with a draw needs a three-way model; no live number shown.");
  }
  if (state.state === "pre") {
    return NOT_APPLICABLE("Game has not started — the pregame model owns this one.");
  }
  if (!Number.isFinite(state.homeScore) || !Number.isFinite(state.awayScore)) {
    return NOT_APPLICABLE("No live score to price from.");
  }

  const margin = state.homeScore - state.awayScore;
  const remaining = fractionRemaining(state);

  if (state.state === "post" || remaining <= 0) {
    const homeWinProb = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
    return {
      applicable: true,
      homeWinProb,
      awayWinProb: 1 - homeWinProb,
      fractionRemaining: 0,
      margin,
      note: margin === 0 ? "Level at full time — heading to extra time." : "Final.",
    };
  }

  const sigma = SPORT_MARGIN_SD[state.sport] * Math.sqrt(remaining);
  // Whatever pregame edge existed still applies, but only over the time left:
  // the pregame margin, pro-rated to the share of the game still to play.
  const pregameEdge =
    options.pregameHomeProb !== undefined
      ? probToSpread(options.pregameHomeProb, state.sport) * remaining
      : 0;

  const homeWinProb = clamp(normalCdf((margin + pregameEdge) / Math.max(sigma, 1e-6)), 0.001, 0.999);

  return {
    applicable: true,
    homeWinProb: Number(homeWinProb.toFixed(4)),
    awayWinProb: Number((1 - homeWinProb).toFixed(4)),
    fractionRemaining: Number(remaining.toFixed(4)),
    margin,
    note: describeLiveState(margin, remaining, homeWinProb),
  };
}

export function describeLiveState(margin: number, remaining: number, homeWinProb: number): string {
  const minutesLabel = `${Math.round(remaining * 100)}% of the game left`;
  if (Math.abs(margin) === 0) return `Level with ${minutesLabel}.`;
  const leader = margin > 0 ? "Home" : "Away";
  const leaderProb = margin > 0 ? homeWinProb : 1 - homeWinProb;
  return `${leader} by ${Math.abs(margin)} with ${minutesLabel} — ${(leaderProb * 100).toFixed(0)}% to hold it.`;
}

/**
 * Live edge in probability points: the in-game model against the live price.
 * Positive means the model rates the side higher than the market is pricing it.
 */
export function liveEdgePts(liveProb: number, americanOdds: number): number | undefined {
  if (!isValidMoneyline(americanOdds)) return undefined;
  return Number(((liveProb - americanToImpliedProb(americanOdds)) * 100).toFixed(2));
}
