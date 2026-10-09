import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { connectLambda, getStore } from "@netlify/blobs";
import { Redis } from "@upstash/redis";

export type AccessTier = "free" | "event" | "premium";
export type AccessSource = "stripe" | "crypto" | "manual";
export type EntitlementStatus = "active" | "expired" | "cancelled" | "revoked" | "pending";

export interface AccessState {
  tier: AccessTier;
  source: AccessSource;
  label: string;
  activatedAt?: string;
  expiresAt?: string;
}

export interface EntitlementRecord {
  id: string;
  tier: AccessTier;
  source: AccessSource;
  label: string;
  status: EntitlementStatus;
  activatedAt: string;
  updatedAt: string;
  expiresAt?: string;
  userId?: string;
  email?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  cryptoTxHash?: string;
  walletAddress?: string;
  metadata?: Record<string, string>;
}

export interface SiteUserLookup {
  id?: string;
  email?: string;
}

export type EntitlementStoreMode = "blobs" | "redis" | "local";

export interface EntitlementStore {
  mode: EntitlementStoreMode;
  delete: (key: string) => Promise<void>;
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, options?: { ex?: number }) => Promise<void>;
}

export class CryptoTransactionAlreadyClaimedError extends Error {
  constructor(txHash: string) {
    super(`Crypto transaction has already been claimed: ${normalizeHash(txHash)}`);
    this.name = "CryptoTransactionAlreadyClaimedError";
  }
}

export type EventLike = {
  blobs?: string;
  headers?: Record<string, string | string[] | undefined>;
};

const ENTITLEMENT_PREFIX = "ai-advantage:entitlements";
const SESSION_COOKIE = "ai_advantage_entitlement";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const EVENT_ACCESS_HOURS = Number(process.env.ENTITLEMENT_EVENT_ACCESS_HOURS || "72");
const LOCAL_ENTITLEMENT_PATH = join(process.cwd(), ".netlify", "state", "ai-advantage-entitlements.json");

const FREE_ACCESS: AccessState = {
  tier: "free",
  source: "manual",
  label: "Free access",
};

let redisClient: Redis | null | undefined;
let localData: Record<string, unknown> | null = null;
let localLoad: Promise<Record<string, unknown>> | null = null;
let localWrite: Promise<void> = Promise.resolve();

function normalizeHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function getHeader(headers: EventLike["headers"], name: string) {
  const lowerName = name.toLowerCase();
  const match = Object.entries(headers ?? {}).find(
    ([key, value]) => key.toLowerCase() === lowerName && value,
  );
  return normalizeHeaderValue(match?.[1]);
}

function normalizeLambdaHeaders(headers: EventLike["headers"]) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).flatMap(([key, value]) => {
      const normalized = normalizeHeaderValue(value);
      return typeof normalized === "string" ? [[key.toLowerCase(), normalized]] : [];
    }),
  );
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

function canUseLocalStore() {
  return process.env.NETLIFY_DEV === "true" || process.env.NETLIFY_LOCAL === "true" || process.env.NODE_ENV !== "production";
}

async function readLocalData() {
  if (localData) return localData;
  if (!localLoad) {
    localLoad = readFile(LOCAL_ENTITLEMENT_PATH, "utf8")
      .then((contents) => {
        const parsed = JSON.parse(contents) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return {};
        throw error;
      });
  }

  localData = await localLoad;
  return localData;
}

async function writeLocalData() {
  const data = await readLocalData();
  localWrite = localWrite.then(async () => {
    await mkdir(dirname(LOCAL_ENTITLEMENT_PATH), { recursive: true });
    await writeFile(LOCAL_ENTITLEMENT_PATH, JSON.stringify(data, null, 2));
  });
  return localWrite;
}

function getLocalStore(): EntitlementStore {
  return {
    mode: "local",
    async get<T>(key: string) {
      const data = await readLocalData();
      return (data[key] as T | undefined) ?? null;
    },
    async set(key: string, value: unknown) {
      const data = await readLocalData();
      data[key] = value;
      await writeLocalData();
    },
    async delete(key: string) {
      const data = await readLocalData();
      delete data[key];
      await writeLocalData();
    },
  };
}

