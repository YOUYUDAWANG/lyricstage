import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1, type DirectorPlanV1 } from "./directorPlan";
import { compileManualDirectorV2V1, type CompiledManualDirectorV2V1 } from "./directorV2Compiler";
import type { DirectorV2ManualFixtureV1, ManualSemanticCueV2 } from "./directorV2Fixtures";
import { lyricGraphemesV1 } from "./lyricChoreography";

export type DirectorV2ExperimentVariantID = "A" | "B" | "C" | "D";

export interface DirectorV2ExperimentVariantV1 {
  id: DirectorV2ExperimentVariantID;
  label: string;
  plan: DirectorPlanV1;
  compiled?: CompiledManualDirectorV2V1;
  metrics: {
    cueCount: number;
    recipeEventCount: number;
    promiseCount: number;
    unresolvedPromiseCount: number;
    cuePlacementSignature: string;
    branchSignature: string;
    primitiveSignature: string;
  };
}

export interface DirectorV2ExperimentPackV1 {
  version: "director-v2-experiment-v1";
  fixtureID: string;
  status: "awaiting-review";
  variants: readonly [
    DirectorV2ExperimentVariantV1,
    DirectorV2ExperimentVariantV1,
    DirectorV2ExperimentVariantV1,
    DirectorV2ExperimentVariantV1,
  ];
}

const shiftedFocus = (
  lyrics: LyricDocumentV0,
  cue: ManualSemanticCueV2,
  shiftedFromLineIndex: number,
  shiftedToLineIndex: number,
): ManualSemanticCueV2["focus"] => {
  if (!cue.focus) return undefined;
  const relativeLine = cue.focus.lineIndex - cue.fromLineIndex;
  const lineIndex = Math.min(shiftedToLineIndex, shiftedFromLineIndex + Math.max(0, relativeLine));
  const line = lyrics.lines.find((candidate) => candidate.lineIndex === lineIndex)!;
  const pieces = lyricGraphemesV1(line.text);
  let length = Math.max(1, Math.min(pieces.length, cue.focus.toGrapheme - cue.focus.fromGrapheme));
  while (length > 1 && pieces[length - 1]!.trim().length === 0) length -= 1;
  return {
    lineIndex,
    fromGrapheme: 0,
    toGrapheme: length,
    expectedText: pieces.slice(0, length).join(""),
  };
};

export const shiftDirectorV2FixtureCuesV1 = (
  lyrics: LyricDocumentV0,
  fixture: DirectorV2ManualFixtureV1,
): DirectorV2ManualFixtureV1 => ({
  ...fixture,
  id: `${fixture.id}:wrong-position`,
  windows: fixture.windows.map((window) => ({
    ...window,
    cues: window.cues.map((cue) => {
      const span = (cue.toLineIndex ?? cue.fromLineIndex) - cue.fromLineIndex;
      const maximumFrom = window.toLineIndex - span;
      const earlier = Math.max(window.fromLineIndex, cue.fromLineIndex - 1);
      const shiftedFromLineIndex = earlier === cue.fromLineIndex
        ? Math.min(maximumFrom, cue.fromLineIndex + 1)
        : earlier;
      const shiftedToLineIndex = shiftedFromLineIndex + span;
      return {
        ...cue,
        fromLineIndex: shiftedFromLineIndex,
        ...(cue.toLineIndex === undefined ? {} : { toLineIndex: shiftedToLineIndex }),
        ...(cue.focus ? { focus: shiftedFocus(lyrics, cue, shiftedFromLineIndex, shiftedToLineIndex) } : {}),
      };
    }),
  })),
});

const metricsFor = (
  plan: DirectorPlanV1,
  compiled?: CompiledManualDirectorV2V1,
): DirectorV2ExperimentVariantV1["metrics"] => ({
  cueCount: compiled?.acceptedCueIDs.length ?? 0,
  recipeEventCount: compiled?.recipeEvents.length ?? 0,
  promiseCount: compiled?.promises.length ?? 0,
  unresolvedPromiseCount: compiled?.promises.filter((promise) => promise.status === "unresolved").length ?? 0,
  cuePlacementSignature: compiled?.influences
    .map((influence) => `${influence.cueID}:${influence.coreRange.fromLineIndex}-${influence.coreRange.toLineIndex}`)
    .join("|") ?? "local",
  branchSignature: compiled?.recipeEvents.map((event) => `${event.recipe}:${event.branch}`).join("|") ?? "local",
  primitiveSignature: plan.effects
    .filter((effect) => effect.id.startsWith("director-v2-effect:"))
    .map((effect) => `${effect.primary.primitive}+${effect.support.map((use) => use.primitive).join("+")}`)
    .join("|") || "local",
});

export const compileDirectorV2ExperimentV1 = (
  lyrics: LyricDocumentV0,
  fixture: DirectorV2ManualFixtureV1,
): DirectorV2ExperimentPackV1 | null => {
  const local = compileLocalDirectorPlanV1(lyrics);
  const correct = compileManualDirectorV2V1(lyrics, local, fixture);
  const wrongPosition = compileManualDirectorV2V1(lyrics, local, shiftDirectorV2FixtureCuesV1(lyrics, fixture));
  const contextFree = compileManualDirectorV2V1(lyrics, local, fixture, { recipeBranchPolicy: "context-free" });
  if (!correct || !wrongPosition || !contextFree) return null;
  const variant = (
    id: DirectorV2ExperimentVariantID,
    label: string,
    plan: DirectorPlanV1,
    compiled?: CompiledManualDirectorV2V1,
  ): DirectorV2ExperimentVariantV1 => ({ id, label, plan, ...(compiled ? { compiled } : {}), metrics: metricsFor(plan, compiled) });
  return {
    version: "director-v2-experiment-v1",
    fixtureID: fixture.id,
    status: "awaiting-review",
    variants: [
      variant("A", "Local V1", local),
      variant("B", "Correct cues + contextual recipes", correct.plan, correct),
      variant("C", "Wrong-position cues", wrongPosition.plan, wrongPosition),
      variant("D", "Correct cues + context-free recipes", contextFree.plan, contextFree),
    ],
  };
};
