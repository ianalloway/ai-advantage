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
): Promise<HistoricalExecutionLedgerEntry[]> {
  if (typeof window === "undefined" || entries.length === 0) {
    return [];
  }

  const response = await fetch("/api/execution-ledger", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      entries,
      accessTier,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as LedgerArchiveResponse;
  if (data.rows.length > 0) {
    await hydrateExecutionLedgerEntries(data.rows);
  }

  return data.rows;
}

export async function listExecutionLedgerArchive(limit = 100): Promise<HistoricalExecutionLedgerEntry[]> {
  const localRows = await listExecutionLedgerEntries(limit);

  if (typeof window === "undefined") {
    return localRows;
  }

  try {
    const response = await fetch(`/api/execution-ledger?limit=${limit}`);
    if (!response.ok) {
      return localRows;
    }

    const data = (await response.json()) as LedgerArchiveResponse;
    if (data.rows.length > 0) {
      await hydrateExecutionLedgerEntries(data.rows);
      return data.rows;
    }
  } catch {
    return localRows;
  }

  return localRows;
}
