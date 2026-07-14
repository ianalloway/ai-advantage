/** CSV helpers for desk / proof-ledger exports. */

export function toCsv(rows: Array<Record<string, string | number | boolean | undefined | null>>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  const escape = (value: string | number | boolean | undefined | null) => {
    if (value === undefined || value === null) return "";
    const text = String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };

  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function deskRowsFromPicks(
  picks: Array<{
    game: {
      id: string;
      sport: string;
      homeTeam: string;
      awayTeam: string;
      date: string;
      bookmaker?: string;
      marketSource?: string;
      odds: null | {
        homeMoneyline: number;
        awayMoneyline: number;
        drawMoneyline?: number;
        homeMoneylineOpen?: number;
        awayMoneylineOpen?: number;
        homeMoneylineClose?: number;
        awayMoneylineClose?: number;
      };
    };
    prediction: {
      predictedWinner: string;
      confidence: number;
      executionAdjustedEdge: number;
      valueBet: null | {
        team: string;
        location: string;
        odds: number;
        modelProb: number;
        rawEdge: number;
        executionAdjustedEdge: number;
        kellyPct: number;
        suggestedBet: number;
      };
    };
  }>,
) {
  return picks.map(({ game, prediction }) => {
    const vb = prediction.valueBet;
    const side = vb?.location ?? "";
    const open =
      side === "Home" ? game.odds?.homeMoneylineOpen : side === "Away" ? game.odds?.awayMoneylineOpen : undefined;
    const close =
      side === "Home" ? game.odds?.homeMoneylineClose : side === "Away" ? game.odds?.awayMoneylineClose : undefined;
    return {
      gameId: game.id,
      sport: game.sport,
      event: `${game.awayTeam} at ${game.homeTeam}`,
      commence: game.date,
      bookmaker: game.bookmaker ?? "",
      marketSource: game.marketSource ?? "",
      lean: prediction.predictedWinner,
      confidence: Number(prediction.confidence.toFixed(4)),
      execEdge: Number(prediction.executionAdjustedEdge.toFixed(2)),
      valueSide: vb?.team ?? "",
      entryOdds: vb?.odds ?? "",
      modelProb: vb ? Number(vb.modelProb.toFixed(4)) : "",
      rawEdge: vb ? Number(vb.rawEdge.toFixed(2)) : "",
      kellyPct: vb ? Number((vb.kellyPct * 100).toFixed(2)) : "",
      suggestedStake: vb ? Number(vb.suggestedBet.toFixed(2)) : "",
      openOdds: open ?? "",
      closeOdds: close ?? "",
      reference: "ESPN PickCenter / public line",
    };
  });
}

export function ledgerRowsFromEntries(
  entries: Array<{
    id: string;
    sport: string;
    eventLabel: string;
    recommendedSide: string;
    sideLocation: string;
    entryOdds: number;
    openOdds?: number;
    closeOdds?: number;
    closeLineValue?: number;
    modelProb: number;
    rawEdge: number;
    executionAdjustedEdge: number;
    kellyPct: number;
    suggestedStake: number;
    ledgerOutcome: string;
    commenceTime: string;
    bookmaker?: string;
  }>,
) {
  return entries.map((entry) => ({
    id: entry.id,
    sport: entry.sport,
    event: entry.eventLabel,
    side: entry.recommendedSide,
    location: entry.sideLocation,
    commence: entry.commenceTime,
    bookmaker: entry.bookmaker ?? "",
    entryOdds: entry.entryOdds,
    openOdds: entry.openOdds ?? "",
    closeOdds: entry.closeOdds ?? "",
    clvPts: entry.closeLineValue !== undefined ? Number(entry.closeLineValue.toFixed(3)) : "",
    modelProb: Number(entry.modelProb.toFixed(4)),
    rawEdge: Number(entry.rawEdge.toFixed(2)),
    execEdge: Number(entry.executionAdjustedEdge.toFixed(2)),
    kellyPct: Number((entry.kellyPct * 100).toFixed(2)),
    suggestedStake: Number(entry.suggestedStake.toFixed(2)),
    outcome: entry.ledgerOutcome,
    reference: "ESPN PickCenter / public line",
  }));
}
