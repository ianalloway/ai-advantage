import { getCurrentSiteUserFromEvent } from "./_lib/auth-session";
import {
  accessStateFromEntitlement,
  bindSessionEntitlementToUser,
  clearEntitlementSessionCookie,
  findBestEntitlement,
  getEntitlementSessionToken,
  entitlementSessionCookie,
  getEntitlementStore,
  renewEntitlementSession,
  revokeEntitlementSession,
} from "./_lib/entitlements";
import { maybeRecordD7Retention } from "../lib/funnel";

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
    const headers = { "Set-Cookie": clearEntitlementSessionCookie(event.headers) };
    try {
      const token = getEntitlementSessionToken(event.headers);
      if (token) {
        const store = getEntitlementStore(event);
        if (!store) throw new Error("Entitlement store unavailable");
        await revokeEntitlementSession(store, token);
      }
      return json(200, {
        success: true,
        revoked: true,
        access: accessStateFromEntitlement(null),
        message: "Paid access session cleared.",
      }, headers);
    } catch {
      // Expire the browser cookie even when server-side revocation cannot be
      // confirmed. Do not claim a retained copy of the token was invalidated.
      return json(503, {
        success: false,
        revoked: false,
        access: accessStateFromEntitlement(null),
        message: "Browser session cleared, but server revocation could not be confirmed.",
      }, headers);
    }
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
  if (user) {
    await bindSessionEntitlementToUser(store, entitlementToken, user);
  }
  const entitlement = await findBestEntitlement(store, {
    userId: user?.id,
    entitlementToken,
  });
  const access = accessStateFromEntitlement(entitlement);
  const renewed = entitlement ? await renewEntitlementSession(store, entitlementToken) : null;
  const headers: Record<string, string> =
    entitlementToken && !entitlement
      ? { "Set-Cookie": clearEntitlementSessionCookie(event.headers) }
      : renewed
        ? { "Set-Cookie": entitlementSessionCookie(event.headers, renewed.token, renewed.maxAge) }
        : {};

  if (entitlement && access.tier !== "free") {
    await maybeRecordD7Retention(store, {
      entitlementId: entitlement.id,
      email: entitlement.email ?? user?.email,
      userId: entitlement.userId ?? user?.id,
      activatedAt: entitlement.activatedAt,
      tier: access.tier,
    });
  }

  return json(200, {
    configured: true,
    entitlement,
    access,
    serverVerified: true,
    user,
  }, headers);
};
