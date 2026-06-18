import { connectLambda, getStore } from "@netlify/blobs";
import { Redis } from "@upstash/redis";
import { timingSafeEqual } from "node:crypto";

type NetlifyEvent = {
  blobs?: string;
  body: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
  queryStringParameters?: Record<string, string | undefined> | null;
};

type AccessTier = "free" | "event" | "premium";
type LedgerOutcome = "pending" | "won" | "lost" | "push";

interface ExecutionLedgerEntryInput {
  id: string;
  eventLabel: string;
  sportLabel: string;
  recommendedSide: string;
  executionWindow: string;
  entryOdds: number;
  executionAdjustedEdge: number;
  ledgerOutcome: LedgerOutcome;
  bookmaker?: string;
}

interface HistoricalExecutionLedgerEntry extends ExecutionLedgerEntryInput {
  firstSeenAt: string;
  lastSeenAt: string;
  snapshotCount: number;
  accessTier: AccessTier;
}

interface LedgerStore {
  get: () => Promise<HistoricalExecutionLedgerEntry[]>;
  set: (rows: HistoricalExecutionLedgerEntry[]) => Promise<void>;
}

const LEDGER_KEY = process.env.EXECUTION_LEDGER_KEY || "ai-advantage:execution-ledger";
const MAX_ROWS = 500;

let redisClient: Redis | null | undefined;

function getRedis() {
  if (redisClient !== undefined) return redisClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = null;
    return redisClient;
  }

  redisClient = Redis.fromEnv();
  return redisClient;
}

function normalizeLambdaHeaders(headers: NetlifyEvent["headers"]) {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => (typeof value === "string" ? [[key.toLowerCase(), value]] : [])),
  );
}

function getHeader(headers: NetlifyEvent["headers"], name: string) {
  const lowerName = name.toLowerCase();
  const match = Object.entries(headers).find(([key, value]) => key.toLowerCase() === lowerName && value);
  return match?.[1];
}

function safeTokenEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isWriteAuthorized(event: NetlifyEvent) {
  const expectedToken = process.env.EXECUTION_LEDGER_WRITE_TOKEN;
  if (!expectedToken) return false;

  const authHeader = getHeader(event.headers, "authorization");
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearerToken ?? getHeader(event.headers, "x-execution-ledger-token");

  return Boolean(token && safeTokenEquals(token, expectedToken));
}

function isLedgerRows(value: unknown): value is HistoricalExecutionLedgerEntry[] {
  return Array.isArray(value);
}

function getLedgerStore(event: NetlifyEvent): LedgerStore | null {
  if (event.blobs) {
    try {
      connectLambda({
        blobs: event.blobs,
        headers: normalizeLambdaHeaders(event.headers),
      });

      const store = getStore("ai-advantage-ledger");
      return {
        async get() {
          const value = (await store.get(LEDGER_KEY, { type: "json" })) as unknown;
          return isLedgerRows(value) ? value : [];
        },
        async set(rows) {
          await store.setJSON(LEDGER_KEY, rows);
        },
      };
    } catch (error) {
      console.warn("Netlify Blobs ledger store is unavailable; checking fallback store.", error);
    }
  }

  const redis = getRedis();
  if (!redis) return null;

  return {
    async get() {
      const value = await redis.get<HistoricalExecutionLedgerEntry[]>(LEDGER_KEY);
      return isLedgerRows(value) ? value : [];
    },
    async set(rows) {
      await redis.set(LEDGER_KEY, rows);
    },
  };
}

function response(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function parseLimit(query: NetlifyEvent["queryStringParameters"]) {
  const value = Number(query?.limit);
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.min(Math.floor(value), MAX_ROWS);
}

function sortRows(rows: HistoricalExecutionLedgerEntry[]) {
  return [...rows].sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

function normalizeRows(rows: HistoricalExecutionLedgerEntry[]) {
  return sortRows(rows)
    .filter((row) => !/^probe-|^test-/i.test(row.id) && !/backend probe|test row/i.test(row.eventLabel))
    .slice(0, MAX_ROWS);
}

function mergeRows(
  existingRows: HistoricalExecutionLedgerEntry[],
  nextRows: ExecutionLedgerEntryInput[],
  accessTier: AccessTier,
) {
  const now = new Date().toISOString();
  const rowsById = new Map(existingRows.map((row) => [row.id, row]));

  nextRows.forEach((entry) => {
    const existing = rowsById.get(entry.id);
    rowsById.set(entry.id, {
      ...existing,
      ...entry,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      snapshotCount: (existing?.snapshotCount ?? 0) + 1,
      accessTier,
    });
  });

  return normalizeRows(Array.from(rowsById.values()));
}

function isAccessTier(value: unknown): value is AccessTier {
  return value === "free" || value === "event" || value === "premium";
}

function isExecutionLedgerEntryInput(value: unknown): value is ExecutionLedgerEntryInput {
  if (!value || typeof value !== "object") return false;

  const row = value as Partial<ExecutionLedgerEntryInput>;
  return (
    typeof row.id === "string" &&
    typeof row.eventLabel === "string" &&
    typeof row.sportLabel === "string" &&
    typeof row.recommendedSide === "string" &&
    typeof row.executionWindow === "string" &&
    typeof row.entryOdds === "number" &&
    typeof row.executionAdjustedEdge === "number" &&
    (row.ledgerOutcome === "pending" ||
      row.ledgerOutcome === "won" ||
      row.ledgerOutcome === "lost" ||
      row.ledgerOutcome === "push")
  );
}

function parseBody(event: NetlifyEvent) {
  if (!event.body) return {};
  try {
    const parsed = JSON.parse(event.body) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const handler = async (event: NetlifyEvent) => {
  const store = getLedgerStore(event);

  if (!store) {
    return response(503, {
      configured: false,
      rows: [],
      message: "No shared ledger backend is configured yet.",
    });
  }

  if (event.httpMethod === "GET") {
    try {
      const limit = parseLimit(event.queryStringParameters);
      const rows = normalizeRows(await store.get()).slice(0, limit);
      return response(200, { configured: true, rows });
    } catch (error) {
      console.error("Unable to read the shared execution ledger.", error);
      return response(500, { configured: true, rows: [], message: "Unable to read the shared execution ledger." });
    }
  }

  if (event.httpMethod === "POST") {
    if (!isWriteAuthorized(event)) {
      return response(403, {
        configured: true,
        rows: [],
        message: "Shared execution ledger writes require a server-side write token.",
      });
    }

    try {
      const payload = parseBody(event);
      const rows = Array.isArray(payload.entries) ? payload.entries.filter(isExecutionLedgerEntryInput) : [];
      const accessTier = isAccessTier(payload.accessTier) ? payload.accessTier : "free";

      if (rows.length === 0) {
        return response(400, { configured: true, rows: [], message: "Missing execution ledger entries." });
      }

      const existingRows = await store.get();
      const mergedRows = mergeRows(existingRows, rows, accessTier);
      await store.set(mergedRows);

      return response(200, {
        configured: true,
        rows: mergedRows.slice(0, parseLimit(event.queryStringParameters)),
        total: mergedRows.length,
      });
    } catch (error) {
      console.error("Unable to update the shared execution ledger.", error);
      return response(500, { configured: true, rows: [], message: "Unable to update the shared execution ledger." });
    }
  }

  return response(405, { configured: true, rows: [], message: "Method not allowed." });
};
