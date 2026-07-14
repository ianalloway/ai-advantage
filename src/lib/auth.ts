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

const ACCOUNT_STORAGE_KEY = "ai_advantage_site_accounts_v1";
const SESSION_STORAGE_KEY = "ai_advantage_site_session_v1";
const CACHED_USER_STORAGE_KEY = "ai_advantage_cached_user_v2";
const AUTH_CHANGE_EVENT = "ai-advantage-auth-changed";

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
  if (typeof window === "undefined") return;

  if (user) {
    localStorage.setItem(CACHED_USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(CACHED_USER_STORAGE_KEY);
  }
}

function getCachedUser(): SiteUser | null {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem(CACHED_USER_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as SiteUser;
    return parsed?.id && parsed?.email ? parsed : null;
  } catch {
    localStorage.removeItem(CACHED_USER_STORAGE_KEY);
    return null;
  }
}

function loadLegacyAccounts(): StoredSiteUser[] {
  if (typeof window === "undefined") return [];

  const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored) as StoredSiteUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    return [];
  }
}

function saveLegacyAccounts(accounts: StoredSiteUser[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
}

async function legacyHashPassword(password: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return password;
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
  localStorage.setItem(SESSION_STORAGE_KEY, nextAccount.id);
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

  localStorage.setItem(SESSION_STORAGE_KEY, account.id);
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
    localStorage.removeItem(SESSION_STORAGE_KEY);
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
    localStorage.removeItem(SESSION_STORAGE_KEY);
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
    localStorage.removeItem(SESSION_STORAGE_KEY);
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
  localStorage.removeItem(SESSION_STORAGE_KEY);
  // Paid access is a separate cookie/local cache — clear it on account logout so
  // shared devices don't keep the premium board unlocked.
  void import("@/lib/stripe")
    .then(({ signOutAccessSession }) => {
      signOutAccessSession();
    })
    .catch(() => undefined);
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
