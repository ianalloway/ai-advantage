import { describe, expect, it } from "vitest";
import {
  CryptoTransactionAlreadyClaimedError,
  findBestEntitlement,
  upsertCryptoEntitlement,
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
