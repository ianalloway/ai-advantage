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

vi.mock("@netlify/blobs", async () => (await import("../tests/helpers/blobsMock")).blobsModule);

describe("EIP-191 signature recovery", () => {
  it("matches the standard personal_sign digest and key-to-address derivation", async () => {
    const { personalSignDigest, recoverPersonalSignAddress } = await import("../netlify/lib/crypto-claim");
    expect(Buffer.from(personalSignDigest("Hello World")).toString("hex")).toBe(
      "a1de988600a42c4b4ab089b619297c17d53cffae5d5120d82d8a92d0bb3b78f2",
    );
    // Private key 1 is the well-known address 0x7E5F...5Bdf.
    expect(recoverPersonalSignAddress("Hello World", await personalSign(ONE_KEY, "Hello World"))).toBe(
      "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
    );
    expect(recoverPersonalSignAddress("Hello World", "0x1234")).toBeNull();
  });
});

const ONE_KEY = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0));
const PAYMENT_ADDRESS = `0x${"c".repeat(40)}`;
const TX_HASH = `0x${"d".repeat(64)}`;

async function personalSign(privateKey: Uint8Array, message: string) {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");
  const { personalSignDigest } = await import("../netlify/lib/crypto-claim");
  const recovered = secp256k1.sign(personalSignDigest(message), privateKey, { prehash: false, format: "recovered" });
  // noble puts the recovery byte first; Ethereum wallets append v = 27 + recovery.
  const ethSig = new Uint8Array(65);
  ethSig.set(recovered.subarray(1), 0);
  ethSig[64] = 27 + recovered[0];
  return `0x${Buffer.from(ethSig).toString("hex")}`;
}

async function addressOf(privateKey: Uint8Array) {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");
  const { keccak_256 } = await import("@noble/hashes/sha3.js");
  const pub = secp256k1.getPublicKey(privateKey, false);
  return `0x${Buffer.from(keccak_256(pub.subarray(1)).subarray(-20)).toString("hex")}`;
}

