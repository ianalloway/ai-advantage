// Type-only: erased at compile time, so this does not reintroduce the runtime
// auth.ts -> stripe.ts edge that moving signOutAccessSession here removed.
import type { AccessState } from "@/lib/stripe";

export interface SiteUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSiteUser extends SiteUser {
  passwordHash: string;
}

interface AuthResponse {
  success?: boolean;
  message?: string;
  user?: SiteUser | null;
}

// Access-state keys — crypto access is cleared alongside the auth session so
// shared devices don't retain entitlement leaks. The names mirror the keys in
// src/lib/stripe.ts (defined there as STORAGE_KEY, LEGACY_STORAGE_KEY,
// CRYPTO_SESSION_KEY) to prevent a silent mismatch when the sign-out flows
// clear the same local storage entries from two different modules.
import { type AccessState } from "@/lib/stripe";

const ACCESS_STORAGE_KEY = "ai_advantage_access_v2";
const STRIPE_CRYPTO_SESSION_KEY = "ai_advantage_crypto_session_v1";

const FREE_ACCESS: AccessState = {
  tier: "free",
  source: "manual",
  label: "Free access",
};

function emitAccessChange(): void {
  // Mirrors the event emitted by src/lib/stripe.ts so that in-memory callers
  // do not depend on a circular auth↔stripe import.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ai-advantage-access-changed"));
  }
}

function clearAccess(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_STORAGE_KEY);
  localStorage.removeItem("ai_advantage_premium");  // mirrors LEGACY_STORAGE_KEY in stripe.ts
  emitAccessChange();
}

// Deprecated: move sign-out handling here to break the circular dependency
// between auth.ts ↔ stripe.ts (stripe.ts dynamically imports this at logout
// time, but is already eagerly bundled by App.tsx and six page components,
// making the dynamic import purely cosmetic).
export function signOutAccessSession(): void {
  if (typeof window === "undefined") return;
  void fetch("/api/entitlements/me", { method: "POST", credentials: "include" }).catch(() => undefined);
  localStorage.removeItem(STRIPE_CRYPTO_SESSION_KEY);
  clearAccess();
}

// Back-compat re-exports consumed by existing page-level imports.
// Migrate callers to `auth.ts` directly; these aliases will be removed in v2.0.
export { activateAccess, getAccessState, isAccessHydrated, syncEntitlementAccess } from "@/lib/stripe";
/** @deprecated `clearAccess` lives in `src/lib/stripe.ts`; import from there or migrate to `src/lib/access.ts`. */
export { clearAccess } from "@/lib/stripe";
/** @deprecated `emitAccessChange` lives in `src/lib/stripe.ts`; import from there. */
export { emitAccessChange } from "@/lib/stripe";

// ——— Auth state ———————————————————————————————————————————————————————————————

const AUTH_CHANGE_EVENT = "ai-advantage-auth-changed";

// Authentication state is intentionally memory-only. The production session
// is held by the server in an HttpOnly cookie; the development fallback must
// not persist identities, password hashes, or session identifiers in browser
// storage.
let cachedUser: SiteUser | null = null;
let legacyAccounts: StoredSiteUser[] = [];

function emitAuthChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function sanitizeUser(user: StoredSiteUser): SiteUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function setCachedUser(user: SiteUser | null): void {
  cachedUser = user;
}

function getCachedUser(): SiteUser | null {
  return cachedUser;
}

function loadLegacyAccounts(): StoredSiteUser[] {
  return [...legacyAccounts];
}

function saveLegacyAccounts(accounts: StoredSiteUser[]): void {
  legacyAccounts = [...accounts];
}

