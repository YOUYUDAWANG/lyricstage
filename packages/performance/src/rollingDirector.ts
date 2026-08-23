import { stableHash32, type LyricDocumentV0, type LyricLineV0 } from "@lyricstage/contracts";
import {
  compileLocalDirectorPlanV1,
  isDirectorPlanV1ForLyrics,
  sanitizeDirectorLineDirectiveV1,
  type DirectorLineDirectiveV1,
  type DirectorPlanV1,
  type DirectorSectionV1,
  type PerformanceArtDirectionV1,
  type PerformanceLayoutV1,
  type PerformanceTypographyV1,
  type PerformanceWorldV1,
} from "./directorPlan";
import {
  compileLocalDramaticScoreV1,
  sanitizeDramaticScoreV1,
  type DramaticActV1,
  type DramaticActRoleV1,
  type DramaticCoverRoleV1,
  type DramaticQuietWindowV1,
  type DramaticScoreV1,
  type MotifActorV1,
  type MotifActorFamilyV1,
  type MotifStateV1,
  type SignatureMomentV1,
  type SignatureMomentPurposeV1,
} from "./dramaticScore";
import {
  compileLocalEffectRecipesV1,
  validateEffectRecipeV1,
  type EffectRecipeV1,
  type PerformanceTriggerV1,
  type StagePresentationV1,
} from "./effectGrammar";
import {
  applySongBlockingV1,
  lyricGraphemesV1,
  sanitizeLyricGesturesV1,
  sanitizeSongBlockingV1,
  type LayoutTransitionV1,
  type LyricGestureV1,
  type SongBlockingV1,
} from "./lyricChoreography";

export interface SignatureAnchorV1 {
  id: string;
  fromLineIndex: number;
  toLineIndex: number;
  anchorLineIndices: number[];
  purpose: SignatureMomentPurposeV1;
  motifState: MotifStateV1;
  actorFamily: MotifActorFamilyV1;
  recallOf: string;
  intensity: number;
  evidence: SignatureMomentV1["evidence"];
}
export type QuietWindowV1 = DramaticQuietWindowV1;
export type SongBlockingTransitionV1 = LayoutTransitionV1;

export interface EvidenceV1 {
  sectionTriggers: PerformanceTriggerV1[];
  lineIndices: number[];
  audioLandmarkIDs: string[];
  rationale: string;
  confidence: number;
}

export interface DirectorBibleV1 {
  version: "director-bible-v1";
  recordingID: string;
  lyricsIdentity: string;
  bibleIdentity: string;
  premise: string;
  emotionalArc: string;
  world: PerformanceWorldV1;
  acts: DramaticActV1[];
  motifActor: MotifActorV1;
  signatureAnchors: SignatureAnchorV1[];
  quietWindows: QuietWindowV1[];
  layoutBudget: {
    baseLayout: PerformanceLayoutV1;
    maximumTransitions: 2;
    proposedTransitions: SongBlockingTransitionV1[];
    continuityJustification?: EvidenceV1;
  };
}

export type DramaticConsequenceKindV1 = SignatureMomentV1["consequence"];

export interface DramaticConsequenceV1 {
  kind: DramaticConsequenceKindV1;
  rationale: string;
}

export interface DramaticEvidenceV1 extends EvidenceV1 {}

export interface SceneCardV1 {
  version: "scene-card-v1";
  recordingID: string;
  lyricsIdentity: string;
  bibleIdentity: string;
  sceneID: string;
  sceneIndex: number;
  fromLineIndex: number;
  toLineIndex: number;
  fromMs: number;
  toMs: number;
  intention: string;
  entryStateHash: string;
  entryMotifState: MotifStateV1;
  exitMotifState: MotifStateV1;
  coverRole: DramaticCoverRoleV1;
  layout: PerformanceLayoutV1;
  artDirection: PerformanceArtDirectionV1;
  typography: PerformanceTypographyV1;
  presentation: StagePresentationV1;
  /** Locally compiled V2 output. Providers never author these values. */
  directives?: DirectorLineDirectiveV1[];
  semanticCueCount?: number;
  gestures: LyricGestureV1[];
  effects: EffectRecipeV1[];
  signatureMoment?: SignatureMomentV1;
  consequence: DramaticConsequenceV1;
  promiseCreates: string[];
  promiseConsumes: string[];
  evidence: DramaticEvidenceV1;
}

export interface RollingPerformanceStateV1 {
  version: "rolling-performance-state-v1";
  recordingID: string;
  lyricsIdentity: string;
  bibleIdentity: string;
  nextSceneIndex: number;
  lastToLineIndex: number | null;
  lastToMs: number | null;
  motifState: MotifStateV1;
  layout: PerformanceLayoutV1;
  layoutTransitionsUsed: number;
  unresolvedPromiseIDs: string[];
  consumedPromiseIDs: string[];
  acceptedSceneIDs: string[];
  stateHash: string;
}

export interface RollingDirectorSummaryV1 {
  version: "rolling-director-summary-v1";
  bibleIdentity: string;
  acceptedSceneIDs: string[];
  coveredLineRanges: Array<{ fromLineIndex: number; toLineIndex: number }>;
  unresolvedPromiseIDs: string[];
}

const layouts = new Set<PerformanceLayoutV1>(["monument", "editorialSplit", "railLeading", "railTrailing", "duetDivide"]);
const artDirections = new Set<PerformanceArtDirectionV1>(["editorialKinetic", "neonRail", "paperCut", "liquidMemory", "monoImpact", "celestialGrid"]);
const typographies = new Set<PerformanceTypographyV1>(["jpGothic", "jpMincho", "cjkGrotesk", "latinDisplay", "monoEditorial"]);
const presentations = new Set<StagePresentationV1>(["reading", "section", "hero", "duet", "aperture"]);
const motifStates = new Set<MotifStateV1>(["seed", "emerge", "transform", "fracture", "return", "resolve"]);
const coverRoles = new Set<DramaticCoverRoleV1>(["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"]);
const consequenceKinds = new Set<DramaticConsequenceKindV1>(["trace", "afterimage", "accumulation", "absence", "reframe", "return"]);
const actRoles = new Set<DramaticActRoleV1>(["setup", "development", "reversal", "climax", "coda"]);
const actorFamilies = new Set<MotifActorFamilyV1>(["thread", "window", "silhouette", "horizon", "fold", "firework", "fish", "petal", "snow"]);
const actorOrigins = new Set<MotifActorV1["origin"]>(["lyric", "artwork", "silence", "voice", "structure"]);
const signaturePurposes = new Set<SignatureMomentPurposeV1>(["reveal", "connection", "rupture", "release", "distance", "collective", "resolution"]);
const stageActions = new Set<SignatureMomentV1["stageAction"]>([
  "thread.connect", "thread.snap", "window.reveal", "silhouette.trace", "sentence.horizon", "phrase.cascade",
  "memory.imprint", "duet.tension", "stage.fold", "motif.recall", "silence.vacuum",
]);
const worldSpatialModes = new Set(["anchored", "panoramic", "cinematic", "orbital", "splitStage", "chorusWall"]);
const worldMotionLaws = new Set(["drift", "flow", "pulse", "fall", "orbit", "converge", "suspend", "fracture"]);
const worldArtworkRoles = new Set(["anchor", "portal", "memory", "counterpoint", "atmosphere"]);
const worldTextures = new Set(["silk", "ink", "mist", "glass", "paper", "light"]);
const triggers = new Set<PerformanceTriggerV1>([
  "repeated_hook", "section_boundary", "silence_gap", "duet_overlap", "voice_handoff",
  "density_lift", "density_release", "semantic_distance", "semantic_motion", "semantic_contrast",
  "question_suspension", "collective_chorus", "final_resolution",
]);

