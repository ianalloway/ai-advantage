import { describe, expect, it } from "vitest";
import { isWorldCupWindow } from "./worldCupWindow";

/**
 * Regression guard. The original check meant to be edition-aware but its ternary
 * returned the same year on both branches, so the edition test was computed and
 * discarded. What remained was a bare Jun 11 - Jul 19 date test, which would have
 * defaulted the homepage to the World Cup every summer forever.
 */
describe("isWorldCupWindow", () => {
  const at = (iso: string) => new Date(iso);

  it("opens during a tournament year", () => {
    expect(isWorldCupWindow(at("2026-06-11T00:00:00Z"))).toBe(true);
    expect(isWorldCupWindow(at("2026-07-01T12:00:00Z"))).toBe(true);
    expect(isWorldCupWindow(at("2026-07-19T00:00:00Z"))).toBe(true);
  });

  it("stays shut outside the window in a tournament year", () => {
    expect(isWorldCupWindow(at("2026-06-10T23:00:00Z"))).toBe(false);
    expect(isWorldCupWindow(at("2026-07-20T00:00:01Z"))).toBe(false);
    expect(isWorldCupWindow(at("2026-10-30T00:00:00Z"))).toBe(false);
  });

  // The actual bug: these summers have no men's World Cup.
  it("stays shut in the summers between tournaments", () => {
    for (const year of [2027, 2028, 2029]) {
      expect(isWorldCupWindow(at(`${year}-07-01T12:00:00Z`)), `${year}`).toBe(false);
    }
  });

  it("opens again on the next edition, and not off-cycle", () => {
    expect(isWorldCupWindow(at("2030-07-01T12:00:00Z"))).toBe(true);
    expect(isWorldCupWindow(at("2034-07-01T12:00:00Z"))).toBe(true);
    expect(isWorldCupWindow(at("2031-07-01T12:00:00Z"))).toBe(false);
  });

  it("stays shut before the first edition it shipped for", () => {
    expect(isWorldCupWindow(at("2022-07-01T12:00:00Z"))).toBe(false);
  });
});
