import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLiveGamesForSports, LiveMarketUnavailableError } from "./liveSports";

/**
 * These cover one distinction: an unreachable market feed is not the same as a
 * day with no games. The fetch used to collapse both into `[]`, which made the
 * error branches on the homepage, Daily Picks, and the Proof Ledger dead code —
 * an outage rendered as "the desk is passing instead of inventing a signal."
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Routes by URL so the primary API and the ESPN fallback can fail independently. */
function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(handler(String(input))),
  ) as unknown as typeof fetch;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchLiveGamesForSports", () => {
  it("throws when the primary API and every ESPN fallback fail", async () => {
    stubFetch(() => {
      throw new Error("network down");
    });

    await expect(fetchLiveGamesForSports(["nba"])).rejects.toBeInstanceOf(LiveMarketUnavailableError);
  });

  it("resolves empty when the primary API reports a genuinely empty slate", async () => {
    stubFetch((url) => {
      if (url.includes("/api/sports-lines")) return jsonResponse({ games: [] });
      throw new Error("ESPN should not be consulted after a successful primary call");
    });

    await expect(fetchLiveGamesForSports(["nba"])).resolves.toEqual([]);
  });

  it("returns the primary API slate when it answers", async () => {
    const games = [{ id: "g1" }];
    stubFetch((url) => {
      if (url.includes("/api/sports-lines")) return jsonResponse({ games });
      throw new Error("unexpected fallback");
    });

    await expect(fetchLiveGamesForSports(["nba"])).resolves.toEqual(games);
  });

  it("does not throw when the primary API fails but a fallback slate lands", async () => {
    stubFetch((url) => {
      if (url.includes("/api/sports-lines")) throw new Error("function offline");
      // An ESPN scoreboard with no events is a reachable source reporting no games.
      return jsonResponse({ events: [] });
    });

    await expect(fetchLiveGamesForSports(["nba"])).resolves.toEqual([]);
  });

  it("resolves empty for an empty sport list rather than reporting an outage", async () => {
    stubFetch(() => {
      throw new Error("should not be called");
    });

    await expect(fetchLiveGamesForSports([])).resolves.toEqual([]);
  });
});
