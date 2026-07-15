import type { EntitlementStore } from "../functions/_lib/entitlements";

export type FunnelEventName =
  | "checkout_started"
  | "checkout_paid"
  | "d7_retained"
  | "cancel_reason"
  | "subscription_cancelled"
  | "trial_started"
  | "portal_opened"
  | "edge_alert_sent";

export interface FunnelEvent {
  id: string;
  name: FunnelEventName;
  at: string;
  mode?: string;
  email?: string;
  userId?: string;
  sessionId?: string;
  reason?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

const FUNNEL_KEY = "ai-advantage:funnel:events";
const MAX_EVENTS = 2000;

export async function appendFunnelEvent(
  store: EntitlementStore,
  event: Omit<FunnelEvent, "id" | "at"> & { id?: string; at?: string },
): Promise<FunnelEvent> {
  const full: FunnelEvent = {
    id: event.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: event.at ?? new Date().toISOString(),
    name: event.name,
    mode: event.mode,
    email: event.email,
    userId: event.userId,
    sessionId: event.sessionId,
    reason: event.reason,
    meta: event.meta,
  };

  const existing = (await store.get<FunnelEvent[]>(FUNNEL_KEY)) ?? [];
  existing.push(full);
  while (existing.length > MAX_EVENTS) existing.shift();
  await store.set(FUNNEL_KEY, existing);
  return full;
}

export async function listFunnelEvents(store: EntitlementStore, limit = 100): Promise<FunnelEvent[]> {
  const existing = (await store.get<FunnelEvent[]>(FUNNEL_KEY)) ?? [];
  return existing.slice(-limit);
}

export function summarizeFunnel(events: FunnelEvent[]) {
  const count = (name: FunnelEventName) => events.filter((e) => e.name === name).length;
  const started = count("checkout_started");
  const paid = count("checkout_paid");
  const d7 = count("d7_retained");
  const cancels = count("subscription_cancelled");
  const reasons = events
    .filter((e) => e.name === "cancel_reason" && e.reason)
    .reduce<Record<string, number>>((acc, e) => {
      const key = String(e.reason);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

  return {
    checkout_started: started,
    checkout_paid: paid,
    paid_rate: started ? Number(((paid / started) * 100).toFixed(1)) : 0,
    d7_retained: d7,
    d7_rate: paid ? Number(((d7 / paid) * 100).toFixed(1)) : 0,
    subscription_cancelled: cancels,
    cancel_reasons: reasons,
    trial_started: count("trial_started"),
    edge_alert_sent: count("edge_alert_sent"),
  };
}

/** Mark D7 once per entitlement id when still active ≥7 days after activation. */
export async function maybeRecordD7Retention(
  store: EntitlementStore,
  input: { entitlementId: string; email?: string; userId?: string; activatedAt?: string; tier: string },
) {
  if (input.tier === "free" || !input.activatedAt) return null;
  const activated = Date.parse(input.activatedAt);
  if (!Number.isFinite(activated)) return null;
  const ageMs = Date.now() - activated;
  if (ageMs < 7 * 24 * 60 * 60 * 1000) return null;

  const markerKey = `ai-advantage:funnel:d7:${input.entitlementId}`;
  const seen = await store.get<string>(markerKey);
  if (seen) return null;

  await store.set(markerKey, new Date().toISOString());
  return appendFunnelEvent(store, {
    name: "d7_retained",
    email: input.email,
    userId: input.userId,
    meta: { entitlementId: input.entitlementId },
  });
}
