import Stripe from "stripe";

type CheckoutMode = "premium" | "one-time";

type RequestLike = {
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

const API_VERSION = "2026-03-25.dahlia";

let stripeClient: Stripe | null = null;

function getStripeClient() {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Missing STRIPE_SECRET_KEY.");
    }

    stripeClient = new Stripe(secretKey, {
      apiVersion: API_VERSION,
    });
  }

  return stripeClient;
}

function getHeader(headers: RequestLike["headers"], name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function getOrigin(req: RequestLike) {
  const configuredOrigin = process.env.PUBLIC_APP_URL;
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const host =
    getHeader(req.headers, "x-forwarded-host") ||
    getHeader(req.headers, "host") ||
    process.env.VERCEL_URL;
  const protocol = getHeader(req.headers, "x-forwarded-proto") || "https";

  if (!host) {
    return "http://localhost:5173";
  }

  return `${protocol}://${host}`;
}

function getPriceId(mode: CheckoutMode) {
  if (mode === "premium") {
    return process.env.STRIPE_PREMIUM_PRICE_ID;
  }

  return process.env.STRIPE_ONE_TIME_PRICE_ID;
}

function getMode(body: unknown): CheckoutMode {
  if (
    body &&
    typeof body === "object" &&
    "mode" in body &&
    (body as { mode?: string }).mode === "one-time"
  ) {
    return "one-time";
  }

  return "premium";
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed.");
    return;
  }

  try {
    const checkoutMode = getMode(req.body);
    const priceId = getPriceId(checkoutMode);

    if (!priceId) {
      res
        .status(500)
        .send(`Missing ${checkoutMode === "premium" ? "STRIPE_PREMIUM_PRICE_ID" : "STRIPE_ONE_TIME_PRICE_ID"}.`);
      return;
    }

    const stripe = getStripeClient();
    const origin = getOrigin(req);
    const successUrl = new URL("/", origin);
    successUrl.searchParams.set("checkout", "success");
    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

    const cancelUrl = new URL("/", origin);
    cancelUrl.searchParams.set("checkout", "cancelled");

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode === "premium" ? "subscription" : "payment",
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      metadata: {
        product_surface: "ai-advantage",
        unlock_type: checkoutMode,
      },
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create Stripe Checkout session.";
    res.status(500).send(message);
  }
}
