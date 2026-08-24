import { stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1, type DirectorPlanV1 } from "./directorPlan";
import { applyLinePerformancesV2 } from "./directorLinePerformanceV2";
import { compileManualDirectorV2V1, type ObservableVisualPromiseV1 } from "./directorV2Compiler";
import type { DirectorV2ManualFixtureV1, WindowIntentV2 } from "./directorV2Fixtures";
import {
  advanceRollingPerformanceStateV1,
  compileDirectorPlanFromRollingV1,
  compileLocalDirectorBibleV1,
  compileLocalSceneCardForWindowV1,
  initialRollingPerformanceStateV1,
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
  type DirectorBibleV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
} from "./rollingDirector";
import type { EffectRecipeV1 } from "./effectGrammar";
import type { LyricGestureV1 } from "./lyricChoreography";
import {
  compileLocalSceneRangesV3,
  compileLocalSceneTreatmentV3,
  type LocalSceneTreatmentV3,
} from "./localDirectorV3";
import type { MusicMapV1 } from "./musicMap";
import { layoutForSemanticSceneV2, type SemanticSceneDirectionV2 } from "./semanticSceneDirectionV2";
import { applySignatureChoreographyV2 } from "./signatureChoreographyV2";

const uniqueByID = <T extends { id: string }>(items: readonly T[]): T[] =>
  [...new Map(items.map((item) => [item.id, item])).values()];

const gesturesForCard = (
  localCard: SceneCardV1,
  v2Gestures: readonly LyricGestureV1[],
  semanticCueCount: number,
): LyricGestureV1[] => {
  const maximum = localCard.signatureMoment ? 4 : Math.min(3, Math.max(1, semanticCueCount));
  const authored = v2Gestures.filter((gesture) => gesture.id.startsWith("director-v2-"));
  const localSupport = v2Gestures.filter((gesture) => !gesture.id.startsWith("director-v2-"));
  const candidate = uniqueByID([...authored, ...localCard.gestures, ...localSupport]).slice(0, maximum);
  if (!localCard.signatureMoment) return candidate;
  const scopes = new Set(candidate.map((gesture) => gesture.scope));
  return candidate.length >= 2 && scopes.size >= 2 ? candidate : localCard.gestures;
};

const effectsForCard = (
  localCard: SceneCardV1,
  v2Effects: readonly EffectRecipeV1[],
  semanticCueCount: number,
): EffectRecipeV1[] => uniqueByID([...v2Effects, ...localCard.effects])
  .slice(0, localCard.signatureMoment ? 4 : Math.min(2, semanticCueCount));

const reidentifySceneCard = (card: Omit<SceneCardV1, "sceneID">): SceneCardV1 => {
  const sceneID = sceneCardIdentityV1(card);
  return { ...card, sceneID, effects: card.effects.map((effect) => ({ ...effect, sectionID: sceneID })) };
};

const rangeCrossesBoundary = (
  fromLineIndex: number,
  toLineIndex: number,
  boundaryAfterLineIndex: number,
): boolean => fromLineIndex <= boundaryAfterLineIndex && toLineIndex > boundaryAfterLineIndex;

const denseWindowRangesV2 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  intent: Pick<WindowIntentV2, "fromLineIndex" | "toLineIndex" | "cues">,
): Array<{ fromLineIndex: number; toLineIndex: number }> => {
  const lines = lyrics.lines.filter((line) =>
    line.lineIndex >= intent.fromLineIndex && line.lineIndex <= intent.toLineIndex);
  if (lines.length === 0) return [];
  const spanMs = Math.max(...lines.map((line) => line.toMs)) - lines[0]!.fromMs;
  const protectedRanges = [
    ...intent.cues.map((cue) => ({ fromLineIndex: cue.fromLineIndex, toLineIndex: cue.toLineIndex ?? cue.fromLineIndex })),
    ...bible.signatureAnchors.map((anchor) => ({ fromLineIndex: anchor.fromLineIndex, toLineIndex: anchor.toLineIndex })),
  ];
  const allowedCuts = lines.slice(0, -1).filter((line) =>
    !protectedRanges.some((range) => rangeCrossesBoundary(range.fromLineIndex, range.toLineIndex, line.lineIndex)));
  const desiredCount = Math.min(
    6,
    lines.length,
    allowedCuts.length + 1,
    Math.max(1, Math.round(spanMs / 12_000)),
  );
  if (desiredCount === 1) return [{ fromLineIndex: lines[0]!.lineIndex, toLineIndex: lines.at(-1)!.lineIndex }];

  const selectedCuts: number[] = [];
  let priorCutLineIndex = lines[0]!.lineIndex - 1;
  for (let part = 1; part < desiredCount; part += 1) {
    const targetMs = lines[0]!.fromMs + spanMs * part / desiredCount;
    const remainingCuts = desiredCount - part - 1;
    const candidates = allowedCuts.filter((line) => line.lineIndex > priorCutLineIndex
      && allowedCuts.filter((candidate) => candidate.lineIndex > line.lineIndex).length >= remainingCuts);
    const cut = candidates.sort((left, right) =>
      Math.abs(left.toMs - targetMs) - Math.abs(right.toMs - targetMs)
      || left.lineIndex - right.lineIndex)[0];
    if (!cut) break;
    selectedCuts.push(cut.lineIndex);
    priorCutLineIndex = cut.lineIndex;
  }
  const ranges: Array<{ fromLineIndex: number; toLineIndex: number }> = [];
  let fromLineIndex = lines[0]!.lineIndex;
  selectedCuts.forEach((toLineIndex) => {
    ranges.push({ fromLineIndex, toLineIndex });
    fromLineIndex = toLineIndex + 1;
  });
  ranges.push({ fromLineIndex, toLineIndex: lines.at(-1)!.lineIndex });
  return ranges;
};

