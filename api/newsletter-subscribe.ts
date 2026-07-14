import { connectLambda, getStore } from "@netlify/blobs";
import { parseSubscriberPayload, processSubscriberSignup } from "./_lib/subscriber.js";

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

interface SubscriberRecord {
  email: string;
  name?: string;
  site?: string;
  source?: string;
  pageUrl?: string;
  referrer?: string;
  userAgent?: string;
  subscribedAt: string;
}

const SUBSTACK_URL = process.env.SUBSTACK_PUBLICATION_URL || "https://allowayai.substack.com";

function normalizeLambdaHeaders(headers: RequestLike["headers"]) {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      const flat = Array.isArray(value) ? value[0] : value;
      return typeof flat === "string" ? [[key.toLowerCase(), flat]] : [];
    }),
  );
}

function buildRedirectUrl(source: string) {
  const redirectUrl = new URL("/subscribe", SUBSTACK_URL);
  redirectUrl.searchParams.set("utm_source", source);
  redirectUrl.searchParams.set("utm_medium", "website");
  redirectUrl.searchParams.set("utm_campaign", "newsletter");
  return redirectUrl.toString();
}

async function saveToBlobsFallback(req: RequestLike, record: SubscriberRecord) {
  if (!req.blobs) return false;

  connectLambda({
    blobs: req.blobs,
    headers: normalizeLambdaHeaders(req.headers),
  });

  const store = getStore("ai-advantage-newsletter");
  await store.setJSON(`subscriber:${record.email}`, record);
  return true;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  let payload;
  try {
    payload = parseSubscriberPayload(req.body, req.headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Please enter a valid email address.";
    res.status(400).json({ message });
    return;
  }

  // Preferred path: Notion-backed capture when it is configured.
  if (process.env.NOTION_API_KEY && process.env.NOTION_PARENT_PAGE_ID) {
    try {
      const result = await processSubscriberSignup(payload);
      res.status(200).json(result);
      return;
    } catch (error) {
      console.error("Notion newsletter capture failed; falling back to Netlify Blobs.", error);
    }
  }

  // Fallback path: durable capture in Netlify Blobs, no extra services required.
  try {
    const saved = await saveToBlobsFallback(req, {
      email: payload.email,
      name: payload.name,
      site: payload.site,
      source: payload.source,
      pageUrl: payload.pageUrl,
      referrer: payload.referrer,
      userAgent: payload.userAgent,
      subscribedAt: new Date().toISOString(),
    });

    if (saved) {
      res.status(200).json({
        message: "Saved. We captured your signup and are taking you to the official Substack subscribe page.",
        redirectUrl: buildRedirectUrl(payload.source || payload.site || "newsletter"),
      });
      return;
    }
  } catch (error) {
    console.error("Netlify Blobs newsletter capture failed.", error);
  }

  res.status(503).json({ message: "Newsletter signup is temporarily unavailable. Please try again later." });
}
