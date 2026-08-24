import { describe, expect, it } from "vitest";
import {
  graphemeWipeProgress,
  segmentDisplayGraphemes,
  youlyLineVisualClass,
  youlyWordGrowthScale,
} from "./youlyVisualModel";

describe("YouLy-inspired Column visual model", () => {
  it("segments emoji and combining marks as display graphemes", () => {
    expect(segmentDisplayGraphemes("光へ✦")).toEqual(["光", "へ", "✦"]);
    expect(segmentDisplayGraphemes("e\u0301")).toEqual(["e\u0301"]);
  });

  it("stages a word wipe across graphemes", () => {
    expect(graphemeWipeProgress(0, 0, 4)).toBe(0);
    expect(graphemeWipeProgress(0.25, 0, 4)).toBe(1);
    expect(graphemeWipeProgress(0.25, 1, 4)).toBe(0);
    expect(graphemeWipeProgress(0.625, 2, 4)).toBe(0.5);
    expect(graphemeWipeProgress(1, 3, 4)).toBe(1);
  });

  it("grows only short, sustained timed words", () => {
    expect(youlyWordGrowthScale(0.5, 4, 1_200, false)).toBeCloseTo(1.035);
    expect(youlyWordGrowthScale(0.5, 10, 1_200, false)).toBe(1);
    expect(youlyWordGrowthScale(0.5, 4, 600, false)).toBe(1);
    expect(youlyWordGrowthScale(0.5, 4, 1_200, true)).toBe(1);
  });

  it("emits stable line state classes", () => {
    expect(youlyLineVisualClass("active", "active")).toBe("youly-phase-active youly-proximity-active");
    expect(youlyLineVisualClass("future", "near")).toBe("youly-phase-inactive youly-proximity-near");
  });
});
