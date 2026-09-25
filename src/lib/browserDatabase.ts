const DB_NAME = "ai-advantage-terminal";
// v2 adds the user's own bet log beside the desk's execution ledger.
const DB_VERSION = 2;
const EXECUTION_LEDGER_STORE = "execution-ledger";
const BET_LOG_STORE = "bet-log";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EXECUTION_LEDGER_STORE)) {
        const store = db.createObjectStore(EXECUTION_LEDGER_STORE, { keyPath: "id" });
        store.createIndex("lastSeenAt", "lastSeenAt", { unique: false });
        store.createIndex("sportLabel", "sportLabel", { unique: false });
        store.createIndex("ledgerOutcome", "ledgerOutcome", { unique: false });
      }
      // Guarded the same way, so an existing v1 database upgrades without
      // touching the ledger rows already in it.
      if (!db.objectStoreNames.contains(BET_LOG_STORE)) {
        const store = db.createObjectStore(BET_LOG_STORE, { keyPath: "id" });
        store.createIndex("placedAt", "placedAt", { unique: false });
        store.createIndex("gameId", "gameId", { unique: false });
        store.createIndex("outcome", "outcome", { unique: false });
      }
    };
  });
}

export async function withObjectStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    Promise.resolve(action(store))
      .then((value) => {
        transaction.oncomplete = () => {
          db.close();
          resolve(value);
        };
      })
      .catch((error) => {
        transaction.abort();
        db.close();
        reject(error);
      });

    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };

    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    };
  });
}

export { BET_LOG_STORE, EXECUTION_LEDGER_STORE };