const clean = (value: unknown, maximum: number): string => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const finiteUnit = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const uniqueStrings = (value: unknown, maximumItems = 32): string[] | null => {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const strings = value.map((item) => clean(item, 160));
  return strings.some((item) => !item) || new Set(strings).size !== strings.length ? null : strings;
};

const normalizeSemantic = (value: unknown): unknown => {
  if (typeof value === "string") return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (Array.isArray(value)) return value.map(normalizeSemantic);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, normalizeSemantic(item)]));
  }
  return value;
};

const bibleSemanticContent = (value: Omit<DirectorBibleV1, "bibleIdentity"> | DirectorBibleV1): unknown => ({
  ...value,
  bibleIdentity: undefined,
});

const sceneSemanticContent = (value: Omit<SceneCardV1, "sceneID"> | SceneCardV1): unknown => ({
  ...value,
  sceneID: undefined,
  effects: value.effects.map((effect) => ({ ...effect, id: undefined, sectionID: "$scene" })),
});

const stateSemanticContent = (value: Omit<RollingPerformanceStateV1, "stateHash"> | RollingPerformanceStateV1): unknown => ({
  ...value,
  stateHash: undefined,
});

export const directorBibleIdentityV1 = (value: Omit<DirectorBibleV1, "bibleIdentity"> | DirectorBibleV1): string =>
  stableHash32(normalizeSemantic(bibleSemanticContent(value)));

export const sceneCardIdentityV1 = (value: Omit<SceneCardV1, "sceneID"> | SceneCardV1): string =>
  stableHash32(normalizeSemantic(sceneSemanticContent(value)));

export const rollingPerformanceStateIdentityV1 = (
  value: Omit<RollingPerformanceStateV1, "stateHash"> | RollingPerformanceStateV1,
): string => stableHash32(normalizeSemantic(stateSemanticContent(value)));

const finalizeBible = (value: Omit<DirectorBibleV1, "bibleIdentity">): DirectorBibleV1 => ({
  ...value,
  bibleIdentity: directorBibleIdentityV1(value),
});

const finalizeState = (value: Omit<RollingPerformanceStateV1, "stateHash">): RollingPerformanceStateV1 => ({
  ...value,
  stateHash: rollingPerformanceStateIdentityV1(value),
});

const lineByIndex = (lyrics: LyricDocumentV0): Map<number, LyricLineV0> =>
  new Map(lyrics.lines.map((line) => [line.lineIndex, line]));

const linesInRange = (lyrics: LyricDocumentV0, fromLineIndex: number, toLineIndex: number): LyricLineV0[] =>
  lyrics.lines.filter((line) => line.lineIndex >= fromLineIndex && line.lineIndex <= toLineIndex);

const exactRange = (lyrics: LyricDocumentV0, fromLineIndex: number, toLineIndex: number): LyricLineV0[] | null => {
  const byIndex = lineByIndex(lyrics);
  const first = byIndex.get(fromLineIndex);
  const last = byIndex.get(toLineIndex);
  if (!first || !last || fromLineIndex > toLineIndex) return null;
  const lines = linesInRange(lyrics, fromLineIndex, toLineIndex);
  if (lines[0]?.lineIndex !== fromLineIndex || lines.at(-1)?.lineIndex !== toLineIndex) return null;
  return lines;
};

const intervalUnionDuration = (lines: readonly LyricLineV0[]): number => {
  const intervals = lines.map((line) => [line.fromMs, line.toMs] as const).sort((left, right) => left[0] - right[0]);
  let total = 0;
  let from = -1;
  let to = -1;
  for (const interval of intervals) {
    if (interval[0] > to) {
      if (to > from) total += to - from;
      [from, to] = interval;
    } else {
      to = Math.max(to, interval[1]);
    }
  }
  return total + Math.max(0, to - from);
};

const evidenceCategoryCount = (sectionTriggers: readonly string[], audioLandmarkIDs: readonly string[]): number => {
  const categories = new Set<string>();
  sectionTriggers.forEach((trigger) => {
    if (["section_boundary", "silence_gap", "final_resolution", "repeated_hook"].includes(trigger)) categories.add("structure");
    else if (["duet_overlap", "voice_handoff", "collective_chorus"].includes(trigger)) categories.add("voice");
    else if (trigger.startsWith("semantic_") || trigger === "question_suspension") categories.add("semantic");
    else if (trigger.startsWith("density_")) categories.add("audio");
  });
  if (audioLandmarkIDs.length > 0) categories.add("audio");
  return categories.size;
};

const sanitizeEvidence = (
  value: unknown,
  validLineIndices: ReadonlySet<number>,
  minimumConfidence: number,
): EvidenceV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Record<string, unknown>;
  if (!Array.isArray(wire.sectionTriggers) || !Array.isArray(wire.lineIndices) || !Array.isArray(wire.audioLandmarkIDs)) return null;
  const sectionTriggers = [...new Set(wire.sectionTriggers.map((item) => clean(item, 48) as PerformanceTriggerV1))];
  const lineIndices = [...new Set(wire.lineIndices.filter((item): item is number => Number.isInteger(item)))];
  const audioLandmarkIDs = uniqueStrings(wire.audioLandmarkIDs, 8);
  const rationale = clean(wire.rationale, 420);
  const confidence = wire.confidence;
  if (!audioLandmarkIDs || sectionTriggers.length === 0 || sectionTriggers.some((item) => !triggers.has(item))
    || lineIndices.length === 0 || lineIndices.some((item) => !validLineIndices.has(item))
    || !rationale || !finiteUnit(confidence) || confidence < minimumConfidence) return null;
  return { sectionTriggers, lineIndices, audioLandmarkIDs, rationale, confidence };
};

const validWorld = (world: unknown): world is PerformanceWorldV1 => {
  if (!world || typeof world !== "object" || Array.isArray(world)) return false;
  const value = world as Partial<PerformanceWorldV1>;
  return worldSpatialModes.has(value.spatialMode ?? "")
    && worldMotionLaws.has(value.motionLaw ?? "")
    && worldArtworkRoles.has(value.artworkRole ?? "")
    && worldTextures.has(value.texture ?? "")
    && finiteUnit(value.depth) && finiteUnit(value.fluidity) && finiteUnit(value.elasticity) && finiteUnit(value.atmosphere)
    && Boolean(clean(value.rationale, 320));
};