async function legacyHashPassword(password: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Secure browser cryptography is unavailable.");
  }

  const bytes = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validateSignupInput(input: {
  email: string;
  username: string;
  password: string;
}): string | null {
  if (!input.email.includes("@")) return "Enter a valid email address.";
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(input.username)) {
    return "Username must be 3-20 characters using letters, numbers, underscores, or hyphens.";
  }
  if (input.password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

async function requestAuth(path: string, init: RequestInit = {}): Promise<AuthResponse> {
  const response = await fetch(`/api/auth/${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("Account backend did not return JSON.");
  }

  const payload = (await response.json()) as AuthResponse;
  if (!response.ok) {
    throw new Error(payload.message || "Account request failed.");
  }

  return payload;
}

async function signUpLegacySiteUser(input: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}): Promise<{ success: boolean; message: string; user?: SiteUser }> {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  const password = input.password.trim();
  const displayName = input.displayName?.trim() || username;
  const validationError = validateSignupInput({ email, username, password });
  if (validationError) return { success: false, message: validationError };

  const accounts = loadLegacyAccounts();
  if (accounts.some((entry) => entry.email === email)) {
    return { success: false, message: "That email already has an account. Log in instead." };
  }
  if (accounts.some((entry) => entry.username === username)) {
    return { success: false, message: "That username is taken. Pick another one." };
  }

  const now = new Date().toISOString();
  const nextAccount: StoredSiteUser = {
    id: email,
    email,
    username,
    displayName,
    createdAt: now,
    updatedAt: now,
    passwordHash: await legacyHashPassword(password),
  };

  accounts.push(nextAccount);
  saveLegacyAccounts(accounts);
  const user = sanitizeUser(nextAccount);
  setCachedUser(user);
  emitAuthChange();
  return { success: true, message: "Account created locally for development.", user };
}

async function signInLegacySiteUser(input: {
  login: string;
  password: string;
}): Promise<{ success: boolean; message: string; user?: SiteUser }> {
  const login = input.login.trim();
  const password = input.password.trim();
  if (!login || !password) {
    return { success: false, message: "Enter both your login and password." };
  }

  const normalizedEmail = normalizeEmail(login);
  const normalizedUsername = normalizeUsername(login);
  const account =
    loadLegacyAccounts().find(
      (entry) => entry.email === normalizedEmail || entry.username === normalizedUsername,
    ) ?? null;

  if (!account) {
    return { success: false, message: "We could not find an account with that email or username." };
  }

  const passwordHash = await legacyHashPassword(password);
  if (account.passwordHash !== passwordHash) {
    return { success: false, message: "That password does not match this account." };
  }

  const user = sanitizeUser(account);
  setCachedUser(user);
  emitAuthChange();
  return { success: true, message: "Logged in locally for development.", user };
}

function shouldUseLegacyFallback(error: unknown): boolean {
  return Boolean(import.meta.env.DEV && error instanceof Error);
}

export function getAuthChangeEventName(): string {
  return AUTH_CHANGE_EVENT;
}

export function getCurrentSiteUser(): SiteUser | null {
  return getCachedUser();
}

export async function syncSiteUserSession(): Promise<SiteUser | null> {
  if (typeof window === "undefined") return null;

  try {
    const payload = await requestAuth("me", { method: "GET" });
    const user = payload.user ?? null;
    setCachedUser(user);
    emitAuthChange();
    return user;
  } catch (error) {
    if (shouldUseLegacyFallback(error)) return getCachedUser();

    // A failed `/me` request is not an authoritative logout. Keep the last
    // known user until the backend returns a real `user: null` response.
    return getCachedUser();
  }
}

export async function signUpSiteUser(input: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}): Promise<{ success: boolean; message: string; user?: SiteUser }> {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  const password = input.password.trim();
  const displayName = input.displayName?.trim() || username;
  const validationError = validateSignupInput({ email, username, password });
  if (validationError) return { success: false, message: validationError };

  try {
    const payload = await requestAuth("signup", {
      method: "POST",
      body: JSON.stringify({ email, username, password, displayName }),
    });

    if (!payload.user) {
      return { success: false, message: payload.message || "Account created, but no user was returned." };
    }

    setCachedUser(payload.user);
    emitAuthChange();
    return {
      success: true,
      message: payload.message || "Account created. You are now logged in.",
      user: payload.user,
    };
  } catch (error) {
    if (shouldUseLegacyFallback(error)) {
      return signUpLegacySiteUser(input);
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Could not create account.",
    };
  }
}

export async function signInSiteUser(input: {
  login: string;
  password: string;
}): Promise<{ success: boolean; message: string; user?: SiteUser }> {
  const login = input.login.trim();
  const password = input.password.trim();
  if (!login || !password) {
    return { success: false, message: "Enter both your login and password." };
  }

  try {
    const payload = await requestAuth("login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });

    if (!payload.user) {
      return { success: false, message: payload.message || "Logged in, but no user was returned." };
    }

    setCachedUser(payload.user);
    emitAuthChange();
    return { success: true, message: payload.message || "Logged in successfully.", user: payload.user };
  } catch (error) {
    if (shouldUseLegacyFallback(error)) {
      return signInLegacySiteUser(input);
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Login failed.",
    };
  }
}

export function signOutSiteUser(): void {
  if (typeof window === "undefined") return;

  void requestAuth("logout", { method: "POST", body: "{}" }).catch(() => undefined);
  setCachedUser(null);
  // Clear any lingering paid-access session so shared devices don't keep
  // premium entitlements unlocked after the auth session ends.
  signOutAccessSession();
  emitAuthChange();
}

export function updateCurrentSiteUser(updates: Partial<Pick<SiteUser, "email" | "username" | "displayName">>): {
  success: boolean;
  message: string;
  user?: SiteUser;
} {
  const current = getCurrentSiteUser();
  if (!current) return { success: false, message: "No signed-in account found." };

  const nextUser = {
    ...current,
    email: updates.email ? normalizeEmail(updates.email) : current.email,
    username: updates.username ? normalizeUsername(updates.username) : current.username,
    displayName: updates.displayName?.trim() || current.displayName,
    updatedAt: new Date().toISOString(),
  };

  if (!nextUser.email.includes("@")) {
    return { success: false, message: "Enter a valid email address." };
  }
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(nextUser.username)) {
    return {
      success: false,
      message: "Username must be 3-20 characters using letters, numbers, underscores, or hyphens.",
    };
  }

  setCachedUser(nextUser);
  emitAuthChange();
  return { success: true, message: "Account updated on this device.", user: nextUser };
}
