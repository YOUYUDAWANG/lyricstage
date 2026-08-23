import { describe, expect, it } from "vitest";
import { lyricFixtures, type LyricDocumentV0 } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1, isDirectorPlanV1ForLyrics } from "./directorPlan";
import { compileManualDirectorV2V1 } from "./directorV2Compiler";
import { directorV2ManualFixtures, type DirectorV2ManualFixtureV1 } from "./directorV2Fixtures";

const lyricsByRecordingID = new Map<string, LyricDocumentV0>(
  Object.values(lyricFixtures).map((lyrics) => [lyrics.recordingID, lyrics]),
);

describe("Director V2 manual cue compiler", () => {
  it("compiles every ideal fixture into the existing complete plan contract", () => {
    directorV2ManualFixtures.forEach((fixture) => {
      const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
      const local = compileLocalDirectorPlanV1(lyrics);
      const compiled = compileManualDirectorV2V1(lyrics, local, fixture);
      expect(compiled, fixture.id).not.toBeNull();
      expect(isDirectorPlanV1ForLyrics(compiled!.plan, lyrics), fixture.id).toBe(true);
      expect(compiled!.plan.sections, fixture.id).toEqual(local.sections);
      expect(compiled!.plan.effects, fixture.id).toEqual(local.effects);
      expect(compiled!.plan.gestures, fixture.id).toEqual(local.gestures);
      expect(compiled!.plan.directives, fixture.id).toHaveLength(local.directives.length);
      expect(compiled!.acceptedCueIDs, fixture.id).toHaveLength(fixture.windows.flatMap((window) => window.cues).length);
    });
  });

  it("derives bounded anticipation, core, and consequence without crossing an instrumental gap", () => {
    const fixture = directorV2ManualFixtures.find((candidate) => candidate.category === "slow-instrumental-gap")!;
    const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
    const compiled = compileManualDirectorV2V1(lyrics, compileLocalDirectorPlanV1(lyrics), fixture)!;
    const rupture = compiled.influences.find((influence) => influence.cueID === "slow:rupture-distant-echo")!;
    const returning = compiled.influences.find((influence) => influence.cueID === "slow:release-after-gap")!;
    expect(rupture.coreRange).toEqual({ fromLineIndex: 3, toLineIndex: 3 });
    expect(rupture.consequenceRange).toBeUndefined();
    expect(returning.anticipationRange).toBeUndefined();
    expect(rupture.recallEligibility).toBe(true);
  });

  it("keeps core intent above anticipation and consequence rewrites", () => {
    const fixture = directorV2ManualFixtures.find((candidate) => candidate.category === "fast")!;
    const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
    const local = compileLocalDirectorPlanV1(lyrics);
    const compiled = compileManualDirectorV2V1(lyrics, local, fixture)!;
    expect(compiled.plan.directives.find((directive) => directive.lineIndex === 1)?.behavior).toBe("gravityDrop");
    expect(compiled.plan.directives.find((directive) => directive.lineIndex === 2)?.behavior).toBe("stretch");
    expect(compiled.plan.directives.find((directive) => directive.lineIndex === 3)?.behavior).toBe("echo");
  });

  it("treats confidence as ranking evidence rather than a legality threshold", () => {
    const fixture = directorV2ManualFixtures[0]!;
    const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
    const lowered = structuredClone(fixture) as DirectorV2ManualFixtureV1;
    lowered.windows[0]!.cues[0]!.confidence = 0;
    expect(compileManualDirectorV2V1(lyrics, compileLocalDirectorPlanV1(lyrics), lowered)).not.toBeNull();
  });

  it("fails closed on rewritten focus text and resource-cap overflow", () => {
    const fixture = directorV2ManualFixtures[0]!;
    const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
    const local = compileLocalDirectorPlanV1(lyrics);
    const rewritten = structuredClone(fixture) as DirectorV2ManualFixtureV1;
    rewritten.windows[0]!.cues[0]!.focus!.expectedText = "已完成";
    expect(compileManualDirectorV2V1(lyrics, local, rewritten)).toBeNull();

    const overflow = structuredClone(fixture) as DirectorV2ManualFixtureV1;
    overflow.windows[0]!.cues = Array.from({ length: 7 }, (_, index) => ({
      ...overflow.windows[0]!.cues[0]!,
      id: `overflow:${index}`,
      focus: undefined,
    }));
    expect(compileManualDirectorV2V1(lyrics, local, overflow)).toBeNull();
  });

  it("is deterministic and leaves local fallback untouched", () => {
    const fixture = directorV2ManualFixtures.find((candidate) => candidate.category === "duet-overlap")!;
    const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
    const local = compileLocalDirectorPlanV1(lyrics);
    const before = structuredClone(local);
    const first = compileManualDirectorV2V1(lyrics, local, fixture)!;
    const second = compileManualDirectorV2V1(lyrics, local, fixture)!;
    expect(first).toEqual(second);
    expect(local).toEqual(before);
    expect(first.plan.planIdentity).not.toBe(local.planIdentity);
  });
});
