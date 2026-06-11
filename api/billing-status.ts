type RequestLike = {
  method?: string;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

function isConfigured(value: string | undefined, prefix: string) {
  return Boolean(value && value.startsWith(prefix) && !/your_|placeholder/i.test(value));
}

export default function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    res.status(405).json({ success: false, code: "method_not_allowed", message: "Method not allowed." });
    return;
  }

  const stripeSecretConfigured = isConfigured(process.env.STRIPE_SECRET_KEY, "sk_");
  const premiumPriceConfigured = isConfigured(process.env.STRIPE_PREMIUM_PRICE_ID, "price_");
  const oneTimePriceConfigured = isConfigured(process.env.STRIPE_ONE_TIME_PRICE_ID, "price_");

  res.status(200).json({
    stripeSecretConfigured,
    premiumPriceConfigured,
    oneTimePriceConfigured,
    premiumCheckoutReady: stripeSecretConfigured && premiumPriceConfigured,
    oneTimeCheckoutReady: stripeSecretConfigured && oneTimePriceConfigured,
    automaticTaxEnabled: process.env.STRIPE_AUTOMATIC_TAX === "true",
  });
}
