import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import { getEntitlementStore } from "../netlify/functions/_lib/entitlements";

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

export interface EdgeAlertSubscription {
  email: string;
  userId?: string;
  minExecEdge: number;
  enabled: boolean;
  updatedAt: string;
}

const SUBS_KEY = "ai-advantage:edge-alerts:subs";

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");
  const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
  if (!store) {
    res.status(503).json({ success: false, message: "Alert store unavailable." });
    return;
  }

  const user = await getCurrentSiteUserFromEvent({ blobs: req.blobs, headers: req.headers });

  if (req.method === "GET") {
    if (!user?.email) {
      res.status(401).json({ success: false, message: "Log in to manage edge alerts." });
      return;
    }
    const subs = (await store.get<EdgeAlertSubscription[]>(SUBS_KEY)) ?? [];
    const mine = subs.find((s) => s.email === user.email.toLowerCase()) ?? null;
    res.status(200).json({ success: true, subscription: mine });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed." });
    return;
  }

  if (!user?.email) {
    res.status(401).json({ success: false, message: "Log in to subscribe to edge alerts." });
    return;
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}) as {
    enabled?: boolean;
    minExecEdge?: number;
  };

  const subscription: EdgeAlertSubscription = {
    email: user.email.toLowerCase(),
    userId: user.id,
    minExecEdge: Math.max(0, Math.min(Number(body.minExecEdge ?? 5), 20)),
    enabled: body.enabled !== false,
    updatedAt: new Date().toISOString(),
  };

  const subs = (await store.get<EdgeAlertSubscription[]>(SUBS_KEY)) ?? [];
  const next = subs.filter((s) => s.email !== subscription.email);
  next.push(subscription);
  await store.set(SUBS_KEY, next);

  res.status(200).json({ success: true, subscription });
}
