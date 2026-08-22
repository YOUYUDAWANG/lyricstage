import { describe, expect, it } from "vitest";
import { canonicalJSON, sha256Hex } from "./canonical";
import { lyricFixtures } from "./fixtures";
import { parseDirectorRecipeV0, parseLyricDocumentV0 } from "./validation";

describe("LyricStage contracts", () => {
  it("accepts every copyright-free lyric fixture", () => {
    for (const fixture of Object.values(lyricFixtures)) {
      const result = parseLyricDocumentV0(fixture);
      expect(result.ok, result.ok ? undefined : JSON.stringify(result.issues)).toBe(true);
    }
  });

  it("rejects discontinuous line indices without changing text", () => {
    const invalid = structuredClone(lyricFixtures.lineOnlyJA);
    invalid.lines[2].lineIndex = 8;
    const result = parseLyricDocumentV0(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.path.endsWith("/lineIndex"))).toBe(true);
    expect(invalid.lines[2].text).toBe("遠い街の輪郭がほどけて");
  });

  it("rejects invented or out-of-line word timing", () => {
    const invalid = structuredClone(lyricFixtures.wordTimedMixed);
    invalid.lines[0].words![0].fromMs = 0;
    expect(parseLyricDocumentV0(invalid).ok).toBe(false);
  });

  it("rejects a recipe that points outside the lyric document", () => {
    const result = parseDirectorRecipeV0(
      {
        version: "director-recipe-v0",
        recordingID: lyricFixtures.lineOnlyJA.recordingID,
        lyricsHash: "fixture-hash",
        recipes: [{ lineIndex: 99, family: "railHandoff", intensity: 0.7 }],
      },
      lyricFixtures.lineOnlyJA.lines.length,
    );
    expect(result.ok).toBe(false);
  });

  it("produces a stable canonical hash independent of object key order", async () => {
    const left = { b: 2, a: { z: 1, y: [3, 4] } };
    const right = { a: { y: [3, 4], z: 1 }, b: 2 };
    expect(canonicalJSON(left)).toBe(canonicalJSON(right));
    expect(await sha256Hex(left)).toBe(await sha256Hex(right));
  });
});
