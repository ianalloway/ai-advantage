import { describe, expect, it } from "vitest";
import { toCsv } from "./exportDesk";

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = toCsv([{ event: 'A, "B"', edge: 3.2 }]);
    expect(csv).toContain('"A, ""B"""');
    expect(csv.split("\n")[0]).toBe("event,edge");
  });
});
