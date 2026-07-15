import { describe, expect, it } from "vitest";
import { summarizeFunnel, type FunnelEvent } from "./funnel";

describe("summarizeFunnel", () => {
  it("tracks checkout → paid → d7 → cancel reason rates", () => {
    const events: FunnelEvent[] = [
      { id: "1", name: "checkout_started", at: "2026-01-01T00:00:00.000Z" },
      { id: "2", name: "checkout_started", at: "2026-01-01T01:00:00.000Z" },
      { id: "3", name: "checkout_paid", at: "2026-01-01T02:00:00.000Z" },
      { id: "4", name: "d7_retained", at: "2026-01-08T02:00:00.000Z" },
      { id: "5", name: "subscription_cancelled", at: "2026-01-09T00:00:00.000Z" },
      { id: "6", name: "cancel_reason", at: "2026-01-09T00:01:00.000Z", reason: "too_expensive" },
      { id: "7", name: "cancel_reason", at: "2026-01-09T00:02:00.000Z", reason: "too_expensive" },
    ];

    expect(summarizeFunnel(events)).toEqual({
      checkout_started: 2,
      checkout_paid: 1,
      paid_rate: 50,
      d7_retained: 1,
      d7_rate: 100,
      subscription_cancelled: 1,
      cancel_reasons: { too_expensive: 2 },
      trial_started: 0,
      trial_nudge_sent: 0,
      edge_alert_sent: 0,
    });
  });
});
