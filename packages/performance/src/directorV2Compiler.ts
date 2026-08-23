import { stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import type { DirectorLineDirectiveV1, DirectorPlanV1, DirectorSectionV1 } from "./directorPlan";
import type {
  DirectorV2ManualFixtureV1,
  ManualArcIntentV2,
  ManualSemanticCueRoleV2,
  ManualSemanticCueV2,
  ManualWindowIntentFixtureV2,
} from "./directorV2Fixtures";
import { lyricGraphemesV1 } from "./lyricChoreography";

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
  return cueCount > 0 && cueCount <= 12 && focusCount <= 6;
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

const reidentifyPlan = (plan: Omit<DirectorPlanV1, "planIdentity">): DirectorPlanV1 => ({
  ...plan,
  planIdentity: stableHash32({ ...plan, planIdentity: undefined }),
});

export const compileManualDirectorV2V1 = (
  lyrics: LyricDocumentV0,
  localPlan: DirectorPlanV1,
  fixture: DirectorV2ManualFixtureV1,
): CompiledManualDirectorV2V1 | null => {
  if (
    localPlan.recordingID !== lyrics.recordingID
    || localPlan.lyricsIdentity !== stableHash32(lyrics)
    || !sanitizeManualFixture(lyrics, fixture)
  ) return null;
  const cueByID = new Map<string, ManualSemanticCueV2>();
  const windowByLine = new Map<number, ManualWindowIntentFixtureV2>();
  const influences: CueInfluenceEnvelopeV1[] = [];
  fixture.windows.forEach((window) => {
    for (let lineIndex = window.fromLineIndex; lineIndex <= window.toLineIndex; lineIndex += 1) {
      windowByLine.set(lineIndex, window);
    }
    window.cues.forEach((cue) => {
      cueByID.set(cue.id, cue);
      influences.push(deriveCueInfluenceEnvelopeV1(lyrics, localPlan, window, cue));
    });
  });
  const lineByIndex = new Map(lyrics.lines.map((line) => [line.lineIndex, line]));
  const directives = localPlan.directives.map((original) => {
    const window = windowByLine.get(original.lineIndex);
    let directive = window
      ? applyWindowDefault(original, window, lineByIndex.get(original.lineIndex)?.voiceRole)
      : { ...original };
    const core = influences.find((influence) => rangeContains(influence.coreRange, original.lineIndex));
    if (core) {
      return applyCore(directive, cueByID.get(core.cueID)!.role, lineByIndex.get(original.lineIndex)?.voiceRole);
    }
    const anticipation = influences.find((influence) => rangeContains(influence.anticipationRange, original.lineIndex));
    if (anticipation) directive = applyAnticipation(directive);
    const consequence = influences.find((influence) => rangeContains(influence.consequenceRange, original.lineIndex));
    if (consequence) directive = applyConsequence(directive);
    return directive;
  });
  const { planIdentity: _ignored, ...withoutIdentity } = localPlan;
  const plan = reidentifyPlan({
    ...withoutIdentity,
    directorVersion: `${localPlan.directorVersion}+director-v2-manual`,
    directives,
  });
  return {
    version: "compiled-manual-director-v2-v1",
    fixtureID: fixture.id,
    plan,
    influences,
    acceptedCueIDs: influences.map((influence) => influence.cueID),
  };
};
