// Server-side crypto payment verification.
// Verifies an Ethereum tx (ETH or USDC/USDT transfer) actually paid the app
// wallet before any premium access is granted. See issue #36.
import {
  createEntitlementSession,
  entitlementSessionCookie,
  getEntitlementStore,
  claimCryptoEntitlement,
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
const PAYMENT_ADDRESS = (
  process.env.CRYPTO_PAYMENT_ADDRESS || "0x6f278ce76ba5ed31fd9be646d074863e126836e9"
).toLowerCase();

const MIN_ETH_WEI = BigInt(process.env.CRYPTO_MIN_ETH_WEI || "2500000000000000"); // 0.0025 ETH
const MIN_STABLE_UNITS = BigInt(process.env.CRYPTO_MIN_STABLE_UNITS || "9500000"); // 9.5 USDC/USDT (6 dp)
const MIN_CONFIRMATIONS = Number(process.env.CRYPTO_MIN_CONFIRMATIONS || "3");

const STABLE_TOKENS = new Set([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
]);
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getUnlockConfig(unlockType: string | undefined): { tier: AccessTier; label: string } {
  if (unlockType === "knowledge-vault") {
    return { tier: "premium", label: "Crypto Knowledge Vault" };
  }

  return { tier: "event", label: "Crypto Big Game Pass" };
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
  const unlockConfig = getUnlockConfig(body?.unlockType);

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
      if (BigInt(tx.value) >= MIN_ETH_WEI) {
        const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
        if (!store) {
          res.status(503).json({ verified: false, reason: "Entitlement backend is not configured." });
          return;
        }
        const entitlement = await claimCryptoEntitlement(store, {
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
    const paid = receipt.logs.some((log) => {
      if (!STABLE_TOKENS.has(log.address.toLowerCase())) return false;
      if (log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length < 3) return false;
      if (topicToAddress(log.topics[2]) !== PAYMENT_ADDRESS) return false;
      return BigInt(log.data) >= MIN_STABLE_UNITS;
    });

    if (paid) {
      const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
      if (!store) {
        res.status(503).json({ verified: false, reason: "Entitlement backend is not configured." });
        return;
      }
      const entitlement = await claimCryptoEntitlement(store, {
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
    const message = error instanceof Error ? error.message : "Verification failed.";
    if (message === "CRYPTO_TRANSACTION_ALREADY_CLAIMED") {
      res.status(409).json({ verified: false, reason: "This transaction hash has already been claimed." });
      return;
    }
    res.status(502).json({ verified: false, reason: message });
  }
}
