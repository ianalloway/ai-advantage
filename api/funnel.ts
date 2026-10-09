import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import { getEntitlementStore } from "../netlify/functions/_lib/entitlements";
import {
  appendFunnelEvent,
  type FunnelEventName,
} from "../netlify/lib/funnel";

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

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}) as {
    name?: string;
    mode?: unknown;
    reason?: string;
    meta?: Record<string, string | number | boolean | null | undefined>;
  };

  if (!body.name || !ALLOWED.includes(body.name as FunnelEventName)) {
    res.status(400).json({ success: false, message: "Invalid funnel event name." });
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
    meta: body.meta,
  });

  res.status(200).json({ success: true });
}
