import { describe, expect, it } from "vitest";
import { buildLinePath, closeLineValuePts, closeVerdict, formatCloseBadge } from "./linePath";

describe("linePath", () => {
  it("marks beating a shorter close as positive CLV", () => {
    const clv = closeLineValuePts(-120, -140);
    expect(clv).toBeGreaterThan(0);
    expect(closeVerdict(-120, -140)).toBe("beat");
    expect(formatCloseBadge("beat", clv)).toContain("Beat close");
  });

  it("builds open → now → close path", () => {
    const path = buildLinePath({ open: -110, current: -120, close: -130 });
    expect(path.map((p) => p.label)).toEqual(["Open", "Now", "Close"]);
  });

  it("pending when close missing", () => {
    expect(closeVerdict(-110, undefined)).toBe("pending");
  });
});