const localTreatmentEffectV3 = (
  bible: DirectorBibleV1,
  card: SceneCardV1,
  treatment: LocalSceneTreatmentV3,
): EffectRecipeV1 | undefined => {
  const triggers = new Set(treatment.triggers);
  const selected: { primitive: EffectRecipeV1["primary"]["primitive"]; intensity: number } | undefined =
    triggers.has("final_resolution") ? { primitive: "geometry.converge", intensity: 0.52 }
      : triggers.has("silence_gap") ? { primitive: "field.aperture", intensity: 0.28 }
        : triggers.has("duet_overlap") || triggers.has("voice_handoff") ? { primitive: "memory.trail", intensity: 0.32 }
          : triggers.has("semantic_contrast") ? { primitive: "geometry.suspend", intensity: 0.4 }
            : triggers.has("repeated_hook") ? { primitive: "motif.recall", intensity: 0.34 }
              : undefined;
  if (!selected) return undefined;
  return {
    version: "effect-recipe-v1",
    id: `local-first-v3-effect:${card.sceneIndex}:${card.fromLineIndex}-${card.toLineIndex}`,
    cardID: "custom",
    sectionID: card.sceneID,
    fromMs: card.fromMs,
    toMs: card.toMs,
    presentation: "section",
    primary: selected,
    support: [],
    evidence: {
      songMotif: bible.motifActor.relationship,
      sectionTriggers: treatment.triggers,
      lineIndices: treatment.evidenceLineIndices,
      rationale: treatment.rationale,
      confidence: treatment.confidence,
    },
  };
};

