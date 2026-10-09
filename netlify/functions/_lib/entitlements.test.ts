import { describe, expect, it } from "vitest";
import {
  CryptoTransactionAlreadyClaimedError,
  accessStateFromEntitlement,
  bindSessionEntitlementToUser,
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
    async setIfAbsent(key: string, value: unknown) {
      await Promise.resolve();
      if (data.has(key)) return false;
      data.set(key, value);
      return true;
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

    const { token } = await createEntitlementSession(store, original);
    const victimEntitlement = await findBestEntitlement(store, { entitlementToken: token });

    expect(victimEntitlement).toMatchObject({
      id: original.id,
      email: "victim@example.com",
      tier: "premium",
      cryptoTxHash: txHash,
    });
  });
});

describe("concurrent first crypto claims", () => {
  // Two requests racing on the same unclaimed tx used to both pass the
  // read-then-write check and both receive a session.
  it("lets exactly one concurrent claimant win", async () => {
    const store = memoryStore();
    const txHash = `0x${"e".repeat(64)}`;
    const claim = (email: string) =>
      upsertCryptoEntitlement(store, {
        email,
        walletAddress: `0x${"b".repeat(40)}`,
        txHash,
        tier: "event",
        label: "Crypto Big Game Pass",
      });

    const results = await Promise.allSettled([claim("first@example.com"), claim("second@example.com")]);
    const won = results.filter((result) => result.status === "fulfilled");
    const lost = results.filter((result) => result.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(CryptoTransactionAlreadyClaimedError);

    const winner = (won[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof claim>>>).value;
    expect(await store.get(`ai-advantage:entitlements:record:crypto:${txHash}`)).toMatchObject({ email: winner.email });
  });
});

describe("crypto claim marker recovery", () => {
  const txHash = `0x${"f".repeat(64)}`;
  const payer = `0x${"b".repeat(40)}`;
  const claim = (store: EntitlementStore, walletAddress = payer) =>
    upsertCryptoEntitlement(store, { email: "payer@example.com", walletAddress, txHash, tier: "event", label: "Pass" });

  it("releases the claim marker when the record write fails, so the payer can retry", async () => {
    const store = memoryStore();
    const set = store.set;
    let failNext = true;
    store.set = async (key, value, options) => {
      if (failNext && key.includes(":record:")) {
        failNext = false;
        throw new Error("blob write failed");
      }
      return set(key, value, options);
    };
    await expect(claim(store)).rejects.toThrow("blob write failed");
    expect(await claim(store)).toMatchObject({ cryptoTxHash: txHash });
  });

  it("lets only the marker's own wallet finish an orphaned claim", async () => {
    const store = memoryStore();
    await store.setIfAbsent(`ai-advantage:entitlements:claim:crypto-tx:${txHash}`, {
      walletAddress: payer,
      claimedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    await expect(claim(store, `0x${"9".repeat(40)}`)).rejects.toBeInstanceOf(CryptoTransactionAlreadyClaimedError);
    expect(await claim(store)).toMatchObject({ walletAddress: payer });
    // Once the record exists, the claim is closed again.
    await expect(claim(store)).rejects.toBeInstanceOf(CryptoTransactionAlreadyClaimedError);
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
    await upsertEntitlement(store, record({ id: "ev", tier: "event", label: "Event", userId: "u1" }) as never);
    await upsertEntitlement(store, record({ id: "pr", tier: "premium", label: "Premium", userId: "u1" }) as never);

    expect(await findBestEntitlement(store, { userId: "u1" })).toMatchObject({ id: "pr" });
  });

  // Signup never verifies email ownership, so the email index must not
  // authorize: registering a guest buyer's address would otherwise inherit
  // their paid access and Stripe billing portal.
  it("never authorizes through the purchase email alone", async () => {
    const store = memoryStore();
    await upsertEntitlement(store, record({ id: "guest", email: "buyer@example.com", stripeCustomerId: "cus_buyer" }) as never);

    expect(await findBestEntitlement(store, { userId: "attacker-account" })).toBeNull();
    expect(
      await findBestEntitlement(store, { email: "buyer@example.com" } as Parameters<typeof findBestEntitlement>[1]),
    ).toBeNull();
  });

  it("ignores expired and non-active records", async () => {
    const store = memoryStore();
    await upsertEntitlement(store, record({ id: "old", expiresAt: past(), userId: "u1" }) as never);
    await upsertEntitlement(store, record({ id: "pend", status: "pending", userId: "u1" }) as never);

    expect(await findBestEntitlement(store, { userId: "u1" })).toBeNull();
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
    await upsertEntitlement(store, record({ id: "pr", userId: "u1" }) as never);

    expect(await findBestEntitlement(store, { entitlementToken: "not-a-real-token" })).toBeNull();
  });

  it("returns null for an unknown lookup", async () => {
    expect(await findBestEntitlement(memoryStore(), { userId: "nobody" })).toBeNull();
  });
});

describe("bindSessionEntitlementToUser", () => {
  it("binds a guest purchase to the account that holds its session and shares its email", async () => {
    const store = memoryStore();
    const saved = await upsertEntitlement(store, record({ id: "guest", email: "Buyer@Example.com" }) as never);
    const { token } = await createEntitlementSession(store, saved);

    const bound = await bindSessionEntitlementToUser(store, token, { id: "u-buyer", email: "buyer@example.com" });
    expect(bound).toMatchObject({ id: "guest", userId: "u-buyer" });
    // The account now reaches it on any device, without the cookie.
    expect(await findBestEntitlement(store, { userId: "u-buyer" })).toMatchObject({ id: "guest" });
  });

  it("refuses to bind without the purchaser's session, with a different email, or over another account", async () => {
    const store = memoryStore();
    const guest = await upsertEntitlement(store, record({ id: "guest", email: "buyer@example.com" }) as never);
    const owned = await upsertEntitlement(store, record({ id: "owned", email: "buyer@example.com", userId: "u-owner" }) as never);
    const guestToken = (await createEntitlementSession(store, guest)).token;
    const ownedToken = (await createEntitlementSession(store, owned)).token;

    expect(await bindSessionEntitlementToUser(store, null, { id: "u-x", email: "buyer@example.com" })).toBeNull();
    expect(await bindSessionEntitlementToUser(store, guestToken, { id: "u-x", email: "other@example.com" })).toBeNull();
    expect(await bindSessionEntitlementToUser(store, ownedToken, { id: "u-x", email: "buyer@example.com" })).toBeNull();
    expect(await findBestEntitlement(store, { userId: "u-x" })).toBeNull();
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
    const { token } = await createEntitlementSession(store, replayed);
    expect(await findBestEntitlement(store, { entitlementToken: token })).not.toBeNull();
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

  // A completed Checkout Session stays "complete / paid" forever. Replaying it
  // (webhook redelivery or a reloaded success URL) must not reactivate a
  // cancelled subscription or restart an event pass clock.
  it("does not let a replayed paid session reactivate a cancelled subscription", async () => {
    const store = memoryStore();
    const paidSub = { id: "cs_sub", mode: "subscription", subscription: "sub_r", status: "complete", payment_status: "paid" };
    expect((await upsertStripeCheckoutSessionEntitlement(store, paidSub)).status).toBe("active");
    await upsertStripeSubscriptionEntitlement(store, { id: "sub_r", status: "canceled" });

    const replayed = await upsertStripeCheckoutSessionEntitlement(store, paidSub);
    expect(replayed.status).toBe("cancelled");
    expect(isActiveEntitlement(replayed)).toBe(false);
  });

  it("does not let a replayed paid session promote a past-due subscription", async () => {
    const store = memoryStore();
    await upsertStripeSubscriptionEntitlement(store, { id: "sub_pd", status: "past_due" });
    const replayed = await upsertStripeCheckoutSessionEntitlement(store, {
      id: "cs_pd", mode: "subscription", subscription: "sub_pd", status: "complete", payment_status: "paid",
    });
    expect(replayed.status).toBe("pending");
  });

  it("keeps an event pass's original expiry when its session is replayed", async () => {
    const store = memoryStore();
    const first = await upsertStripeCheckoutSessionEntitlement(store, { ...base, status: "complete", payment_status: "paid" });
    // Simulate the 72-hour pass having run out.
    const lapsed = await upsertEntitlement(store, { ...first, expiresAt: past() });

    const replayed = await upsertStripeCheckoutSessionEntitlement(store, { ...base, status: "complete", payment_status: "paid" });
    expect(replayed.expiresAt).toBe(lapsed.expiresAt);
    expect(isActiveEntitlement(replayed)).toBe(false);
  });

  it("promotes a pending session once its payment clears", async () => {
    const store = memoryStore();
    const pending = await upsertStripeCheckoutSessionEntitlement(store, {
      ...base, id: "cs_async", payment_intent: "pi_async", status: "complete", payment_status: "unpaid",
    });
    expect(pending.status).toBe("pending");
    const cleared = await upsertStripeCheckoutSessionEntitlement(store, {
      ...base, id: "cs_async", payment_intent: "pi_async", status: "complete", payment_status: "paid",
    });
    expect(isActiveEntitlement(cleared)).toBe(true);
  });

  it("uses the subscription's current status over the historical session when given", async () => {
    const store = memoryStore();
    const paidSub = { id: "cs_live", mode: "subscription", subscription: "sub_live", status: "complete", payment_status: "paid" };
    const cancelled = await upsertStripeCheckoutSessionEntitlement(store, paidSub, { subscriptionStatus: "canceled" });
    expect(cancelled.status).toBe("cancelled");

    const trialing = await upsertStripeCheckoutSessionEntitlement(
      store, { ...paidSub, id: "cs_live2", subscription: "sub_live2" }, { subscriptionStatus: "trialing" },
    );
    expect(isActiveEntitlement(trialing)).toBe(true);

    // An "incomplete" subscription webhook landed first; the live status on the
    // success page has since moved to active, so the buyer gets access now.
    await upsertStripeSubscriptionEntitlement(store, { id: "sub_live3", status: "incomplete" });
    const live = await upsertStripeCheckoutSessionEntitlement(
      store, { ...paidSub, id: "cs_live3", subscription: "sub_live3" }, { subscriptionStatus: "active" },
    );
    expect(isActiveEntitlement(live)).toBe(true);
  });

  it("still lets an explicit cancellation revoke a subscription", async () => {
    const store = memoryStore();
    await upsertStripeSubscriptionEntitlement(store, { id: "sub_x", status: "active" });
    const cancelled = await upsertStripeSubscriptionEntitlement(store, { id: "sub_x", status: "canceled" });

    expect(cancelled.status).toBe("cancelled");
    expect(isActiveEntitlement(cancelled)).toBe(false);
  });
});
