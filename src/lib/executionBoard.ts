import {
  americanToImpliedProb,
  formatEdge,
  formatOdds,
  formatProb,
  isThreeWaySport,
  type ExecutionFactors,
  type GamePrediction,
} from "@/lib/predictions";
import type { LiveMarketGame } from "@/lib/liveSports";

export type ExecutionBoardStatus = "tracked" | "watch" | "pass";
export type ExecutionLedgerOutcome = "pending" | "won" | "lost" | "push";

export interface ExecutionBoardEntry {
  id: string;
  gameId: string;
  sport: LiveMarketGame["sport"];
  sportLabel: string;
  eventLabel: string;
  recommendedSide: string;
  opposingSide: string;
  sideLocation: "Home" | "Away" | "Draw";
  status: ExecutionBoardStatus;
  ledgerOutcome: ExecutionLedgerOutcome;
  marketState: LiveMarketGame["status"]["state"];
  displayTime: string;
  commenceTime: string;
  bookmaker?: string;
  entryOdds: number;
  openOdds?: number;
  closeOdds?: number;
  modelProb: number;
  impliedProb: number;
  rawEdge: number;
  executionAdjustedEdge: number;
  confidence: number;
  kellyPct: number;
  suggestedStake: number;
  executionWindow: string;
  openToCurrentDelta: number;
  closeLineValue?: number;
  score: number;
  factors: ExecutionFactors;
  summary: {
    line: string;
    model: string;
    raw: string;
    execution: string;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getTimingScore(window: string) {
  switch (window) {
    case "Same window":
      return 5;
    case "Today":
      return 3;
    case "Final hour":
      return 1;
    case "Final 15m":
      return -1;
    case "Near close":
      return -2;
    case "Live":
      return -4;
    default:
      return 0;
  }
}

function getCloseLineValue(entryOdds: number, closeOdds?: number) {
  if (closeOdds === undefined) return undefined;
  return (americanToImpliedProb(closeOdds) - americanToImpliedProb(entryOdds)) * 100;
}

// Grade a recommended side against a final score. Soccer is a 3-way market:
// a Draw bet wins on level scores, and a Home/Away moneyline LOSES on a draw
// (it does not push the way a 2-way NBA/NFL/MLB tie would).
export function gradeOutcome(
  sport: LiveMarketGame["sport"],
  homeScore: number,
  awayScore: number,
  recommendedSide: string,
  sideLocation: "Home" | "Away" | "Draw",
): Exclude<ExecutionLedgerOutcome, "pending"> {
  const level = homeScore === awayScore;
  if (sideLocation === "Draw") {
    return level ? "won" : "lost";
  }
  if (level) {
    return isThreeWaySport(sport) ? "lost" : "push";
  }
  const winner = homeScore > awayScore ? "Home" : "Away";
  return winner === sideLocation ? "won" : "lost";
}

function getLedgerOutcome(
  game: LiveMarketGame,
  recommendedSide: string,
  sideLocation: "Home" | "Away" | "Draw",
): ExecutionLedgerOutcome {
  if (game.status.state !== "post" || game.homeScore === undefined || game.awayScore === undefined) {
    return "pending";
  }

  return gradeOutcome(game.sport, game.homeScore, game.awayScore, recommendedSide, sideLocation);
}

export function scoreExecutionBoardEntry({
  rawEdge,
  executionAdjustedEdge,
  confidence,
  kellyPct,
  openToCurrentDelta,
  closeLineValue,
  factors,
}: {
  rawEdge: number;
  executionAdjustedEdge: number;
  confidence: number;
  kellyPct: number;
  openToCurrentDelta: number;
  closeLineValue?: number;
  factors: ExecutionFactors;
}) {
  const executionSignal = executionAdjustedEdge * 4.8;
  const rawSignal = Math.max(rawEdge, 0) * 1.7;
  const confidenceSignal = clamp((confidence - 0.5) * 100, 0, 30);
  const stakeSignal = clamp(kellyPct * 100 * 1.2, 0, 18);
  const timingSignal = getTimingScore(factors.executionWindow);
  const marketSignal = clamp(-openToCurrentDelta * 30, -10, 10);
  const clvSignal = clamp((closeLineValue ?? 0) * 2.5, -12, 12);
  const liquiditySignal = clamp((factors.liquidityFactor - 1) * 50, -5, 5);
  const penaltySignal = (factors.correlationPenalty + factors.newsVolatilityPenalty) * 8;

  return Number(
    clamp(
      executionSignal +
        rawSignal +
        confidenceSignal +
        stakeSignal +
        timingSignal +
        marketSignal +
        clvSignal +
        liquiditySignal -
        penaltySignal,
      -99,
      99,
    ).toFixed(1),
  );
}

export function createExecutionBoardEntry(game: LiveMarketGame, prediction: GamePrediction): ExecutionBoardEntry | null {
  if (!game.odds || !prediction.valueBet) {
    return null;
  }

  const recommendedSide = prediction.valueBet.team;
  const sideLocation = prediction.valueBet.location;
  const entryOdds = prediction.valueBet.odds;
  // The draw outcome has no open/close history in the feed.
  const openOdds = sideLocation === "Home" ? game.odds.homeMoneylineOpen : sideLocation === "Away" ? game.odds.awayMoneylineOpen : undefined;
  const closeOdds = sideLocation === "Home" ? game.odds.homeMoneylineClose : sideLocation === "Away" ? game.odds.awayMoneylineClose : undefined;
  const closeLineValue = getCloseLineValue(entryOdds, closeOdds);
  const score = scoreExecutionBoardEntry({
    rawEdge: prediction.valueBet.rawEdge,
    executionAdjustedEdge: prediction.valueBet.executionAdjustedEdge,
    confidence: prediction.confidence,
    kellyPct: prediction.valueBet.kellyPct,
    openToCurrentDelta: prediction.executionFactors.openToCurrentDelta,
    closeLineValue,
    factors: prediction.executionFactors,
  });

  return {
    id: `${game.id}:${recommendedSide}`,
    gameId: game.id,
    sport: game.sport,
    sportLabel: game.sportLabel,
    eventLabel: `${game.awayTeam} at ${game.homeTeam}`,
    recommendedSide,
    opposingSide: recommendedSide === game.homeTeam ? game.awayTeam : game.homeTeam,
    sideLocation,
    status: "tracked",
    ledgerOutcome: getLedgerOutcome(game, recommendedSide, sideLocation),
    marketState: game.status.state,
    displayTime: game.displayTime,
    commenceTime: game.date,
    bookmaker: game.bookmaker,
    entryOdds,
    openOdds,
    closeOdds,
    modelProb: prediction.valueBet.modelProb,
    impliedProb: prediction.valueBet.impliedProb,
    rawEdge: prediction.valueBet.rawEdge,
    executionAdjustedEdge: prediction.valueBet.executionAdjustedEdge,
    confidence: prediction.confidence,
    kellyPct: prediction.valueBet.kellyPct,
    suggestedStake: prediction.valueBet.suggestedBet,
    executionWindow: prediction.executionFactors.executionWindow,
    openToCurrentDelta: prediction.executionFactors.openToCurrentDelta,
    closeLineValue,
    score,
    factors: prediction.executionFactors,
    summary: {
      line: formatOdds(entryOdds),
      model: formatProb(prediction.valueBet.modelProb),
      raw: formatEdge(prediction.valueBet.rawEdge),
      execution: formatEdge(prediction.valueBet.executionAdjustedEdge),
    },
  };
}
