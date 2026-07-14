import { connectLambda, getStore } from "@netlify/blobs";
import { Redis } from "@upstash/redis";
import { timingSafeEqual } from "node:crypto";

type RequestLike = {
  blobs?: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  send: (body: string) => void;
  setHeader: (name: string, value: string) => void;
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

function getHeader(headers: RequestLike["headers"], name: string) {
  if (!headers) return undefined;
  const direct = headers[name];
  const lower = headers[name.toLowerCase()];
  const value = direct ?? lower;
  return Array.isArray(value) ? value[0] : value;
}

function safeTokenEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function isWriteAuthorized(req: RequestLike) {
  const expectedToken = process.env.EXECUTION_LEDGER_WRITE_TOKEN;
  if (!expectedToken) {
    return false;
  }

  const authHeader = getHeader(req.headers, "authorization");
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearerToken ?? getHeader(req.headers, "x-execution-ledger-token");

  return Boolean(token && safeTokenEquals(token, expectedToken));
}

function getRedis() {
  if (redisClient !== undefined) return redisClient;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = null;
    return redisClient;
  }

  redisClient = Redis.fromEnv();
  return redisClient;
}

function normalizeLambdaHeaders(headers: RequestLike["headers"]) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).flatMap(([key, value]) => {
      const flat = Array.isArray(value) ? value[0] : value;
      return typeof flat === "string" ? [[key.toLowerCase(), flat]] : [];
    }),
  );
}

function isLedgerRows(value: unknown): value is HistoricalExecutionLedgerEntry[] {
  return Array.isArray(value);
}

function getLedgerStore(req: RequestLike): LedgerStore | null {
  if (req.blobs) {
    try {
      connectLambda({
        blobs: req.blobs,
        headers: normalizeLambdaHeaders(req.headers),
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

function parseLimit(query: RequestLike["query"]) {
  const rawLimit = query?.limit;
  const value = Number(Array.isArray(rawLimit) ? rawLimit[0] : rawLimit);
  if (!Number.isFinite(value) || value <= 0) {
    return 100;
  }

  return Math.min(Math.floor(value), MAX_ROWS);
}

function sortRows(rows: HistoricalExecutionLedgerEntry[]) {
  return [...rows].sort(
    (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
  );
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

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  const store = getLedgerStore(req);
  if (!store) {
    res.status(503).json({
      configured: false,
      rows: [],
      message: "No shared ledger backend is configured yet.",
    });
    return;
  }

  if (req.method === "GET") {
    try {
      const limit = parseLimit(req.query);
      const rows = normalizeRows(await store.get()).slice(0, limit);
      res.status(200).json({ configured: true, rows });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to read the shared execution ledger.";
      res.status(500).send(message);
    }
    return;
  }

  if (req.method === "POST") {
    if (!isWriteAuthorized(req)) {
      res.status(403).send("Shared execution ledger writes require a server-side write token.");
      return;
    }

    try {
      const payload =
        req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const rows = Array.isArray(payload.entries)
        ? payload.entries.filter(isExecutionLedgerEntryInput)
        : [];
      const accessTier = isAccessTier(payload.accessTier) ? payload.accessTier : "free";

      if (rows.length === 0) {
        res.status(400).send("Missing execution ledger entries.");
        return;
      }

      const existingRows = await store.get();
      const mergedRows = mergeRows(existingRows, rows, accessTier);
      await store.set(mergedRows);

      res.status(200).json({
        configured: true,
        rows: mergedRows.slice(0, parseLimit(req.query)),
        total: mergedRows.length,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update the shared execution ledger.";
      res.status(500).send(message);
    }
    return;
  }

  res.status(405).send("Method not allowed.");
}
