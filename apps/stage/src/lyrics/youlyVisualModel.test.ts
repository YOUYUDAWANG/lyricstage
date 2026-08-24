import { describe, expect, it } from "vitest";
import {
  segmentDisplayGraphemes,
} from "./youlyVisualModel";

describe("YouLy-inspired Column visual model", () => {
  it("segments emoji and combining marks as display graphemes", () => {
    expect(segmentDisplayGraphemes("光へ✦")).toEqual(["光", "へ", "✦"]);
    expect(segmentDisplayGraphemes("e\u0301")).toEqual(["e\u0301"]);
  });
});
