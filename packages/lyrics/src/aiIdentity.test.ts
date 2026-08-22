import { describe, expect, it } from "vitest";

import {
  buildAIMusicIdentityRequest,
  buildLyricsLookupIdentity,
  isAIMusicIdentityResultV1,
  mergeGroundedLyricsIdentity,
  type AIMusicIdentityResultV1,
  type LyricsLookupTrackV0,
} from "./index";

const track: LyricsLookupTrackV0 = {
  provider: "youtubeMusic",
  trackID: "X9aN34E-f8Q",
  title: "【歌ってみた】泥中に咲く - ウォルピスカーター covered by 存流",
  artist: "存流 -ᴀʀᴜ-",
  durationMs: 287_000,
};

const groundedResult = (): AIMusicIdentityResultV1 => ({
  version: "lyricstage-music-identity-v1",
  resolverVersion: "gemma4-google-search-v1",
  trackID: track.trackID,
  status: "grounded",
  canonicalTitle: "泥中に咲く",
  titleAliases: ["Deichuu ni Saku"],
  performers: ["存流 -ᴀʀᴜ-"],
  originalArtists: ["ウォルピスカーター"],
  creators: [{ name: "針原翼", role: "composer" }],
  isCover: true,
  confidence: 0.94,
  evidenceSummary: "Official pages distinguish the recordings.",
  searchQueries: ["泥中に咲く 存流 ウォルピスカーター"],
  sources: [{
    uri: "https://www.youtube.com/watch?v=X9aN34E-f8Q",
    title: "Official cover",
    domain: "www.youtube.com",
  }],
});

describe("Gemma 4 grounded music identity", () => {
  it("sends deterministic cleanup only as untrusted local hints", () => {
    const request = buildAIMusicIdentityRequest(track);
    expect(request.version).toBe("lyricstage-music-identity-request-v1");
    expect(request.localHints.canonicalTitle).toBe("泥中に咲く");
    expect(request.localHints.originalArtists).toEqual(["ウォルピスカーター"]);
  });

  it("merges a grounded original artist into the lookup identity", () => {
    const identity = mergeGroundedLyricsIdentity(track, buildLyricsLookupIdentity(track), groundedResult());
    expect(identity?.canonicalTitle).toBe("泥中に咲く");
    expect(identity?.coverPerformers).toContain("存流 -ᴀʀᴜ-");
    expect(identity?.originalArtists).toContain("ウォルピスカーター");
  });

  it("rejects ungrounded, mismatched, or malformed identity output", () => {
    expect(mergeGroundedLyricsIdentity(track, buildLyricsLookupIdentity(track), {
      ...groundedResult(),
      sources: [],
    })).toBeUndefined();
    expect(mergeGroundedLyricsIdentity(track, buildLyricsLookupIdentity(track), {
      ...groundedResult(),
      performers: ["別の歌手"],
    })).toBeUndefined();
    expect(isAIMusicIdentityResultV1({ ...groundedResult(), sources: [{ uri: "javascript:alert(1)" }] })).toBe(false);
  });
});
