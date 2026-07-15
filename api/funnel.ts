import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import { getEntitlementStore } from "../netlify/functions/_lib/entitlements";
import {
  appendFunnelEvent,
  listFunnelEvents,
  summarizeFunnel,
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
  const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
  if (!store) {
    res.status(503).json({ success: false, message: "Funnel store unavailable." });
    return;
  }

  if (req.method === "GET") {
    const events = await listFunnelEvents(store, 500);
    res.status(200).json({ success: true, summary: summarizeFunnel(events), recent: events.slice(-20) });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed." });
    return;
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}) as {
    name?: string;
    mode?: string;
    sessionId?: string;
    reason?: string;
    meta?: Record<string, string | number | boolean | null | undefined>;
  };

  if (!body.name || !ALLOWED.includes(body.name as FunnelEventName)) {
    res.status(400).json({ success: false, message: "Invalid funnel event name." });
    return;
  }

  const user = await getCurrentSiteUserFromEvent({ blobs: req.blobs, headers: req.headers });
  const event = await appendFunnelEvent(store, {
    name: body.name as FunnelEventName,
    mode: body.mode,
    sessionId: body.sessionId,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : undefined,
    email: user?.email,
    userId: user?.id,
    meta: body.meta,
  });

  res.status(200).json({ success: true, event });
}
