import Stripe from "stripe";
import {
  getEntitlementStore,
  getHeader,
  upsertStripeCheckoutSessionEntitlement,
  upsertStripeSubscriptionEntitlement,
} from "./_lib/entitlements";

type NetlifyEvent = {
  blobs?: string;
  body: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
  isBase64Encoded?: boolean;
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

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function rawBody(event: NetlifyEvent) {
  if (!event.body) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

async function customerEmail(stripe: Stripe, customerId?: string | null) {
  if (!customerId) return undefined;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return !customer.deleted ? customer.email ?? undefined : undefined;
  } catch {
    return undefined;
  }
}

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return json(405, { received: false, message: "Method not allowed." });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isConfigured(process.env.STRIPE_SECRET_KEY, "sk_") || !isConfigured(webhookSecret, "whsec_")) {
    return json(500, {
      received: false,
      message: "Stripe webhook is not configured. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
    });
  }

  const stripe = getStripeClient();
  const signature = getHeader(event.headers, "stripe-signature");
  if (!signature) {
    return json(400, { received: false, message: "Missing Stripe-Signature header." });
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody(event), signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe webhook signature.";
    return json(400, { received: false, message });
  }

  const store = getEntitlementStore(event);
  if (!store) {
    return json(503, { received: false, message: "Entitlement backend is not configured." });
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        await upsertStripeCheckoutSessionEntitlement(store, session);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        const email = await customerEmail(stripe, customerId);
        await upsertStripeSubscriptionEntitlement(store, subscription, { email });
        break;
      }
      default:
        break;
    }

    return json(200, { received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process Stripe webhook.";
    return json(500, { received: false, message });
  }
};
