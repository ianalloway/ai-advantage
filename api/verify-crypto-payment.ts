// Server-side crypto payment verification.
// Verifies an Ethereum tx (ETH or USDC/USDT transfer) actually paid the app
// wallet before any premium access is granted. See issue #36.
import {
  CryptoTransactionAlreadyClaimedError,
  createEntitlementSession,
  entitlementSessionCookie,
  getEntitlementStore,
  upsertCryptoEntitlement,
  type AccessTier,
} from "../netlify/functions/_lib/entitlements";

type RequestLike = {
  blobs?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const RPC_URL = process.env.ETH_RPC_URL || "https://cloudflare-eth.com";
// Fail closed — never default to a hard-coded wallet in production.
const PAYMENT_ADDRESS = (process.env.CRYPTO_PAYMENT_ADDRESS || "").trim().toLowerCase();

const MIN_ETH_WEI = BigInt(process.env.CRYPTO_MIN_ETH_WEI || "2500000000000000"); // 0.0025 ETH
const MIN_STABLE_UNITS = BigInt(process.env.CRYPTO_MIN_STABLE_UNITS || "9500000"); // 9.5 USDC/USDT (6 dp)
const MIN_CONFIRMATIONS = Number(process.env.CRYPTO_MIN_CONFIRMATIONS || "3");

// `unlockType` arrives in the request body, and the two unlock types are worth
// very different things: the event pass expires in 72 hours, the vault is
// permanent premium. They shared one payment minimum, so anyone could pay the
// event price, post `unlockType: "knowledge-vault"`, and receive permanent
// premium. The vault is not offered anywhere in the UI and has no price of its
// own, so it stays off unless a higher minimum is configured for it.
const MIN_PREMIUM_ETH_WEI = process.env.CRYPTO_MIN_PREMIUM_ETH_WEI
  ? BigInt(process.env.CRYPTO_MIN_PREMIUM_ETH_WEI)
  : null;
const MIN_PREMIUM_STABLE_UNITS = process.env.CRYPTO_MIN_PREMIUM_STABLE_UNITS
  ? BigInt(process.env.CRYPTO_MIN_PREMIUM_STABLE_UNITS)
  : null;

const STABLE_TOKENS = new Set([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
]);
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const EVENT_UNLOCK = { tier: "event" as AccessTier, label: "Crypto Big Game Pass" };
const PREMIUM_UNLOCK = { tier: "premium" as AccessTier, label: "Crypto Knowledge Vault" };

/**
 * Decide the tier from what was actually paid, not from what the client asked
 * for. A request for the permanent vault that only covers the event price is
 * downgraded to the event pass rather than rejected — the payment is real, it
 * just bought the cheaper product.
 */
export function resolveUnlock(
  unlockType: string | undefined,
  paid: { ethWei?: bigint; stableUnits?: bigint },
): { tier: AccessTier; label: string } {
  if (unlockType !== "knowledge-vault") return EVENT_UNLOCK;

  const clearsEth =
    MIN_PREMIUM_ETH_WEI !== null && paid.ethWei !== undefined && paid.ethWei >= MIN_PREMIUM_ETH_WEI;
  const clearsStable =
    MIN_PREMIUM_STABLE_UNITS !== null &&
    paid.stableUnits !== undefined &&
    paid.stableUnits >= MIN_PREMIUM_STABLE_UNITS;

  return clearsEth || clearsStable ? PREMIUM_UNLOCK : EVENT_UNLOCK;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`RPC error: ${response.status}`);
  }
  const data = (await response.json()) as { result?: T; error?: { message?: string } };
  if (data.error) {
    throw new Error(data.error.message || "RPC returned an error.");
  }
  return data.result as T;
}

interface RpcTransaction {
  to: string | null;
  from: string;
  value: string;
  blockNumber: string | null;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
}

interface RpcReceipt {
  status: string;
  blockNumber: string;
  logs: RpcLog[];
}

