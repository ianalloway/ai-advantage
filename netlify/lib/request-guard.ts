type HeaderMap = Record<string, string | string[] | undefined>;

function read(headers: HeaderMap | undefined, name: string) {
  const entry = Object.entries(headers ?? {}).find(([key, value]) => key.toLowerCase() === name && value);
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function originOf(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defence for state-changing JSON endpoints that rely on cookies.
 *
 * - The body must be declared as JSON. A cross-site HTML form cannot send that
 *   content type, and a cross-site fetch() that does needs a CORS preflight,
 *   which this site never grants.
 * - Browsers label every request with Sec-Fetch-Site and send Origin on POST;
 *   either one naming another site is refused. Requests with neither header
 *   are not from a browser and so cannot carry a victim's cookies by accident.
 *
 * Returns null when the request may proceed, else the response to send.
 */
export function rejectCrossSiteJson(headers: HeaderMap | undefined): { status: number; message: string } | null {
  const contentType = read(headers, "content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType.trim())) {
    return { status: 415, message: "Send this request as application/json." };
  }

  const fetchSite = read(headers, "sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return { status: 403, message: "Cross-site requests are not allowed." };
  }

  const origin = read(headers, "origin");
  if (origin) {
    const host = read(headers, "x-forwarded-host") ?? read(headers, "host");
    const proto = read(headers, "x-forwarded-proto") ?? "https";
    const allowed = new Set(
      [process.env.PUBLIC_APP_URL, process.env.URL, host ? `${proto}://${host}` : undefined]
        .map(originOf)
        .filter((value): value is string => Boolean(value)),
    );
    if (!allowed.has(originOf(origin) ?? "null")) {
      return { status: 403, message: "Cross-site requests are not allowed." };
    }
  }

  return null;
}
