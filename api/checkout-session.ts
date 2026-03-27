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

function getSessionId(req: RequestLike) {
  const value = req.query?.session_id;
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    res.status(405).send("Method not allowed.");
    return;
  }

  const sessionId = getSessionId(req);
  if (!sessionId) {
    res.status(400).send("Missing session_id.");
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
      customerEmail: session.customer_details?.email ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to verify Stripe Checkout session.";
    res.status(500).send(message);
  }
}
