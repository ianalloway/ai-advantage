import Stripe from "stripe";
import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import {
  findBestEntitlement,
  getEntitlementSessionToken,
  getEntitlementStore,
  getHeader,
} from "../netlify/functions/_lib/entitlements";
import { appendFunnelEvent } from "../netlify/lib/funnel";

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

const API_VERSION = "2026-02-25.clover";

function isConfigured(value: string | undefined, prefix: string) {
  return Boolean(value && value.startsWith(prefix) && !/your_|placeholder/i.test(value));
}

function getOrigin(req: RequestLike) {
  const configured = process.env.PUBLIC_APP_URL || process.env.URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = getHeader(req.headers, "x-forwarded-host") || getHeader(req.headers, "host");
  const protocol = getHeader(req.headers, "x-forwarded-proto") || "https";
  return host ? `${protocol}://${host}`.replace(/\/$/, "") : "http://localhost:5173";
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed." });
    return;
  }

  if (!isConfigured(process.env.STRIPE_SECRET_KEY, "sk_")) {
    res.status(500).json({ success: false, message: "Stripe is not configured." });
    return;
  }

  const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
  if (!store) {
    res.status(503).json({ success: false, message: "Entitlement store unavailable." });
    return;
  }

  const user = await getCurrentSiteUserFromEvent({ blobs: req.blobs, headers: req.headers });
  const token = getEntitlementSessionToken(req.headers);
  const entitlement = await findBestEntitlement(store, {
    userId: user?.id,
    email: user?.email,
    entitlementToken: token,
  });

  const customerId = entitlement?.stripeCustomerId;
  if (!customerId) {
    res.status(400).json({
      success: false,
      message: "No Stripe customer on this account yet. Start a Pro trial or subscription first.",
    });
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: API_VERSION });
  const returnUrl = new URL("/", getOrigin(req));
  returnUrl.searchParams.set("billing", "portal");

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl.toString(),
  });

  await appendFunnelEvent(store, {
    name: "portal_opened",
    email: user?.email ?? entitlement?.email,
    userId: user?.id ?? entitlement?.userId,
    meta: { customerId },
  });

  res.status(200).json({ success: true, url: session.url });
}
