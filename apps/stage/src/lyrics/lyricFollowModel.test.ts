import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import {
  activeLyricKey,
  activeLyricLineIndices,
  lyricLineTabIndex,
  lyricScrollDurationMs,
  lyricScrollProgress,
  nextLyricFollowMode,
  nextLyricStartIntervalMs,
} from "./lyricFollowModel";

describe("fullscreen lyric follow model", () => {
  it("keeps manual browsing in control until an explicit return", () => {
    expect(nextLyricFollowMode("following", "user-browse")).toBe("browsing");
    expect(nextLyricFollowMode("browsing", "return-completed")).toBe("browsing");
    expect(nextLyricFollowMode("browsing", "return-requested")).toBe("returning");
    expect(nextLyricFollowMode("returning", "return-completed")).toBe("following");
    expect(nextLyricFollowMode("returning", "seek-failed")).toBe("browsing");
    expect(nextLyricFollowMode("browsing", "track-changed")).toBe("following");
  });

  it("treats overlapping duet lines as one active group and gaps as empty", () => {
    const lines = lyricFixtures.duetOverlap.lines;
    const overlappingTime = Math.max(lines[2]!.fromMs, lines[3]!.fromMs);
    const active = activeLyricLineIndices(lines, overlappingTime);
    expect(active).toHaveLength(2);
    expect(activeLyricKey(active)).toBe([...active].sort((a, b) => a - b).join(","));
    expect(activeLyricLineIndices([
      { ...lines[0]!, fromMs: 0, toMs: 1_000 },
      { ...lines[1]!, fromMs: 3_000, toMs: 4_000 },
    ], 2_000)).toEqual([]);
  });

  it("adapts scroll time and never lets a transition outlive a short line", () => {
    expect(lyricScrollDurationMs(600, 240, false)).toBeLessThanOrEqual(520);
    expect(lyricScrollDurationMs(1_200, 240, false)).toBe(360);
    expect(lyricScrollDurationMs(5_000, 800, false)).toBe(640);
    expect(lyricScrollDurationMs(5_000, 800, true)).toBe(0);
    expect(lyricScrollDurationMs(5_000, 0, false)).toBe(0);
  });

  it("finds the next non-overlapping lyric start interval", () => {
    const lines = [
      { lineIndex: 0, fromMs: 0, toMs: 1_200, text: "A" },
      { lineIndex: 1, fromMs: 600, toMs: 1_600, text: "B" },
      { lineIndex: 2, fromMs: 2_000, toMs: 3_000, text: "C" },
    ];
    expect(nextLyricStartIntervalMs(lines, new Set([0, 1]))).toBe(2_000);
    expect(nextLyricStartIntervalMs(lines, new Set())).toBeNull();
  });

  it("uses a bounded monotonic ease-in-out curve", () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(lyricScrollProgress);
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    samples.slice(1).forEach((sample, index) => expect(sample).toBeGreaterThan(samples[index]!));
  });

  it("keeps one active lyric row in the sequential tab order", () => {
    expect(lyricLineTabIndex(4, [4, 5], 0)).toBe(0);
    expect(lyricLineTabIndex(5, [4, 5], 0)).toBe(-1);
    expect(lyricLineTabIndex(0, [], 0)).toBe(0);
  });
});
