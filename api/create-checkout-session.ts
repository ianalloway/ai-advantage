import Stripe from "stripe";
import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import { getEntitlementStore } from "../netlify/functions/_lib/entitlements";
import { appendFunnelEvents } from "../netlify/lib/funnel";
import { checkoutClaimCookie, createCheckoutClaim } from "../netlify/lib/checkout-claim";

type CheckoutMode = "premium" | "annual" | "one-time";

type RequestLike = {
  blobs?: string;
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  send: (body: string) => void;
  setHeader: (name: string, value: string) => void;
};

const API_VERSION = "2026-08-26.dahlia";
const MODE_CONFIG: Record<CheckoutMode, { envKey: string; stripeMode: "payment" | "subscription"; label: string }> = {
  premium: {
    envKey: "STRIPE_PREMIUM_PRICE_ID",
    stripeMode: "subscription",
    label: "Pro Monthly",
  },
  annual: {
    envKey: "STRIPE_ANNUAL_PRICE_ID",
    stripeMode: "subscription",
    label: "Pro Annual",
  },
  "one-time": {
    envKey: "STRIPE_ONE_TIME_PRICE_ID",
    stripeMode: "payment",
    label: "Event Pass",
  },
};

let stripeClient: Stripe | null = null;

function isConfigured(value: string | undefined, prefix: string) {
  return Boolean(value && value.startsWith(prefix) && !/your_|placeholder/i.test(value));
}

function getStripeClient() {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!isConfigured(secretKey, "sk_")) {
      throw new Error("Missing STRIPE_SECRET_KEY.");
    }

    stripeClient = new Stripe(secretKey, {
      apiVersion: API_VERSION,
    });
  }

  return stripeClient;
}

function getHeader(headers: RequestLike["headers"], name: string) {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName);
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function getOrigin(req: RequestLike) {
  const configuredOrigin = process.env.PUBLIC_APP_URL || process.env.URL;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, "");
  }

  const host = getHeader(req.headers, "x-forwarded-host") || getHeader(req.headers, "host");
  const protocol = getHeader(req.headers, "x-forwarded-proto") || "https";

  if (!host) {
    return "http://localhost:5173";
  }

  return `${protocol}://${host}`.replace(/\/$/, "");
}

function getPriceId(mode: CheckoutMode) {
  return process.env[MODE_CONFIG[mode].envKey];
}

function getMode(body: unknown): CheckoutMode | null {
  if (!body || typeof body !== "object" || !("mode" in body)) {
    return "premium";
  }

  const mode = (body as { mode?: string }).mode;
  return mode === "premium" || mode === "annual" || mode === "one-time" ? mode : null;
}

function getOptionalString(body: unknown, key: string) {
  if (!body || typeof body !== "object" || !(key in body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getCustomerEmail(body: unknown) {
  const email = getOptionalString(body, "customerEmail")?.toLowerCase();
  return email && email.includes("@") ? email : undefined;
}

function jsonError(res: ResponseLike, status: number, code: string, message: string, details?: Record<string, unknown>) {
  res.status(status).json({ success: false, code, message, ...details });
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed.");
    return;
  }

  try {
    const checkoutMode = getMode(req.body);
    if (!checkoutMode) {
      jsonError(res, 400, "invalid_checkout_mode", "Choose premium, annual, or one-time checkout.");
      return;
    }

    if (!isConfigured(process.env.STRIPE_SECRET_KEY, "sk_")) {
      jsonError(res, 500, "stripe_secret_missing", "Card checkout is not configured yet.");
      return;
    }

    const priceId = getPriceId(checkoutMode);
    const modeConfig = MODE_CONFIG[checkoutMode];

    if (!isConfigured(priceId, "price_")) {
      jsonError(res, 500, "stripe_price_missing", `${modeConfig.label} card checkout is waiting on a Stripe Price ID.`, {
        missing: modeConfig.envKey,
      });
      return;
    }

    const stripe = getStripeClient();
    const origin = getOrigin(req);
    const successUrl = new URL("/", origin);
    successUrl.searchParams.set("checkout", "success");
    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

    const cancelUrl = new URL("/", origin);
    cancelUrl.searchParams.set("checkout", "cancelled");

    const siteUser = await getCurrentSiteUserFromEvent({ blobs: req.blobs, headers: req.headers });
    const checkoutClaim = createCheckoutClaim();
    // Account binding comes only from the authenticated session: client_reference_id
    // becomes the entitlement's userId, which authorizes access and the billing
    // portal. A logged-out body value is unverified, so guests get no account
    // binding here (the checkout claim cookie proves ownership instead). The body
    // email is only a Stripe prefill and never authorizes anything.
    const customerEmail = siteUser?.email ?? getCustomerEmail(req.body);
    const clientReferenceId = siteUser?.id;
    const referral = getOptionalString(req.body, "referral");
    const safeReferral =
      referral && /^[a-zA-Z0-9_-]{2,64}$/.test(referral) ? referral.slice(0, 64) : undefined;

    const metadata = {
      product_surface: "ai-advantage",
      unlock_type: checkoutMode,
      plan_label: modeConfig.label,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}),
      ...(safeReferral ? { referral: safeReferral } : {}),
    };

    const trialDays = Number(process.env.STRIPE_TRIAL_DAYS || "7");
    const bodyObj = req.body && typeof req.body === "object" ? (req.body as { trial?: boolean }) : {};
    // Trial is monthly-only — annual is already discounted.
    const wantsTrial = checkoutMode === "premium" && bodyObj.trial !== false && trialDays > 0;

    const session = await stripe.checkout.sessions.create({
      mode: modeConfig.stripeMode,
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      ...(modeConfig.stripeMode === "payment" ? { customer_creation: "always" as const } : {}),
      automatic_tax: {
        enabled: process.env.STRIPE_AUTOMATIC_TAX === "true",
      },
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}),
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      metadata: {
        ...metadata,
        checkout_claim_hash: checkoutClaim.hash,
        ...(wantsTrial ? { trial_days: String(trialDays) } : {}),
      },
      ...(modeConfig.stripeMode === "subscription"
        ? {
            subscription_data: {
              metadata,
              ...(wantsTrial ? { trial_period_days: trialDays } : {}),
            },
          }
        : { payment_intent_data: { metadata } }),
    });

    res.setHeader("Set-Cookie", checkoutClaimCookie(req.headers, session.id, checkoutClaim.token));

    const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
    if (store) {
      await appendFunnelEvents(store, [
        {
          name: "checkout_started",
          mode: checkoutMode,
          sessionId: session.id,
          email: customerEmail,
          userId: clientReferenceId,
          meta: {
            trial: wantsTrial,
            trialDays: wantsTrial ? trialDays : 0,
            ...(safeReferral ? { referral: safeReferral } : {}),
          },
        },
        ...(wantsTrial
          ? [
              {
                name: "trial_started" as const,
                mode: checkoutMode,
                sessionId: session.id,
                email: customerEmail,
                userId: clientReferenceId,
                meta: { trialDays, ...(safeReferral ? { referral: safeReferral } : {}) },
              },
            ]
          : []),
      ]);
    }

    res.status(200).json({
      url: session.url,
      id: session.id,
      mode: session.mode,
      trial: wantsTrial,
      trialDays: wantsTrial ? trialDays : 0,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create Stripe Checkout session.";
    jsonError(res, 500, "stripe_checkout_error", message);
  }
}
