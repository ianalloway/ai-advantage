import { getCurrentSiteUser } from "@/lib/auth";

export type AccessTier = "free" | "event" | "premium";
export type AccessSource = "stripe" | "crypto" | "legacy" | "manual";
export type AccessFeature =
  | "premium_board"
  | "historical_ledger"
  | "execution_alerts"
  | "exports";

export interface AccessState {
  tier: AccessTier;
  source: AccessSource;
  label: string;
  activatedAt?: string;
  expiresAt?: string;
}

export interface CryptoAccessAccount {
  id: string;
  email: string;
  walletAddress: string;
  txHash: string;
  tier: AccessTier;
  source: AccessSource;
  label: string;
  activatedAt: string;
  expiresAt?: string;
}

type CheckoutMode = "premium" | "one-time";

interface CheckoutSessionResponse {
  url?: string;
  id?: string;
  mode?: "payment" | "subscription";
}

interface CheckoutSessionStatusResponse {
  paid: boolean;
  mode: "payment" | "subscription";
  status?: string | null;
  paymentStatus?: string | null;
  customerEmail?: string | null;
  customerId?: string | null;
  entitlement?: ServerEntitlement | null;
}

interface ApiErrorResponse {
  message?: string;
  code?: string;
  missing?: string;
}

export interface BillingStatus {
  stripeSecretConfigured: boolean;
  stripeWebhookConfigured: boolean;
  entitlementStoreConfigured: boolean;
  premiumPriceConfigured: boolean;
  oneTimePriceConfigured: boolean;
  premiumCheckoutReady: boolean;
  oneTimeCheckoutReady: boolean;
  automaticTaxEnabled: boolean;
}

export interface ServerEntitlement {
  id: string;
  tier: AccessTier;
  source: AccessSource;
  label: string;
  status: "active" | "expired" | "cancelled" | "revoked" | "pending";
  activatedAt: string;
  updatedAt: string;
  expiresAt?: string;
  email?: string;
}

interface EntitlementStatusResponse {
  configured: boolean;
  entitlement: ServerEntitlement | null;
  access: AccessState;
  message?: string;
}

const STORAGE_KEY = "ai_advantage_access_v2";
const LEGACY_STORAGE_KEY = "ai_advantage_premium";
const CHECKOUT_SYNC_KEY = "ai_advantage_checkout_sync";
const CRYPTO_ACCOUNT_STORAGE_KEY = "ai_advantage_crypto_accounts_v1";
const CRYPTO_SESSION_KEY = "ai_advantage_crypto_session_v1";
const ACCESS_CHANGE_EVENT = "ai-advantage-access-changed";
const EVENT_ACCESS_DURATION_HOURS = 72;

// Checkout URLs must come from environment config — never hardcode payment
// links in the bundle (issue #36). Server-side session creation is preferred.
const MONTHLY_PAYMENT_LINK = import.meta.env.VITE_STRIPE_CHECKOUT_URL || "";
const ONE_TIME_PAYMENT_LINK = import.meta.env.VITE_STRIPE_ONE_TIME_CHECKOUT_URL || "";

const FREE_ACCESS: AccessState = {
  tier: "free",
  source: "manual",
  label: "Free access",
};

function getEventAccessExpiry(hours = EVENT_ACCESS_DURATION_HOURS) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export const PREMIUM_FEATURES = [
  "Execution-adjusted premium board across the rest of the slate",
  "Historical execution ledger and proof archive",
  "Advanced backtesting with historical context",
  "Deeper workflow tools, sizing, and export-ready research surfaces",
  "Priority support and future live alert access",
  "API access for custom integrations",
];

export const FREE_FEATURES = [
  "Open board with live model predictions",
  "Terminal-style market pulse and live slate access",
  "Basic ML predictions and manual game analysis",
  "Proof-first product preview before upgrading",
];

function isExpired(access: AccessState): boolean {
  return Boolean(access.expiresAt && new Date(access.expiresAt).getTime() <= Date.now());
}

function cleanupCheckoutParams(url: URL) {
  ["checkout", "tier", "source", "expires_at", "session_id"].forEach((key) =>
    url.searchParams.delete(key),
  );
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function emitAccessChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACCESS_CHANGE_EVENT));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTxHash(value: string): string {
  return value.trim().toLowerCase();
}

function loadCryptoAccounts(): CryptoAccessAccount[] {
  if (typeof window === "undefined") return [];

  const stored = localStorage.getItem(CRYPTO_ACCOUNT_STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored) as CryptoAccessAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(CRYPTO_ACCOUNT_STORAGE_KEY);
    return [];
  }
}

