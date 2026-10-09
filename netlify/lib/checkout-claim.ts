import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getCookie, shouldUseSecureCookie } from "../functions/_lib/entitlements";

const COOKIE_PREFIX = "ai_advantage_checkout_claim_";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
type RequestHeaders = Parameters<typeof getCookie>[0];

function cookieName(sessionId: string) {
  return `${COOKIE_PREFIX}${createHash("sha256").update(sessionId).digest("hex").slice(0, 16)}`;
}

export function createCheckoutClaim() {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function checkoutClaimCookie(headers: RequestHeaders, sessionId: string, token: string) {
  const parts = [
    `${cookieName(sessionId)}=${token}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (shouldUseSecureCookie(headers)) parts.push("Secure");
  return parts.join("; ");
}

export function hasCheckoutClaim(headers: RequestHeaders, sessionId: string, expectedHash: string | undefined) {
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  let token: string | null;
  try {
    token = getCookie(headers, cookieName(sessionId));
  } catch {
    return false;
  }
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(actual, Buffer.from(expectedHash, "hex"));
}
