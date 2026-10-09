import { EXECUTION_LEDGER_STORE, withObjectStore } from "@/lib/browserDatabase";
import type { ExecutionBoardEntry } from "@/lib/executionBoard";
import type { AccessTier } from "@/lib/stripe";

export interface HistoricalExecutionLedgerEntry extends ExecutionBoardEntry {
  firstSeenAt: string;
  lastSeenAt: string;
  snapshotCount: number;
  accessTier: AccessTier;
}

interface LedgerArchiveResponse {
  configured: boolean;
  /** False when the server returned only the free preview. */
  full?: boolean;
  rows: HistoricalExecutionLedgerEntry[];
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function upsertExecutionLedgerEntries(
  entries: ExecutionBoardEntry[],
  accessTier: AccessTier = "free",
): Promise<void> {
  if (typeof window === "undefined" || entries.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  await withObjectStore(EXECUTION_LEDGER_STORE, "readwrite", async (store) => {
    for (const entry of entries) {
      const existing = await requestToPromise(store.get(entry.id) as IDBRequest<HistoricalExecutionLedgerEntry | undefined>);
      const record: HistoricalExecutionLedgerEntry = {
        ...existing,
        ...entry,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        snapshotCount: (existing?.snapshotCount ?? 0) + 1,
        accessTier,
      };
      await requestToPromise(store.put(record));
    }
  });
}

export async function hydrateExecutionLedgerEntries(
  rows: HistoricalExecutionLedgerEntry[],
): Promise<void> {
  if (typeof window === "undefined" || rows.length === 0) {
    return;
  }

  await withObjectStore(EXECUTION_LEDGER_STORE, "readwrite", async (store) => {
    for (const row of rows) {
      await requestToPromise(store.put(row));
    }
  });
}

export async function listExecutionLedgerEntries(limit = 100): Promise<HistoricalExecutionLedgerEntry[]> {
  if (typeof window === "undefined") {
    return [];
  }

  return withObjectStore(EXECUTION_LEDGER_STORE, "readonly", async (store) => {
    const rows = await requestToPromise(store.getAll() as IDBRequest<HistoricalExecutionLedgerEntry[]>);
    return rows
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
      .slice(0, limit);
  });
}

export async function syncExecutionLedgerEntries(
  entries: ExecutionBoardEntry[],
  accessTier: AccessTier = "free",
  options: { full?: boolean } = {},
): Promise<HistoricalExecutionLedgerEntry[]> {
  if (typeof window === "undefined" || entries.length === 0) {
    return [];
  }

  await upsertExecutionLedgerEntries(entries, accessTier);
  return listExecutionLedgerArchive(250, options);
}

function mergeById(primary: HistoricalExecutionLedgerEntry[], extra: HistoricalExecutionLedgerEntry[], limit: number) {
  const byId = new Map(extra.map((row) => [row.id, row]));
  for (const row of primary) byId.set(row.id, row);
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, limit);
}

/**
 * Read the shared archive. The server decides what the caller may see: Pro
 * callers get the full archive, everyone else a short preview, which is merged
 * into this browser's own locally tracked rows rather than replacing them.
 * `full` only asks for the archive; it grants nothing on its own.
 */
export async function listExecutionLedgerArchive(
  limit = 100,
  options: { full?: boolean } = {},
): Promise<HistoricalExecutionLedgerEntry[]> {
  const localRows = await listExecutionLedgerEntries(limit);

  if (typeof window === "undefined") {
    return localRows;
  }

  try {
    const view = options.full ? "full" : "preview";
    const response = await fetch(`/api/execution-ledger?limit=${limit}&view=${view}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      return localRows;
    }

    const data = (await response.json()) as LedgerArchiveResponse;
    if (data.rows.length > 0) {
      await hydrateExecutionLedgerEntries(data.rows);
      return data.full ? data.rows : mergeById(localRows, data.rows, limit);
    }
  } catch {
    return localRows;
  }

  return localRows;
}
