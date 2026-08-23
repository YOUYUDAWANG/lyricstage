import { stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import type { DirectorLineDirectiveV1, DirectorPlanV1, DirectorSectionV1 } from "./directorPlan";
import type {
  DirectorV2ManualFixtureV1,
  ManualArcIntentV2,
  ManualSemanticCueRoleV2,
  ManualSemanticCueV2,
  ManualWindowIntentFixtureV2,
  SignatureRecipeBranchV1,
  SignatureRecipeIDV1,
} from "./directorV2Fixtures";
import type { EffectPrimitiveIDV1, EffectRecipeV1, PerformanceTriggerV1, StagePresentationV1 } from "./effectGrammar";
import {
  lyricGraphemesV1,
  sanitizeLyricGesturesV1,
  type LyricGesturePrimitiveV1,
  type LyricGestureSemanticRoleV1,
  type LyricGestureV1,
} from "./lyricChoreography";

export interface DirectorV2LineRangeV1 {
  fromLineIndex: number;
  toLineIndex: number;
}

/** Compiler-only influence. It is never a provider, cache, or renderer type. */
export interface CueInfluenceEnvelopeV1 {
  cueID: string;
  windowID: string;
  anticipationRange?: DirectorV2LineRangeV1;
  coreRange: DirectorV2LineRangeV1;
  consequenceRange?: DirectorV2LineRangeV1;
  recallEligibility: boolean;
}

export interface CompiledManualDirectorV2V1 {
  version: "compiled-manual-director-v2-v1";
  fixtureID: string;
  plan: DirectorPlanV1;
  influences: CueInfluenceEnvelopeV1[];
  acceptedCueIDs: string[];
  recipeEvents: ResolvedSignatureRecipeEventV1[];
  promises: ObservableVisualPromiseV1[];
}

export type ObservablePromiseFactV1 = "trace" | "absence" | "displacement" | "incompleteMotif";

export interface ObservableVisualPromiseV1 {
  promiseID: string;
  motifAnchor: string;
  fact: ObservablePromiseFactV1;
  visualPrimitive: EffectPrimitiveIDV1;
  sourceCueID: string;
  sourceRange: DirectorV2LineRangeV1;
  sourceEffectID: string;
  consequenceEffectID?: string;
  status: "unresolved" | "consumed";
  consumerCueID?: string;
  consumerRange?: DirectorV2LineRangeV1;
  consumerEffectID?: string;
}

export interface ResolvedSignatureRecipeEventV1 {
  cueID: string;
  recipe: SignatureRecipeIDV1;
  branch: SignatureRecipeBranchV1;
  influence: CueInfluenceEnvelopeV1;
  effectID: string;
  gestureID: string;
  promiseCreates: string[];
  promiseConsumes: string[];
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const cueRoles = new Set<ManualSemanticCueRoleV2>(["refrain", "rupture", "release", "hold", "handoff", "recall"]);
const spatialIntents = new Set(["hold", "split", "open", "stack"]);
const arcIntents = new Set<ManualArcIntentV2>(["hold", "lift", "break", "recall"]);
const coverRoles = new Set(["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"]);

const rangeContains = (range: DirectorV2LineRangeV1 | undefined, lineIndex: number): boolean =>
  Boolean(range && lineIndex >= range.fromLineIndex && lineIndex <= range.toLineIndex);

const sectionForLine = (sections: readonly DirectorSectionV1[], lineIndex: number): DirectorSectionV1 | undefined =>
  sections.find((section) => lineIndex >= section.fromLineIndex && lineIndex <= section.toLineIndex);

const rangeValid = (lineIndices: ReadonlySet<number>, fromLineIndex: number, toLineIndex: number): boolean =>
  fromLineIndex <= toLineIndex && lineIndices.has(fromLineIndex) && lineIndices.has(toLineIndex);

const sanitizeManualFixture = (
  lyrics: LyricDocumentV0,
  fixture: DirectorV2ManualFixtureV1,
  allowEmptyCues = false,
): boolean => {
  if (fixture.recordingID !== lyrics.recordingID || fixture.windows.length === 0) return false;
  const lineIndices = new Set(lyrics.lines.map((line) => line.lineIndex));
  const lineByIndex = new Map(lyrics.lines.map((line) => [line.lineIndex, line]));
  const cueIDs = new Set<string>();
  const windowIDs = new Set<string>();
  let cueCount = 0;
  let focusCount = 0;
  let priorWindowEnd = -1;
  for (const window of fixture.windows) {
    if (
      !window.id || windowIDs.has(window.id)
      || !rangeValid(lineIndices, window.fromLineIndex, window.toLineIndex)
      || window.fromLineIndex <= priorWindowEnd
      || window.cues.length > 6
      || !spatialIntents.has(window.spatialIntent)
      || !arcIntents.has(window.arcIntent)
      || !coverRoles.has(window.coverRole)
    ) return false;
    windowIDs.add(window.id);
    priorWindowEnd = window.toLineIndex;
    cueCount += window.cues.length;
    for (const cue of window.cues) {
      const cueTo = cue.toLineIndex ?? cue.fromLineIndex;
      if (
        cue.version !== "semantic-cue-v2"
        || !cue.id || cueIDs.has(cue.id)
        || !cueRoles.has(cue.role)
        || !rangeValid(lineIndices, cue.fromLineIndex, cueTo)
        || cue.fromLineIndex < window.fromLineIndex || cueTo > window.toLineIndex
        || cue.evidenceLineIndices.length === 0
        || cue.evidenceLineIndices.some((lineIndex) => !lineIndices.has(lineIndex))
        || !Number.isFinite(cue.confidence) || cue.confidence < 0 || cue.confidence > 1
      ) return false;
      cueIDs.add(cue.id);
      if (!cue.focus) continue;
      focusCount += 1;
      const line = lineByIndex.get(cue.focus.lineIndex);
      const pieces = line ? lyricGraphemesV1(line.text) : [];
      if (
        !line
        || cue.focus.lineIndex < cue.fromLineIndex || cue.focus.lineIndex > cueTo
        || cue.focus.fromGrapheme < 0
        || cue.focus.toGrapheme <= cue.focus.fromGrapheme
        || cue.focus.toGrapheme > pieces.length
        || !cue.focus.expectedText
        || pieces.slice(cue.focus.fromGrapheme, cue.focus.toGrapheme).join("")
          !== cue.focus.expectedText
      ) return false;
    }
  }
  return (allowEmptyCues || cueCount > 0) && cueCount <= 12 && focusCount <= 6;
};

const sameStructuralUnit = (
  plan: DirectorPlanV1,
  leftLineIndex: number,
  rightLineIndex: number,
): boolean => {
  const leftSection = sectionForLine(plan.sections, leftLineIndex);
  const rightSection = sectionForLine(plan.sections, rightLineIndex);
  const leftAct = plan.dramaticScore.acts.find((act) => leftLineIndex >= act.fromLineIndex && leftLineIndex <= act.toLineIndex);
  const rightAct = plan.dramaticScore.acts.find((act) => rightLineIndex >= act.fromLineIndex && rightLineIndex <= act.toLineIndex);
  const quietAt = (lineIndex: number) => plan.dramaticScore.quietWindows.some((quiet) =>
    lineIndex >= quiet.fromLineIndex && lineIndex <= quiet.toLineIndex);
  const signatureAt = (lineIndex: number) => plan.dramaticScore.signatureMoments.find((moment) =>
    lineIndex >= moment.fromLineIndex && lineIndex <= moment.toLineIndex)?.id;
  const leftSignature = signatureAt(leftLineIndex);
  const rightSignature = signatureAt(rightLineIndex);
  return leftSection?.id === rightSection?.id
    && leftAct?.id === rightAct?.id
    && quietAt(leftLineIndex) === quietAt(rightLineIndex)
    && (!leftSignature || !rightSignature || leftSignature === rightSignature);
};

const lyricGapAllowsInfluence = (
  lyrics: LyricDocumentV0,
  leftLineIndex: number,
  rightLineIndex: number,
): boolean => {
  const left = lyrics.lines.find((line) => line.lineIndex === leftLineIndex);
  const right = lyrics.lines.find((line) => line.lineIndex === rightLineIndex);
  return Boolean(left && right && right.fromMs - left.toMs < 2_800);
};

const recallEligible = (
  lyrics: LyricDocumentV0,
  cue: ManualSemanticCueV2,
): boolean => {
  if (cue.role === "hold" || cue.role === "handoff") return false;
  if (cue.role === "rupture" || cue.role === "release") {
    return (cue.toLineIndex ?? cue.fromLineIndex) < (lyrics.lines.at(-1)?.lineIndex ?? 0);
  }
  const normalized = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
  const coreTexts = lyrics.lines
    .filter((line) => line.lineIndex >= cue.fromLineIndex && line.lineIndex <= (cue.toLineIndex ?? cue.fromLineIndex))
    .map((line) => normalized(line.text));
  return cue.role === "recall"
    ? cue.evidenceLineIndices.some((lineIndex) => lineIndex < cue.fromLineIndex)
    : lyrics.lines.some((line) => line.lineIndex < cue.fromLineIndex && coreTexts.includes(normalized(line.text)));
};

export const deriveCueInfluenceEnvelopeV1 = (
  lyrics: LyricDocumentV0,
  plan: DirectorPlanV1,
  window: ManualWindowIntentFixtureV2,
  cue: ManualSemanticCueV2,
): CueInfluenceEnvelopeV1 => {
  const coreTo = cue.toLineIndex ?? cue.fromLineIndex;
  const previous = cue.fromLineIndex - 1;
  const next = coreTo + 1;
  const anticipationRange = previous >= window.fromLineIndex
    && sameStructuralUnit(plan, previous, cue.fromLineIndex)
    && lyricGapAllowsInfluence(lyrics, previous, cue.fromLineIndex)
    ? { fromLineIndex: previous, toLineIndex: previous }
    : undefined;
  const consequenceRange = next <= window.toLineIndex
    && sameStructuralUnit(plan, coreTo, next)
    && lyricGapAllowsInfluence(lyrics, coreTo, next)
    ? { fromLineIndex: next, toLineIndex: next }
    : undefined;
  return {
    cueID: cue.id,
    windowID: window.id,
    ...(anticipationRange ? { anticipationRange } : {}),
    coreRange: { fromLineIndex: cue.fromLineIndex, toLineIndex: coreTo },
    ...(consequenceRange ? { consequenceRange } : {}),
    recallEligibility: recallEligible(lyrics, cue),
  };
};

const applyWindowDefault = (
  directive: DirectorLineDirectiveV1,
  window: ManualWindowIntentFixtureV2,
  voiceRole: string | undefined,
): DirectorLineDirectiveV1 => {
  const splitAlignment = window.spatialIntent === "split"
    ? voiceRole === "duetA" ? "leading" as const : voiceRole === "duetB" ? "trailing" as const : directive.alignment
    : directive.alignment;
  return {
    ...directive,
    alignment: splitAlignment,
    direction: window.spatialIntent === "split" && voiceRole === "duetB" ? -1 : directive.direction,
    intensity: clamp(directive.intensity + (window.arcIntent === "lift" ? 0.03 : window.arcIntent === "hold" ? -0.03 : 0), 0.35, 1.25),
    fontScale: clamp(directive.fontScale + (window.spatialIntent === "open" ? 0.015 : window.spatialIntent === "stack" ? -0.01 : 0), 0.78, 1.22),
  };
};

const applyAnticipation = (directive: DirectorLineDirectiveV1): DirectorLineDirectiveV1 => ({
  ...directive,
  behavior: "settle",
  intensity: clamp(directive.intensity * 0.86, 0.35, 1.25),
  glyphStagger: clamp(directive.glyphStagger * 0.82, 0, 0.14),
});

const applyConsequence = (directive: DirectorLineDirectiveV1): DirectorLineDirectiveV1 => ({
  ...directive,
  behavior: "drift",
  intensity: clamp(directive.intensity * 0.9, 0.35, 1.25),
  glyphStagger: clamp(directive.glyphStagger * 0.9, 0, 0.14),
});

const applyCore = (
  directive: DirectorLineDirectiveV1,
  role: ManualSemanticCueRoleV2,
  voiceRole: string | undefined,
): DirectorLineDirectiveV1 => {
  const behavior: DirectorLineDirectiveV1["behavior"] = role === "refrain" || role === "recall"
    ? "echo"
    : role === "rupture"
      ? "gravityDrop"
      : role === "release"
        ? "stretch"
        : role === "handoff"
          ? "converge"
          : "settle";
  const intensityDelta = role === "hold" ? -0.15 : role === "rupture" ? 0.16 : role === "release" ? 0.12 : 0.08;
  const duetAlignment = role === "handoff"
    ? voiceRole === "duetA" ? "leading" as const : voiceRole === "duetB" ? "trailing" as const : directive.alignment
    : directive.alignment;
  return {
    ...directive,
    behavior,
    alignment: duetAlignment,
    direction: role === "handoff" && voiceRole === "duetB" ? -1 : directive.direction,
    intensity: clamp(directive.intensity + intensityDelta, 0.35, 1.25),
    fontScale: clamp(directive.fontScale + (role === "release" ? 0.025 : 0), 0.78, 1.22),
    glyphStagger: clamp(directive.glyphStagger + (role === "refrain" ? 0.012 : 0), 0, 0.14),
  };
};

interface SignatureCueContextV1 {
  cue: ManualSemanticCueV2;
  window: ManualWindowIntentFixtureV2;
  influence: CueInfluenceEnvelopeV1;
}

const recipeForRole = (role: ManualSemanticCueRoleV2): SignatureRecipeIDV1 | undefined =>
  role === "rupture" || role === "release" || role === "recall" ? role : undefined;

const effectIDFor = (
  cueID: string,
  recipe: SignatureRecipeIDV1,
  branch: SignatureRecipeBranchV1,
): string => `director-v2-effect:${cueID}:${recipe}:${branch}`;

const gestureIDFor = (
  cueID: string,
  recipe: SignatureRecipeIDV1,
  branch: SignatureRecipeBranchV1,
): string => `director-v2-gesture:${cueID}:${recipe}:${branch}`;

const promiseFactFor = (
  recipe: SignatureRecipeIDV1,
  branch: SignatureRecipeBranchV1,
): { fact: ObservablePromiseFactV1; visualPrimitive: EffectPrimitiveIDV1 } => {
  if (recipe === "rupture" && branch === "vacuum") return { fact: "absence", visualPrimitive: "field.aperture" };
  if (recipe === "rupture") return { fact: "displacement", visualPrimitive: "memory.trail" };
  if (recipe === "release" && branch === "expansion") return { fact: "incompleteMotif", visualPrimitive: "motif.recall" };
  return { fact: "trace", visualPrimitive: "memory.trail" };
};

const chooseRecipeBranch = (
  context: SignatureCueContextV1,
  consumedPromise?: ObservableVisualPromiseV1,
  branchPolicy: "contextual" | "context-free" = "contextual",
): SignatureRecipeBranchV1 => {
  if (branchPolicy === "context-free") {
    return context.cue.role === "rupture" ? "separation" : context.cue.role === "release" ? "reveal" : "traceReturn";
  }
  if (context.cue.role === "rupture") {
    return context.window.arcIntent === "break" ? "vacuum" : "separation";
  }
  if (context.cue.role === "release") {
    return context.window.spatialIntent === "open" ? "expansion" : "reveal";
  }
  return consumedPromise?.fact === "absence" ? "absenceResolve" : "traceReturn";
};

const nearestCompatiblePromise = (
  promises: ObservableVisualPromiseV1[],
  motifAnchor: string,
  beforeLineIndex: number,
): ObservableVisualPromiseV1 | undefined => promises
  .filter((promise) => promise.status === "unresolved"
    && promise.motifAnchor === motifAnchor
    && promise.sourceRange.toLineIndex < beforeLineIndex)
  .sort((left, right) => right.sourceRange.toLineIndex - left.sourceRange.toLineIndex
    || left.promiseID.localeCompare(right.promiseID))[0];

const resolveSignatureRecipes = (
  lyrics: LyricDocumentV0,
  fixture: DirectorV2ManualFixtureV1,
  contexts: SignatureCueContextV1[],
  branchPolicy: "contextual" | "context-free",
  seedPromises: readonly ObservableVisualPromiseV1[] = [],
): { events: ResolvedSignatureRecipeEventV1[]; promises: ObservableVisualPromiseV1[] } => {
  const events: ResolvedSignatureRecipeEventV1[] = [];
  const promises: ObservableVisualPromiseV1[] = seedPromises.map((promise) => ({ ...promise }));
  const finalLineIndex = lyrics.lines.at(-1)?.lineIndex ?? 0;
  const ordered = contexts
    .filter((context) => recipeForRole(context.cue.role))
    .sort((left, right) => left.cue.fromLineIndex - right.cue.fromLineIndex || left.cue.id.localeCompare(right.cue.id));
  ordered.forEach((context, contextIndex) => {
    const recipe = recipeForRole(context.cue.role)!;
    const terminal = context.influence.coreRange.toLineIndex >= finalLineIndex;
    const consumed = recipe === "recall" || (recipe === "release" && terminal)
      ? nearestCompatiblePromise(promises, fixture.motifAnchor, context.influence.coreRange.fromLineIndex)
      : undefined;
    if (recipe === "recall" && !consumed) return;
    const branch = chooseRecipeBranch(context, consumed, branchPolicy);
    const effectID = effectIDFor(context.cue.id, recipe, branch);
    const event: ResolvedSignatureRecipeEventV1 = {
      cueID: context.cue.id,
      recipe,
      branch,
      influence: context.influence,
      effectID,
      gestureID: gestureIDFor(context.cue.id, recipe, branch),
      promiseCreates: [],
      promiseConsumes: [],
    };
    if (consumed) {
      consumed.status = "consumed";
      consumed.consumerCueID = context.cue.id;
      consumed.consumerRange = context.influence.coreRange;
      consumed.consumerEffectID = effectID;
      event.promiseConsumes.push(consumed.promiseID);
    }
    const laterContexts = ordered.slice(contextIndex + 1);
    const nextRecallIndex = laterContexts.findIndex((candidate) => candidate.cue.role === "recall");
    const laterRecall = nextRecallIndex >= 0;
    const laterRuptureBeforeRecall = laterRecall
      && laterContexts.slice(0, nextRecallIndex).some((candidate) => candidate.cue.role === "rupture");
    const createsPromise = !terminal && context.influence.recallEligibility
      && (recipe === "rupture" || (recipe === "release"
        && !nearestCompatiblePromise(promises, fixture.motifAnchor, context.influence.coreRange.fromLineIndex)
        && !laterRuptureBeforeRecall
        && laterRecall));
    if (createsPromise) {
      const promiseID = `promise:${recipe}:${fixture.motifAnchor}:${context.influence.coreRange.fromLineIndex}-${context.influence.coreRange.toLineIndex}`;
      const visual = promiseFactFor(recipe, branch);
      promises.push({
        promiseID,
        motifAnchor: fixture.motifAnchor,
        fact: visual.fact,
        visualPrimitive: visual.visualPrimitive,
        sourceCueID: context.cue.id,
        sourceRange: context.influence.coreRange,
        sourceEffectID: effectID,
        status: "unresolved",
      });
      event.promiseCreates.push(promiseID);
    }
    events.push(event);
  });
  return { events, promises };
};

const recipeEffectSpec = (
  event: ResolvedSignatureRecipeEventV1,
): {
  presentation: StagePresentationV1;
  primary: EffectPrimitiveIDV1;
  support: EffectPrimitiveIDV1[];
  trigger: PerformanceTriggerV1;
} => {
  if (event.recipe === "rupture" && event.branch === "separation") {
    return { presentation: "section", primary: "geometry.cut", support: ["memory.trail"], trigger: "semantic_contrast" };
  }
  if (event.recipe === "rupture") {
    return { presentation: "aperture", primary: "field.aperture", support: ["memory.trail"], trigger: "silence_gap" };
  }
  if (event.recipe === "release" && event.branch === "expansion") {
    return { presentation: "section", primary: "geometry.expand", support: ["density.release", "motif.recall"], trigger: "density_release" };
  }
  if (event.recipe === "release") {
    return { presentation: "section", primary: "geometry.expand", support: ["field.aperture", "memory.trail"], trigger: "density_release" };
  }
  if (event.branch === "absenceResolve") {
    return { presentation: "reading", primary: "geometry.converge", support: ["field.aperture"], trigger: "repeated_hook" };
  }
  return { presentation: "reading", primary: "motif.recall", support: ["memory.trail"], trigger: "repeated_hook" };
};

const compileRecipeEffect = (
  lyrics: LyricDocumentV0,
  plan: DirectorPlanV1,
  context: SignatureCueContextV1,
  event: ResolvedSignatureRecipeEventV1,
): EffectRecipeV1 => {
  const line = lyrics.lines.find((candidate) => candidate.lineIndex === context.cue.fromLineIndex)!;
  const section = sectionForLine(plan.sections, context.cue.fromLineIndex)!;
  const spec = recipeEffectSpec(event);
  const intensity = clamp(0.54 + section.intensity * 0.2 + context.cue.confidence * 0.08, 0.54, 0.82);
  return {
    version: "effect-recipe-v1",
    id: event.effectID,
    cardID: "custom",
    sectionID: section.id,
    fromMs: line.fromMs,
    toMs: line.toMs,
    presentation: spec.presentation,
    primary: { primitive: spec.primary, intensity, direction: plan.directives.find((directive) => directive.lineIndex === line.lineIndex)?.direction ?? 1 },
    support: spec.support.map((primitive) => ({ primitive, intensity: clamp(intensity * 0.72, 0.2, 0.75) })),
    evidence: {
      songMotif: plan.motif,
      sectionTriggers: [spec.trigger],
      lineIndices: context.cue.evidenceLineIndices,
      rationale: `${event.recipe}/${event.branch} realizes the validated ${context.cue.role} cue without adding a renderer primitive.`,
      confidence: clamp(0.72 + context.cue.confidence * 0.2, 0.72, 0.92),
    },
  };
};

const compileRecipeGesture = (
  lyrics: LyricDocumentV0,
  plan: DirectorPlanV1,
  context: SignatureCueContextV1,
  event: ResolvedSignatureRecipeEventV1,
): LyricGestureV1 => {
  const targetLineIndex = context.cue.focus?.lineIndex ?? context.cue.fromLineIndex;
  const line = lyrics.lines.find((candidate) => candidate.lineIndex === targetLineIndex)!;
  const pieces = lyricGraphemesV1(line.text);
  const focus = context.cue.focus;
  const phrasePrimitive: LyricGesturePrimitiveV1 = event.recipe === "rupture"
    ? "phrase.breakReform"
    : event.recipe === "release"
      ? event.branch === "expansion" ? "phrase.arc" : "phrase.contour"
      : event.branch === "traceReturn" ? "phrase.contour" : "phrase.breakReform";
  const tokenPrimitive: LyricGesturePrimitiveV1 = event.recipe === "rupture"
    ? "token.elasticFocus"
    : event.recipe === "release" ? "token.halo" : "token.echo";
  const semanticRole: LyricGestureSemanticRoleV1 = event.recipe === "rupture"
    ? "rupture"
    : event.recipe === "release" ? "resolution" : "repetition";
  return {
    version: "lyric-gesture-v1",
    id: event.gestureID,
    lineIndex: targetLineIndex,
    scope: focus ? "token" : "phrase",
    target: focus
      ? { fromGrapheme: focus.fromGrapheme, toGrapheme: focus.toGrapheme, expectedText: focus.expectedText }
      : { fromGrapheme: 0, toGrapheme: pieces.length, expectedText: line.text },
    primitive: focus ? tokenPrimitive : phrasePrimitive,
    driver: "structuralMoment",
    space: "lyricToArtwork",
    envelope: { attackMs: 260, holdMs: 180, releaseMs: 520 },
    intensity: clamp(0.58 + context.cue.confidence * 0.18, 0.58, 0.78),
    direction: plan.directives.find((directive) => directive.lineIndex === targetLineIndex)?.direction ?? 1,
    paletteRole: event.recipe === "release" ? "warm" : event.recipe === "recall" ? "secondary" : "accent",
    evidence: {
      semanticRole,
      rationale: `${event.recipe}/${event.branch} targets exact lyric truth inside the bounded cue core.`,
      confidence: clamp(0.74 + context.cue.confidence * 0.18, 0.74, 0.92),
    },
  };
};

const compilePromiseConsequenceEffect = (
  lyrics: LyricDocumentV0,
  plan: DirectorPlanV1,
  promise: ObservableVisualPromiseV1,
): EffectRecipeV1 | undefined => {
  if (!promise.consumerCueID || !promise.consumerRange) return undefined;
  const source = lyrics.lines.find((line) => line.lineIndex === promise.sourceRange.toLineIndex);
  const actualConsumer = lyrics.lines.find((line) => line.lineIndex === promise.consumerRange!.fromLineIndex);
  if (!source || !actualConsumer || actualConsumer.fromMs <= source.toMs) return undefined;
  const section = sectionForLine(plan.sections, promise.sourceRange.fromLineIndex)!;
  const id = `director-v2-promise:${promise.promiseID}`;
  promise.consequenceEffectID = id;
  return {
    version: "effect-recipe-v1",
    id,
    cardID: "custom",
    sectionID: section.id,
    fromMs: source.toMs,
    toMs: actualConsumer.fromMs,
    presentation: "reading",
    primary: { primitive: promise.visualPrimitive, intensity: 0.32 },
    support: [],
    evidence: {
      songMotif: plan.motif,
      sectionTriggers: [promise.fact === "absence" ? "silence_gap" : "semantic_contrast"],
      lineIndices: [promise.sourceRange.fromLineIndex, actualConsumer.lineIndex],
      rationale: `The observable ${promise.fact} remains present until ${promise.consumerCueID} resolves the same promise.`,
      confidence: 0.84,
    },
  };
};

const applyResolvedRecipeCore = (
  directive: DirectorLineDirectiveV1,
  event: ResolvedSignatureRecipeEventV1 | undefined,
  suppressedRecall: boolean,
): DirectorLineDirectiveV1 => {
  if (suppressedRecall) return { ...directive, behavior: "settle", intensity: clamp(directive.intensity * 0.84, 0.35, 1.25) };
  if (!event) return directive;
  const behavior: DirectorLineDirectiveV1["behavior"] = event.branch === "separation"
    ? "stretch"
    : event.branch === "vacuum"
      ? "settle"
      : event.branch === "expansion"
        ? "stretch"
        : event.branch === "reveal"
          ? "assemble"
          : event.branch === "traceReturn"
            ? "echo"
            : "converge";
  return {
    ...directive,
    behavior,
    intensity: clamp(directive.intensity + (event.recipe === "rupture" ? 0.08 : 0.04), 0.35, 1.25),
    fontScale: clamp(directive.fontScale + (event.branch === "expansion" ? 0.035 : event.branch === "vacuum" ? -0.025 : 0), 0.78, 1.22),
  };
};

const reidentifyPlan = (plan: Omit<DirectorPlanV1, "planIdentity">): DirectorPlanV1 => ({
  ...plan,
  planIdentity: stableHash32({ ...plan, planIdentity: undefined }),
});

export const compileManualDirectorV2V1 = (
  lyrics: LyricDocumentV0,
  localPlan: DirectorPlanV1,
  fixture: DirectorV2ManualFixtureV1,
  options: {
    recipeBranchPolicy?: "contextual" | "context-free";
    allowEmptyCues?: boolean;
    seedPromises?: readonly ObservableVisualPromiseV1[];
  } = {},
): CompiledManualDirectorV2V1 | null => {
  if (
    localPlan.recordingID !== lyrics.recordingID
    || localPlan.lyricsIdentity !== stableHash32(lyrics)
    || !sanitizeManualFixture(lyrics, fixture, options.allowEmptyCues)
  ) return null;
  const cueByID = new Map<string, ManualSemanticCueV2>();
  const contextByCueID = new Map<string, SignatureCueContextV1>();
  const windowByLine = new Map<number, ManualWindowIntentFixtureV2>();
  const influences: CueInfluenceEnvelopeV1[] = [];
  fixture.windows.forEach((window) => {
    for (let lineIndex = window.fromLineIndex; lineIndex <= window.toLineIndex; lineIndex += 1) {
      windowByLine.set(lineIndex, window);
    }
    window.cues.forEach((cue) => {
      cueByID.set(cue.id, cue);
      const influence = deriveCueInfluenceEnvelopeV1(lyrics, localPlan, window, cue);
      influences.push(influence);
      contextByCueID.set(cue.id, { cue, window, influence });
    });
  });
  const signature = resolveSignatureRecipes(
    lyrics,
    fixture,
    [...contextByCueID.values()],
    options.recipeBranchPolicy ?? "contextual",
    options.seedPromises,
  );
  const eventByCueID = new Map(signature.events.map((event) => [event.cueID, event]));
  const lineByIndex = new Map(lyrics.lines.map((line) => [line.lineIndex, line]));
  const directives = localPlan.directives.map((original) => {
    const window = windowByLine.get(original.lineIndex);
    let directive = window
      ? applyWindowDefault(original, window, lineByIndex.get(original.lineIndex)?.voiceRole)
      : { ...original };
    const core = influences.find((influence) => rangeContains(influence.coreRange, original.lineIndex));
    if (core) {
      const cue = cueByID.get(core.cueID)!;
      const generic = applyCore(directive, cue.role, lineByIndex.get(original.lineIndex)?.voiceRole);
      return applyResolvedRecipeCore(generic, eventByCueID.get(core.cueID), cue.role === "recall" && !eventByCueID.has(core.cueID));
    }
    const anticipation = influences.find((influence) => rangeContains(influence.anticipationRange, original.lineIndex));
    if (anticipation) directive = applyAnticipation(directive);
    const consequence = influences.find((influence) => rangeContains(influence.consequenceRange, original.lineIndex));
    if (consequence) directive = applyConsequence(directive);
    return directive;
  });
  const provisionalPlan: DirectorPlanV1 = { ...localPlan, directives };
  const recipeEffects = signature.events.map((event) => compileRecipeEffect(
    lyrics,
    provisionalPlan,
    contextByCueID.get(event.cueID)!,
    event,
  ));
  const consequenceEffects = signature.promises
    .map((promise) => compilePromiseConsequenceEffect(lyrics, provisionalPlan, promise))
    .filter((effect): effect is EffectRecipeV1 => Boolean(effect));
  const recipeGestures = signature.events.map((event) => compileRecipeGesture(
    lyrics,
    provisionalPlan,
    contextByCueID.get(event.cueID)!,
    event,
  ));
  const gestures = sanitizeLyricGesturesV1(lyrics, [...localPlan.gestures, ...recipeGestures]);
  if (!gestures) return null;
  const { planIdentity: _ignored, ...withoutIdentity } = localPlan;
  const plan = reidentifyPlan({
    ...withoutIdentity,
    directorVersion: `${localPlan.directorVersion}+director-v2-manual-recipes`,
    directives,
    effects: [...recipeEffects, ...consequenceEffects, ...localPlan.effects],
    gestures,
  });
  return {
    version: "compiled-manual-director-v2-v1",
    fixtureID: fixture.id,
    plan,
    influences,
    acceptedCueIDs: influences.map((influence) => influence.cueID),
    recipeEvents: signature.events,
    promises: signature.promises,
  };
};
