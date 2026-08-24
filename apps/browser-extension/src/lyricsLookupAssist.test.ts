import { describe, expect, it } from "vitest";
import { buildAILyricsLookupAssistRequestV1, buildLyricsLookupIdentity } from "@lyricstage/lyrics";
import { aiLyricsLookupAssistProfileV1 } from "./lyricsLookupAssist";

describe("lyrics lookup assist provider profile", () => {
  it("sends metadata-only candidate summaries and rejects invented candidates", () => {
    const track = { provider: "youtubeMusic" as const, trackID: "v1", title: "Song (Cover)", artist: "Singer", durationMs: 180_000 };
    const request = buildAILyricsLookupAssistRequestV1(track, buildLyricsLookupIdentity(track), []);
    expect(JSON.stringify(aiLyricsLookupAssistProfileV1.compactInput(request))).not.toContain("syncedLyrics");
    const adapted = aiLyricsLookupAssistProfileV1.adapt(request, {
      version: "lyricstage-lyrics-lookup-assist-v1", trackID: "v1", canonicalTitle: "Song",
      titleAliases: [], recordingArtists: ["Singer"], originalArtists: ["Original"], isCover: true,
      preferredCandidate: { provider: "lrclib", id: "invented" }, confidence: 0.9,
    });
    expect(adapted.response?.preferredCandidate).toBeUndefined();
  });
});
