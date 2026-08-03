import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EVENT_ETH = 3_000_000_000_000_000n; // 0.003 ETH — the price the UI quotes
const EVENT_STABLE = 10_000_000n; // 10 USDC

async function loadResolver(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const mod = await import("./verify-crypto-payment");
  return mod.resolveUnlock;
}

const PREMIUM_ENV_KEYS = ["CRYPTO_MIN_PREMIUM_ETH_WEI", "CRYPTO_MIN_PREMIUM_STABLE_UNITS"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of PREMIUM_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of PREMIUM_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.resetModules();
});

describe("resolveUnlock", () => {
  it("grants the event pass for a normal unlock request", async () => {
    const resolveUnlock = await loadResolver();
    expect(resolveUnlock("big-game", { ethWei: EVENT_ETH })).toMatchObject({ tier: "event" });
    expect(resolveUnlock(undefined, { stableUnits: EVENT_STABLE })).toMatchObject({ tier: "event" });
  });

  // The vault is permanent premium while the event pass expires in 72 hours, and
  // both shared one payment minimum. A client-supplied unlockType must not be
  // able to turn an event-priced payment into permanent access.
  it("refuses to grant permanent premium for an event-priced payment", async () => {
    const resolveUnlock = await loadResolver();

    expect(resolveUnlock("knowledge-vault", { ethWei: EVENT_ETH })).toMatchObject({ tier: "event" });
    expect(resolveUnlock("knowledge-vault", { stableUnits: EVENT_STABLE })).toMatchObject({
      tier: "event",
    });
  });

  it("keeps the vault off entirely while no premium price is configured", async () => {
    const resolveUnlock = await loadResolver();
    // Even an enormous payment cannot buy a product that has no configured price.
    expect(resolveUnlock("knowledge-vault", { ethWei: EVENT_ETH * 1000n })).toMatchObject({
      tier: "event",
    });
  });

  it("grants the vault once a premium price is configured and met", async () => {
    const resolveUnlock = await loadResolver({
      CRYPTO_MIN_PREMIUM_ETH_WEI: "30000000000000000", // 0.03 ETH
      CRYPTO_MIN_PREMIUM_STABLE_UNITS: "100000000", // 100 USDC
    });

    expect(resolveUnlock("knowledge-vault", { ethWei: 30_000_000_000_000_000n })).toMatchObject({
      tier: "premium",
      label: "Crypto Knowledge Vault",
    });
    expect(resolveUnlock("knowledge-vault", { stableUnits: 100_000_000n })).toMatchObject({
      tier: "premium",
    });
  });

  it("downgrades to the event pass when a configured premium price is not met", async () => {
    const resolveUnlock = await loadResolver({
      CRYPTO_MIN_PREMIUM_ETH_WEI: "30000000000000000",
      CRYPTO_MIN_PREMIUM_STABLE_UNITS: "100000000",
    });

    // One wei short must not round up into permanent access.
    expect(resolveUnlock("knowledge-vault", { ethWei: 29_999_999_999_999_999n })).toMatchObject({
      tier: "event",
    });
    expect(resolveUnlock("knowledge-vault", { stableUnits: 99_999_999n })).toMatchObject({
      tier: "event",
    });
  });

  it("does not let an ETH payment satisfy a stablecoin threshold, or vice versa", async () => {
    const resolveUnlock = await loadResolver({
      CRYPTO_MIN_PREMIUM_STABLE_UNITS: "100000000", // only the stable price is set
    });

    // Wei are numerically enormous next to 6-decimal stable units; the two
    // scales must never be compared against each other.
    expect(resolveUnlock("knowledge-vault", { ethWei: EVENT_ETH })).toMatchObject({ tier: "event" });
  });
});
