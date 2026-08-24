import { describe, expect, it } from "vitest";
import {
  aiLyricsLookupAssistVersion,
  buildAILyricsLookupAssistRequestV1,
  mergeAILyricsLookupAssistIdentityV1,
  sanitizeAILyricsLookupAssistResultV1,
} from "./aiLookupAssist";
import { buildLyricsLookupIdentity } from "./identity";

const track = {
  provider: "youtubeMusic" as const,
  trackID: "video-1",
  title: "【歌ってみた】泥中に咲く / covered by 星乃めあ",
  artist: "星乃めあ",
  durationMs: 290_000,
};

describe("AI lyrics lookup assist", () => {
  it("accepts a bounded identity correction and only a candidate issued in the request", () => {
    const local = buildLyricsLookupIdentity(track);
    const request = buildAILyricsLookupAssistRequestV1(track, local, [{
      provider: "lrclib", id: "candidate-1", title: "泥中に咲く", artist: "ウォルピスカーター",
      durationMs: 289_000, syncedLyrics: "[00:00.00]line",
    }]);
    const result = sanitizeAILyricsLookupAssistResultV1(request, {
      version: aiLyricsLookupAssistVersion,
      trackID: track.trackID,
      canonicalTitle: "泥中に咲く",
      titleAliases: ["Deichuu ni Saku"],
      recordingArtists: ["星乃めあ"],
      originalArtists: ["ウォルピスカーター"],
      isCover: true,
      preferredCandidate: { provider: "lrclib", id: "candidate-1" },
      confidence: 0.91,
    });
    expect(result?.preferredCandidate).toEqual({ provider: "lrclib", id: "candidate-1" });
    expect(mergeAILyricsLookupAssistIdentityV1(track, local, result!).originalArtists)
      .toContain("ウォルピスカーター");
  });

  it("fails closed for stale tracks, unsupported candidate ids, and weak confidence", () => {
    const local = buildLyricsLookupIdentity(track);
    const request = buildAILyricsLookupAssistRequestV1(track, local, []);
    const base = {
      version: aiLyricsLookupAssistVersion,
      trackID: track.trackID,
      canonicalTitle: "泥中に咲く",
      titleAliases: [], recordingArtists: ["星乃めあ"], originalArtists: ["ウォルピスカーター"],
      isCover: true, preferredCandidate: { provider: "lrclib", id: "invented" }, confidence: 0.9,
    };
    expect(sanitizeAILyricsLookupAssistResultV1(request, { ...base, trackID: "old" })).toBeUndefined();
    expect(sanitizeAILyricsLookupAssistResultV1(request, { ...base, confidence: 0.4 })).toBeUndefined();
    expect(sanitizeAILyricsLookupAssistResultV1(request, base)?.preferredCandidate).toBeUndefined();
  });

  it("keeps a cleaned cover identity for manual review when the original is unresolved", () => {
    const local = buildLyricsLookupIdentity(track);
    const request = buildAILyricsLookupAssistRequestV1(track, local, []);
    const result = sanitizeAILyricsLookupAssistResultV1(request, {
      version: aiLyricsLookupAssistVersion,
      trackID: track.trackID,
      canonicalTitle: "泥中に咲く",
      titleAliases: [],
      recordingArtists: ["星乃めあ"],
      originalArtists: [],
      isCover: true,
      preferredCandidate: null,
      confidence: 0.86,
    });
    expect(result).toMatchObject({ canonicalTitle: "泥中に咲く", originalArtists: [], isCover: true });
  });
});
