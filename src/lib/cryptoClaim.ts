interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export interface CryptoClaimInput {
  txHash: string;
  walletAddress: string;
  email: string;
  unlockType: string;
}

export interface CryptoClaimResult {
  verified: boolean;
  reason?: string;
}

function getWalletProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return provider && typeof provider.request === "function" ? provider : null;
}

function utf8ToHex(value: string) {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function postClaim(body: Record<string, unknown>) {
  const response = await fetch("/api/verify-crypto-payment", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as CryptoClaimResult & {
    challenge?: { nonce: string; message: string };
  };
}

/**
 * Claim an on-chain payment. A tx hash and its sender are public, so the server
 * only grants access after the sending wallet signs a single-use message
 * (EIP-191 personal_sign, no gas) bound to this tx, email and account.
 */
export async function claimCryptoPayment(input: CryptoClaimInput): Promise<CryptoClaimResult> {
  const provider = getWalletProvider();
  if (!provider) {
    return {
      verified: false,
      reason: "Open this page in a browser with the wallet that sent the payment (for example MetaMask) so it can sign the claim.",
    };
  }

  const wallet = input.walletAddress.trim().toLowerCase();
  let accounts: string[] | undefined;
  try {
    accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[] | undefined;
  } catch {
    return { verified: false, reason: "Connect the wallet that sent the payment so it can sign the claim." };
  }
  if (!accounts?.some((account) => account.toLowerCase() === wallet)) {
    return { verified: false, reason: `Switch your wallet to ${input.walletAddress} (the address that sent the payment) and try again.` };
  }

  const issued = await postClaim({ ...input, step: "challenge" });
  if (!issued.challenge) {
    return { verified: false, reason: issued.reason || "Could not start the claim. Try again in a minute." };
  }

  let signature: string;
  try {
    signature = (await provider.request({
      method: "personal_sign",
      params: [utf8ToHex(issued.challenge.message), input.walletAddress],
    })) as string;
  } catch {
    return { verified: false, reason: "The claim was not signed in your wallet." };
  }

  return postClaim({ ...input, nonce: issued.challenge.nonce, signature });
}
