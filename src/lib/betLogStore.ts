import { BET_LOG_STORE, withObjectStore } from "@/lib/browserDatabase";
import type { BetLogEntry } from "@/lib/betLog";

/**
 * The bet log lives in the browser only. It is the user's own record of what
 * they actually took — it is never synced to the shared ledger, because the
 * shared ledger is the desk's proof of its picks, not a claim about anyone's
 * real money.
 */

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function listBetLogEntries(limit = 200): Promise<BetLogEntry[]> {
  if (typeof window === "undefined") return [];

  return withObjectStore(BET_LOG_STORE, "readonly", async (store) => {
    const rows = await requestToPromise(store.getAll() as IDBRequest<BetLogEntry[]>);
    return rows
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
      .slice(0, limit);
  });
}

export async function putBetLogEntry(entry: BetLogEntry): Promise<void> {
  if (typeof window === "undefined") return;
  await withObjectStore(BET_LOG_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put(entry));
  });
}

export async function putBetLogEntries(entries: BetLogEntry[]): Promise<void> {
  if (typeof window === "undefined" || entries.length === 0) return;
  await withObjectStore(BET_LOG_STORE, "readwrite", async (store) => {
    for (const entry of entries) {
      await requestToPromise(store.put(entry));
    }
  });
}

export async function removeBetLogEntry(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  await withObjectStore(BET_LOG_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}

export async function clearBetLog(): Promise<void> {
  if (typeof window === "undefined") return;
  await withObjectStore(BET_LOG_STORE, "readwrite", async (store) => {
    await requestToPromise(store.clear());
  });
}
