import { describe, expect, it } from "vitest";

import { manualLyricsLookupIdentity, sanitizeManualLyricsSearchQuery } from "./index";

describe("manual lyrics search", () => {
  it("treats the user's title and artist as explicit search fields", () => {
    const query = sanitizeManualLyricsSearchQuery("  死別  ", " シャノン ");
    expect(query).toEqual({ title: "死別", artist: "シャノン" });
    expect(query && manualLyricsLookupIdentity(query)).toEqual({
      canonicalTitle: "死別",
      titles: ["死別"],
      originalArtists: ["シャノン"],
      coverPerformers: [],
      isCover: false,
    });
  });

  it("allows an empty artist but rejects an empty or oversized title", () => {
    expect(sanitizeManualLyricsSearchQuery("春を告げる", "")).toEqual({ title: "春を告げる", artist: "" });
    expect(sanitizeManualLyricsSearchQuery("", "yama")).toBeUndefined();
    expect(sanitizeManualLyricsSearchQuery("x".repeat(501), "")).toBeUndefined();
  });
});
