import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureReferralFromUrl, getReferralCode } from "./referral";

describe("referral capture", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
    vi.stubGlobal("window", { location: { search: "" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores a valid ref query param", () => {
    expect(captureReferralFromUrl("?ref=partner_42")).toBe("partner_42");
    expect(getReferralCode()).toBe("partner_42");
  });

  it("rejects unsafe referral codes", () => {
    expect(captureReferralFromUrl("?ref=bad code!")).toBeNull();
    expect(getReferralCode()).toBeNull();
  });
});
