import { describe, expect, it } from "vitest";
import {
  CryptoTransactionAlreadyClaimedError,
  accessStateFromEntitlement,
  createEntitlementSession,
  findBestEntitlement,
  isActiveEntitlement,
  upsertCryptoEntitlement,
  upsertEntitlement,
  upsertStripeCheckoutSessionEntitlement,
  upsertStripeSubscriptionEntitlement,
  type EntitlementStore,
} from "./entitlements";

function memoryStore(): EntitlementStore {
  const data = new Map<string, unknown>();
  return {
    mode: "local",
    async delete(key: string) {
      data.delete(key);
    },
    async get<T>(key: string) {
      return (data.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown) {
      data.set(key, value);
    },
  };
}

describe("upsertCryptoEntitlement", () => {
  it("rejects replayed crypto transaction hashes without overwriting the original claimant", async () => {
    const store = memoryStore();
    const txHash = `0x${"a".repeat(64)}`;

    const original = await upsertCryptoEntitlement(store, {
      email: "victim@example.com",
      walletAddress: `0x${"b".repeat(40)}`,
      txHash,
      tier: "premium",
      label: "Crypto Knowledge Vault",
    });

    await expect(
      upsertCryptoEntitlement(store, {
        email: "attacker@example.com",
        walletAddress: `0x${"b".repeat(40)}`,
        txHash,
        tier: "event",
        label: "Crypto Big Game Pass",
      }),
    ).rejects.toBeInstanceOf(CryptoTransactionAlreadyClaimedError);

    const victimEntitlement = await findBestEntitlement(store, { email: "victim@example.com" });
    const attackerEntitlement = await findBestEntitlement(store, { email: "attacker@example.com" });

    expect(victimEntitlement).toMatchObject({
      id: original.id,
      email: "victim@example.com",
      tier: "premium",
      cryptoTxHash: txHash,
    });
    expect(attackerEntitlement).toBeNull();
  });
});

const HOUR = 60 * 60 * 1000;
const future = (ms = HOUR) => new Date(Date.now() + ms).toISOString();
const past = (ms = HOUR) => new Date(Date.now() - ms).toISOString();

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    tier: "premium",
    source: "stripe",
    label: "Stripe Pro Monthly",
    status: "active",
    activatedAt: past(),
    updatedAt: past(),
    ...overrides,
  } as Parameters<typeof isActiveEntitlement>[0];
}

describe("isActiveEntitlement", () => {
  it("accepts an active, unexpired, paid entitlement", () => {
    expect(isActiveEntitlement(record())).toBe(true);
    expect(isActiveEntitlement(record({ expiresAt: future() }))).toBe(true);
  });

  it("rejects anything that must not unlock paid features", () => {
    expect(isActiveEntitlement(null)).toBe(false);
    expect(isActiveEntitlement(undefined)).toBe(false);
    expect(isActiveEntitlement(record({ status: "pending" }))).toBe(false);
    expect(isActiveEntitlement(record({ status: "cancelled" }))).toBe(false);
    expect(isActiveEntitlement(record({ tier: "free" }))).toBe(false);
    expect(isActiveEntitlement(record({ expiresAt: past() }))).toBe(false);
  });
});

describe("accessStateFromEntitlement", () => {
  it("falls back to free access for an inactive record", () => {
    expect(accessStateFromEntitlement(record({ status: "pending" }))).toMatchObject({ tier: "free" });
    expect(accessStateFromEntitlement(record({ expiresAt: past() }))).toMatchObject({ tier: "free" });
    expect(accessStateFromEntitlement(null)).toMatchObject({ tier: "free" });
  });

  it("carries tier, source, and label through for an active record", () => {
    expect(accessStateFromEntitlement(record({ expiresAt: future() }))).toMatchObject({
      tier: "premium",
      source: "stripe",
      label: "Stripe Pro Monthly",
    });
  });
});

