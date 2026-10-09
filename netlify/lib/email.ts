/** Send one transactional email through Resend, the provider the app already uses. */
export function isEmailConfigured() {
  const key = process.env.RESEND_API_KEY;
  return Boolean(key && process.env.RESEND_FROM_EMAIL && !/your_|placeholder/i.test(key));
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  options: { timeoutMs?: number } = {},
) {
  if (!isEmailConfigured()) return { ok: false, reason: "resend_not_configured" as const };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [to], subject, html, text }),
      ...(options.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
    });
    return { ok: response.ok, reason: response.ok ? "sent" : `http_${response.status}` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : "send_failed" };
  }
}
