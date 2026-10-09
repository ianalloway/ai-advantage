import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import { getEntitlementStore } from "../netlify/functions/_lib/entitlements";
import {
  appendFunnelEvent,
  type FunnelEventName,
} from "../netlify/lib/funnel";
import { consumeRateLimit, getClientIp } from "../netlify/lib/rate-limit";

type RequestLike = {
  blobs?: string;
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const ALLOWED: FunnelEventName[] = [
  "checkout_started",
  "checkout_paid",
  "cancel_reason",
  "portal_opened",
  "trial_started",
];

// Every event is appended to one shared list, so both the rate and the size of
// what an anonymous caller can add are capped.
const EVENTS_PER_IP = 30;
const EVENT_WINDOW_SECONDS = 10 * 60;
const MAX_META_KEYS = 10;
const MAX_META_STRING = 200;

type MetaValue = string | number | boolean | null;

/** Validated meta, undefined when absent, or null when it is not acceptable. */
export function parseMeta(meta: unknown): Record<string, MetaValue> | undefined | null {
  if (meta === undefined || meta === null) return undefined;
  if (typeof meta !== "object" || Array.isArray(meta)) return null;
  const entries = Object.entries(meta as Record<string, unknown>);
  if (entries.length > MAX_META_KEYS) return null;
  const valid = entries.every(
    ([key, value]) =>
      /^[A-Za-z0-9_]{1,40}$/.test(key) &&
      (value === null ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && value.length <= MAX_META_STRING)),
  );
  return valid ? (Object.fromEntries(entries) as Record<string, MetaValue>) : null;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed." });
    return;
  }

  const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
  if (!store) {
    res.status(503).json({ success: false, message: "Funnel store unavailable." });
    return;
  }

  const limit = await consumeRateLimit(
    store.increment,
    `ai-advantage:ratelimit:funnel:${getClientIp(req.headers)}`,
    EVENTS_PER_IP,
    EVENT_WINDOW_SECONDS,
  );
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({ success: false, message: "Too many funnel events." });
    return;
  }

  let body: { name?: string; mode?: unknown; reason?: unknown; meta?: unknown };
  try {
    body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}) as typeof body;
  } catch {
    res.status(400).json({ success: false, message: "Invalid JSON body." });
    return;
  }

  if (!body.name || !ALLOWED.includes(body.name as FunnelEventName)) {
    res.status(400).json({ success: false, message: "Invalid funnel event name." });
    return;
  }

  const meta = parseMeta(body.meta);
  if (meta === null) {
    res.status(400).json({
      success: false,
      message: `meta must be an object of at most ${MAX_META_KEYS} short scalar fields.`,
    });
    return;
  }

  const user = await getCurrentSiteUserFromEvent({ blobs: req.blobs, headers: req.headers });
  // Checkout session IDs are recorded server-side by the checkout and webhook
  // handlers. A client-supplied one is unverified and must never be stored next
  // to account identity, and the stored event (email, userId) is not echoed back.
  await appendFunnelEvent(store, {
    name: body.name as FunnelEventName,
    mode: typeof body.mode === "string" ? body.mode.slice(0, 40) : undefined,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined,
    email: user?.email,
    userId: user?.id,
    meta,
  });

  res.status(200).json({ success: true });
}
