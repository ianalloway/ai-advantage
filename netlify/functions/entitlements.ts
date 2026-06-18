import { getCurrentSiteUserFromEvent } from "./_lib/auth-session";
import {
  accessStateFromEntitlement,
  clearEntitlementSessionCookie,
  findBestEntitlement,
  getEntitlementSessionToken,
  getEntitlementStore,
} from "./_lib/entitlements";

type NetlifyEvent = {
  blobs?: string;
  headers: Record<string, string | undefined>;
  httpMethod: string;
};

function json(statusCode: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod === "POST") {
    return json(200, {
      success: true,
      access: accessStateFromEntitlement(null),
      message: "Paid access session cleared.",
    }, {
      "Set-Cookie": clearEntitlementSessionCookie(event.headers),
    });
  }

  if (event.httpMethod !== "GET") {
    return json(405, { success: false, message: "Method not allowed." });
  }

  const store = getEntitlementStore(event);
  if (!store) {
    return json(200, {
      configured: false,
      entitlement: null,
      access: accessStateFromEntitlement(null),
      message: "Entitlement backend is not configured.",
    });
  }

  const user = await getCurrentSiteUserFromEvent(event);
  const entitlementToken = getEntitlementSessionToken(event.headers);
  const entitlement = await findBestEntitlement(store, {
    userId: user?.id,
    email: user?.email,
    entitlementToken,
  });
  const access = accessStateFromEntitlement(entitlement);
  const headers =
    entitlementToken && !entitlement
      ? { "Set-Cookie": clearEntitlementSessionCookie(event.headers) }
      : {};

  return json(200, {
    configured: true,
    entitlement,
    access,
    user,
  }, headers);
};
