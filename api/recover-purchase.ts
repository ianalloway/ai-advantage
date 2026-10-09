// Email-ownership recovery for purchases that are not bound to an account.
//
// Paid access is never granted from an email address alone (signup does not
// verify email). Instead, a buyer asks for a single-use link sent to the email
// on the purchase; following it proves they control that mailbox, and access is
// restored on that browser. The purchase is bound to an account only when the
// account and browser that asked for the link are the ones confirming it.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import {
  bindEntitlementToUser,
  createEntitlementSession,
  entitlementSessionCookie,
  findActiveEntitlementsByPurchaseEmail,
  getCookie,
  getEntitlementStore,
  shouldUseSecureCookie,
  type EntitlementStore,
} from "../netlify/functions/_lib/entitlements";
import { isEmailConfigured, sendEmail } from "../netlify/lib/email";
import { consumeRateLimit, getClientIp } from "../netlify/lib/rate-limit";
import { rejectCrossSiteJson } from "../netlify/lib/request-guard";

type RequestLike = {
  blobs?: string;
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const TOKEN_TTL_SECONDS = 30 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const NONCE_COOKIE = "ai_advantage_restore_nonce";
const NONCE_COOKIE_PATH = "/api/recover-purchase";
const REQUESTS_PER_IP = { limit: 5, windowSeconds: 15 * 60 };
const REQUESTS_PER_EMAIL = { limit: 3, windowSeconds: 60 * 60 };
const GENERIC_SENT = "If a purchase was made with that email, we just sent it a restore link. It expires in 30 minutes.";

interface RecoveryToken {
  email: string;
  expiresAt: string;
  /** sha256 of the HttpOnly nonce cookie set on the browser that asked for the link. */
  nonceHash: string;
  /** Account signed in when the link was requested, or null for a guest. */
  requesterUserId: string | null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function tokenKey(token: string) {
  return `ai-advantage:purchase-recovery:${sha256(token)}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain ?? ""}`;
}

/**
 * Links in the email must point at our own origin. A Host header is
 * attacker-controlled (it would let someone mail a victim a link to their own
 * server and harvest the token), so only configured origins are used.
 */
function configuredOrigin() {
  const origin = process.env.PUBLIC_APP_URL || process.env.URL;
  return origin ? origin.replace(/\/$/, "") : null;
}

function nonceCookie(req: RequestLike, value: string, maxAge: number) {
  const parts = [`${NONCE_COOKIE}=${value}`, `Path=${NONCE_COOKIE_PATH}`, `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (shouldUseSecureCookie(req.headers)) parts.push("Secure");
  return parts.join("; ");
}

function sameHash(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * The account a confirmed link may bind to: only the account that requested the
 * link, still signed in, on the browser holding the request's nonce. Anything
 * else (a different browser, a different or swapped-in account, a guest) gets
 * browser-only access.
 */
async function bindingTarget(req: RequestLike, record: RecoveryToken) {
  if (!record.requesterUserId) return null;
  const nonce = getCookie(req.headers, NONCE_COOKIE);
  if (!nonce || !sameHash(sha256(nonce), record.nonceHash)) return null;
  const user = await getCurrentSiteUserFromEvent({ blobs: req.blobs, headers: req.headers });
  return user && user.id === record.requesterUserId ? user : null;
}

async function readLiveToken(store: EntitlementStore, token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const record = await store.get<RecoveryToken>(tokenKey(token));
  if (!record) return null;
  if (!(new Date(record.expiresAt).getTime() > Date.now())) {
    await store.delete(tokenKey(token));
    return null;
  }
  return record;
}

async function requestLink(req: RequestLike, res: ResponseLike, store: EntitlementStore, origin: string, email: string) {
  const ipLimit = await consumeRateLimit(
    store.increment,
    `ai-advantage:ratelimit:recover-ip:${getClientIp(req.headers)}`,
    REQUESTS_PER_IP.limit,
    REQUESTS_PER_IP.windowSeconds,
  );
  const emailLimit = ipLimit.ok
    ? await consumeRateLimit(
        store.increment,
        `ai-advantage:ratelimit:recover-email:${sha256(email)}`,
        REQUESTS_PER_EMAIL.limit,
        REQUESTS_PER_EMAIL.windowSeconds,
      )
    : ipLimit;
  if (!emailLimit.ok) {
    res.setHeader("Retry-After", String(emailLimit.retryAfterSeconds));
    res.status(429).json({ success: false, message: "Too many restore requests. Try again later." });
    return;
  }

  const user = await getCurrentSiteUserFromEvent({ blobs: req.blobs, headers: req.headers });
  const nonce = randomBytes(32).toString("base64url");
  res.setHeader("Set-Cookie", nonceCookie(req, nonce, TOKEN_TTL_SECONDS));

  // Same answer whether or not a purchase exists, so this cannot enumerate buyers.
  const purchases = await findActiveEntitlementsByPurchaseEmail(store, email);
  if (purchases.length > 0) {
    const token = randomBytes(32).toString("base64url");
    await store.set(
      tokenKey(token),
      {
        email,
        expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
        nonceHash: sha256(nonce),
        requesterUserId: user?.id ?? null,
      } satisfies RecoveryToken,
      { ex: TOKEN_TTL_SECONDS },
    );
    // The token rides in the URL fragment: it never reaches a server log, a
    // Referer header, or a link-scanning GET.
    const link = `${origin}/profile#restore=${token}`;
    const sent = await sendEmail(
      email,
      "Restore your AI Advantage purchase",
      `<p>Someone asked to restore access to the AI Advantage purchase made with this email.</p>
<p><a href="${link}">Restore my purchase</a> (expires in 30 minutes, works once)</p>
<p style="color:#64748b;font-size:13px">If this wasn't you, ignore this email. Nothing changes unless the link is used.</p>`,
      `Restore your AI Advantage purchase (expires in 30 minutes, works once):\n${link}\n\nIf this wasn't you, ignore this email.`,
    );
    if (!sent.ok) {
      console.error("[recover-purchase] restore email failed", sent.reason);
    }
  }

  res.status(200).json({ success: true, message: GENERIC_SENT });
}

async function previewLink(req: RequestLike, res: ResponseLike, store: EntitlementStore, token: string) {
  const record = await readLiveToken(store, token);
  const purchases = record ? await findActiveEntitlementsByPurchaseEmail(store, record.email) : [];
  if (!record || purchases.length === 0) {
    res.status(200).json({ valid: false });
    return;
  }
  const target = await bindingTarget(req, record);
  res.status(200).json({ valid: true, account: target ? maskEmail(target.email) : null });
}

async function redeemLink(req: RequestLike, res: ResponseLike, store: EntitlementStore, token: string) {
  const record = await readLiveToken(store, token);
  // Single use: only the request that wins this marker may redeem.
  const firstUse = record ? await store.setIfAbsent(`${tokenKey(token)}:used`, new Date().toISOString()) : false;
  if (record) await store.delete(tokenKey(token));
  const purchases = record && firstUse ? await findActiveEntitlementsByPurchaseEmail(store, record.email) : [];
  if (!record || !firstUse || purchases.length === 0) {
    res.status(410).json({ success: false, message: "That restore link was already used or has expired." });
    return;
  }

  const target = await bindingTarget(req, record);
  if (target) {
    await Promise.all(purchases.map((purchase) => bindEntitlementToUser(store, purchase.id, target.id)));
  }
  const session = await createEntitlementSession(store, purchases[0]);
  res.setHeader("Set-Cookie", entitlementSessionCookie(req.headers, session.token, session.maxAge));
  res.status(200).json({ success: true, account: target ? maskEmail(target.email) : null });
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed." });
    return;
  }
  const crossSite = rejectCrossSiteJson(req.headers);
  if (crossSite) {
    res.status(crossSite.status).json({ success: false, message: crossSite.message });
    return;
  }
  const origin = configuredOrigin();
  const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers }, { consistency: "strong" });
  if (!origin || !isEmailConfigured() || !store) {
    res.status(503).json({ success: false, message: "Purchase recovery by email is not configured." });
    return;
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token : "";
  if (body.action === "preview") {
    await previewLink(req, res, store, token);
    return;
  }
  if (body.action === "redeem") {
    await redeemLink(req, res, store, token);
    return;
  }

  const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ success: false, message: "Enter the email used for the purchase." });
    return;
  }
  await requestLink(req, res, store, origin, email);
}