function saveCryptoAccounts(accounts: CryptoAccessAccount[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CRYPTO_ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
}

function buildAccessState(account: Pick<CryptoAccessAccount, "tier" | "source" | "label" | "activatedAt" | "expiresAt">): AccessState {
  return {
    tier: account.tier,
    source: account.source,
    label: account.label,
    activatedAt: account.activatedAt,
    expiresAt: account.expiresAt,
  };
}

function buildAccessLabel(mode: CheckoutSessionStatusResponse["mode"]): AccessState {
  if (mode === "subscription") {
    return {
      tier: "premium",
      source: "stripe",
      label: "Stripe Pro Monthly",
      activatedAt: new Date().toISOString(),
    };
  }

  return {
    tier: "event",
    source: "stripe",
    label: "Stripe one-time premium unlock",
    activatedAt: new Date().toISOString(),
    expiresAt: getEventAccessExpiry(),
  };
}

function normalizeServerAccess(access: AccessState | null | undefined): AccessState {
  if (!access || access.tier === "free" || isExpired(access)) {
    return FREE_ACCESS;
  }

  return access;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as ApiErrorResponse;
      return payload.message || fallback;
    } catch {
      return fallback;
    }
  }

  const message = await response.text();
  return message || fallback;
}

function isConfiguredPaymentLink(url: string): boolean {
  if (!url || /your_|placeholder/i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return parsed.hostname === "buy.stripe.com";
  } catch {
    return false;
  }
}

async function createCheckoutSession(type: CheckoutMode): Promise<string> {
  const siteUser = getCurrentSiteUser();
  const response = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: type,
      customerEmail: siteUser?.email,
      clientReferenceId: siteUser?.id,
    }),
  });

  if (!response.ok) {
    const message = await readApiError(response, "Unable to start Stripe checkout.");
    throw new Error(message || "Unable to start Stripe checkout.");
  }

  const data = (await response.json()) as CheckoutSessionResponse;
  if (!data.url) {
    throw new Error("Stripe checkout session did not return a redirect URL.");
  }

  return data.url;
}

