/**
 * Daily: nudge trials on day 5–6 before conversion (Resend).
 */
import { getEntitlementStore } from "./_lib/entitlements";
import { appendFunnelEvent, listFunnelEvents } from "../lib/funnel";

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = (process.env.PUBLIC_APP_URL || "https://aiadvantagesports.com").replace(/\/$/, "");

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from || /your_|placeholder/i.test(key)) {
    return { ok: false, reason: "resend_not_configured" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  return { ok: response.ok, reason: response.ok ? "sent" : `http_${response.status}` };
}

export default async () => {
  const store = getEntitlementStore();
  if (!store) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "store_unavailable" }) };
  }

  const events = await listFunnelEvents(store, 2000);
  const now = Date.now();
  let sent = 0;
  let skipped = 0;

  for (const event of events) {
    if (event.name !== "trial_started" || !event.email) continue;
    const started = Date.parse(event.at);
    if (!Number.isFinite(started)) continue;
    const ageDays = (now - started) / DAY_MS;
    if (ageDays < 5 || ageDays >= 7) continue;

    const dayBucket = ageDays < 6 ? "d5" : "d6";
    const dedupeKey = `ai-advantage:trial-nudge:${event.email}:${dayBucket}`;
    if (await store.get<string>(dedupeKey)) {
      skipped += 1;
      continue;
    }

    const subject =
      dayBucket === "d5"
        ? "2 days left on your AI Advantage trial"
        : "Last day — keep the execution desk?";
    const profileUrl = `${APP_URL}/profile`;
    const deskUrl = `${APP_URL}/daily-picks`;
    const text = [
      subject,
      "",
      "Your Pro trial includes the full board, Kelly sizing, and CLV proof tracking vs ESPN.",
      `Open the desk: ${deskUrl}`,
      `Manage billing / stay on Pro: ${profileUrl}`,
      "",
      "If the edge hasn't earned the click, cancel in the billing portal before the trial ends — no hard feelings.",
    ].join("\n");
    const html = `<p><strong>${subject}</strong></p>
<p>Your Pro trial includes the full board, Kelly sizing, and CLV proof tracking vs ESPN.</p>
<p><a href="${deskUrl}">Open the live desk</a> · <a href="${profileUrl}">Manage billing</a></p>
<p style="color:#64748b;font-size:13px">Cancel anytime in the Stripe customer portal before the trial ends.</p>`;

    const result = await sendEmail(event.email, subject, html, text);
    if (!result.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, reason: result.reason, sent, skipped }),
      };
    }

    await store.set(dedupeKey, new Date().toISOString(), { ex: 60 * 60 * 24 * 21 });
    await appendFunnelEvent(store, {
      name: "trial_nudge_sent",
      email: event.email,
      userId: event.userId,
      meta: { nudge: dayBucket },
    });
    sent += 1;
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, sent, skipped }) };
};

export const config = { schedule: "@daily" };
