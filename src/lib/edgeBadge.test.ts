import { describe, expect, it } from "vitest";
import { getEdgeBadge } from "./edgeBadge";

describe("getEdgeBadge", () => {
  it("passes when there is no value bet", () => {
    expect(getEdgeBadge(9, false).tier).toBe("pass");
  });

  it("tiers by execution-adjusted edge", () => {
    expect(getEdgeBadge(3.2, true).tier).toBe("watch");
    expect(getEdgeBadge(5.5, true).tier).toBe("strong");
    expect(getEdgeBadge(8.1, true).tier).toBe("must");
  });
});
