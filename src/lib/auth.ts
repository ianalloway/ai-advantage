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

const ACCOUNT_STORAGE_KEY = "ai_advantage_site_accounts_v1";
const SESSION_STORAGE_KEY = "ai_advantage_site_session_v1";
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

function loadAccounts(): StoredSiteUser[] {
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

function saveAccounts(accounts: StoredSiteUser[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
}

async function hashPassword(password: string): Promise<string> {
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

export function getAuthChangeEventName(): string {
  return AUTH_CHANGE_EVENT;
}

export function getCurrentSiteUser(): SiteUser | null {
  if (typeof window === "undefined") return null;

  const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) return null;

  const account = loadAccounts().find((entry) => entry.id === sessionId);
  if (!account) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }

  return sanitizeUser(account);
}

export async function signUpSiteUser(input: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}): Promise<{ success: boolean; message: string; user?: SiteUser }> {
  if (typeof window === "undefined") {
    return { success: false, message: "Site signup is only available in the browser." };
  }

  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  const password = input.password.trim();
  const displayName = input.displayName?.trim() || username;
  const validationError = validateSignupInput({ email, username, password });
  if (validationError) return { success: false, message: validationError };

  const accounts = loadAccounts();
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
    passwordHash: await hashPassword(password),
  };

  accounts.push(nextAccount);
  saveAccounts(accounts);
  localStorage.setItem(SESSION_STORAGE_KEY, nextAccount.id);
  emitAuthChange();
  return { success: true, message: "Account created. You are now logged in.", user: sanitizeUser(nextAccount) };
}

export async function signInSiteUser(input: {
  login: string;
  password: string;
}): Promise<{ success: boolean; message: string; user?: SiteUser }> {
  if (typeof window === "undefined") {
    return { success: false, message: "Site login is only available in the browser." };
  }

  const login = input.login.trim();
  const password = input.password.trim();
  if (!login || !password) {
    return { success: false, message: "Enter both your login and password." };
  }

  const normalizedEmail = normalizeEmail(login);
  const normalizedUsername = normalizeUsername(login);
  const account =
    loadAccounts().find(
      (entry) => entry.email === normalizedEmail || entry.username === normalizedUsername,
    ) ?? null;

  if (!account) {
    return { success: false, message: "We could not find an account with that email or username." };
  }

  const passwordHash = await hashPassword(password);
  if (account.passwordHash !== passwordHash) {
    return { success: false, message: "That password does not match this account." };
  }

  localStorage.setItem(SESSION_STORAGE_KEY, account.id);
  emitAuthChange();
  return { success: true, message: "Logged in successfully.", user: sanitizeUser(account) };
}

export function signOutSiteUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  emitAuthChange();
}

export function updateCurrentSiteUser(updates: Partial<Pick<SiteUser, "email" | "username" | "displayName">>): {
  success: boolean;
  message: string;
  user?: SiteUser;
} {
  if (typeof window === "undefined") {
    return { success: false, message: "Site accounts are only available in the browser." };
  }

  const current = getCurrentSiteUser();
  if (!current) {
    return { success: false, message: "No signed-in account found." };
  }

  const accounts = loadAccounts();
  const currentIndex = accounts.findIndex((entry) => entry.id === current.id);
  if (currentIndex === -1) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    emitAuthChange();
    return { success: false, message: "Your account session was lost. Please log in again." };
  }

  const nextEmail = updates.email ? normalizeEmail(updates.email) : accounts[currentIndex].email;
  const nextUsername = updates.username
    ? normalizeUsername(updates.username)
    : accounts[currentIndex].username;
  const nextDisplayName = updates.displayName?.trim() || accounts[currentIndex].displayName;

  if (!nextEmail.includes("@")) {
    return { success: false, message: "Enter a valid email address." };
  }
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(nextUsername)) {
    return {
      success: false,
      message: "Username must be 3-20 characters using letters, numbers, underscores, or hyphens.",
    };
  }

  const emailConflict = accounts.find(
    (entry, index) => index !== currentIndex && entry.email === nextEmail,
  );
  if (emailConflict) {
    return { success: false, message: "That email already belongs to another account." };
  }

  const usernameConflict = accounts.find(
    (entry, index) => index !== currentIndex && entry.username === nextUsername,
  );
  if (usernameConflict) {
    return { success: false, message: "That username is already taken." };
  }

  const nextAccount: StoredSiteUser = {
    ...accounts[currentIndex],
    id: nextEmail,
    email: nextEmail,
    username: nextUsername,
    displayName: nextDisplayName,
    updatedAt: new Date().toISOString(),
  };
  accounts[currentIndex] = nextAccount;
  saveAccounts(accounts);
  localStorage.setItem(SESSION_STORAGE_KEY, nextAccount.id);
  emitAuthChange();
  return { success: true, message: "Account updated.", user: sanitizeUser(nextAccount) };
}
