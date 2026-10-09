// Email-ownership recovery for purchases that are not bound to an account.
//
// Paid access is never granted from an email address alone (signup does not
// verify email). Instead, a buyer asks for a single-use link sent to the email
// on the purchase; following it proves they control that mailbox, and the
// purchase is then bound to their signed-in account and/or this browser.
import { createHash, randomBytes } from "node:crypto";
import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import {
  bindEntitlementToUser,
  createEntitlementSession,
  entitlementSessionCookie,
  findActiveEntitlementsByPurchaseEmail,
  getEntitlementStore,
} from "../netlify/functions/_lib/entitlements";
import { isEmailConfigured, sendEmail } from "../netlify/lib/email";
import { consumeRateLimit, getClientIp } from "../netlify/lib/rate-limit";

type RequestLike = {
  blobs?: string;
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  send: (body: string) => void;
  setHeader: (name: string, value: string) => void;
};

const TOKEN_TTL_SECONDS = 30 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REQUESTS_PER_IP = { limit: 5, windowSeconds: 15 * 60 };
const REQUESTS_PER_EMAIL = { limit: 3, windowSeconds: 60 * 60 };
const GENERIC_SENT = "If a purchase was made with that email, we just sent it a restore link. It expires in 30 minutes.";

interface RecoveryToken {
  email: string;
  expiresAt: string;
}

function tokenKey(token: string) {
  return `ai-advantage:purchase-recovery:${createHash("sha256").update(token).digest("hex")}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function readBody(req: RequestLike): Record<string, string> {
  if (req.body && typeof req.body === "object") {
    return Object.fromEntries(
      Object.entries(req.body as Record<string, unknown>).map(([key, value]) => [key, typeof value === "string" ? value : ""]),
    );
  }
  if (typeof req.body !== "string") return {};
  try {
    const parsed = JSON.parse(req.body) as unknown;
    if (parsed && typeof parsed === "object") return readBody({ ...req, body: parsed });
  } catch {
    // Not JSON: the confirmation page posts a URL-encoded form.
  }
  return Object.fromEntries(new URLSearchParams(req.body));
}

function redirect(res: ResponseLike, origin: string, outcome: "restored" | "invalid") {
  res.setHeader("Location", `${origin}/profile?restore=${outcome}`);
  res.status(303).send("");
}

function confirmationPage(token: string) {
  // The token is validated against TOKEN_PATTERN, so it is safe in an attribute.
  // A GET never consumes the token: mail scanners prefetch links.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Restore your purchase</title></head>
<body style="font-family:system-ui,sans-serif;background:#030611;color:#e4e4e7;display:grid;place-items:center;min-height:100vh;margin:0">
<form method="post" action="/api/recover-purchase" style="max-width:24rem;padding:2rem;text-align:center">
<h1 style="font-size:1.25rem">Restore your AI Advantage purchase</h1>
<p style="color:#a1a1aa;font-size:.9rem">If you are signed in, the purchase is added to your account. Either way, this browser gets access.</p>
<input type="hidden" name="token" value="${token}">
<button type="submit" style="margin-top:1rem;padding:.75rem 1.5rem;border:0;border-radius:.75rem;background:#67e8f9;color:#020617;font-weight:600">Restore access</button>
</form></body></html>`;
}

async function requestLink(req: RequestLike, res: ResponseLike, origin: string, email: string) {
  const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers }, { consistency: "strong" });
  if (!store) {
    res.status(503).json({ success: false, message: "Purchase recovery is unavailable right now." });
    return;
  }
  const ipLimit = await consumeRateLimit(
    store.increment,
    `ai-advantage:ratelimit:recover-ip:${getClientIp(req.headers)}`,
    REQUESTS_PER_IP.limit,
    REQUESTS_PER_IP.windowSeconds,
  );
  const emailLimit = ipLimit.ok
    ? await consumeRateLimit(
        store.increment,
        `ai-advantage:ratelimit:recover-email:${createHash("sha256").update(email).digest("hex")}`,
        REQUESTS_PER_EMAIL.limit,
        REQUESTS_PER_EMAIL.windowSeconds,
      )
    : ipLimit;
  if (!emailLimit.ok) {
    res.setHeader("Retry-After", String(emailLimit.retryAfterSeconds));
    res.status(429).json({ success: false, message: "Too many restore requests. Try again later." });
    return;
  }

  // Same answer whether or not a purchase exists, so this cannot enumerate buyers.
  const purchases = await findActiveEntitlementsByPurchaseEmail(store, email);
  if (purchases.length > 0) {
    const token = randomBytes(32).toString("base64url");
    await store.set(
      tokenKey(token),
      { email, expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString() } satisfies RecoveryToken,
      { ex: TOKEN_TTL_SECONDS },
    );
    const link = `${origin}/api/recover-purchase?token=${token}`;
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

async function redeemLink(req: RequestLike, res: ResponseLike, origin: string, token: string) {
  const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers }, { consistency: "strong" });
  if (!store || !TOKEN_PATTERN.test(token)) {
    redirect(res, origin, "invalid");
    return;
  }
  const key = tokenKey(token);
  const record = await store.get<RecoveryToken>(key);
  // Single use: only the request that wins this marker may redeem.
  const firstUse = record ? await store.setIfAbsent(`${key}:used`, new Date().toISOString()) : false;
  await store.delete(key);
  if (!record || !firstUse || !(new Date(record.expiresAt).getTime() > Date.now())) {
    redirect(res, origin, "invalid");
    return;
  }

  const purchases = await findActiveEntitlementsByPurchaseEmail(store, record.email);
  if (purchases.length === 0) {
    redirect(res, origin, "invalid");
    return;
  }
  const user = await getCurrentSiteUserFromEvent({ blobs: req.blobs, headers: req.headers });
  if (user) {
    await Promise.all(purchases.map((purchase) => bindEntitlementToUser(store, purchase.id, user.id)));
  }
  const session = await createEntitlementSession(store, purchases[0]);
  res.setHeader("Set-Cookie", entitlementSessionCookie(req.headers, session.token, session.maxAge));
  redirect(res, origin, "restored");
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Cache-Control", "no-store");
  const origin = configuredOrigin();
  if (!origin || !isEmailConfigured()) {
    res.setHeader("Content-Type", "application/json");
    res.status(503).json({ success: false, message: "Purchase recovery by email is not configured." });
    return;
  }

  if (req.method === "GET") {
    const raw = req.query?.token;
    const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
    if (!TOKEN_PATTERN.test(token)) {
      redirect(res, origin, "invalid");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(confirmationPage(token));
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Content-Type", "application/json");
    res.status(405).json({ success: false, message: "Method not allowed." });
    return;
  }

  const body = readBody(req);
  if (body.token) {
    await redeemLink(req, res, origin, body.token);
    return;
  }

  res.setHeader("Content-Type", "application/json");
  const email = (body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ success: false, message: "Enter the email used for the purchase." });
    return;
  }
  await requestLink(req, res, origin, email);
}