export function getEntitlementStore(event?: EventLike): EntitlementStore | null {
  if (event?.blobs) {
    try {
      connectLambda({
        blobs: event.blobs,
        headers: normalizeLambdaHeaders(event.headers),
      });
      const store = getStore("ai-advantage-entitlements");
      return {
        mode: "blobs",
        async get<T>(key: string) {
          return (await store.get(key, { type: "json" })) as T | null;
        },
        async set(key: string, value: unknown) {
          await store.setJSON(key, value);
        },
        async delete(key: string) {
          await store.delete(key);
        },
      };
    } catch (error) {
      console.warn("Netlify Blobs entitlement store is unavailable; checking fallback store.", error);
    }
  }

  const redis = getRedis();
  if (redis) {
    return {
      mode: "redis",
      async get<T>(key: string) {
        return (await redis.get<T>(key)) ?? null;
      },
      async set(key: string, value: unknown, options?: { ex?: number }) {
        if (options?.ex) {
          await redis.set(key, value, { ex: options.ex });
        } else {
          await redis.set(key, value);
        }
      },
      async delete(key: string) {
        await redis.del(key);
      },
    };
  }

  return canUseLocalStore() ? getLocalStore() : null;
}

function recordKey(id: string) {
  return `${ENTITLEMENT_PREFIX}:record:${id}`;
}

function sessionKey(token: string) {
  return `${ENTITLEMENT_PREFIX}:session:${createHash("sha256").update(token).digest("hex")}`;
}

function userIndexKey(userId: string) {
  return `${ENTITLEMENT_PREFIX}:idx:user:${userId}`;
}

function emailIndexKey(email: string) {
  return `${ENTITLEMENT_PREFIX}:idx:email:${normalizeEmail(email)}`;
}

function stripeCustomerIndexKey(customerId: string) {
  return `${ENTITLEMENT_PREFIX}:idx:stripe-customer:${customerId}`;
}

function stripeSubscriptionIndexKey(subscriptionId: string) {
  return `${ENTITLEMENT_PREFIX}:idx:stripe-subscription:${subscriptionId}`;
}

