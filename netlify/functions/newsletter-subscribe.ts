import { connectLambda, getStore } from "@netlify/blobs";
import { processSubscriberSignup } from "../../api/_lib/subscriber.js";

type NetlifyEvent = {
  blobs?: string;
  body: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
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

function response(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function normalizeLambdaHeaders(headers: NetlifyEvent["headers"]) {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => (typeof value === "string" ? [[key.toLowerCase(), value]] : [])),
  );
}

function getRedirectUrl() {
  const redirectUrl = new URL("/subscribe", SUBSTACK_URL);
  redirectUrl.searchParams.set("utm_source", "ai-advantage-api");
  redirectUrl.searchParams.set("utm_medium", "website");
  redirectUrl.searchParams.set("utm_campaign", "newsletter");
  return redirectUrl.toString();
}

function parseBody(event: NetlifyEvent) {
  if (!event.body) return {};
  try {
    const parsed = JSON.parse(event.body) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return response(405, { message: "Method not allowed." });
  }

  const body = parseBody(event);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 254) {
    return response(400, { message: "Please enter a valid email address." });
  }

  const record: SubscriberRecord = {
    email,
    name: asOptionalText(body.name),
    site: asOptionalText(body.site),
    source: asOptionalText(body.source),
    pageUrl: asOptionalText(body.pageUrl ?? body.page_url),
    referrer: asOptionalText(body.referrer),
    userAgent: asOptionalText(body.userAgent ?? body.user_agent),
    subscribedAt: new Date().toISOString(),
  };

  // Preferred path: Notion-backed capture when it is configured.
  if (process.env.NOTION_API_KEY && process.env.NOTION_PARENT_PAGE_ID) {
    try {
      const result = await processSubscriberSignup(record);
      return response(200, result);
    } catch (error) {
      console.error("Notion newsletter capture failed; falling back to Netlify Blobs.", error);
    }
  }

  // Fallback path: durable capture in Netlify Blobs, no extra services required.
  if (event.blobs) {
    try {
      connectLambda({
        blobs: event.blobs,
        headers: normalizeLambdaHeaders(event.headers),
      });

      const store = getStore({ name: "ai-advantage-newsletter", consistency: "strong" });
      await store.setJSON(`subscriber:${email}`, record);

      return response(200, {
        message: "Saved. We captured your signup and are taking you to the official Substack subscribe page.",
        redirectUrl: getRedirectUrl(),
      });
    } catch (error) {
      console.error("Netlify Blobs newsletter capture failed.", error);
    }
  }

  return response(503, { message: "Newsletter signup is temporarily unavailable. Please try again later." });
};
