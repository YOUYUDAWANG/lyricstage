import { describe, expect, it } from "vitest";

import { manualLyricsLookupIdentity, sanitizeManualLyricsSearchQuery } from "./index";

describe("manual lyrics search", () => {
  it("treats the user's title and artist as explicit search fields", () => {
    const query = sanitizeManualLyricsSearchQuery("  死別  ", " シャノン ");
    expect(query).toEqual({ title: "死別", artist: "シャノン", originalArtist: "" });
    expect(query && manualLyricsLookupIdentity(query)).toEqual({
      canonicalTitle: "死別",
      titles: ["死別"],
      originalArtists: ["シャノン"],
      coverPerformers: [],
      isCover: false,
    });
  });

  it("allows an empty artist but rejects an empty or oversized title", () => {
    expect(sanitizeManualLyricsSearchQuery("春を告げる", "")).toEqual({ title: "春を告げる", artist: "", originalArtist: "" });
    expect(sanitizeManualLyricsSearchQuery("", "yama")).toBeUndefined();
    expect(sanitizeManualLyricsSearchQuery("x".repeat(501), "")).toBeUndefined();
  });

  it("preserves one shared cover identity when the user corrects the cleaned fields", () => {
    const base = {
      canonicalTitle: "水星記 Mercury Records",
      titles: ["水星記 Mercury Records"],
      originalArtists: [],
      coverPerformers: ["東 雪蓮"],
      isCover: true,
    };
    const query = sanitizeManualLyricsSearchQuery("水星記", "東 雪蓮", "原唱者");
    expect(query && manualLyricsLookupIdentity(query, base)).toEqual({
      canonicalTitle: "水星記",
      titles: ["水星記"],
      originalArtists: ["原唱者"],
      coverPerformers: ["東 雪蓮"],
      isCover: true,
    });
  });
});
