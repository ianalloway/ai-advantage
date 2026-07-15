/**
 * Hourly: email subscribers when the live desk has execution edges above their floor.
 */
import { analyzeGame } from "../../src/lib/predictions";
import { getEntitlementStore } from "./_lib/entitlements";
import { appendFunnelEvent } from "../lib/funnel";
import type { EdgeAlertSubscription } from "../../api/edge-alerts";

const FEED_URL =
  (process.env.PUBLIC_APP_URL || "https://aiadvantagesports.com") +
  "/api/sports-lines?sports=nba,mlb,nfl,wc";
const SUBS_KEY = "ai-advantage:edge-alerts:subs";

type FeedGame = {
  id: string;
  sport: "nba" | "nfl" | "mlb" | "wc";
  homeTeam: string;
  awayTeam: string;
  date: string;
  status: { state: string };
  bookmaker?: string;
  odds: null | {
    homeMoneyline: number;
    awayMoneyline: number;
    drawMoneyline?: number;
    homeMoneylineOpen?: number;
    awayMoneylineOpen?: number;
  };
};

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from || /your_|placeholder/i.test(key)) {
    return { ok: false, reason: "resend_not_configured" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  return { ok: response.ok, reason: response.ok ? "sent" : `http_${response.status}` };
}

export default async () => {
  const store = getEntitlementStore();
  if (!store) return { ok: false, reason: "no_store" };

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { ok: false, reason: "resend_missing" };
  }

  const subs = ((await store.get<EdgeAlertSubscription[]>(SUBS_KEY)) ?? []).filter((s) => s.enabled);
  if (subs.length === 0) return { ok: true, sent: 0 };

  const feedRes = await fetch(FEED_URL, { signal: AbortSignal.timeout(12000) });
  if (!feedRes.ok) return { ok: false, reason: "feed_failed" };
  const feed = (await feedRes.json()) as { games?: FeedGame[] };
  const games = (feed.games ?? []).filter((g) => g.odds);

  const picks = games
    .map((game) => {
      const prediction = analyzeGame(game.homeTeam, game.awayTeam, game.sport, 1000, 3, 0.25, {
        id: game.id,
        bookmaker: game.bookmaker,
        commenceTime: game.date,
        homeOdds: game.odds!.homeMoneyline,
        awayOdds: game.odds!.awayMoneyline,
        drawOdds: game.odds!.drawMoneyline,
        homeOpenOdds: game.odds!.homeMoneylineOpen,
        awayOpenOdds: game.odds!.awayMoneylineOpen,
        isLive: game.status.state === "in",
      });
      return { game, prediction };
    })
    .filter((row) => row.prediction.valueBet)
    .sort(
      (a, b) =>
        (b.prediction.valueBet?.executionAdjustedEdge ?? 0) -
        (a.prediction.valueBet?.executionAdjustedEdge ?? 0),
    );

  const dayKey = new Date().toISOString().slice(0, 10);
  let sent = 0;

  for (const sub of subs) {
    const qualifying = picks.filter(
      (row) => (row.prediction.valueBet?.executionAdjustedEdge ?? 0) >= sub.minExecEdge,
    );
    if (qualifying.length === 0) continue;

    const dedupeKey = `ai-advantage:edge-alerts:sent:${sub.email}:${dayKey}:${sub.minExecEdge}`;
    if (await store.get<string>(dedupeKey)) continue;

    const top = qualifying.slice(0, 5);
    const lines = top.map((row) => {
      const vb = row.prediction.valueBet!;
      return `• ${row.game.awayTeam} @ ${row.game.homeTeam} — ${vb.team} (${vb.odds > 0 ? "+" : ""}${vb.odds}) · exec edge ${vb.executionAdjustedEdge.toFixed(1)}% · Kelly $${vb.suggestedBet.toFixed(0)}`;
    });

    const subject = `${qualifying.length} edge${qualifying.length === 1 ? "" : "s"} ≥ ${sub.minExecEdge}% on the AI Advantage desk`;
    const text = [
      "Execution desk alert (vs ESPN PickCenter — not a sharp consensus).",
      "",
      ...lines,
      "",
      "Open the board: https://aiadvantagesports.com/daily-picks",
      "Manage alerts: https://aiadvantagesports.com/profile",
    ].join("\n");
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2>Edges cleared your ${sub.minExecEdge}% floor</h2>
      <p style="color:#555">Reference: ESPN PickCenter public line. Execution-adjusted edge after timing/liquidity discount.</p>
      <ul>${top
        .map((row) => {
          const vb = row.prediction.valueBet!;
          return `<li><strong>${row.game.awayTeam} @ ${row.game.homeTeam}</strong> — ${vb.team} (${vb.odds > 0 ? "+" : ""}${vb.odds}) · exec ${vb.executionAdjustedEdge.toFixed(1)}% · Kelly $${vb.suggestedBet.toFixed(0)}</li>`;
        })
        .join("")}</ul>
      <p><a href="https://aiadvantagesports.com/daily-picks">Open Daily Picks</a></p>
    </div>`;

    const result = await sendEmail(sub.email, subject, html, text);
    if (result.ok) {
      await store.set(dedupeKey, new Date().toISOString(), { ex: 60 * 60 * 36 });
      await appendFunnelEvent(store, {
        name: "edge_alert_sent",
        email: sub.email,
        userId: sub.userId,
        meta: { count: qualifying.length, minExecEdge: sub.minExecEdge },
      });
      sent += 1;
    }
  }

  return { ok: true, sent, subscribers: subs.length, qualifyingBoard: picks.length };
};

export const config = {
  schedule: "@hourly",
};