const sanitizeBibleDramaturgy = (
  lyrics: LyricDocumentV0,
  candidate: DirectorBibleV1,
): Pick<DirectorBibleV1, "acts" | "motifActor" | "signatureAnchors" | "quietWindows"> | null => {
  if (candidate.acts.length < 2 || candidate.acts.length > 5
    || candidate.signatureAnchors.length < 2 || candidate.signatureAnchors.length > 4
    || candidate.quietWindows.length > 8) return null;
  const acts: DramaticActV1[] = [];
  const actIDs = new Set<string>();
  for (const act of candidate.acts) {
    if (!act || !clean(act.id, 120) || actIDs.has(act.id) || !actRoles.has(act.role) || !motifStates.has(act.motifState)
      || !exactRange(lyrics, act.fromLineIndex, act.toLineIndex) || !finiteUnit(act.tension) || !finiteUnit(act.visualDensity)
      || !clean(act.intention, 320) || (acts.length > 0 && act.fromLineIndex !== acts.at(-1)!.toLineIndex + 1)) return null;
    acts.push(act);
    actIDs.add(act.id);
  }
  if (acts[0]!.fromLineIndex !== lyrics.lines[0]?.lineIndex || acts.at(-1)!.toLineIndex !== lyrics.lines.at(-1)?.lineIndex) return null;

  const motif = candidate.motifActor;
  if (!actorFamilies.has(motif.family) || !actorOrigins.has(motif.origin) || !clean(motif.relationship, 360)
    || !Array.isArray(motif.states) || motif.states.length < 3 || motif.states.length > 6
    || motif.states.some((state) => !motifStates.has(state.state) || !clean(state.meaning, 240))
    || !motif.states.some((state) => state.state === "seed")
    || !motif.states.some((state) => state.state === "transform" || state.state === "fracture")
    || !motif.states.some((state) => state.state === "return" || state.state === "resolve")) return null;

  const anchors: SignatureAnchorV1[] = [];
  const anchorIDs = new Set<string>();
  const lyricIndices = new Set(lyrics.lines.map((line) => line.lineIndex));
  for (const anchor of candidate.signatureAnchors) {
    if (!anchor || "stageAction" in anchor || "coverRole" in anchor || "consequence" in anchor
      || !clean(anchor.id, 120) || anchorIDs.has(anchor.id)
      || !exactRange(lyrics, anchor.fromLineIndex, anchor.toLineIndex) || !signaturePurposes.has(anchor.purpose)
      || !motifStates.has(anchor.motifState) || anchor.actorFamily !== motif.family || !finiteUnit(anchor.intensity)
      || !Array.isArray(anchor.anchorLineIndices) || anchor.anchorLineIndices.length === 0
      || new Set(anchor.anchorLineIndices).size !== anchor.anchorLineIndices.length
      || anchor.anchorLineIndices.some((lineIndex) => !lyricIndices.has(lineIndex)
        || lineIndex < anchor.fromLineIndex || lineIndex > anchor.toLineIndex)
      || !anchor.evidence || !Array.isArray(anchor.evidence.sectionTriggers)
      || anchor.evidence.sectionTriggers.length === 0
      || anchor.evidence.sectionTriggers.some((trigger) => !triggers.has(trigger as PerformanceTriggerV1))
      || !clean(anchor.evidence.rationale, 420) || !finiteUnit(anchor.evidence.confidence) || anchor.evidence.confidence < 0.7
      || (anchors.length > 0 && anchor.fromLineIndex <= anchors.at(-1)!.toLineIndex)) return null;
    const returning = anchor.motifState === "return" || anchor.motifState === "resolve";
    if ((returning && !anchorIDs.has(anchor.recallOf)) || (!returning && clean(anchor.recallOf, 120))) return null;
    anchors.push(anchor);
    anchorIDs.add(anchor.id);
  }
  if (!(["seed", "emerge"] as MotifStateV1[]).includes(anchors[0]!.motifState)
    || !(["return", "resolve"] as MotifStateV1[]).includes(anchors.at(-1)!.motifState)
    || !anchors.slice(0, -1).some((anchor) => anchor.id === anchors.at(-1)!.recallOf)) return null;

  const quietWindows: QuietWindowV1[] = [];
  for (const window of candidate.quietWindows) {
    if (!window || !exactRange(lyrics, window.fromLineIndex, window.toLineIndex) || !clean(window.reason, 240)) return null;
    quietWindows.push(window);
  }
  return { acts, motifActor: motif, signatureAnchors: anchors, quietWindows };
};

export const sanitizeDirectorBibleV1 = (lyrics: LyricDocumentV0, value: unknown): DirectorBibleV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value) || lyrics.lines.length < 2) return null;
  const wire = value as Partial<DirectorBibleV1>;
  const lyricsIdentity = stableHash32(lyrics);
  if (wire.version !== "director-bible-v1" || wire.recordingID !== lyrics.recordingID
    || wire.lyricsIdentity !== lyricsIdentity || !clean(wire.bibleIdentity, 80)
    || !clean(wire.premise, 240) || !clean(wire.emotionalArc, 320) || !validWorld(wire.world)
    || !Array.isArray(wire.acts) || !Array.isArray(wire.signatureAnchors) || !Array.isArray(wire.quietWindows)
    || !wire.motifActor || !wire.layoutBudget) return null;
  const candidate = wire as DirectorBibleV1;
  if (candidate.bibleIdentity !== directorBibleIdentityV1(candidate)) return null;
  const dramaturgy = sanitizeBibleDramaturgy(lyrics, candidate);
  if (!dramaturgy) return null;
  const ordinaryLongSong = lyrics.durationMs >= 150_000 && lyrics.lines.length >= 24;
  if (ordinaryLongSong && dramaturgy.signatureAnchors.length < 3) {
    const exception = sanitizeEvidence(candidate.layoutBudget.continuityJustification, new Set(lyrics.lines.map((line) => line.lineIndex)), 0.85);
    if (!exception || evidenceCategoryCount(exception.sectionTriggers, exception.audioLandmarkIDs) < 2) return null;
  }
  const budget = candidate.layoutBudget;
  if (budget.maximumTransitions !== 2 || !layouts.has(budget.baseLayout) || !Array.isArray(budget.proposedTransitions)
    || budget.proposedTransitions.length > 2) return null;
  const sectionShells: DirectorSectionV1[] = dramaturgy.acts.map((act, index) => {
    const range = exactRange(lyrics, act.fromLineIndex, act.toLineIndex)!;
    return {
      id: act.id,
      fromLineIndex: act.fromLineIndex,
      toLineIndex: act.toLineIndex,
      fromMs: range[0]!.fromMs,
      toMs: Math.max(...range.map((line) => line.toMs)),
      artDirection: "editorialKinetic",
      layout: budget.baseLayout,
      typography: "jpGothic",
      paletteIndex: index % 12,
      intensity: act.tension,
    };
  });
  const blocking: SongBlockingV1 = { version: "song-blocking-v1", baseLayout: budget.baseLayout, transitions: budget.proposedTransitions };
  if (!sanitizeSongBlockingV1(blocking, sectionShells)) return null;
  if (budget.proposedTransitions.length === 0) {
    const justification = sanitizeEvidence(budget.continuityJustification, new Set(lyrics.lines.map((line) => line.lineIndex)), 0.82);
    if (!justification || evidenceCategoryCount(justification.sectionTriggers, justification.audioLandmarkIDs) < 2) return null;
  }
  const quietLines = new Set<number>();
  dramaturgy.quietWindows.forEach((window) => linesInRange(lyrics, window.fromLineIndex, window.toLineIndex)
    .forEach((line) => quietLines.add(line.lineIndex)));
  const totalLyricTime = intervalUnionDuration(lyrics.lines);
  const quietLyricTime = intervalUnionDuration(lyrics.lines.filter((line) => quietLines.has(line.lineIndex)));
  if (totalLyricTime <= 0 || quietLyricTime / totalLyricTime < 0.4) return null;
  return {
    ...candidate,
    acts: dramaturgy.acts,
    motifActor: dramaturgy.motifActor,
    signatureAnchors: dramaturgy.signatureAnchors,
    quietWindows: dramaturgy.quietWindows,
  };
};

const quietWindowsFor = (lyrics: LyricDocumentV0): QuietWindowV1[] => {
  const target = intervalUnionDuration(lyrics.lines) * 0.46;
  const windows: QuietWindowV1[] = [];
  const included: LyricLineV0[] = [];
  for (const line of lyrics.lines) {
    included.push(line);
    if (intervalUnionDuration(included) >= target) break;
  }
  if (included.length > 0) windows.push({
    fromLineIndex: included[0]!.lineIndex,
    toLineIndex: included.at(-1)!.lineIndex,
    reason: "The local performance protects a continuous reading field before later structural events.",
  });
  return windows;
};

const anchorFromMoment = (moment: SignatureMomentV1): SignatureAnchorV1 => ({
  id: moment.id,
  fromLineIndex: moment.anchorLineIndices[0]!,
  toLineIndex: moment.anchorLineIndices[0]!,
  anchorLineIndices: [moment.anchorLineIndices[0]!],
  purpose: moment.purpose,
  motifState: moment.motifState,
  actorFamily: moment.actorFamily,
  recallOf: moment.recallOf,
  intensity: moment.intensity,
  evidence: moment.evidence,
});

