import { describe, expect, it } from "vitest";
import {
  clampLyricsOffsetMs,
  formatLyricsOffset,
  lyricsOffsetForIdentity,
  lyricsTimeForPlaybackMs,
  playbackTimeForLyricsMs,
} from "./lyricsTimeOffset";

describe("lyrics timeline offset", () => {
  it("samples later lyric time when lyrics are moved earlier", () => {
    expect(lyricsTimeForPlaybackMs(10_000, -500, 30_000)).toBe(10_500);
    expect(formatLyricsOffset(-500)).toBe("提前 0.5s");
  });

  it("samples earlier lyric time when lyrics are delayed", () => {
    expect(lyricsTimeForPlaybackMs(10_000, 1_500, 30_000)).toBe(8_500);
    expect(formatLyricsOffset(1_500)).toBe("延后 1.5s");
  });

  it("converts lyric line timestamps back to host playback time", () => {
    expect(playbackTimeForLyricsMs(10_000, -500, 30_000)).toBe(9_500);
    expect(playbackTimeForLyricsMs(10_000, 1_500, 30_000)).toBe(11_500);
  });

  it("clamps malformed, excessive, and edge values", () => {
    expect(clampLyricsOffsetMs(Number.NaN)).toBe(0);
    expect(clampLyricsOffsetMs(15_000)).toBe(10_000);
    expect(clampLyricsOffsetMs(-15_000)).toBe(-10_000);
    expect(lyricsTimeForPlaybackMs(250, 500, 30_000)).toBe(0);
    expect(lyricsTimeForPlaybackMs(29_900, -500, 30_000)).toBe(30_000);
  });

  it("never exposes a loaded offset to a different recording identity", () => {
    expect(lyricsOffsetForIdentity("song-a", "song-a", 1_500)).toBe(1_500);
    expect(lyricsOffsetForIdentity("song-a", "song-b", 1_500)).toBe(0);
    expect(lyricsOffsetForIdentity(null, "song-b", 1_500)).toBe(0);
  });
});
