import { randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { EntitlementStore } from "../functions/_lib/entitlements";

/**
 * Proof that the person claiming an on-chain payment controls the paying wallet.
 *
 * A transaction hash and its sender are public, so they cannot prove anything on
 * their own. The server issues a single-use nonce bound to the transaction, the
 * wallet, the access email and the signed-in account (or "guest"), and the
 * wallet signs that exact message with EIP-191 `personal_sign`.
 */

const CHALLENGE_PREFIX = "ai-advantage:crypto-claim:challenge";
const CHALLENGE_TTL_SECONDS = 10 * 60;

export interface CryptoClaimBinding {
  txHash: string;
  walletAddress: string;
  email: string;
  userId: string | null;
}

interface StoredChallenge extends CryptoClaimBinding {
  message: string;
  expiresAt: string;
}

function challengeKey(nonce: string) {
  return `${CHALLENGE_PREFIX}:${nonce}`;
}

export function buildCryptoClaimMessage(binding: CryptoClaimBinding, nonce: string, issuedAt: string) {
  return [
    "AI Advantage: claim crypto payment",
    "",
    "Signing proves you control the wallet that sent this payment. It costs no gas.",
    "",
    `Wallet: ${binding.walletAddress}`,
    `Transaction: ${binding.txHash}`,
    `Access email: ${binding.email}`,
    `Account: ${binding.userId ?? "guest"}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

export async function createCryptoClaimChallenge(store: EntitlementStore, binding: CryptoClaimBinding) {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
  const message = buildCryptoClaimMessage(binding, nonce, issuedAt);
  await store.set(challengeKey(nonce), { ...binding, message, expiresAt } satisfies StoredChallenge, {
    ex: CHALLENGE_TTL_SECONDS,
  });
  return { nonce, message, expiresAt };
}

/** The challenge for `nonce` if it exists, is unexpired and matches `binding` exactly. */
export async function getCryptoClaimChallenge(store: EntitlementStore, nonce: unknown, binding: CryptoClaimBinding) {
  if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/.test(nonce)) return null;
  const challenge = await store.get<StoredChallenge>(challengeKey(nonce));
  if (!challenge || typeof challenge.message !== "string") return null;
  if (!(new Date(challenge.expiresAt).getTime() > Date.now())) {
    // Netlify Blobs has no TTL, so expired challenges are removed when seen.
    await store.delete(challengeKey(nonce));
    return null;
  }
  const matches =
    challenge.txHash === binding.txHash &&
    challenge.walletAddress === binding.walletAddress &&
    challenge.email === binding.email &&
    (challenge.userId ?? null) === (binding.userId ?? null);
  return matches ? challenge : null;
}

export async function deleteCryptoClaimChallenge(store: EntitlementStore, nonce: string) {
  await store.delete(challengeKey(nonce));
}

function hexToBytes(hex: string) {
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
}

function toHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

/** EIP-191 personal_sign digest: keccak256("\x19Ethereum Signed Message:\n" + len + message). */
export function personalSignDigest(message: string) {
  const body = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const payload = new Uint8Array(prefix.length + body.length);
  payload.set(prefix);
  payload.set(body, prefix.length);
  return keccak_256(payload);
}

/** Lower-case 0x address that produced `signature` over `message`, or null if it is malformed. */
export function recoverPersonalSignAddress(message: string, signature: unknown): string | null {
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  const bytes = hexToBytes(signature);
  const v = bytes[64];
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) return null;
  try {
    const publicKey = secp256k1.Signature.fromBytes(bytes.subarray(0, 64), "compact")
      .addRecoveryBit(recovery)
      .recoverPublicKey(personalSignDigest(message))
      .toBytes(false);
    return `0x${toHex(keccak_256(publicKey.subarray(1)).subarray(-20))}`;
  } catch {
    return null;
  }
}
