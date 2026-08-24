import { describe, expect, it } from "vitest";
import { buildLyricsLookupIdentity, type LyricsLookupResponseV0, type LyricsLookupTrackV0 } from "@lyricstage/lyrics";
import type { DirectorBYOKConfigurationV1 } from "@lyricstage/performance";
import { assistAutomaticLyrics } from "./automaticLyricsAssist";

const track: LyricsLookupTrackV0 = {
  provider: "youtubeMusic",
  trackID: "cover",
  title: "水星記 Mercury Records / 東 雪蓮 (cover)",
  artist: "東 雪蓮",
  durationMs: 320_000,
};

const candidate = (id: string, artist: string) => ({
  provider: "lrclib" as const,
  id,
  title: "水星記",
  artist,
  durationMs: 320_000,
  syncedLyrics: "[00:01.00]test",
});

describe("automatic lyrics assist", () => {
  it("enriches an already matched cover identity without replacing its lyrics", async () => {
    const coverLyrics = candidate("cover-lyrics", "東 雪蓮");
    const originalEvidence = candidate("original-evidence", "郭頂");
    const initial: LyricsLookupResponseV0 = {
      type: "lyrics-lookup-result",
      version: "lyrics-lookup-v0",
      trackID: track.trackID,
      status: "match",
      source: "network",
      match: coverLyrics,
      matchKind: "sameRecording",
      candidates: [coverLyrics, originalEvidence],
    };
    const executeImplementation = async () => ({ response: {
      version: "lyricstage-lyrics-lookup-assist-v1" as const,
      trackID: track.trackID,
      canonicalTitle: "水星記",
      titleAliases: ["Mercury Records"],
      recordingArtists: ["東 雪蓮"],
      originalArtists: ["郭頂"],
      isCover: true,
      preferredCandidate: { provider: "lrclib" as const, id: "original-evidence" },
      confidence: 0.92,
    } });

    const assisted = await assistAutomaticLyrics({
      track,
      identity: buildLyricsLookupIdentity(track),
      initial,
      configuration: {} as DirectorBYOKConfigurationV1,
      executeImplementation: executeImplementation as never,
    });

    expect(assisted.result.match).toBe(coverLyrics);
    expect(assisted.result.matchKind).toBe("sameRecording");
    expect(assisted.result.resolvedIdentity).toMatchObject({
      canonicalTitle: "水星記",
      recordingArtists: ["東 雪蓮"],
      originalArtists: ["郭頂"],
      method: "ai",
    });
  });
});
