import { describe, expect, it } from "vitest";
import {
  boundedYouAndAizuTime,
  YOU_AND_AIZU_DURATION_MS,
  youAndAizuCueAt,
  youAndAizuProgress,
} from "./youAndAizuModel";

describe("You & 合図 showcase timeline", () => {
  it("keeps sampling inside the authoritative song duration", () => {
    expect(boundedYouAndAizuTime(-1)).toBe(0);
    expect(boundedYouAndAizuTime(Number.NaN)).toBe(0);
    expect(boundedYouAndAizuTime(YOU_AND_AIZU_DURATION_MS + 1)).toBe(YOU_AND_AIZU_DURATION_MS);
    expect(youAndAizuProgress(YOU_AND_AIZU_DURATION_MS / 2)).toBe(0.5);
  });

  it("selects semantic cues at their exact boundaries", () => {
    expect(youAndAizuCueAt(0).id).toBe("wake-signal");
    expect(youAndAizuCueAt(21_890).id).toBe("concert-a");
    expect(youAndAizuCueAt(51_470).id).toBe("shared-cue");
    expect(youAndAizuCueAt(YOU_AND_AIZU_DURATION_MS).id).toBe("da-capo");
  });
});
