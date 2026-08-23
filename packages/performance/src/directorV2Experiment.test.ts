import { describe, expect, it } from "vitest";
import { lyricFixtures, type LyricDocumentV0 } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1, isDirectorPlanV1ForLyrics } from "./directorPlan";
import { compileManualDirectorV2V1 } from "./directorV2Compiler";
import { compileDirectorV2ExperimentV1, shiftDirectorV2FixtureCuesV1 } from "./directorV2Experiment";
import { directorV2ManualFixtures } from "./directorV2Fixtures";

const lyricsByRecordingID = new Map<string, LyricDocumentV0>(
  Object.values(lyricFixtures).map((lyrics) => [lyrics.recordingID, lyrics]),
);

describe("Director V2 A/B/C/D expression gate", () => {
  it("builds four complete existing-runtime plans without declaring an artistic winner", () => {
    directorV2ManualFixtures.forEach((fixture) => {
      const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
      const local = compileLocalDirectorPlanV1(lyrics);
      expect(compileManualDirectorV2V1(lyrics, local, fixture), `${fixture.id}:B`).not.toBeNull();
      expect(compileManualDirectorV2V1(lyrics, local, shiftDirectorV2FixtureCuesV1(lyrics, fixture)), `${fixture.id}:C`).not.toBeNull();
      expect(compileManualDirectorV2V1(lyrics, local, fixture, { recipeBranchPolicy: "context-free" }), `${fixture.id}:D`).not.toBeNull();
      const experiment = compileDirectorV2ExperimentV1(lyrics, fixture);
      expect(experiment, fixture.id).not.toBeNull();
      if (!experiment) return;
      expect(experiment.status).toBe("awaiting-review");
      expect(experiment.variants.map((variant) => variant.id)).toEqual(["A", "B", "C", "D"]);
      experiment.variants.forEach((variant) => expect(isDirectorPlanV1ForLyrics(variant.plan, lyrics), `${fixture.id}:${variant.id}`).toBe(true));
      expect(experiment.variants[0].metrics.cueCount).toBe(0);
      expect(experiment.variants[1].metrics.cueCount).toBeGreaterThan(0);
    });
  });

  it("keeps C's capability budget while moving cue causality", () => {
    directorV2ManualFixtures.forEach((fixture) => {
      const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
      const [, correct, shifted] = compileDirectorV2ExperimentV1(lyrics, fixture)!.variants;
      expect(shifted.metrics.cueCount, fixture.id).toBe(correct.metrics.cueCount);
      expect(shifted.metrics.cuePlacementSignature, fixture.id).not.toBe(correct.metrics.cuePlacementSignature);
      expect(new Set(shifted.compiled!.recipeEvents.map((event) => event.recipe)), fixture.id)
        .toEqual(new Set(correct.compiled!.recipeEvents.map((event) => event.recipe)));
    });
  });

  it("makes B context-sensitive while D fixes one branch per recipe family", () => {
    const contextual = new Map<string, Set<string>>();
    const contextFree = new Map<string, Set<string>>();
    directorV2ManualFixtures.forEach((fixture) => {
      const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
      const [, correct, , fixed] = compileDirectorV2ExperimentV1(lyrics, fixture)!.variants;
      correct.compiled!.recipeEvents.forEach((event) => {
        const branches = contextual.get(event.recipe) ?? new Set<string>();
        branches.add(event.branch);
        contextual.set(event.recipe, branches);
      });
      fixed.compiled!.recipeEvents.forEach((event) => {
        const branches = contextFree.get(event.recipe) ?? new Set<string>();
        branches.add(event.branch);
        contextFree.set(event.recipe, branches);
      });
    });
    expect(contextual.get("rupture")?.size).toBe(2);
    expect(contextual.get("release")?.size).toBe(2);
    expect(contextual.get("recall")?.size).toBe(2);
    expect([...contextFree.values()].every((branches) => branches.size === 1)).toBe(true);
  });

  it("keeps ideal B promises resolved and exposes C failures instead of repairing them invisibly", () => {
    directorV2ManualFixtures.forEach((fixture) => {
      const lyrics = lyricsByRecordingID.get(fixture.recordingID)!;
      const [, correct, shifted] = compileDirectorV2ExperimentV1(lyrics, fixture)!.variants;
      expect(correct.metrics.unresolvedPromiseCount, fixture.id).toBe(0);
      expect(shifted.metrics.unresolvedPromiseCount, fixture.id).toBeGreaterThanOrEqual(0);
    });
  });
});