function cryptoTxIndexKey(txHash: string) {
  return `${ENTITLEMENT_PREFIX}:idx:crypto-tx:${normalizeHash(txHash)}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeHash(value: string) {
  return value.trim().toLowerCase();
}

function normalizeWallet(value: string) {
  return value.trim().toLowerCase();
}

function eventAccessExpiry() {
  return new Date(Date.now() + EVENT_ACCESS_HOURS * 60 * 60 * 1000).toISOString();
}

function isRecord(value: unknown): value is EntitlementRecord {
  return Boolean(value && typeof value === "object" && typeof (value as EntitlementRecord).id === "string");
}

function isExpired(record: EntitlementRecord) {
  return Boolean(record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now());
}

export function isActiveEntitlement(record: EntitlementRecord | null | undefined): record is EntitlementRecord {
  return Boolean(record && record.status === "active" && !isExpired(record) && record.tier !== "free");
}

function accessRank(record: EntitlementRecord) {
  if (record.tier === "premium") return 3;
  if (record.tier === "event") return 2;
  return 1;
}

export function accessStateFromEntitlement(record: EntitlementRecord | null | undefined): AccessState {
  if (!isActiveEntitlement(record)) return FREE_ACCESS;
  return {
    tier: record.tier,
    source: record.source,
    label: record.label,
    activatedAt: record.activatedAt,
    expiresAt: record.expiresAt,
  };
}

async function addIndex(store: EntitlementStore, key: string | undefined, id: string) {
  if (!key) return;
  const existing = await store.get<string[] | string>(key);
  const ids = Array.isArray(existing) ? existing : existing ? [existing] : [];
  if (!ids.includes(id)) {
    await store.set(key, [...ids, id]);
  }
}

async function getIndexedIds(store: EntitlementStore, key: string | undefined) {
  if (!key) return [];
  const existing = await store.get<string[] | string>(key);
  if (Array.isArray(existing)) return existing;
  return existing ? [existing] : [];
}

async function getRecord(store: EntitlementStore, id: string) {
  const record = await store.get<EntitlementRecord>(recordKey(id));
  return isRecord(record) ? record : null;
}

async function getRecords(store: EntitlementStore, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids));
  const records = await Promise.all(uniqueIds.map((id) => getRecord(store, id)));
  return records.filter(isRecord);
}

export async function upsertEntitlement(
  store: EntitlementStore,
  input: Omit<EntitlementRecord, "updatedAt">,
  options?: { keepActive?: boolean },
) {
  const now = new Date().toISOString();
  const existing = await getRecord(store, input.id);
  // "pending" means "not confirmed yet", never "revoked" — real revocation goes
  // through cancelled/expired/revoked. Stripe neither guarantees event order nor
  // delivers exactly once, and this webhook returns 500 on store errors, so an
  // unpaid checkout.session.completed can be retried *after*
  // async_payment_succeeded already granted access. Letting that replay win
  // would revoke a paying customer's access.
  const status =
    options?.keepActive && input.status === "pending" && existing?.status === "active"
      ? "active"
      : input.status;
  const record: EntitlementRecord = {
    ...existing,
    ...input,
    status,
    email: input.email ? normalizeEmail(input.email) : existing?.email,
    walletAddress: input.walletAddress ? normalizeWallet(input.walletAddress) : existing?.walletAddress,
    cryptoTxHash: input.cryptoTxHash ? normalizeHash(input.cryptoTxHash) : existing?.cryptoTxHash,
    activatedAt: existing?.activatedAt ?? input.activatedAt,
    updatedAt: now,
  };

  await store.set(recordKey(record.id), record);
  await Promise.all([
    addIndex(store, record.userId ? userIndexKey(record.userId) : undefined, record.id),
    addIndex(store, record.email ? emailIndexKey(record.email) : undefined, record.id),
    addIndex(store, record.stripeCustomerId ? stripeCustomerIndexKey(record.stripeCustomerId) : undefined, record.id),
    addIndex(store, record.stripeSubscriptionId ? stripeSubscriptionIndexKey(record.stripeSubscriptionId) : undefined, record.id),
    addIndex(store, record.cryptoTxHash ? cryptoTxIndexKey(record.cryptoTxHash) : undefined, record.id),
  ]);

  return record;
}

async function getSessionEntitlementId(store: EntitlementStore, token: string | null | undefined) {
  if (!token) return null;
  const session = await store.get<{ entitlementId?: string; expiresAt?: string }>(sessionKey(token));
  if (session?.entitlementId && (!session.expiresAt || new Date(session.expiresAt).getTime() > Date.now())) {
    return session.entitlementId;
  }
  return null;
}

/**
 * Resolve the best active entitlement a request is authorized for.
 *
 * Only two things authorize: an entitlement session cookie (minted to whoever
 * proved the purchase) and entitlements bound to the account's immutable user
 * id. The email index is deliberately not consulted: signup does not verify
 * email ownership, so anyone could register a guest buyer's address and
 * inherit their paid access and Stripe billing portal.
 */
export async function findBestEntitlement(store: EntitlementStore, lookup: {
  userId?: string;
  entitlementToken?: string | null;
}) {
  const ids: string[] = [];

  const sessionEntitlementId = await getSessionEntitlementId(store, lookup.entitlementToken);
  if (sessionEntitlementId) ids.push(sessionEntitlementId);

  ids.push(...(await getIndexedIds(store, lookup.userId ? userIndexKey(lookup.userId) : undefined)));

  const records = (await getRecords(store, ids)).filter(isActiveEntitlement);
  return records.sort((a, b) => {
    const rankDiff = accessRank(b) - accessRank(a);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  })[0] ?? null;
}

/**
 * Bind the entitlement behind this browser's entitlement session to a signed-in
 * account, so a guest purchase follows the buyer to other devices once they
 * create an account. Requires both proofs: possession of the entitlement
 * session (issued only to the purchaser) and an account email equal to the
 * purchase email. An entitlement already bound to another account is left alone.
 */
export async function bindSessionEntitlementToUser(
  store: EntitlementStore,
  token: string | null | undefined,
  user: { id: string; email?: string },
) {
  const entitlementId = await getSessionEntitlementId(store, token);
  if (!entitlementId || !user.id) return null;
  const record = await getRecord(store, entitlementId);
  if (!isActiveEntitlement(record) || record.userId) return null;
  if (!record.email || !user.email || normalizeEmail(record.email) !== normalizeEmail(user.email)) return null;

  const { updatedAt: _updatedAt, ...rest } = record;
  return upsertEntitlement(store, { ...rest, userId: user.id });
}

export async function findEntitlementByStripeCustomer(store: EntitlementStore, customerId: string) {
  const ids = await getIndexedIds(store, stripeCustomerIndexKey(customerId));
  const records = await getRecords(store, ids);
  return records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
}

export async function findEntitlementByStripeSubscription(store: EntitlementStore, subscriptionId: string) {
  const ids = await getIndexedIds(store, stripeSubscriptionIndexKey(subscriptionId));
  const records = await getRecords(store, ids);
  return records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
}

export function getCookie(headers: EventLike["headers"], name: string) {
  const cookieHeader = getHeader(headers, "cookie") ?? "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const target = cookies.find((part) => part.startsWith(`${name}=`));
  return target ? decodeURIComponent(target.slice(name.length + 1)) : null;
}

export function shouldUseSecureCookie(headers: EventLike["headers"]) {
  const host = getHeader(headers, "host") ?? "";
  const forwardedProto = getHeader(headers, "x-forwarded-proto") ?? "";
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(:|$)/.test(host)) {
    return false;
  }

  return forwardedProto === "https" || process.env.NODE_ENV !== "development";
}

export function getEntitlementSessionToken(headers: EventLike["headers"]) {
  return getCookie(headers, SESSION_COOKIE);
}

export async function createEntitlementSession(store: EntitlementStore, entitlement: EntitlementRecord) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() < Date.now() + SESSION_TTL_SECONDS * 1000
    ? entitlement.expiresAt
    : new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const maxAge = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));

  await store.set(
    sessionKey(token),
    {
      entitlementId: entitlement.id,
      expiresAt,
    },
    { ex: maxAge },
  );

  return { token, maxAge };
}

export async function revokeEntitlementSession(store: EntitlementStore, token: string) {
  await store.delete(sessionKey(token));
}

export function entitlementSessionCookie(headers: EventLike["headers"], token: string, maxAge: number) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (shouldUseSecureCookie(headers)) parts.push("Secure");
  return parts.join("; ");
}

export function clearEntitlementSessionCookie(headers: EventLike["headers"]) {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (shouldUseSecureCookie(headers)) parts.push("Secure");
  return parts.join("; ");
}

function stringId(value: unknown) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return undefined;
}

function subscriptionStatusToEntitlement(status: string | null | undefined): EntitlementStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled") return "cancelled";
  return "pending";
}

/**
 * Fulfil a Checkout Session into an entitlement, at most once.
 *
 * Both the webhook and the post-checkout receipt lookup call this, and both can
 * be replayed (Stripe redelivers events; a buyer can reload the success URL).
 * Fulfilment is keyed by the entitlement id the session maps to (subscription,
 * then payment intent, then session id). Once that record has left "pending",
 * a later call never touches its lifecycle: a cancelled subscription stays
 * cancelled and an event pass keeps its original expiry. It only fills in
 * identity fields the record is missing. A pending record may be promoted to
 * active once payment clears, and the pass clock starts at that activation.
 *
 * For subscriptions, `options.subscriptionStatus` is the subscription's current
 * Stripe status; when given it decides access instead of the historical
 * session's payment flags. Without it (webhook replays), a status written by
 * the subscription webhooks is never overridden by a checkout session.
 */
export async function upsertStripeCheckoutSessionEntitlement(
  store: EntitlementStore,
  session: {
    id: string;
    mode?: string | null;
    status?: string | null;
    payment_status?: string | null;
    customer?: unknown;
    subscription?: unknown;
    payment_intent?: unknown;
    client_reference_id?: string | null;
    customer_email?: string | null;
    customer_details?: { email?: string | null } | null;
    metadata?: Record<string, string> | null;
  },
  options?: { subscriptionStatus?: string | null },
) {
  const paid =
    session.status === "complete" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required");
  const now = new Date().toISOString();
  const stripeCustomerId = stringId(session.customer);
  const stripeSubscriptionId = stringId(session.subscription);
  const stripePaymentIntentId = stringId(session.payment_intent);
  const mode = session.mode === "subscription" ? "subscription" : "payment";
  const tier: AccessTier = mode === "subscription" ? "premium" : "event";
  const label = mode === "subscription" ? "Stripe Pro Monthly" : "Stripe Event Pass";
  const id = stripeSubscriptionId
    ? `stripe:subscription:${stripeSubscriptionId}`
    : stripePaymentIntentId
      ? `stripe:payment:${stripePaymentIntentId}`
      : `stripe:checkout:${session.id}`;
  const identity = {
    userId: session.client_reference_id ?? undefined,
    email: session.customer_details?.email ?? session.customer_email ?? undefined,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId,
  };

  // Current Stripe truth for a subscription, when the caller fetched it. It is
  // not a replay, so it may move status in either direction.
  const liveStatus =
    mode === "subscription" && options && "subscriptionStatus" in options
      ? subscriptionStatusToEntitlement(options.subscriptionStatus)
      : undefined;

  const existing = await getRecord(store, id);
  const ownedBySubscriptionLifecycle = mode === "subscription" && Boolean(existing?.metadata?.stripe_status);
  if (existing && (existing.status !== "pending" || ownedBySubscriptionLifecycle)) {
    const missing = Object.fromEntries(
      Object.entries(identity).filter(([key, value]) => value && !existing[key as keyof EntitlementRecord]),
    );
    const statusChange = liveStatus && liveStatus !== existing.status ? { status: liveStatus } : {};
    if (Object.keys(missing).length === 0 && !("status" in statusChange)) return existing;
    const { updatedAt: _updatedAt, ...rest } = existing;
    return upsertEntitlement(store, { ...rest, ...missing, ...statusChange });
  }

  const status: EntitlementStatus = liveStatus ?? (paid ? "active" : "pending");

  return upsertEntitlement(store, {
    id,
    tier,
    source: "stripe",
    label,
    status,
    activatedAt: now,
    expiresAt: tier === "event" ? eventAccessExpiry() : undefined,
    ...identity,
    metadata: {
      checkout_mode: mode,
      unlock_type: session.metadata?.unlock_type ?? "",
      plan_label: session.metadata?.plan_label ?? label,
    },
  });
}

export async function upsertStripeSubscriptionEntitlement(
  store: EntitlementStore,
  subscription: {
    id: string;
    customer?: unknown;
    status?: string | null;
    metadata?: Record<string, string> | null;
    current_period_end?: number | null;
  },
  fallback?: {
    email?: string;
    userId?: string;
  },
) {
  const status = subscription.status ?? "pending";
  const active = status === "active" || status === "trialing";
  const expiresAt = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : undefined;

  return upsertEntitlement(store, {
    id: `stripe:subscription:${subscription.id}`,
    tier: "premium",
    source: "stripe",
    label: "Stripe Pro Monthly",
    status: active ? "active" : status === "canceled" ? "cancelled" : "pending",
    activatedAt: new Date().toISOString(),
    expiresAt,
    userId: subscription.metadata?.client_reference_id || fallback?.userId,
    email: subscription.metadata?.customer_email || fallback?.email,
    stripeCustomerId: stringId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    metadata: {
      stripe_status: status,
    },
  });
}

export async function getCryptoEntitlement(store: EntitlementStore, txHash: string) {
  return getRecord(store, `crypto:${normalizeHash(txHash)}`);
}

export async function upsertCryptoEntitlement(
  store: EntitlementStore,
  input: {
    email: string;
    walletAddress: string;
    txHash: string;
    tier: AccessTier;
    label: string;
    userId?: string;
  },
) {
  const txHash = normalizeHash(input.txHash);
  const id = `crypto:${txHash}`;
  const existing = await getRecord(store, id);
  if (existing) {
    throw new CryptoTransactionAlreadyClaimedError(txHash);
  }

  const tier = input.tier === "premium" ? "premium" : "event";
  return upsertEntitlement(store, {
    id,
    tier,
    source: "crypto",
    label: input.label,
    status: "active",
    activatedAt: new Date().toISOString(),
    expiresAt: tier === "event" ? eventAccessExpiry() : undefined,
    email: input.email,
    userId: input.userId,
    walletAddress: input.walletAddress,
    cryptoTxHash: txHash,
  });
}
