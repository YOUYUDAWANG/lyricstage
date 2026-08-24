import { afterEach, describe, expect, it, vi } from "vitest";
import type { YouTubeMusicSnapshotV0 } from "@lyricstage/companion";
import type { LyricsLookupTrackV0 } from "@lyricstage/lyrics";
import { lyricsTrackFromSnapshot, lyricsTrackIdentity, requestManualLyrics } from "./youtubeMusicLyrics";

const track: LyricsLookupTrackV0 = {
  provider: "youtubeMusic",
  trackID: "video-a",
  title: "Song A",
  artist: "Artist",
  durationMs: 159_200,
};

describe("YouTube Music lyrics identity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("invalidates installed lyrics when transition metadata changes before the video ID", () => {
    const original = lyricsTrackIdentity(track);
    expect(lyricsTrackIdentity({ ...track, title: "Song B" })).not.toBe(original);
    expect(lyricsTrackIdentity({ ...track, artist: "Other Artist" })).not.toBe(original);
    expect(lyricsTrackIdentity({ ...track, durationMs: 160_000 })).not.toBe(original);
  });

  it("ignores sub-second duration jitter", () => {
    expect(lyricsTrackIdentity({ ...track, durationMs: 159_400 })).toBe(lyricsTrackIdentity(track));
  });

  it("normalizes fractional media duration before lyrics and Director contracts", () => {
    const snapshot: YouTubeMusicSnapshotV0 = {
      type: "youtube-music-snapshot",
      version: "youtube-music-companion-v0",
      sequence: 1,
      sentAtUnixMs: 1,
      track: {
        provider: "youtubeMusic",
        trackID: "video-a",
        title: "Song A",
        artist: "Artist",
        pageURL: "https://music.youtube.com/watch?v=video-a",
      },
      playback: {
        currentTimeMs: 1_000,
        durationMs: 159_200.437,
        playbackRate: 1,
        state: "playing",
      },
    };
    expect(lyricsTrackFromSnapshot(snapshot)?.durationMs).toBe(159_200);
  });

  it("sends bounded manual title and artist queries through the extension runtime", async () => {
    const sendMessage = vi.fn(async () => ({
      type: "lyrics-lookup-result",
      version: "lyrics-lookup-v0",
      trackID: track.trackID,
      status: "candidates",
      source: "network",
      candidates: [{
        provider: "kugou",
        id: "manual-1",
        title: "死別",
        artist: "シャノン",
        durationMs: 214_000,
        syncedLyrics: "[00:01.00]test",
      }],
    }));
    vi.stubGlobal("chrome", { runtime: { id: "extension", sendMessage } });
    const response = await requestManualLyrics(track, "死別", "シャノン");
    expect(response.status).toBe("candidates");
    expect(sendMessage).toHaveBeenCalledWith({
      type: "youtube-music-search-lyrics",
      track,
      query: { title: "死別", artist: "シャノン", originalArtist: "" },
    });
  });
});
