// Operator-only entitlement tools: the one-time legacy email binding migration
// and binding a purchase to an account by id for support cases.
//
// Requires ADMIN_API_TOKEN (at least 32 characters) as a bearer token and fails
// closed without it. Never call this from the browser.
import { timingSafeEqual, createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  bindEntitlementToUser,
  getEntitlementStore,
  getHeader,
  openBlobsStore,
} from "../netlify/functions/_lib/entitlements";
import {
  applyLegacyEmailBindings,
  planLegacyEmailBindings,
  type LegacyAccount,
} from "../netlify/lib/legacy-email-binding";

type RequestLike = {
  blobs?: string;
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const USER_PREFIX = "ai-advantage:auth:user:";

function isAuthorized(req: RequestLike) {
  const expected = process.env.ADMIN_API_TOKEN ?? "";
  if (expected.length < 32) return false;
  const supplied = getHeader(req.headers, "authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  // Hash both sides so the comparison is constant-time regardless of length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

function isAccount(value: unknown): value is LegacyAccount {
  const account = value as LegacyAccount | null;
  return Boolean(account && typeof account.id === "string" && typeof account.email === "string" && typeof account.createdAt === "string");
}

async function listAccounts(req: RequestLike): Promise<LegacyAccount[]> {
  if (req.blobs) {
    // Same wiring as the entitlement store: connectLambda() here would reset the
    // Blobs context without the uncached edge URL and break strong reads.
    const { store } = openBlobsStore({ blobs: req.blobs, headers: req.headers }, "ai-advantage-auth", "strong");
    const { blobs } = await store.list({ prefix: USER_PREFIX });
    const users = await Promise.all(blobs.map(({ key }) => store.get(key, { type: "json" }) as Promise<unknown>));
    return users.filter(isAccount);
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return [];
  const redis = Redis.fromEnv();
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = (await redis.scan(cursor, { match: `${USER_PREFIX}*`, count: 500 })) as [string, string[]];
    keys.push(...batch);
    cursor = String(next);
  } while (cursor !== "0");
  const users = await Promise.all(keys.map((key) => redis.get<unknown>(key)));
  return users.filter(isAccount);
}

function parseCutoff(value: unknown) {
  const cutoff = typeof value === "string" ? new Date(value) : null;
  return cutoff && Number.isFinite(cutoff.getTime()) && cutoff.getTime() <= Date.now() ? cutoff : null;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed." });
    return;
  }
  if (!isAuthorized(req)) {
    res.status(401).json({ success: false, message: "Unauthorized." });
    return;
  }
  const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers }, { consistency: "strong" });
  if (!store) {
    res.status(503).json({ success: false, message: "Entitlement store unavailable." });
    return;
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as {
    action?: string;
    cutoff?: string;
    bindings?: unknown;
    userId?: string;
    entitlementId?: string;
  };

  if (body.action === "bind") {
    if (!body.userId || !body.entitlementId) {
      res.status(400).json({ success: false, message: "userId and entitlementId are required." });
      return;
    }
    const bound = await bindEntitlementToUser(store, body.entitlementId, body.userId);
    res.status(bound ? 200 : 409).json({ success: Boolean(bound), entitlement: bound });
    return;
  }

  if (body.action === "plan-legacy-email" || body.action === "apply-legacy-email") {
    const cutoff = parseCutoff(body.cutoff);
    if (!cutoff) {
      res.status(400).json({ success: false, message: "cutoff must be an ISO timestamp that is not in the future." });
      return;
    }
    const { plan, ambiguous } = await planLegacyEmailBindings(store, await listAccounts(req), cutoff);
    if (body.action === "plan-legacy-email") {
      res.status(200).json({ success: true, dryRun: true, count: plan.length, plan, ambiguous });
      return;
    }
    // Apply only the pairs the operator reviewed in the dry run.
    const approved = Array.isArray(body.bindings)
      ? body.bindings.flatMap((pair: unknown) => {
          const candidate = pair as { entitlementId?: unknown; userId?: unknown } | null;
          return typeof candidate?.entitlementId === "string" && typeof candidate?.userId === "string"
            ? [{ entitlementId: candidate.entitlementId, userId: candidate.userId }]
            : [];
        })
      : [];
    if (approved.length === 0) {
      res.status(400).json({ success: false, message: "bindings must list the reviewed {entitlementId, userId} pairs." });
      return;
    }
    const { applied, skipped } = await applyLegacyEmailBindings(store, plan, approved);
    res.status(200).json({ success: true, dryRun: false, count: applied.length, applied, skipped, ambiguous });
    return;
  }

  res.status(400).json({ success: false, message: "Unknown action." });
}
