import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import type { DirectorSectionV1 } from "./directorPlan";
import {
  applySongBlockingV1,
  lyricGraphemesV1,
  sanitizeLyricGesturesV1,
  sanitizeSongBlockingV1,
} from "./lyricChoreography";

const sections = Array.from({ length: 4 }, (_, index): DirectorSectionV1 => ({
  id: `section:${index}`,
  fromLineIndex: index * 6,
  toLineIndex: index * 6 + 5,
  fromMs: index * 20_000,
  toMs: index * 20_000 + 18_000,
  artDirection: "editorialKinetic",
  layout: "monument",
  typography: "jpGothic",
  paletteIndex: index,
  intensity: 0.6,
}));

describe("song blocking and lyric choreography", () => {
  it("allows two major spatial changes and only one exceptional third change", () => {
    const blocking = {
      version: "song-blocking-v1",
      baseLayout: "railLeading",
      transitions: [
        {
          atSectionIndex: 1,
          toLayout: "monument",
          purpose: "perspectiveShift",
          strength: "major",
          evidence: { sectionTriggers: ["section_boundary", "density_lift"], lineIndices: [6], audioLandmarkIDs: [], rationale: "The first structural lift opens the center.", confidence: 0.82 },
        },
        {
          atSectionIndex: 2,
          toLayout: "duetDivide",
          purpose: "voiceReframe",
          strength: "major",
          evidence: { sectionTriggers: ["repeated_hook", "voice_handoff", "density_lift"], lineIndices: [12], audioLandmarkIDs: [], rationale: "The returning hook reframes two verified voices.", confidence: 0.88 },
        },
        {
          atSectionIndex: 3,
          toLayout: "railTrailing",
          purpose: "finalExpansion",
          strength: "exceptional",
          evidence: { sectionTriggers: ["final_resolution", "voice_handoff", "density_release"], lineIndices: [18], audioLandmarkIDs: ["final-release"], rationale: "The final resolution combines structure, voice, and release.", confidence: 0.94 },
        },
      ],
    };
    const resolved = sanitizeSongBlockingV1(blocking, sections);
    expect(resolved?.transitions).toHaveLength(3);
    expect(applySongBlockingV1(sections, resolved!).map((section) => section.layout)).toEqual([
      "railLeading", "monument", "duetDivide", "railTrailing",
    ]);
    expect(sanitizeSongBlockingV1({
      ...blocking,
      transitions: blocking.transitions.map((transition, index) => index === 2 ? { ...transition, strength: "major" } : transition),
    }, sections)).toBeNull();
  });

  it("rejects a layout change whose stated purpose is not supported by its evidence", () => {
    expect(sanitizeSongBlockingV1({
      version: "song-blocking-v1",
      baseLayout: "editorialSplit",
      transitions: [{
        atSectionIndex: 1,
        toLayout: "duetDivide",
        purpose: "voiceReframe",
        strength: "major",
        evidence: {
          sectionTriggers: ["section_boundary", "density_lift"],
          lineIndices: [6],
          audioLandmarkIDs: [],
          rationale: "A louder new section alone should not be allowed to masquerade as a voice change.",
          confidence: 0.9,
        },
      }],
    }, sections)).toBeNull();
  });

  it("accepts exact real-word glyph targets and rejects rewritten lyric targets", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const line = lyrics.lines[0]!;
    const word = line.words![0]!;
    const pieces = lyricGraphemesV1(line.text);
    const wordPieces = lyricGraphemesV1(word.text);
    const start = pieces.findIndex((piece, index) => wordPieces.every((wordPiece, offset) => pieces[index + offset] === wordPiece));
    const gesture = {
      id: "glyph:fixture",
      lineIndex: line.lineIndex,
      scope: "glyph",
      target: { fromGrapheme: start, toGrapheme: start + 1, expectedText: pieces[start] },
      primitive: "glyph.strokeTrace",
      driver: "wordWindow",
      space: "lyricLocal",
      envelope: { attackMs: 180, holdMs: 120, releaseMs: 280 },
      intensity: 0.52,
      direction: 1,
      paletteRole: "accent",
      evidence: { semanticRole: "identity", rationale: "One real-timed glyph receives a restrained trace.", confidence: 0.76 },
    };
    expect(sanitizeLyricGesturesV1(lyrics, [gesture])?.[0]?.target.expectedText).toBe(pieces[start]);
    expect(sanitizeLyricGesturesV1(lyrics, [{ ...gesture, target: { ...gesture.target, expectedText: "改" } }])).toBeNull();
  });
});