describe("verify-crypto-payment ownership proof", () => {
  const blobs = Buffer.from(
    JSON.stringify({ url: "https://blob.invalid", url_uncached: "https://blob.invalid" }),
  ).toString("base64");
  const payerKey = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 7 : 0));
  const attackerKey = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 9 : 0));

  function response() {
    return {
      statusCode: 200,
      body: null as unknown as Record<string, unknown>,
      headers: {} as Record<string, string>,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body as Record<string, unknown>; },
      setHeader(name: string, value: string) { this.headers[name] = value; },
    };
  }

  async function setup() {
    (await import("../tests/helpers/blobsMock")).resetBlobs();
    vi.resetModules();
    process.env.CRYPTO_PAYMENT_ADDRESS = PAYMENT_ADDRESS;
    const payer = await addressOf(payerKey);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const { method } = JSON.parse(init.body) as { method: string };
      const result =
        method === "eth_getTransactionByHash"
          ? { to: PAYMENT_ADDRESS, from: payer, value: `0x${EVENT_ETH.toString(16)}`, blockNumber: "0x10" }
          : method === "eth_getTransactionReceipt"
            ? { status: "0x1", blockNumber: "0x10", logs: [] }
            : "0x20";
      return { ok: true, json: async () => ({ result }) };
    }));
    const handler = (await import("./verify-crypto-payment")).default;
    const call = async (body: Record<string, unknown>, ip = "203.0.113.5") => {
      const res = response();
      await handler({ blobs, method: "POST", headers: { host: "example.test", "x-nf-client-connection-ip": ip }, body }, res);
      return res;
    };
    return { handler, call, payer };
  }

  async function signedClaim(
    call: Awaited<ReturnType<typeof setup>>["call"],
    claim: Record<string, unknown>,
    key: Uint8Array,
  ) {
    const issued = await call({ ...claim, step: "challenge" });
    const { nonce, message } = issued.body.challenge as { nonce: string; message: string };
    return call({ ...claim, nonce, signature: await personalSign(key, message) });
  }

  afterEach(() => {
    delete process.env.CRYPTO_PAYMENT_ADDRESS;
    vi.unstubAllGlobals();
  });

  it("refuses a claim on someone else's public transaction without the payer's signature", async () => {
    const { call, payer } = await setup();
    const claim = { txHash: TX_HASH, walletAddress: payer, email: "attacker@example.test" };

    const unsigned = await call(claim);
    expect(unsigned.statusCode).toBe(401);

    const forged = await signedClaim(call, claim, attackerKey);
    expect(forged.statusCode).toBe(401);
    expect(forged.headers["Set-Cookie"]).toBeUndefined();

    // The rightful payer can still claim afterwards.
    const rightful = await signedClaim(call, { ...claim, email: "payer@example.test" }, payerKey);
    expect(rightful.body).toMatchObject({ verified: true, entitlement: { email: "payer@example.test" } });
    expect(rightful.headers["Set-Cookie"]).toContain("ai_advantage_entitlement=");
  });

  it("binds the signature to the exact claim it was issued for", async () => {
    const { call, payer } = await setup();
    const claim = { txHash: TX_HASH, walletAddress: payer, email: "payer@example.test" };
    const issued = await call({ ...claim, step: "challenge" });
    const { nonce, message } = issued.body.challenge as { nonce: string; message: string };
    const signature = await personalSign(payerKey, message);

    const redirected = await call({ ...claim, email: "attacker@example.test", nonce, signature });
    expect(redirected.statusCode).toBe(401);
    const claimed = await call({ ...claim, nonce, signature });
    expect(claimed.body).toMatchObject({ verified: true });
    // Single use: the same nonce cannot mint another session.
    const replayed = await call({ ...claim, nonce, signature });
    expect(replayed.statusCode).toBe(401);
  });

  it("reads challenges and claims through strongly consistent storage", async () => {
    const { call, payer } = await setup();
    const mock = await import("../tests/helpers/blobsMock");
    await call({ txHash: TX_HASH, walletAddress: payer, email: "payer@example.test", step: "challenge" });
    expect(mock.getStoreCalls).toContainEqual({ name: "ai-advantage-entitlements", consistency: "strong" });
  });

  it("rate-limits challenge issuance per IP", async () => {
    const { call, payer } = await setup();
    const claim = { txHash: TX_HASH, walletAddress: payer, email: "payer@example.test", step: "challenge" };
    for (let i = 0; i < 10; i += 1) expect((await call(claim, "198.51.100.1")).statusCode).toBe(200);
    const limited = await call(claim, "198.51.100.1");
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["Retry-After"])).toBeGreaterThan(0);
    expect((await call(claim, "198.51.100.2")).statusCode).toBe(200);
  });

  it("keeps issuing challenges, limited in-process, when strong Blobs reads are unavailable", async () => {
    const { handler, payer } = await setup();
    const { resetInProcessFallback } = await import("../netlify/lib/rate-limit");
    resetInProcessFallback();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const eventual = Buffer.from(JSON.stringify({ url: "https://blob.invalid" })).toString("base64");
    const challenge = async () => {
      const res = response();
      await handler({
        blobs: eventual, method: "POST",
        headers: { host: "example.test", "x-nf-client-connection-ip": "198.51.100.77" },
        body: { txHash: TX_HASH, walletAddress: payer, email: "payer@example.test", step: "challenge" },
      }, res);
      return res.statusCode;
    };
    try {
      for (let i = 0; i < 10; i += 1) expect(await challenge()).toBe(200);
      expect(await challenge()).toBe(429);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("[rate-limit:in-process-fallback] crypto-challenge"));
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects and deletes an expired challenge", async () => {
    const { call, payer } = await setup();
    const mock = await import("../tests/helpers/blobsMock");
    const claim = { txHash: TX_HASH, walletAddress: payer, email: "payer@example.test" };
    const issued = await call({ ...claim, step: "challenge" });
    const { nonce, message } = issued.body.challenge as { nonce: string; message: string };
    const key = `ai-advantage:crypto-claim:challenge:${nonce}`;
    expect(mock.blobValues("ai-advantage-entitlements").has(key)).toBe(true);

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(Date.now() + 11 * 60 * 1000));
      const late = await call({ ...claim, nonce, signature: await personalSign(payerKey, message) });
      expect(late.statusCode).toBe(401);
      expect(mock.blobValues("ai-advantage-entitlements").has(key)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the payer's wallet restore access without renewing the pass", async () => {
    const { call, payer } = await setup();
    const claim = { txHash: TX_HASH, walletAddress: payer, email: "payer@example.test" };
    const first = await signedClaim(call, claim, payerKey);
    const original = first.body.entitlement as { id: string; expiresAt: string };

    const restored = await signedClaim(call, claim, payerKey);
    expect(restored.body).toMatchObject({ verified: true, method: "restore" });
    expect(restored.body.entitlement).toMatchObject({ id: original.id, expiresAt: original.expiresAt });
    expect(restored.headers["Set-Cookie"]).toContain("ai_advantage_entitlement=");
  });
});
