import Stripe from "stripe";
import { getCurrentSiteUserFromEvent } from "../netlify/functions/_lib/auth-session";
import { getEntitlementStore } from "../netlify/functions/_lib/entitlements";
import { appendFunnelEvent } from "../netlify/lib/funnel";

type CheckoutMode = "premium" | "one-time";

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

const API_VERSION = "2026-02-25.clover";
const MODE_CONFIG: Record<CheckoutMode, { envKey: string; stripeMode: "payment" | "subscription"; label: string }> = {
  premium: {
    envKey: "STRIPE_PREMIUM_PRICE_ID",
    stripeMode: "subscription",
    label: "Pro Monthly",
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
  return mode === "premium" || mode === "one-time" ? mode : null;
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

function getClientReferenceId(body: unknown) {
  return getOptionalString(body, "clientReferenceId")?.slice(0, 200);
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
      jsonError(res, 400, "invalid_checkout_mode", "Choose either premium or one-time checkout.");
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
    // Prefer authenticated session identity. Body fields are only used when logged out
    // so a client cannot re-attribute a checkout to another userId while signed in.
    const customerEmail = siteUser?.email ?? getCustomerEmail(req.body);
    const clientReferenceId = siteUser?.id ?? (siteUser ? undefined : getClientReferenceId(req.body));
    const metadata = {
      product_surface: "ai-advantage",
      unlock_type: checkoutMode,
      plan_label: modeConfig.label,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}),
    };

    const trialDays = Number(process.env.STRIPE_TRIAL_DAYS || "7");
    const bodyObj = req.body && typeof req.body === "object" ? (req.body as { trial?: boolean }) : {};
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

    const store = getEntitlementStore({ blobs: req.blobs, headers: req.headers });
    if (store) {
      await appendFunnelEvent(store, {
        name: "checkout_started",
        mode: checkoutMode,
        sessionId: session.id,
        email: customerEmail,
        userId: clientReferenceId,
        meta: { trial: wantsTrial, trialDays: wantsTrial ? trialDays : 0 },
      });
      if (wantsTrial) {
        await appendFunnelEvent(store, {
          name: "trial_started",
          mode: checkoutMode,
          sessionId: session.id,
          email: customerEmail,
          userId: clientReferenceId,
          meta: { trialDays },
        });
      }
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
