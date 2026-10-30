const REFERRAL_STORAGE_KEY = "ai_advantage_referral_v1";
const REFERRAL_PATTERN = /^[a-zA-Z0-9_-]{2,64}$/;

/** Capture `?ref=` once and keep it for checkout attribution. */
export function captureReferralFromUrl(search = typeof window !== "undefined" ? window.location.search : ""): string | null {
  if (typeof window === "undefined") return null;
  const ref = new URLSearchParams(search).get("ref")?.trim() ?? "";
  if (!REFERRAL_PATTERN.test(ref)) return getReferralCode();
  localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
  return ref;
}

export function getReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(REFERRAL_STORAGE_KEY)?.trim() ?? "";
  return REFERRAL_PATTERN.test(value) ? value : null;
}