describe("findBestEntitlement", () => {
  it("prefers premium over a concurrent event pass", async () => {
    const store = memoryStore();
    await upsertEntitlement(store, record({ id: "ev", tier: "event", label: "Event", email: "a@b.com" }) as never);
    await upsertEntitlement(store, record({ id: "pr", tier: "premium", label: "Premium", email: "a@b.com" }) as never);

    expect(await findBestEntitlement(store, { email: "a@b.com" })).toMatchObject({ id: "pr" });
  });

  it("matches email case-insensitively, so casing cannot cost a paying user access", async () => {
    const store = memoryStore();
    await upsertEntitlement(store, record({ id: "pr", email: "Mixed.Case@Example.COM" }) as never);

    expect(await findBestEntitlement(store, { email: "  mixed.case@example.com " })).toMatchObject({ id: "pr" });
  });

  it("ignores expired and non-active records", async () => {
    const store = memoryStore();
    await upsertEntitlement(store, record({ id: "old", expiresAt: past(), email: "a@b.com" }) as never);
    await upsertEntitlement(store, record({ id: "pend", status: "pending", email: "a@b.com" }) as never);

    expect(await findBestEntitlement(store, { email: "a@b.com" })).toBeNull();
  });

  it("resolves through a valid entitlement session token", async () => {
    const store = memoryStore();
    const saved = await upsertEntitlement(store, record({ id: "pr" }) as never);
    const { token } = await createEntitlementSession(store, saved);

    expect(await findBestEntitlement(store, { entitlementToken: token })).toMatchObject({ id: "pr" });
  });

  it("ignores a session token whose record points at a revoked entitlement", async () => {
    const store = memoryStore();
    const saved = await upsertEntitlement(store, record({ id: "pr" }) as never);
    const { token } = await createEntitlementSession(store, saved);
    // Subscription lapses after the session cookie was issued.
    await upsertEntitlement(store, record({ id: "pr", status: "cancelled" }) as never);

    expect(await findBestEntitlement(store, { entitlementToken: token })).toBeNull();
  });

  it("ignores an unknown or garbage session token", async () => {
    const store = memoryStore();
    await upsertEntitlement(store, record({ id: "pr", email: "a@b.com" }) as never);

    expect(await findBestEntitlement(store, { entitlementToken: "not-a-real-token" })).toBeNull();
  });

  it("returns null for an unknown lookup", async () => {
    expect(await findBestEntitlement(memoryStore(), { email: "nobody@example.com" })).toBeNull();
  });
});

describe("upsertEntitlement", () => {
  it("preserves the original activation time across later writes", async () => {
    const store = memoryStore();
    const first = await upsertEntitlement(store, record({ id: "pr", activatedAt: past(5 * HOUR) }) as never);
    const second = await upsertEntitlement(store, record({ id: "pr", activatedAt: new Date().toISOString() }) as never);

    expect(second.activatedAt).toBe(first.activatedAt);
  });
});

