import { describe, expect, it } from "vitest";
import { lyricFixtures, parseLyricDocumentV0 } from "@lyricstage/contracts";
import {
  applyNonMusicSegments,
  effectiveMusicDurationMs,
  mergeNonMusicSegments,
  videoTimeForMusicTime,
} from "./sponsorblock";

describe("SponsorBlock lyric timing", () => {
  it("merges overlapping non-music segments and computes effective music duration", () => {
    expect(mergeNonMusicSegments([[0, 5000], [4000, 7000], [90_000, 95_000]])).toEqual([
      [0, 7000],
      [90_000, 95_000],
    ]);
    expect(effectiveMusicDurationMs(120_000, [[0, 7000], [90_000, 95_000]])).toBe(108_000);
  });

  it("maps song time onto the video timeline without accumulating a second clock", () => {
    const segments: Array<[number, number]> = [[0, 5000], [35_000, 40_000]];
    expect(videoTimeForMusicTime(0, segments)).toBe(5000);
    expect(videoTimeForMusicTime(29_999, segments)).toBe(34_999);
    expect(videoTimeForMusicTime(30_000, segments)).toBe(40_000);
  });

  it("shifts line and word facts while preserving lyric text", () => {
    const source = lyricFixtures.wordTimedMixed;
    const shifted = applyNonMusicSegments(source, [[0, 5000]], source.durationMs + 5000);
    expect(shifted.lines.map((line) => line.text)).toEqual(source.lines.map((line) => line.text));
    expect(shifted.lines[0]!.fromMs).toBe(source.lines[0]!.fromMs + 5000);
    expect(shifted.lines[0]!.words?.[0]?.fromMs).toBe(source.lines[0]!.words?.[0]?.fromMs! + 5000);
  });

  it("normalizes fractional 3DMV timing to the integer Director contract", () => {
    const source = lyricFixtures.wordTimedMixed;
    const shifted = applyNonMusicSegments(
      source,
      [[0.4, 5000.6], [18_000.2, 18_900.8]],
      source.durationMs + 5901.37,
    );
    expect(Number.isInteger(shifted.durationMs)).toBe(true);
    expect(shifted.lines.every((line) => (
      Number.isInteger(line.fromMs)
      && Number.isInteger(line.toMs)
      && (line.words ?? []).every((word) => Number.isInteger(word.fromMs) && Number.isInteger(word.toMs))
    ))).toBe(true);
    expect(parseLyricDocumentV0(shifted).ok).toBe(true);
  });
});
