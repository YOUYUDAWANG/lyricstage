import { describe, expect, it } from "vitest";
import { isLyricsLookupResponseV0, lyricsLookupVersion } from "./types";

describe("lyrics lookup response identity", () => {
  const response = {
    type: "lyrics-lookup-result",
    version: lyricsLookupVersion,
    trackID: "track",
    status: "miss",
    source: "network",
    candidates: [],
    resolvedIdentity: {
      canonicalTitle: "水星記",
      recordingArtists: ["東 雪蓮"],
      originalArtists: [],
      isCover: true,
      method: "ai",
      confidence: 0.91,
    },
  } as const;

  it("accepts one bounded shared identity", () => {
    expect(isLyricsLookupResponseV0(response)).toBe(true);
  });

  it("rejects an invalid identity confidence", () => {
    expect(isLyricsLookupResponseV0({
      ...response,
      resolvedIdentity: { ...response.resolvedIdentity, confidence: 2 },
    })).toBe(false);
  });
});
