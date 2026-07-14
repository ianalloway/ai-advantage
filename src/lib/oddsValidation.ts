/** Shared American-odds validation for feed integrity + smoke tests. */

export const VALID_SPORTS = ["nba", "nfl", "mlb", "wc"] as const;
export type ValidSport = (typeof VALID_SPORTS)[number];

export const VALID_STATUS_STATES = ["pre", "in", "post"] as const;

/** American moneyline in a tradable band (excludes 0 / junk). */
export function isValidMoneyline(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value !== 0 &&
    Math.abs(value) >= 100 &&
    Math.abs(value) <= 100000
  );
}

/** Two-way ML must not both be positive favorites; soft vig sanity. */
export function hasSaneTwoWayMoneyline(home: number, away: number): boolean {
  if (!isValidMoneyline(home) || !isValidMoneyline(away)) return false;
  // Both heavily favorite is almost never a real board (except data bugs).
  if (home < -1000 && away < -1000) return false;
  return true;
}

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function ageSeconds(iso: string, now = Date.now()): number {
  return Math.max(0, (now - Date.parse(iso)) / 1000);
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{8}$/.test(value);
}
