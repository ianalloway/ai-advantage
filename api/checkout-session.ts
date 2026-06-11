import Stripe from "stripe";

type RequestLike = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  send: (body: string) => void;
  setHeader: (name: string, value: string) => void;
};

const API_VERSION = "2026-02-25.clover";

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

function getSessionId(req: RequestLike) {
  const value = req.query?.session_id;
  return Array.isArray(value) ? value[0] : value;
}

function jsonError(res: ResponseLike, status: number, code: string, message: string) {
  res.status(status).json({ success: false, code, message });
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    jsonError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  const sessionId = getSessionId(req);
  if (!sessionId || !sessionId.startsWith("cs_")) {
    jsonError(res, 400, "missing_session_id", "Missing or invalid session_id.");
    return;
  }

  if (!isConfigured(process.env.STRIPE_SECRET_KEY, "sk_")) {
    jsonError(res, 500, "stripe_secret_missing", "Card checkout verification is not configured yet.");
    return;
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid =
      session.status === "complete" &&
      (session.payment_status === "paid" || session.payment_status === "no_payment_required");

    res.status(200).json({
      paid,
      mode: session.mode,
      status: session.status,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email ?? null,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to verify Stripe Checkout session.";
    jsonError(res, 500, "stripe_checkout_verify_error", message);
  }
}
