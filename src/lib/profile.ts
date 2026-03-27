import {
  getAccessState,
  getCurrentCryptoAccount,
  type AccessState,
  type CryptoAccessAccount,
} from "@/lib/stripe";
import { getCurrentSiteUser, type SiteUser } from "@/lib/auth";

export type RiskProfile = "conservative" | "balanced" | "aggressive";

export interface UserProfile {
  accountId: string;
  email: string;
  displayName: string;
  username: string;
  homeMarket: string;
  bankroll: number;
  favoriteSports: string[];
  riskProfile: RiskProfile;
  favoriteBook: string;
  bio: string;
  newsletterOptIn: boolean;
  marketAlerts: boolean;
  createdAt: string;
  updatedAt: string;
}

const PROFILE_STORAGE_KEY = "ai_advantage_profiles_v1";

function loadProfiles(): Record<string, UserProfile> {
  if (typeof window === "undefined") return {};

  const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!stored) return {};

  try {
    const parsed = JSON.parse(stored) as Record<string, UserProfile>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    return {};
  }
}

function saveProfiles(profiles: Record<string, UserProfile>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

export function getProfileAccountId(
  access: AccessState = getAccessState(),
  cryptoAccount: CryptoAccessAccount | null = getCurrentCryptoAccount(),
  siteUser: SiteUser | null = getCurrentSiteUser(),
): string | null {
  if (siteUser) return `user:${siteUser.id}`;
  if (cryptoAccount) return cryptoAccount.id;
  if (access.tier === "free") return null;
  return `${access.source}:${access.tier}`;
}

function buildDefaultProfile(
  accountId: string,
  access: AccessState,
  cryptoAccount: CryptoAccessAccount | null,
  siteUser: SiteUser | null,
): UserProfile {
  const email = siteUser?.email ?? cryptoAccount?.email ?? "";
  const displayName = siteUser?.displayName || (email ? email.split("@")[0] : "");
  const now = new Date().toISOString();

  return {
    accountId,
    email,
    displayName,
    username: siteUser?.username ?? "",
    homeMarket: "",
    bankroll: 1000,
    favoriteSports: ["nba"],
    riskProfile: access.tier === "premium" ? "balanced" : "conservative",
    favoriteBook: "",
    bio: "",
    newsletterOptIn: true,
    marketAlerts: access.tier === "premium",
    createdAt: now,
    updatedAt: now,
  };
}

export function getCurrentUserProfile(
  access: AccessState = getAccessState(),
  cryptoAccount: CryptoAccessAccount | null = getCurrentCryptoAccount(),
  siteUser: SiteUser | null = getCurrentSiteUser(),
): UserProfile | null {
  const accountId = getProfileAccountId(access, cryptoAccount, siteUser);
  if (!accountId) return null;

  const profiles = loadProfiles();
  if (profiles[accountId]) return profiles[accountId];

  if (siteUser) {
    const legacyKeys = [cryptoAccount?.id, access.tier !== "free" ? `${access.source}:${access.tier}` : null]
      .filter((value): value is string => Boolean(value));
    const legacyProfileKey = legacyKeys.find((key) => profiles[key]);
    if (legacyProfileKey) {
      const migratedProfile = {
        ...profiles[legacyProfileKey],
        accountId,
        email: siteUser.email,
        displayName: profiles[legacyProfileKey].displayName || siteUser.displayName,
        username: profiles[legacyProfileKey].username || siteUser.username,
        updatedAt: new Date().toISOString(),
      };
      profiles[accountId] = migratedProfile;
      saveProfiles(profiles);
      return migratedProfile;
    }
  }

  return buildDefaultProfile(accountId, access, cryptoAccount, siteUser);
}

export function saveCurrentUserProfile(
  updates: Partial<UserProfile>,
  access: AccessState = getAccessState(),
  cryptoAccount: CryptoAccessAccount | null = getCurrentCryptoAccount(),
  siteUser: SiteUser | null = getCurrentSiteUser(),
): UserProfile | null {
  const accountId = getProfileAccountId(access, cryptoAccount, siteUser);
  if (!accountId) return null;

  const profiles = loadProfiles();
  const existing = profiles[accountId] ?? buildDefaultProfile(accountId, access, cryptoAccount, siteUser);
  const now = new Date().toISOString();

  const nextProfile: UserProfile = {
    ...existing,
    ...updates,
    accountId,
    email: updates.email ?? siteUser?.email ?? cryptoAccount?.email ?? existing.email,
    updatedAt: now,
    createdAt: existing.createdAt || now,
  };

  profiles[accountId] = nextProfile;
  saveProfiles(profiles);
  return nextProfile;
}
