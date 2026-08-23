import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1 } from "./directorPlan";
import { compileManualDirectorV2V1, type ObservableVisualPromiseV1 } from "./directorV2Compiler";
import type { DirectorV2ManualFixtureV1, WindowIntentV2 } from "./directorV2Fixtures";
import {
  advanceRollingPerformanceStateV1,
  compileLocalSceneCardForWindowV1,
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
  type DirectorBibleV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
} from "./rollingDirector";
import type { EffectRecipeV1 } from "./effectGrammar";
import { lyricGraphemesV1, type LyricGestureV1 } from "./lyricChoreography";

const uniqueByID = <T extends { id: string }>(items: readonly T[]): T[] =>
  [...new Map(items.map((item) => [item.id, item])).values()];

const gesturesForCard = (
  localCard: SceneCardV1,
  v2Gestures: readonly LyricGestureV1[],
  semanticCueCount: number,
): LyricGestureV1[] => {
  const maximum = localCard.signatureMoment ? 6 : Math.min(6, Math.max(3, semanticCueCount * 2));
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
  .slice(0, localCard.signatureMoment ? 4 : Math.min(4, Math.max(2, semanticCueCount)));

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

const localSupportGestureV2 = (
  lyrics: LyricDocumentV0,
  sceneIndex: number,
  lineIndex: number,
): LyricGestureV1 | undefined => {
  const line = lyrics.lines.find((candidate) => candidate.lineIndex === lineIndex);
  if (!line) return undefined;
  const graphemes = lyricGraphemesV1(line.text);
  if (graphemes.length === 0) return undefined;
  return {
    version: "lyric-gesture-v1",
    id: `rolling-v2-support:${sceneIndex}:${lineIndex}`,
    lineIndex,
    scope: "phrase",
    target: { fromGrapheme: 0, toGrapheme: graphemes.length, expectedText: line.text },
    primitive: sceneIndex % 2 === 0 ? "phrase.breathe" : "phrase.contour",
    driver: "lineEnter",
    space: "lyricLocal",
    envelope: { attackMs: 280, holdMs: 420, releaseMs: 640 },
    intensity: 0.58 + sceneIndex % 3 * 0.06,
    direction: sceneIndex % 2 === 0 ? 1 : -1,
    paletteRole: sceneIndex % 3 === 0 ? "accent" : "primary",
    evidence: {
      semanticRole: "motion",
      rationale: "A local phrase pulse keeps the staged narrative alive between semantic events.",
      confidence: 0.72,
    },
  };
};

const localSupportEffectV2 = (
  bible: DirectorBibleV1,
  card: SceneCardV1,
): EffectRecipeV1 => {
  const primitives = ["field.ribbon", "geometry.orbit", "density.lift", "memory.trail"] as const;
  return {
    version: "effect-recipe-v1",
    id: `rolling-v2-support-effect:${card.sceneIndex}:${card.fromLineIndex}-${card.toLineIndex}`,
    cardID: "custom",
    sectionID: card.sceneID,
    fromMs: card.fromMs,
    toMs: card.toMs,
    presentation: "section",
    primary: { primitive: primitives[card.sceneIndex % primitives.length]!, intensity: 0.56 + card.sceneIndex % 4 * 0.06 },
    support: [],
    evidence: {
      songMotif: bible.motifActor.relationship,
      sectionTriggers: card.evidence.sectionTriggers,
      lineIndices: [card.fromLineIndex],
      rationale: "A bounded local field marks this narrative beat without inventing lyric timing.",
      confidence: 0.72,
    },
  };
};

const densifyLocalCardV2 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  card: SceneCardV1,
): SceneCardV1 | null => {
  if (card.signatureMoment) return card;
  const supportGesture = localSupportGestureV2(lyrics, card.sceneIndex, card.fromLineIndex);
  const withoutID: Omit<SceneCardV1, "sceneID"> = {
    ...card,
    intention: "Keep the narrative field visibly progressing between semantic anchors.",
    presentation: "section",
    gestures: supportGesture ? uniqueByID([supportGesture, ...card.gestures]).slice(0, 2) : card.gestures,
    effects: [],
    consequence: { kind: "trace", rationale: "The scene leaves a visible local trace for the next beat to inherit." },
  };
  const identified = reidentifySceneCard(withoutID);
  const withEffect = reidentifySceneCard({
    ...withoutID,
    effects: [localSupportEffectV2(bible, identified)],
  });
  return sanitizeSceneCardV1(lyrics, bible, state, withEffect);
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
): SceneCardV1[] => {
  const intent = { fromLineIndex, toLineIndex, cues: [] };
  const ranges = denseWindowRangesV2(lyrics, bible, intent);
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
    const card = densifyLocalCardV2(lyrics, bible, currentState, local);
    if (!card) return [];
    output.push(card);
    currentState = advanceRollingPerformanceStateV1(currentState, card);
  }
  return output;
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
  const supportGesture = localCard.signatureMoment
    ? undefined
    : localSupportGestureV2(lyrics, state.nextSceneIndex, intent.fromLineIndex);
  const v2Gestures = compiled.plan.gestures
    .filter((gesture) => gesture.id.startsWith("director-v2-") && inRange(gesture.lineIndex));
  if (supportGesture) v2Gestures.push(supportGesture);
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
  if (v2Effects.length === 0 && !localCard.signatureMoment) v2Effects.push(localSupportEffectV2(bible, localCard));
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
  return sanitizeSceneCardV1(lyrics, bible, state, candidate);
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
    const card = compileWindowIntentV2ToSceneCardV1(lyrics, bible, currentState, {
      ...intent,
      id: `${intent.id}:scene:${index}`,
      entryStateHash: currentState.stateHash,
      fromLineIndex: range.fromLineIndex,
      toLineIndex: range.toLineIndex,
      cues,
    });
    if (!card) return [];
    cards.push(card);
    currentState = advanceRollingPerformanceStateV1(currentState, card);
  }
  return cards;
};
