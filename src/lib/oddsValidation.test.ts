import { describe, expect, it } from "vitest";
import {
  ageSeconds,
  hasSaneTwoWayMoneyline,
  isDateKey,
  isIsoTimestamp,
  isValidMoneyline,
} from "./oddsValidation";

describe("oddsValidation", () => {
  it("accepts tradable American moneylines", () => {
    expect(isValidMoneyline(-110)).toBe(true);
    expect(isValidMoneyline(150)).toBe(true);
    expect(isValidMoneyline(0)).toBe(false);
    expect(isValidMoneyline(99)).toBe(false);
    expect(isValidMoneyline(undefined)).toBe(false);
  });

  it("rejects absurd two-way boards", () => {
    expect(hasSaneTwoWayMoneyline(-110, -105)).toBe(true);
    expect(hasSaneTwoWayMoneyline(-2000, -1500)).toBe(false);
  });

  it("validates feed timestamps and date keys", () => {
    expect(isDateKey("20260714")).toBe(true);
    expect(isDateKey("2026-07-14")).toBe(false);
    expect(isIsoTimestamp("2026-07-14T17:00:00.000Z")).toBe(true);
    expect(ageSeconds("2026-07-14T17:00:00.000Z", Date.parse("2026-07-14T17:01:00.000Z"))).toBe(60);
  });
});