const densifyLocalCardV2 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  acceptedCards: readonly SceneCardV1[],
  card: SceneCardV1,
  musicMap?: MusicMapV1,
): SceneCardV1 | null => {
  const treatment = compileLocalSceneTreatmentV3(
    lyrics,
    state,
    acceptedCards,
    { fromLineIndex: card.fromLineIndex, toLineIndex: card.toLineIndex },
    musicMap,
  );
  const semanticScene = treatment.semanticScene;
  const localPlan = compileLocalDirectorPlanV1(lyrics);
  const directives = localPlan.directives.filter((directive) =>
    directive.lineIndex >= card.fromLineIndex && directive.lineIndex <= card.toLineIndex);
  const consequence = card.signatureMoment ? card.consequence : {
    kind: semanticScene.purpose === "turn" ? "reframe" as const
      : semanticScene.purpose === "aftermath" ? "absence" as const
        : semanticScene.purpose === "resolve" ? "return" as const
          : semanticScene.purpose === "develop" ? "accumulation" as const : "trace" as const,
    rationale: `The local-first ${semanticScene.purpose} scene leaves an observable consequence for the following phrase.`,
  };
  const withoutID: Omit<SceneCardV1, "sceneID"> = {
    ...card,
    semanticScene,
    layout: layoutForSemanticSceneV2(state.layout, state.layoutTransitionsUsed, semanticScene),
    intention: treatment.rationale,
    coverRole: card.signatureMoment ? card.coverRole
      : semanticScene.purpose === "establish" ? "origin"
        : semanticScene.purpose === "turn" ? "boundary"
          : semanticScene.purpose === "aftermath" ? "absent"
            : semanticScene.purpose === "resolve" ? "destination" : "anchor",
    presentation: "section",
    directives,
    semanticCueCount: 0,
    gestures: card.gestures,
    effects: card.signatureMoment ? card.effects : [],
    consequence,
    evidence: {
      sectionTriggers: treatment.triggers,
      lineIndices: treatment.evidenceLineIndices,
      audioLandmarkIDs: treatment.audioLandmarkIDs,
      rationale: treatment.rationale,
      confidence: treatment.confidence,
    },
  };
  const identified = reidentifySceneCard(withoutID);
  const localEffect = card.signatureMoment ? undefined : localTreatmentEffectV3(bible, identified, treatment);
  const withEffect = card.signatureMoment || !localEffect ? identified : reidentifySceneCard({
    ...withoutID,
    effects: [localEffect],
  });
  const staged = sanitizeSceneCardV1(lyrics, bible, state, withEffect);
  if (!staged) return null;
  const performed = applyLinePerformancesV2(lyrics, bible, state, staged, treatment.linePerformances);
  if (!performed) return staged;
  const choreographed = treatment.signatureClip === "none" ? performed : applySignatureChoreographyV2(
    lyrics,
    bible,
    state,
    performed,
    { purpose: semanticScene.purpose, linePerformances: treatment.linePerformances },
    treatment.signatureClip,
  ) ?? performed;
  if (choreographed.gestures.length <= 2) return choreographed;
  // A full local song can contain twenty Scenes. Keep two visible gesture
  // layers per Scene so the assembled plan stays inside the existing global
  // 48-gesture contract; per-line directives still cover every lyric line.
  const gestures = [...choreographed.gestures]
    .sort((left, right) => Number(right.id.startsWith("signature-clip-v2:")) - Number(left.id.startsWith("signature-clip-v2:"))
      || right.intensity - left.intensity
      || left.lineIndex - right.lineIndex)
    .slice(0, 2);
  const { sceneID: _ignored, ...trimmedWithoutID } = choreographed;
  return sanitizeSceneCardV1(lyrics, bible, state, reidentifySceneCard({ ...trimmedWithoutID, gestures })) ?? choreographed;
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

export const compileLocalContinuitySceneCardsV2 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  acceptedCards: readonly SceneCardV1[],
  fromLineIndex: number,
  toLineIndex: number,
  musicMap?: MusicMapV1,
): SceneCardV1[] => {
  const ranges = compileLocalSceneRangesV3(lyrics, bible, fromLineIndex, toLineIndex, musicMap);
  const output: SceneCardV1[] = [];
  let currentState = state;
  for (const range of ranges) {
    const local = compileLocalContinuitySceneCardV2(
      lyrics,
      bible,
      currentState,
      [...acceptedCards, ...output],
      range.fromLineIndex,
      range.toLineIndex,
    );
    if (!local) return [];
    const card = densifyLocalCardV2(
      lyrics,
      bible,
      currentState,
      [...acceptedCards, ...output],
      local,
      musicMap,
    );
    if (!card) return [];
    output.push(card);
    currentState = advanceRollingPerformanceStateV1(currentState, card);
  }
  return output;
};

