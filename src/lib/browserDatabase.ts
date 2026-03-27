const DB_NAME = "ai-advantage-terminal";
const DB_VERSION = 1;
const EXECUTION_LEDGER_STORE = "execution-ledger";

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

export { EXECUTION_LEDGER_STORE };
