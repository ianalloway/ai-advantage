/**
 * In-memory stand-in for @netlify/blobs with the semantics the app relies on:
 * JSON values, ETags, and onlyIfNew / onlyIfMatch conditional writes.
 *
 *   vi.mock("@netlify/blobs", async () => (await import("<path>/tests/helpers/blobsMock")).blobsModule);
 */
type Entry = { value: unknown; etag: string };

// Kept on globalThis so vi.resetModules() (simulated cold starts) re-imports
// the mock without losing or splitting the stored data.
type StoreCall = string | { name: string; consistency?: string };
const shared = globalThis as unknown as { __blobStores?: Map<string, Map<string, Entry>>; __getStoreCalls?: StoreCall[] };
shared.__blobStores ??= new Map();
shared.__getStoreCalls ??= [];
export const blobStores = shared.__blobStores;

/** Every getStore() argument since the last reset, to assert consistency modes. */
export const getStoreCalls = shared.__getStoreCalls;

export function resetBlobs() {
  blobStores.clear();
  getStoreCalls.length = 0;
}

/** Plain values of one store, keyed like the real store. */
export function blobValues(name: string) {
  return new Map(Array.from(blobStores.get(name) ?? new Map<string, Entry>(), ([key, entry]) => [key, entry.value]));
}

function storeFor(options: string | { name: string; consistency?: string }) {
  getStoreCalls.push(options);
  const name = typeof options === "string" ? options : options.name;
  if (!blobStores.has(name)) blobStores.set(name, new Map());
  const data = blobStores.get(name)!;
  return {
    get: async (key: string) => structuredClone(data.get(key)?.value ?? null),
    getWithMetadata: async (key: string) => {
      const entry = data.get(key);
      return entry ? { data: structuredClone(entry.value), etag: entry.etag, metadata: {} } : null;
    },
    setJSON: async (key: string, value: unknown, options?: { onlyIfNew?: boolean; onlyIfMatch?: string }) => {
      const current = data.get(key);
      if (options?.onlyIfNew && current) return { modified: false };
      if (options?.onlyIfMatch !== undefined && current?.etag !== options.onlyIfMatch) return { modified: false };
      const etag = `"${crypto.randomUUID()}"`;
      data.set(key, { value: structuredClone(value), etag });
      return { modified: true, etag };
    },
    delete: async (key: string) => {
      data.delete(key);
    },
  };
}

export const blobsModule = {
  connectLambda: () => undefined,
  setEnvironmentContext: () => undefined,
  getStore: storeFor,
};
