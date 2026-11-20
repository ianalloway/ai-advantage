import * as netlifyBlobs from "@netlify/blobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@netlify/blobs", async () => (await import("../tests/helpers/blobsMock")).blobsModule);

import { blobValues, resetBlobs } from "../tests/helpers/blobsMock";
import handler, { LEDGER_PREVIEW_ROWS } from "./execution-ledger";
import {
  createEntitlementSession,
  entitlementSessionCookie,
  getEntitlementStore,
  upsertEntitlement,
} from "../netlify/functions/_lib/entitlements";

const blobs = Buffer.from(JSON.stringify({ url: "https://blob.invalid" })).toString("base64");
const WRITE_TOKEN = "ledger-write-token-for-tests";
const TOTAL_ROWS = 30;

function response() {
  return {
    statusCode: 200,
    body: null as unknown as { rows: Array<{ id: string }>; full?: boolean },
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body as typeof this.body; },
    send(body: string) { this.body = body as unknown as typeof this.body; },
    setHeader(name: string, value: string) { this.headers[name] = value; },
  };
}

async function get(query: Record<string, string>, cookie = "") {
  const res = response();
  await handler({ blobs, method: "GET", query, headers: { host: "example.test", cookie } }, res);
  return res;
}

async function cookieFor(tier: "event" | "premium") {
  const store = getEntitlementStore({ blobs, headers: {} })!;
  const record = await upsertEntitlement(store, {
    id: `test-${tier}`, tier, source: "stripe", label: tier, status: "active",
    activatedAt: new Date().toISOString(),
    expiresAt: tier === "event" ? new Date(Date.now() + 3_600_000).toISOString() : undefined,
  });
  const session = await createEntitlementSession(store, record);
  return entitlementSessionCookie({ host: "example.test" }, session.token, session.maxAge).split(";")[0];
}

beforeEach(async () => {
  resetBlobs();
  vi.stubEnv("EXECUTION_LEDGER_WRITE_TOKEN", WRITE_TOKEN);
  const entries = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
    id: `row-${i}`, eventLabel: `Game ${i}`, sportLabel: "NBA", recommendedSide: "Home",
    executionWindow: "pregame", entryOdds: -110, executionAdjustedEdge: 0.03, ledgerOutcome: "won",
  }));
  const seeded = response();
  await handler({
    blobs, method: "POST", query: { limit: "500" }, body: { entries },
    headers: { host: "example.test", authorization: `Bearer ${WRITE_TOKEN}` },
  }, seeded);
  expect(seeded.statusCode).toBe(200);
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("execution ledger archive access", () => {
  it("gives anonymous callers only a bounded preview, whatever they ask for", async () => {
    for (const query of [{ limit: "250" }, { limit: "500", view: "full" }]) {
      const res = await get(query);
      expect(res.statusCode).toBe(200);
      expect(res.body.full).toBe(false);
      expect(res.body.rows).toHaveLength(LEDGER_PREVIEW_ROWS);
    }
  });

  it("gives an event pass the preview: the archive is a Pro feature", async () => {
    const res = await get({ limit: "250", view: "full" }, await cookieFor("event"));
    expect(res.body.full).toBe(false);
    expect(res.body.rows).toHaveLength(LEDGER_PREVIEW_ROWS);
  });

  it("returns the full archive to an active Pro entitlement", async () => {
    const res = await get({ limit: "250", view: "full" }, await cookieFor("premium"));
    expect(res.body.full).toBe(true);
    expect(res.body.rows).toHaveLength(TOTAL_ROWS);
  });

  it("marks every read as private and uncacheable", async () => {
    for (const cookie of ["", await cookieFor("premium")]) {
      const res = await get({ limit: "250" }, cookie);
      expect(res.headers["Cache-Control"]).toBe("private, no-store");
    }
  });
});

describe("execution ledger concurrent writers", () => {
  it("reports a retryable failure if every attempted update conflicts", async () => {
    const getStore = netlifyBlobs.getStore;
    const replace = vi.fn().mockResolvedValue({ modified: false });
    const spy = vi.spyOn(netlifyBlobs, "getStore").mockImplementation((options) => {
      const store = getStore(options);
      return Object.assign(store, { setJSON: replace });
    });
    try {
      const res = response();
      await handler({
        blobs, method: "POST", headers: { authorization: `Bearer ${WRITE_TOKEN}` },
        body: { entries: [{
          id: "row-1", eventLabel: "Game 1", sportLabel: "NBA", recommendedSide: "Home",
          executionWindow: "pregame", entryOdds: -110, executionAdjustedEdge: 0.03, ledgerOutcome: "won",
        }] },
      }, res);
      expect(res.statusCode).toBe(503);
      expect(res.headers["Retry-After"]).toBe("1");
      expect(replace).toHaveBeenCalledTimes(5);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps simultaneous updates to distinct rows and counts both observations of a shared row", async () => {
    const sendEntries = async (ids: string[]) => {
      const res = response();
      const entries = ids.map((id) => ({
        id, eventLabel: "Regular game", sportLabel: "NBA", recommendedSide: "Home",
        executionWindow: "pregame", entryOdds: -110, executionAdjustedEdge: 0.03, ledgerOutcome: "pending",
      }));
      await handler({
        blobs, method: "POST", headers: { authorization: `Bearer ${WRITE_TOKEN}` }, body: { entries },
      }, res);
      return res.statusCode;
    };
    expect(await Promise.all([sendEntries(["first", "row-0"]), sendEntries(["second", "row-0"])]))
      .toEqual([200, 200]);
    const rows = Array.from(blobValues("ai-advantage-ledger").values())[0] as Array<{ id: string; snapshotCount: number }>;
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(["first", "second"]));
    expect(rows.find((r) => r.id === "row-0")?.snapshotCount).toBe(3);
  });
});