const makeMiddleAnchor = (lyrics: LyricDocumentV0, score: DramaticScoreV1): SignatureAnchorV1 | null => {
  const first = score.signatureMoments[0];
  const last = score.signatureMoments.at(-1);
  const candidates = lyrics.lines.filter((line) => first && last && line.lineIndex > first.toLineIndex && line.lineIndex < last.fromLineIndex);
  const line = candidates[Math.floor(candidates.length / 2)];
  if (!line || !first || !last) return null;
  return {
    id: `local-moment:transform:${line.lineIndex}`,
    fromLineIndex: line.lineIndex,
    toLineIndex: line.lineIndex,
    anchorLineIndices: [line.lineIndex],
    purpose: "rupture",
    motifState: "transform",
    actorFamily: score.motifActor.family,
    recallOf: "",
    intensity: 0.78,
    evidence: {
      sectionTriggers: ["section_boundary", "density_lift"],
      rationale: "A central structural lift develops the existing motif without replacing its actor.",
      confidence: 0.82,
    },
  };
};

export const compileLocalDirectorBibleV1 = (lyrics: LyricDocumentV0): DirectorBibleV1 => {
  const local = compileLocalDirectorPlanV1(lyrics);
  const score = compileLocalDramaticScoreV1(lyrics, local.sections);
  const signatureAnchors = score.signatureMoments.map(anchorFromMoment);
  if (lyrics.durationMs >= 150_000 && lyrics.lines.length >= 24 && signatureAnchors.length < 3) {
    const middle = makeMiddleAnchor(lyrics, score);
    if (middle) signatureAnchors.splice(1, 0, middle);
  }
  const firstLineIndex = lyrics.lines[0]?.lineIndex ?? 0;
  const continuityJustification: EvidenceV1 = {
    sectionTriggers: ["section_boundary", "density_release"],
    lineIndices: [firstLineIndex],
    audioLandmarkIDs: [],
    rationale: "The local fallback keeps one stable layout so lyric structure and density, rather than spatial novelty, carry the arc.",
    confidence: 0.86,
  };
  return finalizeBible({
    version: "director-bible-v1",
    recordingID: lyrics.recordingID,
    lyricsIdentity: stableHash32(lyrics),
    premise: score.premise,
    emotionalArc: score.emotionalArc,
    world: local.world,
    acts: score.acts,
    motifActor: score.motifActor,
    signatureAnchors,
    quietWindows: quietWindowsFor(lyrics),
    layoutBudget: {
      baseLayout: local.blocking.baseLayout,
      maximumTransitions: 2,
      proposedTransitions: [],
      continuityJustification,
    },
  });
};

export const initialRollingPerformanceStateV1 = (bible: DirectorBibleV1): RollingPerformanceStateV1 =>
  finalizeState({
    version: "rolling-performance-state-v1",
    recordingID: bible.recordingID,
    lyricsIdentity: bible.lyricsIdentity,
    bibleIdentity: bible.bibleIdentity,
    nextSceneIndex: 0,
    lastToLineIndex: null,
    lastToMs: null,
    motifState: bible.acts[0]?.motifState ?? "seed",
    layout: bible.layoutBudget.baseLayout,
    layoutTransitionsUsed: 0,
    unresolvedPromiseIDs: [],
    consumedPromiseIDs: [],
    acceptedSceneIDs: [],
  });

export const checkpointRollingPerformanceStateV1 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  resumeFromLineIndex: number,
): RollingPerformanceStateV1 | null => {
  if (!sanitizeDirectorBibleV1(lyrics, bible)) return null;
  const resumePosition = lyrics.lines.findIndex((line) => line.lineIndex === resumeFromLineIndex);
  if (resumePosition < 0) return null;
  const previous = lyrics.lines[resumePosition - 1];
  const actIndex = bible.acts.findIndex((act) => resumeFromLineIndex >= act.fromLineIndex && resumeFromLineIndex <= act.toLineIndex);
  const act = bible.acts[actIndex];
  if (!act) return null;
  const appliedTransitions = bible.layoutBudget.proposedTransitions.filter((transition) => transition.atSectionIndex <= actIndex);
  return finalizeState({
    version: "rolling-performance-state-v1",
    recordingID: bible.recordingID,
    lyricsIdentity: bible.lyricsIdentity,
    bibleIdentity: bible.bibleIdentity,
    nextSceneIndex: 0,
    lastToLineIndex: previous?.lineIndex ?? null,
    lastToMs: previous?.toMs ?? null,
    motifState: act.motifState,
    layout: appliedTransitions.at(-1)?.toLayout ?? bible.layoutBudget.baseLayout,
    layoutTransitionsUsed: appliedTransitions.length,
    unresolvedPromiseIDs: [],
    consumedPromiseIDs: [],
    acceptedSceneIDs: [],
  });
};

export const isRollingPerformanceStateV1 = (
  value: unknown,
  bible: DirectorBibleV1,
): value is RollingPerformanceStateV1 => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<RollingPerformanceStateV1>;
  return state.version === "rolling-performance-state-v1"
    && state.recordingID === bible.recordingID && state.lyricsIdentity === bible.lyricsIdentity
    && state.bibleIdentity === bible.bibleIdentity && Number.isInteger(state.nextSceneIndex) && (state.nextSceneIndex ?? -1) >= 0
    && (state.lastToLineIndex === null || Number.isInteger(state.lastToLineIndex))
    && (state.lastToMs === null || (typeof state.lastToMs === "number" && Number.isFinite(state.lastToMs)))
    && motifStates.has(state.motifState ?? "" as MotifStateV1) && layouts.has(state.layout ?? "" as PerformanceLayoutV1)
    && Number.isInteger(state.layoutTransitionsUsed) && (state.layoutTransitionsUsed ?? -1) >= 0 && (state.layoutTransitionsUsed ?? 3) <= 2
    && Array.isArray(state.unresolvedPromiseIDs) && Array.isArray(state.consumedPromiseIDs) && Array.isArray(state.acceptedSceneIDs)
    && new Set(state.unresolvedPromiseIDs).size === state.unresolvedPromiseIDs.length
    && new Set(state.consumedPromiseIDs).size === state.consumedPromiseIDs.length
    && new Set(state.acceptedSceneIDs).size === state.acceptedSceneIDs.length
    && state.acceptedSceneIDs.length === state.nextSceneIndex
    && Boolean(state.stateHash) && state.stateHash === rollingPerformanceStateIdentityV1(state as RollingPerformanceStateV1);
};

const signatureForRange = (bible: DirectorBibleV1, fromLineIndex: number, toLineIndex: number): SignatureAnchorV1 | undefined =>
  bible.signatureAnchors.find((anchor) => anchor.fromLineIndex >= fromLineIndex && anchor.toLineIndex <= toLineIndex);

const signatureMomentMatchesAnchor = (moment: SignatureMomentV1, anchor: SignatureAnchorV1): boolean =>
  moment.id === anchor.id
  && moment.fromLineIndex === anchor.fromLineIndex
  && moment.toLineIndex === anchor.toLineIndex
  && stableHash32(moment.anchorLineIndices) === stableHash32(anchor.anchorLineIndices)
  && moment.purpose === anchor.purpose
  && moment.motifState === anchor.motifState
  && moment.actorFamily === anchor.actorFamily
  && moment.recallOf === anchor.recallOf
  && moment.intensity === anchor.intensity
  && stableHash32(normalizeSemantic(moment.evidence)) === stableHash32(normalizeSemantic(anchor.evidence))
  && stageActions.has(moment.stageAction)
  && coverRoles.has(moment.coverRole)
  && consequenceKinds.has(moment.consequence);

