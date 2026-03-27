type SubscriberPayload = {
  email: string;
  name?: string;
  site?: string;
  source?: string;
  pageUrl?: string;
  referrer?: string;
  userAgent?: string;
};

type HeaderMap = Record<string, string | string[] | undefined>;

export interface NewsletterResult {
  message: string;
  redirectUrl: string;
}

const NOTION_VERSION = "2022-06-28";
const DEFAULT_SUBSTACK_URL = "https://allowayai.substack.com";

function getHeader(headers: HeaderMap, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value?: string) {
  return value?.trim() || undefined;
}

export function parseSubscriberPayload(body: unknown, headers: HeaderMap): SubscriberPayload {
  const raw =
    typeof body === "string"
      ? (JSON.parse(body) as SubscriberPayload)
      : ((body || {}) as SubscriberPayload);

  const email = raw.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }

  return {
    email,
    name: normalizeText(raw.name),
    site: normalizeText(raw.site) || "unknown-site",
    source: normalizeText(raw.source) || "unknown-source",
    pageUrl: normalizeText(raw.pageUrl),
    referrer: normalizeText(raw.referrer),
    userAgent: normalizeText(raw.userAgent) || getHeader(headers, "user-agent"),
  };
}

function buildNotionTitle(payload: SubscriberPayload) {
  const date = new Date().toISOString().slice(0, 10);
  const prefix = payload.site || "signup";
  return `${prefix} subscriber - ${payload.email} - ${date}`.slice(0, 100);
}

function buildSubstackRedirectUrl(source: string) {
  const publicationUrl = process.env.SUBSTACK_PUBLICATION_URL || DEFAULT_SUBSTACK_URL;
  const redirectUrl = new URL("/subscribe", publicationUrl);
  redirectUrl.searchParams.set("utm_source", source);
  redirectUrl.searchParams.set("utm_medium", "website");
  redirectUrl.searchParams.set("utm_campaign", "newsletter");
  return redirectUrl.toString();
}

async function createNotionSignupPage(payload: SubscriberPayload) {
  const notionApiKey = requireEnv("NOTION_API_KEY");
  const parentPageId = requireEnv("NOTION_PARENT_PAGE_ID");
  const subscribedAt = new Date().toISOString();
  const lines = [
    `Email: ${payload.email}`,
    `Name: ${payload.name || "Not provided"}`,
    `Site: ${payload.site || "Unknown"}`,
    `Source: ${payload.source || "Unknown"}`,
    `Subscribed at: ${subscribedAt}`,
    `Page URL: ${payload.pageUrl || "Not provided"}`,
    `Referrer: ${payload.referrer || "Direct / not provided"}`,
    `User agent: ${payload.userAgent || "Not provided"}`,
  ];

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      parent: {
        page_id: parentPageId,
      },
      properties: {
        title: {
          title: [
            {
              type: "text",
              text: {
                content: buildNotionTitle(payload),
              },
            },
          ],
        },
      },
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "Newsletter signup",
                },
              },
            ],
          },
        },
        ...lines.map((line) => ({
          object: "block" as const,
          type: "bulleted_list_item" as const,
          bulleted_list_item: {
            rich_text: [
              {
                type: "text" as const,
                text: {
                  content: line,
                },
              },
            ],
          },
        })),
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion write failed: ${errorText}`);
  }

  const data = (await response.json()) as { url?: string };
  return {
    subscribedAt,
    notionUrl: data.url,
  };
}

async function sendNotificationEmail(
  payload: SubscriberPayload,
  meta: { notionUrl?: string; subscribedAt: string },
) {
  const resendApiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("RESEND_FROM_EMAIL");
  const notifyEmail = requireEnv("NOTIFY_EMAIL");
  const subject = `New newsletter signup from ${payload.site || "website"}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin-bottom:12px;">New newsletter signup</h2>
      <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
      <p><strong>Name:</strong> ${escapeHtml(payload.name || "Not provided")}</p>
      <p><strong>Site:</strong> ${escapeHtml(payload.site || "Unknown")}</p>
      <p><strong>Source:</strong> ${escapeHtml(payload.source || "Unknown")}</p>
      <p><strong>Subscribed at:</strong> ${escapeHtml(meta.subscribedAt)}</p>
      <p><strong>Page URL:</strong> ${escapeHtml(payload.pageUrl || "Not provided")}</p>
      <p><strong>Referrer:</strong> ${escapeHtml(payload.referrer || "Direct / not provided")}</p>
      <p><strong>User agent:</strong> ${escapeHtml(payload.userAgent || "Not provided")}</p>
      ${
        meta.notionUrl
          ? `<p><strong>Notion page:</strong> <a href="${escapeHtml(meta.notionUrl)}">${escapeHtml(meta.notionUrl)}</a></p>`
          : ""
      }
    </div>
  `.trim();
  const text = [
    "New newsletter signup",
    `Email: ${payload.email}`,
    `Name: ${payload.name || "Not provided"}`,
    `Site: ${payload.site || "Unknown"}`,
    `Source: ${payload.source || "Unknown"}`,
    `Subscribed at: ${meta.subscribedAt}`,
    `Page URL: ${payload.pageUrl || "Not provided"}`,
    `Referrer: ${payload.referrer || "Direct / not provided"}`,
    `User agent: ${payload.userAgent || "Not provided"}`,
    meta.notionUrl ? `Notion page: ${meta.notionUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [notifyEmail],
      reply_to: payload.email,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email send failed: ${errorText}`);
  }
}

export async function processSubscriberSignup(
  payload: SubscriberPayload,
): Promise<NewsletterResult> {
  const notionMeta = await createNotionSignupPage(payload);
  await sendNotificationEmail(payload, notionMeta);

  return {
    message:
      "Saved. We logged your info, sent Ian the details, and are taking you to the official Substack subscribe page.",
    redirectUrl: buildSubstackRedirectUrl(payload.source || payload.site || "newsletter"),
  };
}