describe("upsertStripeCheckoutSessionEntitlement", () => {
  const session = (overrides: Record<string, unknown> = {}) => ({
    id: "cs_1",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    payment_intent: "pi_1",
    ...overrides,
  });

  it("activates only a genuinely paid session", async () => {
    const store = memoryStore();
    const paid = await upsertStripeCheckoutSessionEntitlement(store, session());
    expect(paid.status).toBe("active");

    const free = await upsertStripeCheckoutSessionEntitlement(
      store,
      session({ id: "cs_2", payment_intent: "pi_2", payment_status: "no_payment_required" }),
    );
    expect(free.status).toBe("active");
  });

  it("holds an unpaid or incomplete session at pending", async () => {
    const store = memoryStore();
    const unpaid = await upsertStripeCheckoutSessionEntitlement(
      store,
      session({ id: "cs_3", payment_intent: "pi_3", payment_status: "unpaid" }),
    );
    expect(unpaid.status).toBe("pending");
    expect(isActiveEntitlement(unpaid)).toBe(false);

    const open = await upsertStripeCheckoutSessionEntitlement(
      store,
      session({ id: "cs_4", payment_intent: "pi_4", status: "open" }),
    );
    expect(open.status).toBe("pending");
  });

  it("grants premium for subscription mode and a time-boxed event pass otherwise", async () => {
    const store = memoryStore();
    const sub = await upsertStripeCheckoutSessionEntitlement(
      store,
      session({ id: "cs_5", mode: "subscription", subscription: "sub_1" }),
    );
    expect(sub.tier).toBe("premium");
    expect(sub.expiresAt).toBeUndefined();

    const pass = await upsertStripeCheckoutSessionEntitlement(store, session({ id: "cs_6", payment_intent: "pi_6" }));
    expect(pass.tier).toBe("event");
    expect(new Date(pass.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("upsertStripeSubscriptionEntitlement", () => {
  it("treats active and trialing as paid access", async () => {
    const store = memoryStore();
    for (const status of ["active", "trialing"]) {
      const entitlement = await upsertStripeSubscriptionEntitlement(store, { id: `sub_${status}`, status });
      expect(isActiveEntitlement(entitlement)).toBe(true);
    }
  });

  it("revokes access once the subscription is canceled or unpaid", async () => {
    const store = memoryStore();
    const cancelled = await upsertStripeSubscriptionEntitlement(store, { id: "sub_c", status: "canceled" });
    expect(cancelled.status).toBe("cancelled");
    expect(isActiveEntitlement(cancelled)).toBe(false);

    const unpaid = await upsertStripeSubscriptionEntitlement(store, { id: "sub_u", status: "past_due" });
    expect(isActiveEntitlement(unpaid)).toBe(false);
  });

  it("expires access at the end of the paid period", async () => {
    const store = memoryStore();
    const periodEnd = Math.floor((Date.now() + 24 * HOUR) / 1000);
    const entitlement = await upsertStripeSubscriptionEntitlement(store, {
      id: "sub_p",
      status: "active",
      current_period_end: periodEnd,
    });
    expect(new Date(entitlement.expiresAt as string).getTime()).toBe(periodEnd * 1000);
  });
});

describe("out-of-order Stripe webhook delivery", () => {
  const base = {
    id: "cs_replay",
    mode: "payment",
    payment_intent: "pi_replay",
    customer_email: "buyer@example.com",
  };

  // Stripe neither guarantees event order nor delivers exactly once, and the
  // webhook returns 500 on store errors, so Stripe retries. A redelivered
  // unpaid checkout.session.completed used to overwrite the paid state and
  // revoke a paying customer's access.
  it("does not let a replayed unpaid event revoke access that is already active", async () => {
    const store = memoryStore();

    const paid = await upsertStripeCheckoutSessionEntitlement(store, {
      ...base,
      status: "complete",
      payment_status: "paid",
    });
    expect(isActiveEntitlement(paid)).toBe(true);

    const replayed = await upsertStripeCheckoutSessionEntitlement(store, {
      ...base,
      status: "complete",
      payment_status: "unpaid",
    });

    expect(replayed.status).toBe("active");
    expect(isActiveEntitlement(replayed)).toBe(true);
    expect(await findBestEntitlement(store, { email: paid.email ?? undefined })).not.toBeNull();
  });

  it("still withholds access when the first event seen is unpaid", async () => {
    const store = memoryStore();
    const pending = await upsertStripeCheckoutSessionEntitlement(store, {
      ...base,
      id: "cs_pending_first",
      payment_intent: "pi_pending_first",
      status: "complete",
      payment_status: "unpaid",
    });

    expect(pending.status).toBe("pending");
    expect(isActiveEntitlement(pending)).toBe(false);
  });

  it("still lets an explicit cancellation revoke a subscription", async () => {
    const store = memoryStore();
    await upsertStripeSubscriptionEntitlement(store, { id: "sub_x", status: "active" });
    const cancelled = await upsertStripeSubscriptionEntitlement(store, { id: "sub_x", status: "canceled" });

    expect(cancelled.status).toBe("cancelled");
    expect(isActiveEntitlement(cancelled)).toBe(false);
  });
});