const expectedLayoutForCard = (bible: DirectorBibleV1, prior: RollingPerformanceStateV1, fromLineIndex: number): PerformanceLayoutV1 => {
  const next = bible.layoutBudget.proposedTransitions[prior.layoutTransitionsUsed];
  const act = next ? bible.acts[next.atSectionIndex] : undefined;
  return act && fromLineIndex >= act.fromLineIndex ? next!.toLayout : prior.layout;
};

export const sanitizeSceneCardV1 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  priorState: RollingPerformanceStateV1,
  value: unknown,
): SceneCardV1 | null => {
  if (!sanitizeDirectorBibleV1(lyrics, bible) || !isRollingPerformanceStateV1(priorState, bible)
    || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const card = value as Partial<SceneCardV1>;
  if (card.version !== "scene-card-v1" || card.recordingID !== lyrics.recordingID
    || card.lyricsIdentity !== bible.lyricsIdentity || card.bibleIdentity !== bible.bibleIdentity
    || !clean(card.sceneID, 80) || card.sceneIndex !== priorState.nextSceneIndex
    || !Number.isInteger(card.fromLineIndex) || !Number.isInteger(card.toLineIndex)
    || !clean(card.intention, 320) || card.entryStateHash !== priorState.stateHash
    || !motifStates.has(card.entryMotifState ?? "" as MotifStateV1)
    || !motifStates.has(card.exitMotifState ?? "" as MotifStateV1)
    || card.entryMotifState !== priorState.motifState || !coverRoles.has(card.coverRole ?? "" as DramaticCoverRoleV1)
    || !layouts.has(card.layout ?? "" as PerformanceLayoutV1) || !artDirections.has(card.artDirection ?? "" as PerformanceArtDirectionV1)
    || !typographies.has(card.typography ?? "" as PerformanceTypographyV1) || !presentations.has(card.presentation ?? "" as StagePresentationV1)
    || !Array.isArray(card.gestures) || !Array.isArray(card.effects) || !card.consequence || !card.evidence) return null;
  const complete = card as SceneCardV1;
  if (complete.sceneID !== sceneCardIdentityV1(complete)) return null;
  const range = exactRange(lyrics, complete.fromLineIndex, complete.toLineIndex);
  if (!range || complete.fromMs !== range[0]!.fromMs || complete.toMs !== Math.max(...range.map((line) => line.toMs))
    || complete.fromMs >= complete.toMs || complete.toMs - complete.fromMs > 75_000
    || (priorState.lastToLineIndex !== null && complete.fromLineIndex <= priorState.lastToLineIndex)) return null;
  const expectedLayout = expectedLayoutForCard(bible, priorState, complete.fromLineIndex);
  const layoutChanged = complete.layout !== priorState.layout;
  if (complete.layout !== expectedLayout || (layoutChanged && priorState.layoutTransitionsUsed >= 2)) return null;
  const gestures = sanitizeLyricGesturesV1(lyrics, complete.gestures);
  if (!gestures || gestures.some((gesture) => gesture.lineIndex < complete.fromLineIndex || gesture.lineIndex > complete.toLineIndex)) return null;
  const perLineGestureCount = new Map<number, number>();
  gestures.forEach((gesture) => perLineGestureCount.set(gesture.lineIndex, (perLineGestureCount.get(gesture.lineIndex) ?? 0) + 1));
  if ([...perLineGestureCount.values()].some((count) => count > 2)) return null;
  const gestureLines = gestures.map((gesture) => lineByIndex(lyrics).get(gesture.lineIndex)!);
  if (gestureLines.some((line, index) => gestureLines.filter((candidate, candidateIndex) => candidateIndex !== index
    && line.fromMs < candidate.toMs && candidate.fromMs < line.toMs).length >= 2)) return null;
  const signatureCandidate = signatureForRange(bible, complete.fromLineIndex, complete.toLineIndex);
  const signature = signatureCandidate?.id === bible.signatureAnchors.at(-1)?.id
    && priorState.unresolvedPromiseIDs.length === 0
    && !complete.signatureMoment
    ? undefined
    : signatureCandidate;
  const semanticCueCount = Number.isInteger(complete.semanticCueCount) ? complete.semanticCueCount! : undefined;
  const compiledV2Budgets = complete.directives !== undefined && semanticCueCount !== undefined;
  if (Boolean(complete.signatureMoment) !== Boolean(signature)
    || (signature && (!complete.signatureMoment || !signatureMomentMatchesAnchor(complete.signatureMoment, signature)))) return null;
  if (signature) {
    const scales = new Set(gestures.map((gesture) => gesture.scope));
    if (gestures.length < 2 || gestures.length > 4 || scales.size < 2 || complete.effects.length < 1 || complete.effects.length > 2
      || complete.consequence.kind !== complete.signatureMoment!.consequence) return null;
  } else {
    const maximumGestures = compiledV2Budgets ? Math.min(3, Math.max(2, semanticCueCount)) : 2;
    const maximumEffects = compiledV2Budgets ? Math.min(3, Math.max(1, semanticCueCount)) : 1;
    if (gestures.length > maximumGestures || complete.effects.length > maximumEffects) return null;
  }
  if (!consequenceKinds.has(complete.consequence.kind) || !clean(complete.consequence.rationale, 320)) return null;
  const validLineIndices = new Set(range.map((line) => line.lineIndex));
  let directives: DirectorLineDirectiveV1[] | undefined;
  if (complete.directives !== undefined) {
    if (!Array.isArray(complete.directives) || complete.directives.length !== range.length) return null;
    const seenDirectiveLines = new Set<number>();
    directives = [];
    for (const candidate of complete.directives) {
      const directive = sanitizeDirectorLineDirectiveV1(candidate, validLineIndices);
      if (!directive || seenDirectiveLines.has(directive.lineIndex)) return null;
      seenDirectiveLines.add(directive.lineIndex);
      directives.push(directive);
    }
    if (seenDirectiveLines.size !== validLineIndices.size) return null;
    directives.sort((left, right) => left.lineIndex - right.lineIndex);
  }
  if (semanticCueCount !== undefined && (semanticCueCount < 0 || semanticCueCount > 3)) return null;
  const evidence = sanitizeEvidence(complete.evidence, validLineIndices, 0.65);
  if (!evidence) return null;
  if (complete.effects.some((effect) => effect.sectionID !== complete.sceneID
    || !validateEffectRecipeV1(effect, {
      id: complete.sceneID,
      fromLineIndex: complete.fromLineIndex,
      toLineIndex: complete.toLineIndex,
      fromMs: complete.fromMs,
      toMs: complete.toMs,
      intensity: signature?.intensity ?? 0.58,
    }, validLineIndices))) return null;
  const creates = uniqueStrings(complete.promiseCreates, 8);
  const consumes = uniqueStrings(complete.promiseConsumes, 8);
  if (!creates || !consumes || creates.some((id) => priorState.unresolvedPromiseIDs.includes(id) || priorState.consumedPromiseIDs.includes(id))
    || consumes.some((id) => !priorState.unresolvedPromiseIDs.includes(id))
    || creates.some((id) => consumes.includes(id))) return null;
  const finalSignature = bible.signatureAnchors.at(-1);
  if (signature?.id === finalSignature?.id && consumes.length === 0) return null;
  return { ...complete, ...(directives ? { directives } : {}), gestures, evidence };
};

export const advanceRollingPerformanceStateV1 = (
  prior: RollingPerformanceStateV1,
  card: SceneCardV1,
): RollingPerformanceStateV1 => {
  const consumed = new Set([...prior.consumedPromiseIDs, ...card.promiseConsumes]);
  const unresolved = prior.unresolvedPromiseIDs.filter((id) => !consumed.has(id));
  card.promiseCreates.forEach((id) => unresolved.push(id));
  return finalizeState({
    version: "rolling-performance-state-v1",
    recordingID: prior.recordingID,
    lyricsIdentity: prior.lyricsIdentity,
    bibleIdentity: prior.bibleIdentity,
    nextSceneIndex: prior.nextSceneIndex + 1,
    lastToLineIndex: card.toLineIndex,
    lastToMs: card.toMs,
    motifState: card.exitMotifState,
    layout: card.layout,
    layoutTransitionsUsed: prior.layoutTransitionsUsed + (card.layout === prior.layout ? 0 : 1),
    unresolvedPromiseIDs: unresolved,
    consumedPromiseIDs: [...consumed],
    acceptedSceneIDs: [...prior.acceptedSceneIDs, card.sceneID],
  });
};

const groupSceneRanges = (lyrics: LyricDocumentV0, bible: DirectorBibleV1): LyricLineV0[][] => {
  const output: LyricLineV0[][] = [];
  let current: LyricLineV0[] = [];
  const anchorLines = new Set(bible.signatureAnchors.flatMap((anchor) => anchor.anchorLineIndices));
  for (const line of lyrics.lines) {
    if (anchorLines.has(line.lineIndex)) {
      if (current.length > 0) output.push(current);
      output.push([line]);
      current = [];
      continue;
    }
    if (current.length === 0) {
      current = [line];
      continue;
    }
    const candidateDuration = Math.max(...[...current, line].map((item) => item.toMs)) - current[0]!.fromMs;
    const currentDuration = Math.max(...current.map((item) => item.toMs)) - current[0]!.fromMs;
    if (candidateDuration > 45_000 && currentDuration >= 20_000 || candidateDuration > 75_000) {
      output.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) output.push(current);
  return output;
};

const localSignatureGestures = (line: LyricLineV0, sceneIndex: number): LyricGestureV1[] => {
  const graphemes = lyricGraphemesV1(line.text);
  if (graphemes.length === 0) return [];
  const values: unknown[] = [{
    version: "lyric-gesture-v1",
    id: `local-rolling:phrase:${sceneIndex}:${line.lineIndex}`,
    lineIndex: line.lineIndex,
    scope: "phrase",
    target: { fromGrapheme: 0, toGrapheme: graphemes.length, expectedText: line.text },
    primitive: "phrase.breathe",
    driver: "structuralMoment",
    space: "lyricLocal",
    envelope: { attackMs: 320, holdMs: 240, releaseMs: 520 },
    intensity: 0.58,
    direction: 1,
    paletteRole: "accent",
    evidence: { semanticRole: "resolution", rationale: "The signature line receives a bounded whole-phrase consequence.", confidence: 0.74 },
  }, {
    version: "lyric-gesture-v1",
    id: `local-rolling:token:${sceneIndex}:${line.lineIndex}`,
    lineIndex: line.lineIndex,
    scope: "token",
    target: { fromGrapheme: 0, toGrapheme: 1, expectedText: graphemes[0] },
    primitive: "token.halo",
    driver: "lineEnter",
    space: "lyricLocal",
    envelope: { attackMs: 220, holdMs: 160, releaseMs: 360 },
    intensity: 0.52,
    direction: 1,
    paletteRole: "primary",
    evidence: { semanticRole: "identity", rationale: "One exact lyric token introduces the local signature without rewriting text.", confidence: 0.72 },
  }];
  return sanitizeLyricGesturesV1({
    version: "lyric-document-v0",
    recordingID: "local-gesture",
    durationMs: Math.max(1, line.toMs),
    lines: [line],
  }, values) ?? [];
};

const localSignatureMomentForAnchor = (
  anchor: SignatureAnchorV1,
  anchorIndex: number,
  anchorCount: number,
): SignatureMomentV1 => {
  const final = anchorIndex === anchorCount - 1;
  const stageAction: SignatureMomentV1["stageAction"] = final
    ? "motif.recall"
    : anchor.actorFamily === "thread"
      ? anchorIndex === 0 ? "thread.connect" : "thread.snap"
      : anchor.actorFamily === "window"
        ? "window.reveal"
        : anchor.actorFamily === "silhouette"
          ? "silhouette.trace"
          : anchor.actorFamily === "horizon"
            ? "sentence.horizon"
            : anchor.actorFamily === "fold"
              ? "stage.fold"
              : "phrase.cascade";
  return {
    ...anchor,
    stageAction,
    coverRole: final ? "memory" : anchorIndex === 0 ? "origin" : "boundary",
    consequence: final ? "return" : anchorIndex === 0 ? "trace" : "accumulation",
  };
};

export const compileLocalSceneCardForWindowV1 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  fromLineIndex: number,
  toLineIndex: number,
): SceneCardV1 | null => {
  if (!sanitizeDirectorBibleV1(lyrics, bible) || !isRollingPerformanceStateV1(state, bible)) return null;
  const range = exactRange(lyrics, fromLineIndex, toLineIndex);
  if (!range || range[0]!.fromMs >= Math.max(...range.map((line) => line.toMs))
    || Math.max(...range.map((line) => line.toMs)) - range[0]!.fromMs > 75_000) return null;
  const local = compileLocalDirectorPlanV1(lyrics);
  const signatureCandidate = signatureForRange(bible, fromLineIndex, toLineIndex);
  const finalSignatureWithoutPromise = signatureCandidate?.id === bible.signatureAnchors.at(-1)?.id
    && state.unresolvedPromiseIDs.length === 0;
  // A seek/checkpoint may enter the final anchor without having observed the
  // promise it is meant to resolve. Preserve continuity as a quiet scene
  // instead of inventing a false recall or dropping the whole window.
  const signature = finalSignatureWithoutPromise ? undefined : signatureCandidate;
  const signatureIndex = signature ? bible.signatureAnchors.findIndex((anchor) => anchor.id === signature.id) : -1;
  const signatureMoment = signature
    ? localSignatureMomentForAnchor(signature, signatureIndex, bible.signatureAnchors.length)
    : undefined;
  const anchorLine = signature ? lineByIndex(lyrics).get(signature.anchorLineIndices[0]!) ?? range[0]! : range[0]!;
  const localSection = local.sections.find((section) => fromLineIndex >= section.fromLineIndex && fromLineIndex <= section.toLineIndex)
    ?? local.sections[0]!;
  const evidenceTriggers: PerformanceTriggerV1[] = signature
    ? signature.evidence.sectionTriggers.filter((trigger): trigger is PerformanceTriggerV1 => triggers.has(trigger as PerformanceTriggerV1))
    : [state.nextSceneIndex === 0 ? "density_release" : "section_boundary"];
  const evidence: DramaticEvidenceV1 = {
    sectionTriggers: evidenceTriggers.length > 0 ? evidenceTriggers : ["section_boundary"],
    lineIndices: signature?.anchorLineIndices ?? [fromLineIndex],
    audioLandmarkIDs: [],
    rationale: signature?.evidence.rationale ?? "The deterministic repair card preserves legibility while retaining valid AI scene styling.",
    confidence: Math.max(0.7, signature?.evidence.confidence ?? 0.7),
  };
  const finalSignature = signature?.id === bible.signatureAnchors.at(-1)?.id;
  const promiseCreates = signature && !finalSignature && state.unresolvedPromiseIDs.length === 0
    ? [`promise:${signature.id}`]
    : [];
  const promiseConsumes = finalSignature ? [state.unresolvedPromiseIDs[0]!] : [];
  const fromMs = range[0]!.fromMs;
  const toMs = Math.max(...range.map((line) => line.toMs));
  const baseEffect: EffectRecipeV1 | undefined = signature ? {
    version: "effect-recipe-v1",
    id: `local-rolling-window-effect:${state.nextSceneIndex}`,
    cardID: "custom",
    sectionID: "$pending",
    fromMs,
    toMs,
    presentation: "section",
    primary: { primitive: signatureMoment?.consequence === "return" ? "motif.recall" : "field.drift", intensity: 0.58 },
    support: [],
    evidence: {
      songMotif: bible.motifActor.relationship,
      sectionTriggers: evidence.sectionTriggers,
      lineIndices: evidence.lineIndices,
      rationale: evidence.rationale,
      confidence: evidence.confidence,
    },
  } : undefined;
  const withoutID: Omit<SceneCardV1, "sceneID"> = {
    version: "scene-card-v1",
    recordingID: lyrics.recordingID,
    lyricsIdentity: bible.lyricsIdentity,
    bibleIdentity: bible.bibleIdentity,
    sceneIndex: state.nextSceneIndex,
    fromLineIndex,
    toLineIndex,
    fromMs,
    toMs,
    intention: signatureMoment ? `Stage ${signatureMoment.purpose} and preserve its ${signatureMoment.consequence}.` : "Protect a quiet reading span between authored events.",
    entryStateHash: state.stateHash,
    entryMotifState: state.motifState,
    exitMotifState: signature?.motifState ?? state.motifState,
    coverRole: signatureMoment?.coverRole ?? "anchor",
    layout: expectedLayoutForCard(bible, state, fromLineIndex),
    artDirection: localSection.artDirection,
    typography: localSection.typography,
    presentation: signature ? "section" : "reading",
    gestures: signature ? localSignatureGestures(anchorLine, state.nextSceneIndex) : [],
    effects: baseEffect ? [baseEffect] : [],
    signatureMoment,
    consequence: {
      kind: signatureMoment?.consequence ?? "trace",
      rationale: signatureMoment ? `The ${signatureMoment.consequence} remains after the repaired event.` : "The quiet card leaves only a restrained trace.",
    },
    promiseCreates,
    promiseConsumes,
    evidence,
  };
  const sceneID = sceneCardIdentityV1(withoutID);
  const candidate: SceneCardV1 = {
    ...withoutID,
    sceneID,
    effects: withoutID.effects.map((effect) => ({ ...effect, sectionID: sceneID })),
  };
  return sanitizeSceneCardV1(lyrics, bible, state, candidate);
};

export const compileLocalSceneCardsV1 = (lyrics: LyricDocumentV0, bible: DirectorBibleV1): SceneCardV1[] => {
  const local = compileLocalDirectorPlanV1(lyrics);
  let state = initialRollingPerformanceStateV1(bible);
  let openingPromise = "";
  return groupSceneRanges(lyrics, bible).map((range, sceneIndex) => {
    const fromLineIndex = range[0]!.lineIndex;
    const toLineIndex = range.at(-1)!.lineIndex;
    const signature = signatureForRange(bible, fromLineIndex, toLineIndex);
    const signatureIndex = signature ? bible.signatureAnchors.findIndex((anchor) => anchor.id === signature.id) : -1;
    const signatureMoment = signature
      ? localSignatureMomentForAnchor(signature, signatureIndex, bible.signatureAnchors.length)
      : undefined;
    const anchorLine = signature ? lineByIndex(lyrics).get(signature.anchorLineIndices[0]!) ?? range[0]! : range[0]!;
    const localSection = local.sections.find((section) => fromLineIndex >= section.fromLineIndex && fromLineIndex <= section.toLineIndex) ?? local.sections[0]!;
    const expectedLayout = expectedLayoutForCard(bible, state, fromLineIndex);
    const evidenceTriggers: PerformanceTriggerV1[] = signature
      ? signature.evidence.sectionTriggers.filter((trigger): trigger is PerformanceTriggerV1 => triggers.has(trigger as PerformanceTriggerV1))
      : [sceneIndex === 0 ? "density_release" : "section_boundary"];
    const evidence: DramaticEvidenceV1 = {
      sectionTriggers: evidenceTriggers.length > 0 ? evidenceTriggers : ["section_boundary"],
      lineIndices: signature?.anchorLineIndices ?? [fromLineIndex],
      audioLandmarkIDs: [],
      rationale: signature?.evidence.rationale ?? "The deterministic local card preserves legibility between signature anchors.",
      confidence: Math.max(0.7, signature?.evidence.confidence ?? 0.7),
    };
    const promiseCreates = signature && !openingPromise ? [`promise:${signature.id}`] : [];
    if (promiseCreates[0]) openingPromise = promiseCreates[0];
    const promiseConsumes = signature?.id === bible.signatureAnchors.at(-1)?.id && openingPromise ? [openingPromise] : [];
    const gestures = signature ? localSignatureGestures(anchorLine, sceneIndex) : [];
    const baseEffect: EffectRecipeV1 | undefined = signature ? {
      version: "effect-recipe-v1",
      id: `local-rolling-effect:${sceneIndex}`,
      cardID: "custom",
      sectionID: "$pending",
      fromMs: range[0]!.fromMs,
      toMs: Math.max(...range.map((line) => line.toMs)),
      presentation: "section",
      primary: { primitive: signatureMoment?.consequence === "return" ? "motif.recall" : "field.drift", intensity: 0.58 },
      support: [],
      evidence: {
        songMotif: bible.motifActor.relationship,
        sectionTriggers: evidence.sectionTriggers,
        lineIndices: evidence.lineIndices,
        rationale: evidence.rationale,
        confidence: evidence.confidence,
      },
    } : undefined;
    const withoutID: Omit<SceneCardV1, "sceneID"> = {
      version: "scene-card-v1",
      recordingID: lyrics.recordingID,
      lyricsIdentity: bible.lyricsIdentity,
      bibleIdentity: bible.bibleIdentity,
      sceneIndex,
      fromLineIndex,
      toLineIndex,
      fromMs: range[0]!.fromMs,
      toMs: Math.max(...range.map((line) => line.toMs)),
      intention: signatureMoment ? `Stage ${signatureMoment.purpose} and preserve its ${signatureMoment.consequence}.` : "Protect a quiet reading span between authored events.",
      entryStateHash: state.stateHash,
      entryMotifState: state.motifState,
      exitMotifState: signature?.motifState ?? state.motifState,
      coverRole: signatureMoment?.coverRole ?? "anchor",
      layout: expectedLayout,
      artDirection: localSection.artDirection,
      typography: localSection.typography,
      presentation: signature ? "section" : "reading",
      gestures,
      effects: baseEffect ? [baseEffect] : [],
      signatureMoment,
      consequence: {
        kind: signatureMoment?.consequence ?? "trace",
        rationale: signatureMoment ? `The ${signatureMoment.consequence} remains after the authored event.` : "The quiet card leaves only a restrained trace.",
      },
      promiseCreates,
      promiseConsumes,
      evidence,
    };
    const sceneID = sceneCardIdentityV1(withoutID);
    const card: SceneCardV1 = {
      ...withoutID,
      sceneID,
      effects: withoutID.effects.map((effect) => ({ ...effect, sectionID: sceneID })),
    };
    const sanitized = sanitizeSceneCardV1(lyrics, bible, state, card);
    if (!sanitized) throw new Error(`Local rolling scene ${sceneIndex} violated rolling-director-v1`);
    state = advanceRollingPerformanceStateV1(state, sanitized);
    return sanitized;
  });
};

const planIdentity = (plan: Omit<DirectorPlanV1, "planIdentity"> | DirectorPlanV1): string => stableHash32({ ...plan, planIdentity: undefined });

const sectionForCard = (card: SceneCardV1, paletteIndex: number): DirectorSectionV1 => ({
  id: `rolling:${card.sceneID}`,
  fromLineIndex: card.fromLineIndex,
  toLineIndex: card.toLineIndex,
  fromMs: card.fromMs,
  toMs: card.toMs,
  artDirection: card.artDirection,
  layout: card.layout,
  typography: card.typography,
  paletteIndex,
  intensity: card.signatureMoment?.intensity ?? 0.58,
});

export const compileDirectorPlanFromRollingV1 = (
  lyrics: LyricDocumentV0,
  bibleValue: DirectorBibleV1,
  cardValues: readonly SceneCardV1[],
  source: DirectorPlanV1["source"] = "ai",
): DirectorPlanV1 => {
  const local = compileLocalDirectorPlanV1(lyrics);
  const bible = sanitizeDirectorBibleV1(lyrics, bibleValue);
  if (!bible) return local;
  const accepted: SceneCardV1[] = [];
  let state = initialRollingPerformanceStateV1(bible);
  for (const candidate of cardValues) {
    let card = sanitizeSceneCardV1(lyrics, bible, state, candidate);
    if (!card && accepted.length === 0) {
      const checkpoint = checkpointRollingPerformanceStateV1(lyrics, bible, candidate.fromLineIndex);
      if (checkpoint && checkpoint.stateHash === candidate.entryStateHash) {
        card = sanitizeSceneCardV1(lyrics, bible, checkpoint, candidate);
        if (card) state = checkpoint;
      }
    }
    if (!card) break;
    accepted.push(card);
    state = advanceRollingPerformanceStateV1(state, card);
  }
  if (accepted.length === 0) return local;
  const cardByLine = new Map<number, SceneCardV1>();
  accepted.forEach((card) => linesInRange(lyrics, card.fromLineIndex, card.toLineIndex).forEach((line) => cardByLine.set(line.lineIndex, card)));
  const sections: DirectorSectionV1[] = [];
  let cursor = 0;
  while (cursor < lyrics.lines.length) {
    const line = lyrics.lines[cursor]!;
    const card = cardByLine.get(line.lineIndex);
    if (card && line.lineIndex === card.fromLineIndex) {
      sections.push(sectionForCard(card, sections.length % 12));
      while (cursor < lyrics.lines.length && lyrics.lines[cursor]!.lineIndex <= card.toLineIndex) cursor += 1;
      continue;
    }
    const localSection = local.sections.find((section) => line.lineIndex >= section.fromLineIndex && line.lineIndex <= section.toLineIndex)!;
    const start = cursor;
    while (cursor + 1 < lyrics.lines.length) {
      const next = lyrics.lines[cursor + 1]!;
      if (cardByLine.has(next.lineIndex) || next.lineIndex > localSection.toLineIndex) break;
      cursor += 1;
    }
    const range = lyrics.lines.slice(start, cursor + 1);
    sections.push({
      ...localSection,
      id: `rolling-local:${sections.length}:${range[0]!.lineIndex}-${range.at(-1)!.lineIndex}`,
      fromLineIndex: range[0]!.lineIndex,
      toLineIndex: range.at(-1)!.lineIndex,
      fromMs: range[0]!.fromMs,
      toMs: Math.max(...range.map((item) => item.toMs)),
    });
    cursor += 1;
  }
  const actSectionIndex = (actIndex: number): number => {
    const lineIndex = bible.acts[actIndex]?.fromLineIndex;
    return Math.max(0, sections.findIndex((section) => lineIndex !== undefined && lineIndex >= section.fromLineIndex && lineIndex <= section.toLineIndex));
  };
  const proposedBlocking: SongBlockingV1 = {
    version: "song-blocking-v1",
    baseLayout: bible.layoutBudget.baseLayout,
    transitions: bible.layoutBudget.proposedTransitions.map((transition) => ({
      ...transition,
      atSectionIndex: actSectionIndex(transition.atSectionIndex),
      evidence: {
        ...transition.evidence,
        lineIndices: transition.evidence.lineIndices.filter((lineIndex) => {
          const section = sections[actSectionIndex(transition.atSectionIndex)];
          return section && lineIndex >= section.fromLineIndex && lineIndex <= section.toLineIndex;
        }),
      },
    })),
  };
  const blocking = sanitizeSongBlockingV1(proposedBlocking, sections) ?? local.blocking;
  const blockedSections = applySongBlockingV1(sections, blocking);
  const sectionByCard = new Map(accepted.map((card) => [card.sceneID, blockedSections.find((section) => section.id === `rolling:${card.sceneID}`)!]));
  const cardEffects = accepted.flatMap((card) => card.effects.map((effect) => {
    const section = sectionByCard.get(card.sceneID)!;
    const cueScoped = effect.cardID === "custom" && effect.id.startsWith("director-v2-");
    return {
      ...effect,
      sectionID: section.id,
      fromMs: cueScoped || effect.presentation === "hero" ? effect.fromMs : section.fromMs,
      toMs: cueScoped || effect.presentation === "hero" ? effect.toMs : section.toMs,
    };
  }));
  const coveredLines = new Set(cardByLine.keys());
  const localGestures = local.gestures.filter((gesture) => !coveredLines.has(gesture.lineIndex));
  const gestures = sanitizeLyricGesturesV1(lyrics, [...localGestures, ...accepted.flatMap((card) => card.gestures)]) ?? local.gestures;
  const localEffects = compileLocalEffectRecipesV1(lyrics, blockedSections, bible.motifActor.relationship)
    .filter((effect) => !accepted.some((card) => effect.evidence.lineIndices.some((lineIndex) => lineIndex >= card.fromLineIndex && lineIndex <= card.toLineIndex)));
  const effects = [...localEffects, ...cardEffects].filter((effect) => {
    const section = blockedSections.find((item) => item.id === effect.sectionID);
    return section ? validateEffectRecipeV1(effect, section, new Set(lyrics.lines.map((line) => line.lineIndex))) : false;
  });
  const acceptedMomentByAnchorID = new Map(accepted.flatMap((card) => card.signatureMoment
    ? [[card.signatureMoment.id, card.signatureMoment] as const]
    : []));
  const mixedDramaticScore = sanitizeDramaticScoreV1(lyrics, {
    version: "dramatic-score-v1",
    premise: bible.premise,
    emotionalArc: bible.emotionalArc,
    acts: bible.acts,
    motifActor: bible.motifActor,
    signatureMoments: bible.signatureAnchors.map((anchor, anchorIndex) =>
      acceptedMomentByAnchorID.get(anchor.id)
      ?? localSignatureMomentForAnchor(anchor, anchorIndex, bible.signatureAnchors.length)),
    quietWindows: bible.quietWindows,
  });
  const directedByLine = new Map(accepted.flatMap((card) => card.directives ?? []).map((directive) => [directive.lineIndex, directive]));
  const withoutIdentity: Omit<DirectorPlanV1, "planIdentity"> = {
    version: "director-plan-v1",
    recordingID: lyrics.recordingID,
    lyricsIdentity: bible.lyricsIdentity,
    source: source === "local" ? "local" : source,
    directorVersion: directedByLine.size > 0 ? "lyricstage-rolling-director-v2" : "lyricstage-rolling-director-v1",
    concept: bible.premise,
    motif: bible.motifActor.relationship,
    intensityArc: bible.emotionalArc,
    world: bible.world,
    blocking,
    sections: blockedSections,
    directives: local.directives.map((directive) => directedByLine.get(directive.lineIndex) ?? directive),
    effects,
    gestures,
    dramaticScore: mixedDramaticScore ?? local.dramaticScore,
  };
  const plan: DirectorPlanV1 = { ...withoutIdentity, planIdentity: planIdentity(withoutIdentity) };
  return isDirectorPlanV1ForLyrics(plan, lyrics) ? plan : local;
};

export const summarizeRollingPerformanceV1 = (
  bible: DirectorBibleV1,
  cards: readonly SceneCardV1[],
  state: RollingPerformanceStateV1,
): RollingDirectorSummaryV1 => ({
  version: "rolling-director-summary-v1",
  bibleIdentity: bible.bibleIdentity,
  acceptedSceneIDs: cards.map((card) => card.sceneID),
  coveredLineRanges: cards.map((card) => ({ fromLineIndex: card.fromLineIndex, toLineIndex: card.toLineIndex })),
  unresolvedPromiseIDs: [...state.unresolvedPromiseIDs],
});