function topicToAddress(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  let body: {
    txHash?: string;
    walletAddress?: string;
    email?: string;
    unlockType?: string;
  };
  try {
    body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}) as typeof body;
  } catch {
    res.status(400).json({ verified: false, reason: "Invalid JSON body." });
    return;
  }

  const txHash = (body?.txHash || "").trim().toLowerCase();
  const walletAddress = (body?.walletAddress || "").trim().toLowerCase();
  const email = (body?.email || "").trim().toLowerCase();
  const requestedUnlock = body?.unlockType;

  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    res.status(400).json({ verified: false, reason: "Invalid transaction hash." });
    return;
  }
  if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) {
    res.status(400).json({ verified: false, reason: "Invalid wallet address." });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ verified: false, reason: "A valid access email is required." });
    return;
  }
  if (!/^0x[a-f0-9]{40}$/.test(PAYMENT_ADDRESS)) {
    res.status(503).json({
      verified: false,
      reason: "Crypto payments are not configured (missing CRYPTO_PAYMENT_ADDRESS).",
    });
    return;
  }

  try {
    const [tx, receipt, latestHex] = await Promise.all([
      rpc<RpcTransaction | null>("eth_getTransactionByHash", [txHash]),
      rpc<RpcReceipt | null>("eth_getTransactionReceipt", [txHash]),
      rpc<string>("eth_blockNumber", []),
    ]);

    if (!tx || !receipt || !receipt.blockNumber) {
      res.status(200).json({ verified: false, reason: "Transaction not found or not yet mined." });
      return;
    }
    if (receipt.status !== "0x1") {
      res.status(200).json({ verified: false, reason: "Transaction failed on-chain." });
      return;
    }

    const confirmations = Number(BigInt(latestHex) - BigInt(receipt.blockNumber)) + 1;
    if (confirmations < MIN_CONFIRMATIONS) {
      res.status(200).json({
        verified: false,
        reason: `Waiting for confirmations (${confirmations}/${MIN_CONFIRMATIONS}). Try again shortly.`,
      });
      return;
    }

    if (tx.from.toLowerCase() !== walletAddress) {
      res.status(200).json({ verified: false, reason: "Transaction was not sent from that wallet." });
      return;
    }

    // Case 1: direct ETH payment to the app wallet.
    if (tx.to && tx.to.toLowerCase() === PAYMENT_ADDRESS) {
      const ethWei = BigInt(tx.value);
      if (ethWei >= MIN_ETH_WEI) {
        const unlockConfig = resolveUnlock(requestedUnlock, { ethWei });
        const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
        if (!store) {
          res.status(503).json({ verified: false, reason: "Entitlement backend is not configured." });
          return;
        }
        const entitlement = await upsertCryptoEntitlement(store, {
          email,
          walletAddress,
          txHash,
          tier: unlockConfig.tier,
          label: unlockConfig.label,
        });
        const session = await createEntitlementSession(store, entitlement);
        res.setHeader("Set-Cookie", entitlementSessionCookie(req.headers, session.token, session.maxAge));
        res.status(200).json({ verified: true, method: "eth", entitlement });
        return;
      }
      res.status(200).json({ verified: false, reason: "ETH amount below the required payment." });
      return;
    }

    // Case 2: USDC/USDT ERC-20 transfer to the app wallet.
    let stableUnits: bigint | undefined;
    for (const log of receipt.logs) {
      if (!STABLE_TOKENS.has(log.address.toLowerCase())) continue;
      if (log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue;
      if (topicToAddress(log.topics[2]) !== PAYMENT_ADDRESS) continue;
      // A Transfer with an empty data field carries no amount.
      const amount = log.data && log.data !== "0x" ? BigInt(log.data) : 0n;
      if (amount < MIN_STABLE_UNITS) continue;
      // Keep the largest qualifying transfer: one tx may pay the wallet twice.
      if (stableUnits === undefined || amount > stableUnits) stableUnits = amount;
    }

    if (stableUnits !== undefined) {
      const unlockConfig = resolveUnlock(requestedUnlock, { stableUnits });
      const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
      if (!store) {
        res.status(503).json({ verified: false, reason: "Entitlement backend is not configured." });
        return;
      }
      const entitlement = await upsertCryptoEntitlement(store, {
        email,
        walletAddress,
        txHash,
        tier: unlockConfig.tier,
        label: unlockConfig.label,
      });
      const session = await createEntitlementSession(store, entitlement);
      res.setHeader("Set-Cookie", entitlementSessionCookie(req.headers, session.token, session.maxAge));
      res.status(200).json({ verified: true, method: "stablecoin", entitlement });
      return;
    }

    res.status(200).json({
      verified: false,
      reason: "Transaction does not pay the app wallet the required amount.",
    });
  } catch (error) {
    if (error instanceof CryptoTransactionAlreadyClaimedError) {
      res.status(409).json({
        verified: false,
        reason: "This crypto transaction has already been claimed.",
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Verification failed.";
    res.status(502).json({ verified: false, reason: message });
  }
}