async function verifyCheckoutSession(sessionId: string): Promise<CheckoutSessionStatusResponse> {
  const response = await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`);

  if (!response.ok) {
    const message = await readApiError(response, "Unable to verify Stripe checkout.");
    throw new Error(message || "Unable to verify Stripe checkout.");
  }

  return (await response.json()) as CheckoutSessionStatusResponse;
}

export function activateAccess(access: AccessState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(access));
  // Never write the legacy flag — it was a trivially forgeable premium bypass.
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  emitAccessChange();
}

export function clearAccess(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  emitAccessChange();
}

export function getAccessState(): AccessState {
  if (typeof window === "undefined") return FREE_ACCESS;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as AccessState;
      if (parsed.tier && !isExpired(parsed)) {
        return parsed;
      }
      clearAccess();
    } catch {
      clearAccess();
    }
  }

  // The legacy `ai_advantage_premium` flag is no longer honored — it allowed
  // anyone to grant themselves premium from the console (issue #36).
  localStorage.removeItem(LEGACY_STORAGE_KEY);

  return FREE_ACCESS;
}

export async function syncEntitlementAccess(): Promise<AccessState> {
  const response = await fetch("/api/entitlements/me", {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load entitlement status.");
  }

  const status = (await response.json()) as EntitlementStatusResponse;
  if (!status.configured) {
    return getAccessState();
  }

  const access = normalizeServerAccess(status.access);
  if (access.tier === "free") {
    clearAccess();
  } else {
    activateAccess(access);
  }

  return access;
}

export function hasFeatureAccess(feature: AccessFeature, access = getAccessState()): boolean {
  if (isExpired(access)) {
    return false;
  }

  if (access.tier === "premium") {
    return true;
  }

  if (access.tier === "event") {
    return feature === "premium_board";
  }

  return false;
}

export const isPremiumUser = (): boolean => hasFeatureAccess("premium_board");

export function getAccessChangeEventName(): string {
  return ACCESS_CHANGE_EVENT;
}

export function getCurrentCryptoAccount(): CryptoAccessAccount | null {
  if (typeof window === "undefined") return null;

  const sessionId = localStorage.getItem(CRYPTO_SESSION_KEY);
  if (!sessionId) return null;

  const account = loadCryptoAccounts().find((entry) => entry.id === sessionId) ?? null;
  if (!account) {
    localStorage.removeItem(CRYPTO_SESSION_KEY);
    return null;
  }

  if (isExpired(buildAccessState(account))) {
    localStorage.removeItem(CRYPTO_SESSION_KEY);
    return null;
  }

  return account;
}

export function saveCryptoAccessAccount(input: {
  email: string;
  walletAddress: string;
  txHash: string;
  tier: AccessTier;
  label: string;
  activatedAt?: string;
  expiresAt?: string;
}): CryptoAccessAccount {
  const account: CryptoAccessAccount = {
    id: `${normalizeEmail(input.email)}::${normalizeTxHash(input.txHash)}`,
    email: normalizeEmail(input.email),
    walletAddress: normalizeWalletAddress(input.walletAddress),
    txHash: normalizeTxHash(input.txHash),
    tier: input.tier,
    source: "crypto",
    label: input.label,
    activatedAt: input.activatedAt ?? new Date().toISOString(),
    expiresAt: input.expiresAt,
  };

  if (typeof window !== "undefined") {
    const nextAccounts = loadCryptoAccounts().filter((entry) => entry.id !== account.id);
    nextAccounts.push(account);
    saveCryptoAccounts(nextAccounts);
    localStorage.setItem(CRYPTO_SESSION_KEY, account.id);
  }

  activateAccess(buildAccessState(account));
  return account;
}

export function signOutAccessSession(): void {
  if (typeof window === "undefined") return;
  void fetch("/api/entitlements/me", { method: "POST", credentials: "include" }).catch(() => undefined);
  localStorage.removeItem(CRYPTO_SESSION_KEY);
  clearAccess();
}

export function signInWithCryptoAccount(input: {
  email: string;
  txHash: string;
}): { success: boolean; message: string; account?: CryptoAccessAccount } {
  if (typeof window === "undefined") {
    return { success: false, message: "Crypto sign-in is only available in the browser." };
  }

  const email = normalizeEmail(input.email);
  const txHash = normalizeTxHash(input.txHash);
  const account = loadCryptoAccounts().find(
    (entry) => entry.email === email && entry.txHash === txHash,
  );

  if (!account) {
    return {
      success: false,
      message: "We could not find a saved crypto unlock for that email and transaction hash on this device.",
    };
  }

  if (isExpired(buildAccessState(account))) {
    localStorage.removeItem(CRYPTO_SESSION_KEY);
    return {
      success: false,
      message: "That crypto pass has expired. Buy a fresh event pass or unlock the vault again.",
    };
  }

  localStorage.setItem(CRYPTO_SESSION_KEY, account.id);
  activateAccess(buildAccessState(account));
  return {
    success: true,
    message: "Crypto access restored. You are signed back in.",
    account,
  };
}

export async function syncAccessFromUrl(): Promise<AccessState | null> {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const checkout = url.searchParams.get("checkout");
  const sessionId = url.searchParams.get("session_id");

  if (checkout === "cancelled") {
    cleanupCheckoutParams(url);
    return null;
  }

  if (checkout !== "success") {
    return null;
  }

  if (sessionId) {
    const alreadyProcessed = sessionStorage.getItem(CHECKOUT_SYNC_KEY);
    if (alreadyProcessed === sessionId) {
      return null;
    }

    sessionStorage.setItem(CHECKOUT_SYNC_KEY, sessionId);

    try {
      const session = await verifyCheckoutSession(sessionId);
      if (!session.paid) {
        return null;
      }

      const access = normalizeServerAccess(session.entitlement ? {
        tier: session.entitlement.tier,
        source: session.entitlement.source,
        label: session.entitlement.label,
        activatedAt: session.entitlement.activatedAt,
        expiresAt: session.entitlement.expiresAt,
      } : await syncEntitlementAccess().catch(() => buildAccessLabel(session.mode)));
      activateAccess(access);
      cleanupCheckoutParams(url);
      return access;
    } finally {
      sessionStorage.removeItem(CHECKOUT_SYNC_KEY);
    }
  }

  cleanupCheckoutParams(url);
  return null;
}

export function getCheckoutUrl(type: CheckoutMode = "premium"): string {
  const url = type === "premium" ? MONTHLY_PAYMENT_LINK : ONE_TIME_PAYMENT_LINK;
  return isConfiguredPaymentLink(url) ? url : "";
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const response = await fetch("/api/billing-status", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = await readApiError(response, "Unable to load billing status.");
    throw new Error(message);
  }

  return (await response.json()) as BillingStatus;
}

export const redirectToCheckout = async (type: CheckoutMode = "premium"): Promise<void> => {
  try {
    const checkoutUrl = await createCheckoutSession(type);
    window.location.assign(checkoutUrl);
    return;
  } catch (error) {
    const fallbackUrl = getCheckoutUrl(type);
    if (fallbackUrl) {
      window.location.assign(fallbackUrl);
      return;
    }

    throw error instanceof Error
      ? error
      : new Error("Unable to start checkout for this plan.");
  }
};

export const subscribeEmail = async (
  email: string,
): Promise<{ success: boolean; message: string; redirectUrl?: string }> => {
  if (!email || !email.includes("@")) {
    return { success: false, message: "Please enter a valid email address." };
  }

  try {
    const submission = new URLSearchParams({
      "form-name": "ai-advantage-newsletter",
      email,
      name: "",
      site: "ai-advantage",
      source: "homepage-newsletter",
      page_url: typeof window !== "undefined" ? window.location.href : "",
      referrer: typeof document !== "undefined" ? document.referrer : "",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
    const response = await fetch("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: submission.toString(),
    });

    if (!response.ok) {
      return {
        success: false,
        message: "Netlify could not save your signup. Please try again.",
      };
    }

    const redirectUrl = new URL(
      "/subscribe",
      import.meta.env.VITE_SUBSTACK_PUBLICATION_URL || "https://allowayai.substack.com",
    );
    redirectUrl.searchParams.set("utm_source", "ai-advantage-homepage");
    redirectUrl.searchParams.set("utm_medium", "website");
    redirectUrl.searchParams.set("utm_campaign", "newsletter");

    return {
      success: true,
      message: "Saved. We captured your signup and are taking you to the official Substack subscribe page.",
      redirectUrl: redirectUrl.toString(),
    };
  } catch {
    return { success: false, message: "Something went wrong. Please try again." };
  }
};

export { getEventAccessExpiry };
