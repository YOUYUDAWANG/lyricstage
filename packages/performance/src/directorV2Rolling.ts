import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1 } from "./directorPlan";
import { compileManualDirectorV2V1, type ObservableVisualPromiseV1 } from "./directorV2Compiler";
import type { DirectorV2ManualFixtureV1, WindowIntentV2 } from "./directorV2Fixtures";
import {
  compileLocalSceneCardForWindowV1,
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
  type DirectorBibleV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
} from "./rollingDirector";
import type { EffectRecipeV1 } from "./effectGrammar";
import type { LyricGestureV1 } from "./lyricChoreography";

const uniqueByID = <T extends { id: string }>(items: readonly T[]): T[] =>
  [...new Map(items.map((item) => [item.id, item])).values()];

const gesturesForCard = (
  localCard: SceneCardV1,
  v2Gestures: readonly LyricGestureV1[],
): LyricGestureV1[] => {
  const maximum = localCard.signatureMoment ? 4 : 2;
  const candidate = uniqueByID([...v2Gestures, ...localCard.gestures]).slice(0, maximum);
  if (!localCard.signatureMoment) return candidate;
  const scopes = new Set(candidate.map((gesture) => gesture.scope));
  return candidate.length >= 2 && scopes.size >= 2 ? candidate : localCard.gestures;
};

const effectsForCard = (
  localCard: SceneCardV1,
  v2Effects: readonly EffectRecipeV1[],
): EffectRecipeV1[] => uniqueByID([...v2Effects, ...localCard.effects])
  .slice(0, localCard.signatureMoment ? 2 : 1);

const reidentifySceneCard = (card: Omit<SceneCardV1, "sceneID">): SceneCardV1 => {
  const sceneID = sceneCardIdentityV1(card);
  return { ...card, sceneID, effects: card.effects.map((effect) => ({ ...effect, sectionID: sceneID })) };
};

export const compileLocalContinuitySceneCardV2 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  acceptedCards: readonly SceneCardV1[],
  fromLineIndex: number,
  toLineIndex: number,
): SceneCardV1 | null => {
  const local = compileLocalSceneCardForWindowV1(lyrics, bible, state, fromLineIndex, toLineIndex);
  if (!local) return null;
  const predecessor = [...acceptedCards]
    .filter((card) => card.toLineIndex + 1 === fromLineIndex)
    .sort((left, right) => right.toLineIndex - left.toLineIndex)[0];
  if (!predecessor) return local;
  const { sceneID: _ignored, ...withoutID } = local;
  const inherited = reidentifySceneCard({
    ...withoutID,
    artDirection: predecessor.artDirection,
    typography: predecessor.typography,
    coverRole: predecessor.coverRole,
    presentation: predecessor.presentation === "hero" ? "section" : predecessor.presentation,
  });
  return sanitizeSceneCardV1(lyrics, bible, state, inherited);
};

export const compileWindowIntentV2ToSceneCardV1 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  intent: WindowIntentV2,
): SceneCardV1 | null => {
  if (intent.version !== "window-intent-v2"
    || intent.bibleIdentity !== bible.bibleIdentity
    || intent.entryStateHash !== state.stateHash) return null;
  const localCard = compileLocalSceneCardForWindowV1(
    lyrics,
    bible,
    state,
    intent.fromLineIndex,
    intent.toLineIndex,
  );
  if (!localCard) return null;
  const fixture: DirectorV2ManualFixtureV1 = {
    id: `rolling-v2:${state.nextSceneIndex}:${intent.fromLineIndex}-${intent.toLineIndex}`,
    category: "fast",
    recordingID: lyrics.recordingID,
    motifAnchor: bible.motifActor.relationship,
    windows: [{
      id: intent.id,
      fromLineIndex: intent.fromLineIndex,
      toLineIndex: intent.toLineIndex,
      spatialIntent: intent.spatialIntent,
      coverRole: intent.coverRole,
      arcIntent: intent.arcIntent,
      cues: intent.cues,
    }],
    expectations: { signatureEvents: [], promises: [] },
  };
  const priorLineIndex = state.lastToLineIndex ?? intent.fromLineIndex - 1;
  const canSeedPromises = priorLineIndex < intent.fromLineIndex
    && lyrics.lines.some((line) => line.lineIndex === priorLineIndex);
  const seedPromises: ObservableVisualPromiseV1[] = canSeedPromises
    ? state.unresolvedPromiseIDs.map((promiseID) => ({
      promiseID,
      motifAnchor: bible.motifActor.relationship,
      fact: "trace",
      visualPrimitive: "memory.trail",
      sourceCueID: `rolling-state:${promiseID}`,
      sourceRange: { fromLineIndex: priorLineIndex, toLineIndex: priorLineIndex },
      sourceEffectID: `rolling-state-effect:${promiseID}`,
      status: "unresolved",
    }))
    : [];
  const compiled = compileManualDirectorV2V1(
    lyrics,
    compileLocalDirectorPlanV1(lyrics),
    fixture,
    { allowEmptyCues: true, seedPromises },
  );
  if (!compiled) return null;
  const inRange = (lineIndex: number) => lineIndex >= intent.fromLineIndex && lineIndex <= intent.toLineIndex;
  const directives = compiled.plan.directives.filter((directive) => inRange(directive.lineIndex));
  const v2Gestures = compiled.plan.gestures.filter((gesture) =>
    gesture.id.startsWith("director-v2-gesture:") && inRange(gesture.lineIndex));
  const v2Effects = compiled.plan.effects
    .filter((effect) => effect.id.startsWith("director-v2-"))
    .map((effect) => {
      const localEvidenceLines = effect.evidence.lineIndices.filter(inRange);
      return {
        ...effect,
        evidence: {
          ...effect.evidence,
          lineIndices: localEvidenceLines.length > 0 ? localEvidenceLines : [intent.fromLineIndex],
        },
      };
    });
  const withoutID: Omit<SceneCardV1, "sceneID"> = {
    ...localCard,
    intention: intent.cues.length > 0
      ? `Director V2 sparse cues: ${intent.cues.map((cue) => cue.role).join(" → ")}.`
      : `Director V2 restrained ${intent.arcIntent} window.`,
    coverRole: intent.coverRole,
    directives,
    semanticCueCount: intent.cues.length,
    gestures: gesturesForCard(localCard, v2Gestures),
    effects: effectsForCard(localCard, v2Effects),
  };
  const candidate = reidentifySceneCard(withoutID);
  return sanitizeSceneCardV1(lyrics, bible, state, candidate);
};