export const compileLocalDirectorPlanV3 = (
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
): DirectorPlanV1 => {
  if (lyrics.lines.length === 0) return compileLocalDirectorPlanV1(lyrics);
  const bible = compileLocalDirectorBibleV1(lyrics);
  const cards: SceneCardV1[] = [];
  let state = initialRollingPerformanceStateV1(bible);
  let cursor = 0;
  while (cursor < lyrics.lines.length) {
    const first = lyrics.lines[cursor]!;
    let end = cursor;
    while (end + 1 < lyrics.lines.length
      && end - cursor + 1 < 30
      && lyrics.lines[end + 1]!.toMs - first.fromMs <= 60_000) end += 1;
    const windowCards = compileLocalContinuitySceneCardsV2(
      lyrics,
      bible,
      state,
      cards,
      first.lineIndex,
      lyrics.lines[end]!.lineIndex,
      musicMap,
    );
    if (windowCards.length === 0) return compileLocalDirectorPlanV1(lyrics);
    cards.push(...windowCards);
    windowCards.forEach((card) => { state = advanceRollingPerformanceStateV1(state, card); });
    cursor = end + 1;
  }
  const compiled = compileDirectorPlanFromRollingV1(lyrics, bible, cards, "local");
  const versioned = { ...compiled, directorVersion: "lyricstage-local-first-director-v3", planIdentity: undefined };
  return { ...compiled, directorVersion: versioned.directorVersion, planIdentity: stableHash32(versioned) };
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
  const localTreatment = compileLocalSceneTreatmentV3(
    lyrics,
    state,
    [],
    { fromLineIndex: intent.fromLineIndex, toLineIndex: intent.toLineIndex },
  );
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
  const v2Gestures = compiled.plan.gestures
    .filter((gesture) => gesture.id.startsWith("director-v2-") && inRange(gesture.lineIndex));
  const v2Effects = compiled.plan.effects
    .filter((effect) => effect.id.startsWith("director-v2-"))
    .map((effect) => {
      const localEvidenceLines = effect.evidence.lineIndices.filter(inRange);
      return {
        ...effect,
        fromMs: Math.max(localCard.fromMs, effect.fromMs),
        toMs: Math.min(localCard.toMs, effect.toMs),
        evidence: {
          ...effect.evidence,
          lineIndices: localEvidenceLines.length > 0 ? localEvidenceLines : [intent.fromLineIndex],
        },
      };
    })
    .filter((effect) => effect.fromMs < effect.toMs);
  const withoutID: Omit<SceneCardV1, "sceneID"> = {
    ...localCard,
    intention: intent.cues.length > 0
      ? `Director V2 sparse cues: ${intent.cues.map((cue) => cue.role).join(" → ")}.`
      : `Director V2 restrained ${intent.arcIntent} window.`,
    coverRole: intent.coverRole,
    directives,
    semanticCueCount: intent.cues.length,
    gestures: gesturesForCard(localCard, v2Gestures, intent.cues.length),
    effects: effectsForCard(localCard, v2Effects, intent.cues.length),
  };
  const candidate = reidentifySceneCard(withoutID);
  const sanitized = sanitizeSceneCardV1(lyrics, bible, state, candidate);
  if (!sanitized || intent.cues.length > 0) return sanitized;
  return applyLinePerformancesV2(lyrics, bible, state, sanitized, localTreatment.linePerformances) ?? sanitized;
};

const semanticSceneForIntentV2 = (
  lyrics: LyricDocumentV0,
  state: RollingPerformanceStateV1,
  acceptedCards: readonly SceneCardV1[],
  range: { fromLineIndex: number; toLineIndex: number },
  cues: WindowIntentV2["cues"],
): SemanticSceneDirectionV2 => {
  const roles = new Set(cues.map((cue) => cue.role));
  if (roles.has("handoff")) return { version: "semantic-scene-direction-v2", purpose: "turn", spatialIntent: "split" };
  if (roles.has("rupture")) return { version: "semantic-scene-direction-v2", purpose: "turn", spatialIntent: "open" };
  if (range.toLineIndex === lyrics.lines.at(-1)?.lineIndex) {
    return { version: "semantic-scene-direction-v2", purpose: "resolve", spatialIntent: "open" };
  }
  return compileLocalSceneTreatmentV3(lyrics, state, acceptedCards, range).semanticScene;
};

export const compileWindowIntentV2ToSceneCardsV1 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  intent: WindowIntentV2,
): SceneCardV1[] => {
  if (intent.version !== "window-intent-v2"
    || intent.bibleIdentity !== bible.bibleIdentity
    || intent.entryStateHash !== state.stateHash) return [];
  const ranges = denseWindowRangesV2(lyrics, bible, intent);
  const cards: SceneCardV1[] = [];
  let currentState = state;
  for (const [index, range] of ranges.entries()) {
    const cues = intent.cues.filter((cue) => cue.fromLineIndex >= range.fromLineIndex
      && (cue.toLineIndex ?? cue.fromLineIndex) <= range.toLineIndex);
    const compiled = compileWindowIntentV2ToSceneCardV1(lyrics, bible, currentState, {
      ...intent,
      id: `${intent.id}:scene:${index}`,
      entryStateHash: currentState.stateHash,
      fromLineIndex: range.fromLineIndex,
      toLineIndex: range.toLineIndex,
      cues,
    });
    if (!compiled) return [];
    const semanticScene = semanticSceneForIntentV2(lyrics, currentState, cards, range, cues);
    const { sceneID: _ignored, ...withoutID } = compiled;
    const card = reidentifySceneCard({ ...withoutID, semanticScene, layout: layoutForSemanticSceneV2(currentState.layout, currentState.layoutTransitionsUsed, semanticScene) });
    if (!sanitizeSceneCardV1(lyrics, bible, currentState, card)) return [];
    cards.push(card);
    currentState = advanceRollingPerformanceStateV1(currentState, card);
  }
  return cards;
};
