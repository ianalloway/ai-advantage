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
const shared = globalThis as unknown as {
  __blobStores?: Map<string, Map<string, Entry>>;
  __getStoreCalls?: StoreCall[];
  __blobsContext?: { uncached: boolean };
};
shared.__blobStores ??= new Map();
shared.__getStoreCalls ??= [];
// Like the real library, the environment context is global and set by
// connectLambda() (which carries no uncached edge URL) or setEnvironmentContext(),
// and each store captures it when getStore() is called. Strong reads fail on a
// store created while the context had no uncached URL.
shared.__blobsContext ??= { uncached: false };
const context = shared.__blobsContext;
export const blobStores = shared.__blobStores;

/** Every getStore() argument since the last reset, to assert consistency modes. */
export const getStoreCalls = shared.__getStoreCalls;

export function resetBlobs() {
  blobStores.clear();
  getStoreCalls.length = 0;
  context.uncached = false;
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
  const strong = typeof options === "object" && options.consistency === "strong";
  const uncachedAtCreation = context.uncached;
  const assertReadable = () => {
    if (strong && !uncachedAtCreation) {
      throw new Error("Netlify Blobs: strong consistency needs an uncachedEdgeURL in the environment context.");
    }
  };
  return {
    get: async (key: string) => {
      assertReadable();
      return structuredClone(data.get(key)?.value ?? null);
    },
    getWithMetadata: async (key: string) => {
      assertReadable();
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
    list: async (listOptions?: { prefix?: string }) => {
      assertReadable();
      return {
      blobs: Array.from(data.entries())
        .filter(([key]) => key.startsWith(listOptions?.prefix ?? ""))
        .map(([key, entry]) => ({ key, etag: entry.etag })),
        directories: [],
      };
    },
  };
}

export const blobsModule = {
  connectLambda: () => {
    context.uncached = false;
  },
  setEnvironmentContext: (options: { uncachedEdgeURL?: string }) => {
    context.uncached = Boolean(options?.uncachedEdgeURL);
  },
  getStore: storeFor,
};
