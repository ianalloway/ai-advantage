// Scheduled job: settle the shared execution ledger.
//
// Runs hourly. Ingests qualifying value bets from the live feed as pending rows
// and grades any finished games against ESPN box scores, so the public proof
// ledger reflects real, settled results (wins and losses) instead of empty
// pending snapshots. Runs server-side with direct Blobs access, so it does not
// need the client-facing write token.
import { getStore } from "@netlify/blobs";
import {
  fetchEspnFinal,
  runSettlement,
  type FeedGame,
  type LedgerRow,
} from "../lib/ledgerSettlement";

const STORE_NAME = "ai-advantage-ledger";
const LEDGER_KEY = process.env.EXECUTION_LEDGER_KEY || "ai-advantage:execution-ledger";
const FEED_URL =
  (process.env.PUBLIC_APP_URL || "https://aiadvantagesports.com") +
  "/api/sports-lines?sports=nba,mlb,nfl,wc";

async function fetchFeed(): Promise<FeedGame[]> {
  const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { games?: FeedGame[] };
  return Array.isArray(data.games) ? data.games : [];
}

export default async () => {
  const store = getStore(STORE_NAME);

  let existing: LedgerRow[] = [];
  try {
    const value = (await store.get(LEDGER_KEY, { type: "json" })) as unknown;
    if (Array.isArray(value)) existing = value as LedgerRow[];
  } catch (error) {
    console.warn("settle-ledger: unable to read ledger store", error);
  }

  const result = await runSettlement(existing, {
    fetchFeed,
    fetchFinal: fetchEspnFinal,
  });

  try {
    await store.setJSON(LEDGER_KEY, result.rows);
  } catch (error) {
    console.error("settle-ledger: unable to write ledger store", error);
    return new Response(JSON.stringify({ ok: false, error: "write-failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      ingested: result.ingested,
      settled: result.settled,
      pending: result.pending,
      total: result.rows.length,
    }),
    { headers: { "content-type": "application/json" } },
  );
};

export const config = { schedule: "@hourly" };
