import { describe, expect, it } from "vitest";
import { lyricFixtures, type LyricDocumentV0 } from "@lyricstage/contracts";
import { directorV2ManualFixtures } from "./directorV2Fixtures";
import { lyricGraphemesV1 } from "./lyricChoreography";

const lyricsByRecordingID = new Map<string, LyricDocumentV0>(
  Object.values(lyricFixtures).map((lyrics) => [lyrics.recordingID, lyrics]),
);

const cuesFor = (fixture: (typeof directorV2ManualFixtures)[number]) => fixture.windows.flatMap((window) => window.cues);

describe("Director V2 manual expression fixtures", () => {
  it("covers the five frozen song categories with repository lyric truth", () => {
    expect(directorV2ManualFixtures.map((fixture) => fixture.category).sort()).toEqual([
      "duet-overlap",
      "fast",
      "long-line",
      "repeated-chorus",
      "slow-instrumental-gap",
    ]);
    directorV2ManualFixtures.forEach((fixture) => {
      expect(lyricsByRecordingID.has(fixture.recordingID), fixture.id).toBe(true);
    });
  });

  it("keeps windows, evidence, and exact focus anchored to real lyric lines", () => {
    directorV2ManualFixtures.forEach((fixture) => {
      const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
      const lineByIndex = new Map(lyrics.lines.map((line) => [line.lineIndex, line]));
      fixture.windows.forEach((window) => {
        expect(lineByIndex.has(window.fromLineIndex), window.id).toBe(true);
        expect(lineByIndex.has(window.toLineIndex), window.id).toBe(true);
        expect(window.fromLineIndex, window.id).toBeLessThanOrEqual(window.toLineIndex);
        window.cues.forEach((cue) => {
          const cueTo = cue.toLineIndex ?? cue.fromLineIndex;
          expect(cue.fromLineIndex, cue.id).toBeGreaterThanOrEqual(window.fromLineIndex);
          expect(cueTo, cue.id).toBeLessThanOrEqual(window.toLineIndex);
          expect(cue.fromLineIndex, cue.id).toBeLessThanOrEqual(cueTo);
          expect(cue.evidenceLineIndices.length, cue.id).toBeGreaterThan(0);
          cue.evidenceLineIndices.forEach((lineIndex) => expect(lineByIndex.has(lineIndex), cue.id).toBe(true));
          expect(cue.confidence, cue.id).toBeGreaterThanOrEqual(0);
          expect(cue.confidence, cue.id).toBeLessThanOrEqual(1);
          if (!cue.focus) return;
          expect(cue.focus.lineIndex, cue.id).toBeGreaterThanOrEqual(cue.fromLineIndex);
          expect(cue.focus.lineIndex, cue.id).toBeLessThanOrEqual(cueTo);
          const pieces = lyricGraphemesV1(lineByIndex.get(cue.focus.lineIndex)!.text);
          expect(pieces.slice(cue.focus.fromGrapheme, cue.focus.toGrapheme).join(""), cue.id)
            .toBe(cue.focus.expectedText);
        });
      });
    });
  });

  it("honors the frozen resource caps without treating them as density targets", () => {
    directorV2ManualFixtures.forEach((fixture) => {
      const cues = cuesFor(fixture);
      expect(cues.length, fixture.id).toBeLessThanOrEqual(12);
      expect(cues.filter((cue) => cue.focus).length, fixture.id).toBeLessThanOrEqual(6);
      fixture.windows.forEach((window) => expect(window.cues.length, window.id).toBeLessThanOrEqual(6));
    });
  });

  it("binds every planned event and visual promise to authored cues", () => {
    directorV2ManualFixtures.forEach((fixture) => {
      const cues = cuesFor(fixture);
      const cueByID = new Map(cues.map((cue) => [cue.id, cue]));
      fixture.expectations.signatureEvents.forEach((event) => {
        expect(cueByID.has(event.cueID), `${fixture.id}:${event.cueID}`).toBe(true);
        expect(event.observableFact.trim().length, event.cueID).toBeGreaterThan(20);
      });
      fixture.expectations.promises.forEach((promise) => {
        expect(promise.promiseID, fixture.id).toMatch(/^promise:(rupture|release|recall):[a-z0-9-]+:\d+-\d+$/u);
        expect(cueByID.get(promise.sourceCueID)?.role, promise.promiseID).toBe("rupture");
        expect(["recall", "release"], promise.promiseID).toContain(cueByID.get(promise.consumerCueID)?.role);
        expect(promise.visibleContinuity.trim().length, promise.promiseID).toBeGreaterThan(20);
      });
    });
  });

  it("represents a real lyricless gap without inventing a lyricless AI cue", () => {
    const fixture = directorV2ManualFixtures.find((candidate) => candidate.category === "slow-instrumental-gap")!;
    const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
    const gap = fixture.expectations.instrumentalGap!;
    expect(gap.toMs - gap.fromMs).toBeGreaterThanOrEqual(15_000);
    expect(lyrics.lines.some((line) => line.toMs === gap.fromMs)).toBe(true);
    expect(lyrics.lines.some((line) => line.fromMs === gap.toMs)).toBe(true);
    expect(cuesFor(fixture).some((cue) => {
      const line = lyrics.lines.find((candidate) => candidate.lineIndex === cue.fromLineIndex)!;
      return line.fromMs > gap.fromMs && line.fromMs < gap.toMs;
    })).toBe(false);
  });

  it("makes repeated structure and actual voice overlap explicit", () => {
    const repeated = directorV2ManualFixtures.find((fixture) => fixture.category === "repeated-chorus")!;
    expect(cuesFor(repeated).some((cue) => cue.role === "refrain")).toBe(true);
    expect(cuesFor(repeated).some((cue) => cue.role === "recall")).toBe(true);

    const duet = directorV2ManualFixtures.find((fixture) => fixture.category === "duet-overlap")!;
    const lyrics = lyricsByRecordingID.get(duet.recordingID)!;
    const overlapCue = cuesFor(duet).find((cue) => cue.id === "duet:handoff-overlap")!;
    const anchored = lyrics.lines.filter((line) => overlapCue.evidenceLineIndices.includes(line.lineIndex));
    expect(overlapCue.role).toBe("handoff");
    expect(anchored.some((line, index) => anchored.some((other, otherIndex) => index !== otherIndex
      && line.fromMs < other.toMs && other.fromMs < line.toMs))).toBe(true);
  });

  it("keeps the line-only long-line fixture phrase-level and focus-free", () => {
    const fixture = directorV2ManualFixtures.find((candidate) => candidate.category === "long-line")!;
    const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
    expect(lyrics.lines.every((line) => !line.words || line.words.length === 0)).toBe(true);
    expect(cuesFor(fixture).every((cue) => !cue.focus)).toBe(true);
  });
});
