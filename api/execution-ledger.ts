import { Redis } from "@upstash/redis";

type RequestLike = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
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

const LEDGER_KEY = process.env.EXECUTION_LEDGER_KEY || "ai-advantage:execution-ledger";
const MAX_ROWS = 500;
const MAX_POST_ROWS = 50;
const MAX_TEXT_LENGTH = 160;

function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return Redis.fromEnv();
}

function parseLimit(query: RequestLike["query"]) {
  const rawLimit = query?.limit;
  const value = Number(Array.isArray(rawLimit) ? rawLimit[0] : rawLimit);
  if (!Number.isFinite(value) || value <= 0) {
    return 100;
  }

  return Math.min(Math.floor(value), MAX_ROWS);
}

function clampText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, MAX_TEXT_LENGTH);
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sortRows(rows: HistoricalExecutionLedgerEntry[]) {
  return [...rows].sort(
    (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
  );
}

function normalizeRows(rows: HistoricalExecutionLedgerEntry[]) {
  return sortRows(rows).slice(0, MAX_ROWS);
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

function normalizeExecutionLedgerEntry(value: unknown): ExecutionLedgerEntryInput | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Partial<ExecutionLedgerEntryInput>;
  const id = clampText(row.id);
  const eventLabel = clampText(row.eventLabel);
  const sportLabel = clampText(row.sportLabel);
  const recommendedSide = clampText(row.recommendedSide);
  const executionWindow = clampText(row.executionWindow);
  const entryOdds = finiteNumber(row.entryOdds);
  const executionAdjustedEdge = finiteNumber(row.executionAdjustedEdge);
  const bookmaker = clampText(row.bookmaker);

  if (
    !id ||
    !eventLabel ||
    !sportLabel ||
    !recommendedSide ||
    !executionWindow ||
    entryOdds === null ||
    executionAdjustedEdge === null ||
    (row.ledgerOutcome !== "pending" &&
      row.ledgerOutcome !== "won" &&
      row.ledgerOutcome !== "lost" &&
      row.ledgerOutcome !== "push")
  ) {
    return null;
  }

  return {
    id,
    eventLabel,
    sportLabel,
    recommendedSide,
    executionWindow,
    entryOdds,
    executionAdjustedEdge,
    ledgerOutcome: row.ledgerOutcome,
    ...(bookmaker ? { bookmaker } : {}),
  };
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  const redis = getRedis();
  if (!redis) {
    res.status(503).json({
      configured: false,
      rows: [],
      message: "Upstash Redis is not configured for the shared execution ledger yet.",
    });
    return;
  }

  if (req.method === "GET") {
    try {
      const limit = parseLimit(req.query);
      const rows = sortRows((await redis.get<HistoricalExecutionLedgerEntry[]>(LEDGER_KEY)) ?? []).slice(0, limit);
      res.status(200).json({ configured: true, rows });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to read the shared execution ledger.";
      res.status(500).send(message);
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const payload =
        req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const submittedRows = Array.isArray(payload.entries)
        ? payload.entries.slice(0, MAX_POST_ROWS)
        : [];
      const rows = submittedRows
        .map(normalizeExecutionLedgerEntry)
        .filter((row): row is ExecutionLedgerEntryInput => Boolean(row));
      const accessTier = isAccessTier(payload.accessTier) ? payload.accessTier : "free";

      if (rows.length === 0) {
        res.status(400).send("Missing valid execution ledger entries.");
        return;
      }

      const existingRows = (await redis.get<HistoricalExecutionLedgerEntry[]>(LEDGER_KEY)) ?? [];
      const mergedRows = mergeRows(existingRows, rows, accessTier);
      await redis.set(LEDGER_KEY, mergedRows);

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
