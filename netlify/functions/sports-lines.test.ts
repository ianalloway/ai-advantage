import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@netlify/blobs", async () => (await import("../../tests/helpers/blobsMock")).blobsModule);

import { fetchEspnScoreboardWithLookahead, handler, selectUpcomingEvents } from "./sports-lines";

function event(id: string, date: string, state: "pre" | "in" | "post" = "pre") {
  return {
    id,
    date,
    competitions: [
      {
        competitors: [
          { homeAway: "home" as const, team: { displayName: `Home ${id}`, abbreviation: "HOM" } },
          { homeAway: "away" as const, team: { displayName: `Away ${id}`, abbreviation: "AWY" } },
        ],
        status: { type: { state, detail: "", shortDetail: "", completed: state === "post" } },
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** ESPN as of Nov 2026: single dates work, ranges 400. */
function mockEspn(byDay: Record<string, unknown[]>, summary: unknown = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      calls.push(url.toString());
      if (url.pathname.endsWith("/summary")) return jsonResponse(summary);
      const dates = url.searchParams.get("dates") ?? "";
      if (!/^\d{8}$/.test(dates)) {
        return jsonResponse({ code: 400, message: "Failed to get events endpoint." }, 400);
      }
      return jsonResponse({ events: byDay[dates] ?? [] });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ESPN off-day lookahead", () => {
  it("returns today's events without looking ahead", async () => {
    const calls = mockEspn({ "20261102": [event("a", "2026-11-03T00:00Z", "post")] });
    const events = await fetchEspnScoreboardWithLookahead("nba", "20261102");
    expect(events.map((e) => e.id)).toEqual(["a"]);
    expect(calls).toHaveLength(1);
  });

  it("falls back to per-day requests when ESPN rejects the date range", async () => {
    mockEspn({
      "20261104": [event("b", "2026-11-05T00:30Z"), event("c", "2026-11-05T00:00Z")],
      "20261105": [event("d", "2026-11-06T00:00Z")],
    });
    const events = await fetchEspnScoreboardWithLookahead("nba", "20261103");
    expect(events.map((e) => e.id)).toEqual(["c", "b", "d"]);
  });

  it("stays empty when nothing is scheduled in the lookahead window", async () => {
    mockEspn({});
    await expect(fetchEspnScoreboardWithLookahead("mlb", "20261103")).resolves.toEqual([]);
  });

  it("keeps only upcoming games, de-duplicated and capped", () => {
    const many = Array.from({ length: 12 }, (_, i) => event(`e${i}`, `2026-11-${String(5 + i).padStart(2, "0")}T00:00Z`));
    const selected = selectUpcomingEvents([event("done", "2026-11-04T00:00Z", "post"), many[0], ...many]);
    expect(selected[0].id).toBe("e0");
    expect(selected).toHaveLength(8);
    expect(new Set(selected.map((e) => e.id)).size).toBe(8);
  });

  it("serves the next priced slate on an empty day instead of an empty board", async () => {
    mockEspn(
      { "20261104": [event("401", "2026-11-05T00:00Z")] },
      {
        pickcenter: [
          {
            provider: { name: "DraftKings" },
            homeTeamOdds: { moneyLine: -130 },
            awayTeamOdds: { moneyLine: 110 },
          },
        ],
      },
    );
    const res = await handler({ httpMethod: "GET", queryStringParameters: { sports: "nba", date: "20261103" } });
    const body = JSON.parse(res.body) as { games: Array<{ id: string; odds: unknown }> };
    expect(res.statusCode).toBe(200);
    expect(body.games).toHaveLength(1);
    expect(body.games[0].odds).toBeTruthy();
  });
});
