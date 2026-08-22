import { stableHash32, type LyricDocumentV0, type LyricLineV0 } from "@lyricstage/contracts";
import {
  compileLocalEffectRecipesV1,
  effectCardsV1,
  effectPrimitiveRegistryV1,
  validateEffectRecipeV1,
  type EffectCardIDV1,
  type EffectPrimitiveIDV1,
  type EffectPrimitiveUseV1,
  type EffectRecipeV1,
  type PerformanceTriggerV1,
  type StagePresentationV1,
} from "./effectGrammar";
import {
  applySongBlockingV1,
  blockingFromSectionsV1,
  compileLocalLyricGesturesV1,
  sanitizeLyricGesturesV1,
  sanitizeSongBlockingV1,
  type LyricGestureV1,
  type SongBlockingV1,
} from "./lyricChoreography";
import {
  compileLocalDramaticScoreV1,
  sanitizeDramaticScoreV1,
  type DramaticScoreV1,
} from "./dramaticScore";

export type PerformanceArtDirectionV1 =
  | "editorialKinetic"
  | "neonRail"
  | "paperCut"
  | "liquidMemory"
  | "monoImpact"
  | "celestialGrid";

export type PerformanceLayoutV1 =
  | "monument"
  | "editorialSplit"
  | "railLeading"
  | "railTrailing"
  | "duetDivide";

export type PerformanceTypographyV1 =
  | "jpGothic"
  | "jpMincho"
  | "cjkGrotesk"
  | "latinDisplay"
  | "monoEditorial";

export type PerformanceBehaviorV1 =
  | "settle"
  | "assemble"
  | "gravityDrop"
  | "ripple"
  | "stretch"
  | "echo"
  | "drift"
  | "focus"
  | "converge";

export type PerformancePaletteRoleV1 = "primary" | "accent" | "warm" | "secondary";

export type PerformanceSpatialModeV1 =
  | "anchored"
  | "panoramic"
  | "cinematic"
  | "orbital"
  | "splitStage"
  | "chorusWall";

export type PerformanceMotionLawV1 =
  | "drift"
  | "flow"
  | "pulse"
  | "fall"
  | "orbit"
  | "converge"
  | "suspend"
  | "fracture";

export type PerformanceArtworkRoleV1 =
  | "anchor"
  | "portal"
  | "memory"
  | "counterpoint"
  | "atmosphere";

export type PerformanceTextureV1 = "silk" | "ink" | "mist" | "glass" | "paper" | "light";

export interface PerformanceWorldV1 {
  spatialMode: PerformanceSpatialModeV1;
  motionLaw: PerformanceMotionLawV1;
  artworkRole: PerformanceArtworkRoleV1;
  texture: PerformanceTextureV1;
  depth: number;
  fluidity: number;
  elasticity: number;
  atmosphere: number;
  rationale: string;
}

export interface DirectorSectionV1 {
  id: string;
  fromLineIndex: number;
  toLineIndex: number;
  fromMs: number;
  toMs: number;
  artDirection: PerformanceArtDirectionV1;
  layout: PerformanceLayoutV1;
  typography: PerformanceTypographyV1;
  paletteIndex: number;
  intensity: number;
}

export interface DirectorLineDirectiveV1 {
  lineIndex: number;
  behavior: PerformanceBehaviorV1;
  alignment: "leading" | "center" | "trailing";
  direction: -1 | 1;
  intensity: number;
  fontScale: number;
  glyphStagger: number;
  paletteRole: PerformancePaletteRoleV1;
}

export interface DirectorPlanV1 {
  version: "director-plan-v1";
  recordingID: string;
  lyricsIdentity: string;
  planIdentity: string;
  source: "local" | "ai" | "cache";
  directorVersion: string;
  concept: string;
  motif: string;
  intensityArc: string;
  world: PerformanceWorldV1;
  blocking: SongBlockingV1;
  sections: DirectorSectionV1[];
  directives: DirectorLineDirectiveV1[];
  effects: EffectRecipeV1[];
  gestures: LyricGestureV1[];
  dramaticScore: DramaticScoreV1;
}

export interface DirectorResolutionResponseV1 {
  type: "director-resolution-v1";
  status: "ready" | "unavailable" | "error";
  source: "cache" | "network" | "local";
  plan?: DirectorPlanV1;
  reason?: string;
}

export interface LegacyDirectorWireV1 {
  version: "lyric-performance-v4";
  directorVersion: string;
  trackID: string;
  lyricsHash: string;
  degraded?: boolean;
  partial?: boolean;
  stageBible?: {
    concept?: unknown;
    motif?: unknown;
    intensityArc?: unknown;
  };
  stageDirectives?: unknown;
}

export interface FullscreenDirectorWireV1 {
  version: "lyricstage-fullscreen-director-v1";
  directorVersion: string;
  trackID: string;
  recordingID: string;
  lyricsHash: string;
  lyricsIdentity: string;
  degraded?: boolean;
  concept?: unknown;
  motif?: unknown;
  intensityArc?: unknown;
  sections?: unknown;
  directives?: unknown;
}

export interface FullscreenDirectorWireV2 extends Omit<FullscreenDirectorWireV1, "version"> {
  version: "lyricstage-fullscreen-director-v2";
  world?: unknown;
  effects?: unknown;
}

export interface FullscreenDirectorWireV3 extends Omit<FullscreenDirectorWireV2, "version"> {
  version: "lyricstage-fullscreen-director-v3";
  blocking?: unknown;
  gestures?: unknown;
}

export interface FullscreenDirectorWireV4 extends Omit<FullscreenDirectorWireV3, "version"> {
  version: "lyricstage-fullscreen-director-v4";
  dramaticScore?: unknown;
}

const artDirections: PerformanceArtDirectionV1[] = [
  "editorialKinetic",
  "neonRail",
  "paperCut",
  "liquidMemory",
  "monoImpact",
  "celestialGrid",
];
const layouts: PerformanceLayoutV1[] = ["monument", "editorialSplit", "railLeading", "railTrailing"];
const allLayouts: PerformanceLayoutV1[] = [...layouts, "duetDivide"];
const typographies: PerformanceTypographyV1[] = [
  "jpGothic", "jpMincho", "cjkGrotesk", "latinDisplay", "monoEditorial",
];
const behaviors = new Set<PerformanceBehaviorV1>([
  "settle", "assemble", "gravityDrop", "ripple", "stretch", "echo", "drift", "focus", "converge",
]);
const alignments = new Set(["leading", "center", "trailing"] as const);
const paletteRoles = new Set<PerformancePaletteRoleV1>(["primary", "accent", "warm", "secondary"]);
const spatialModes = new Set<PerformanceSpatialModeV1>(["anchored", "panoramic", "cinematic", "orbital", "splitStage", "chorusWall"]);
const motionLaws = new Set<PerformanceMotionLawV1>(["drift", "flow", "pulse", "fall", "orbit", "converge", "suspend", "fracture"]);
const artworkRoles = new Set<PerformanceArtworkRoleV1>(["anchor", "portal", "memory", "counterpoint", "atmosphere"]);
const textures = new Set<PerformanceTextureV1>(["silk", "ink", "mist", "glass", "paper", "light"]);
const effectCardIDs = new Set<EffectCardIDV1>(effectCardsV1.map((card) => card.id));
const effectPrimitiveIDs = new Set<EffectPrimitiveIDV1>(Object.keys(effectPrimitiveRegistryV1) as EffectPrimitiveIDV1[]);
const effectTriggers = new Set<PerformanceTriggerV1>([
  "repeated_hook", "section_boundary", "silence_gap", "duet_overlap", "voice_handoff",
  "density_lift", "density_release", "semantic_distance", "semantic_motion", "semantic_contrast",
  "question_suspension", "collective_chorus", "final_resolution",
]);
const presentations = new Set<StagePresentationV1>(["reading", "section", "hero", "duet", "aperture"]);

const numericHash = (value: unknown): number => Number.parseInt(stableHash32(value), 16) >>> 0;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
const normalizeText = (text: string): string =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
const cleanString = (value: unknown, maximum: number): string =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const localPerformanceWorldV1 = (): PerformanceWorldV1 => ({
  spatialMode: "anchored",
  motionLaw: "drift",
  artworkRole: "anchor",
  texture: "silk",
  depth: 0.38,
  fluidity: 0.28,
  elasticity: 0.18,
  atmosphere: 0.52,
  rationale: "Stable cover-led reading keeps the local fallback calm and legible.",
});

const performanceWorldFromWireV1 = (
  value: unknown,
  seedInput: unknown,
  source: DirectorPlanV1["source"],
): PerformanceWorldV1 => {
  if (source === "local") return localPerformanceWorldV1();
  const seed = numericHash(seedInput);
  const fallback: PerformanceWorldV1 = {
    spatialMode: (["panoramic", "cinematic", "orbital", "splitStage", "chorusWall"] as const)[seed % 5]!,
    motionLaw: (["flow", "pulse", "fall", "orbit", "converge", "suspend", "fracture"] as const)[(seed >>> 3) % 7]!,
    artworkRole: (["portal", "memory", "counterpoint", "atmosphere"] as const)[(seed >>> 6) % 4]!,
    texture: (["ink", "mist", "glass", "paper", "light"] as const)[(seed >>> 9) % 5]!,
    depth: 0.56,
    fluidity: 0.58,
    elasticity: 0.48,
    atmosphere: 0.72,
    rationale: "The directed concept establishes a distinct full-stage visual world.",
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const wire = value as Record<string, unknown>;
  const spatialMode = cleanString(wire.spatialMode, 30) as PerformanceSpatialModeV1;
  const motionLaw = cleanString(wire.motionLaw, 30) as PerformanceMotionLawV1;
  const artworkRole = cleanString(wire.artworkRole, 30) as PerformanceArtworkRoleV1;
  const texture = cleanString(wire.texture, 30) as PerformanceTextureV1;
  return {
    spatialMode: spatialModes.has(spatialMode) ? spatialMode : fallback.spatialMode,
    motionLaw: motionLaws.has(motionLaw) ? motionLaw : fallback.motionLaw,
    artworkRole: artworkRoles.has(artworkRole) ? artworkRole : fallback.artworkRole,
    texture: textures.has(texture) ? texture : fallback.texture,
    depth: clamp(finite(wire.depth, fallback.depth), 0, 1),
    fluidity: clamp(finite(wire.fluidity, fallback.fluidity), 0, 1),
    elasticity: clamp(finite(wire.elasticity, fallback.elasticity), 0, 1),
    atmosphere: clamp(finite(wire.atmosphere, fallback.atmosphere), 0, 1),
    rationale: cleanString(wire.rationale, 320) || fallback.rationale,
  };
};

const containsJapanese = (text: string): boolean => /[\u3040-\u30ff]/u.test(text);
const containsCJK = (text: string): boolean => /[\u3400-\u9fff]/u.test(text);
const typographyFor = (lyrics: LyricDocumentV0, _seed: number): PerformanceTypographyV1 => {
  const body = lyrics.lines.map((line) => line.text).join("");
  if (containsJapanese(body)) return "jpGothic";
  if (containsCJK(body)) return "cjkGrotesk";
  return "latinDisplay";
};

const repeatedCounts = (lyrics: LyricDocumentV0): Map<string, number> => {
  const counts = new Map<string, number>();
  lyrics.lines.forEach((line) => {
    const key = normalizeText(line.text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
};

const hasDuet = (lines: LyricLineV0[]): boolean => lines.some((line, index) =>
  lines.some((candidate, candidateIndex) =>
    index !== candidateIndex
    && line.fromMs < candidate.toMs
    && candidate.fromMs < line.toMs
  )
);

const sectionRanges = (lyrics: LyricDocumentV0): Array<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (let index = 1; index < lyrics.lines.length; index += 1) {
    const previous = lyrics.lines[index - 1]!;
    const current = lyrics.lines[index]!;
    const gap = current.fromMs - previous.toMs;
    const length = index - start;
    if (gap >= 2_800 || length >= 6) {
      ranges.push([start, index - 1]);
      start = index;
    }
  }
  ranges.push([start, lyrics.lines.length - 1]);
  return ranges;
};

const planIdentity = (plan: Omit<DirectorPlanV1, "planIdentity"> | DirectorPlanV1): string => stableHash32({
  ...plan,
  planIdentity: undefined,
});

const finalizePlan = (plan: Omit<DirectorPlanV1, "planIdentity">): DirectorPlanV1 => ({
  ...plan,
  planIdentity: planIdentity(plan),
});

export const compileLocalDirectorPlanV1 = (lyrics: LyricDocumentV0): DirectorPlanV1 => {
  const lyricsIdentity = stableHash32(lyrics);
  const seed = numericHash([lyrics.recordingID, lyricsIdentity]);
  const counts = repeatedCounts(lyrics);
  const typography = typographyFor(lyrics, seed);
  const ranges = sectionRanges(lyrics);
  const sections = ranges.map<DirectorSectionV1>(([fromLineIndex, toLineIndex], sectionIndex) => {
    const lines = lyrics.lines.slice(fromLineIndex, toLineIndex + 1);
    const repeated = lines.some((line) => (counts.get(normalizeText(line.text)) ?? 1) > 1);
    const duet = hasDuet(lines);
    const finalSection = sectionIndex === ranges.length - 1;
    const artDirection: PerformanceArtDirectionV1 = duet
      ? "liquidMemory"
      : repeated
        ? "editorialKinetic"
        : finalSection
          ? "monoImpact"
          : sectionIndex % 2 === 0
            ? "liquidMemory"
            : "paperCut";
    const layout: PerformanceLayoutV1 = duet
      ? "duetDivide"
      : "monument";
    return {
      id: `local:${sectionIndex}:${fromLineIndex}-${toLineIndex}`,
      fromLineIndex,
      toLineIndex,
      fromMs: lines[0]!.fromMs,
      toMs: Math.max(...lines.map((line) => line.toMs)),
      artDirection,
      layout,
      typography,
      paletteIndex: (seed + sectionIndex * 5) % 12,
      intensity: repeated ? 0.86 : duet ? 0.78 : clamp(0.38 + sectionIndex * 0.065, 0.38, 0.66),
    };
  });
  const directives = lyrics.lines.map<DirectorLineDirectiveV1>((line) => {
    const repetition = counts.get(normalizeText(line.text)) ?? 1;
    const overlapping = lyrics.lines.some((candidate) =>
      candidate.lineIndex !== line.lineIndex
      && line.fromMs < candidate.toMs
      && candidate.fromMs < line.toMs
    );
    const behavior: PerformanceBehaviorV1 = overlapping
      ? "converge"
      : repetition > 1
        ? "echo"
        : (["settle", "assemble", "focus", "drift"] as const)[line.lineIndex % 4]!;
    return {
      lineIndex: line.lineIndex,
      behavior,
      alignment: overlapping
        ? line.voiceRole === "duetB" ? "trailing" : "leading"
        : "leading",
      direction: line.lineIndex % 2 === 0 ? 1 : -1,
      intensity: repetition > 1 ? 0.94 : overlapping ? 0.88 : 0.58,
      fontScale: repetition > 1 ? 1.08 : 1,
      glyphStagger: line.words?.length ? 0.035 : 0,
      paletteRole: repetition > 1 ? "accent" : overlapping ? "secondary" : "primary",
    };
  });
  const motif = "cover-led editorial atmosphere";
  const blocking = blockingFromSectionsV1(sections);
  const blockedSections = applySongBlockingV1(sections, blocking);
  return finalizePlan({
    version: "director-plan-v1",
    recordingID: lyrics.recordingID,
    lyricsIdentity,
    source: "local",
    directorVersion: "lyricstage-web-local-director-v1",
    concept: sections[0]?.artDirection ?? "editorialKinetic",
    motif,
    intensityArc: "quiet verses, structural lifts, repeated hooks resolve with memory",
    world: localPerformanceWorldV1(),
    blocking,
    sections: blockedSections,
    directives,
    effects: compileLocalEffectRecipesV1(lyrics, blockedSections, motif),
    gestures: compileLocalLyricGesturesV1(lyrics),
    dramaticScore: compileLocalDramaticScoreV1(lyrics, blockedSections),
  });
};

const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const sanitizeWireDirective = (
  value: unknown,
  validLineIndices: Set<number>,
): DirectorLineDirectiveV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Record<string, unknown>;
  const lineIndex = Number.isInteger(wire.lineIndex) ? wire.lineIndex as number : -1;
  const behavior = cleanString(wire.behavior, 30) as PerformanceBehaviorV1;
  if (!validLineIndices.has(lineIndex) || !behaviors.has(behavior)) return null;
  const alignmentValue = cleanString(wire.alignment, 20) as DirectorLineDirectiveV1["alignment"];
  const paletteValue = cleanString(wire.paletteRole, 20) as PerformancePaletteRoleV1;
  return {
    lineIndex,
    behavior,
    alignment: alignments.has(alignmentValue) ? alignmentValue : "center",
    direction: finite(wire.direction, 1) < 0 ? -1 : 1,
    intensity: clamp(finite(wire.intensity, 0.72), 0.35, 1.25),
    fontScale: clamp(finite(wire.fontScale, 1), 0.78, 1.22),
    glyphStagger: clamp(finite(wire.glyphStagger, 0.04), 0, 0.14),
    paletteRole: paletteRoles.has(paletteValue) ? paletteValue : "primary",
  };
};

const sanitizePrimitiveUse = (value: unknown): EffectPrimitiveUseV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Record<string, unknown>;
  const primitive = cleanString(wire.primitive, 40) as EffectPrimitiveIDV1;
  if (!effectPrimitiveIDs.has(primitive)) return null;
  const output: EffectPrimitiveUseV1 = {
    primitive,
    intensity: clamp(finite(wire.intensity, 0.65), 0, 1),
  };
  if (wire.direction === -1 || wire.direction === 1) output.direction = wire.direction;
  if (typeof wire.scale === "number" && Number.isFinite(wire.scale)) output.scale = clamp(wire.scale, 0.4, 1.2);
  return output;
};

const sanitizeWireEffect = (
  value: unknown,
  sections: DirectorSectionV1[],
  lyrics: LyricDocumentV0,
  validLineIndices: Set<number>,
): EffectRecipeV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Record<string, unknown>;
  if (wire.version !== "effect-recipe-v1") return null;
  const sectionID = cleanString(wire.sectionID, 120);
  const section = sections.find((candidate) => candidate.id === sectionID);
  const cardValue = cleanString(wire.cardID, 60);
  const cardID = cardValue === "custom" || effectCardIDs.has(cardValue as EffectCardIDV1)
    ? cardValue as EffectCardIDV1 | "custom"
    : null;
  const presentation = cleanString(wire.presentation, 24) as StagePresentationV1;
  const primary = sanitizePrimitiveUse(wire.primary);
  const support = Array.isArray(wire.support) ? wire.support.map(sanitizePrimitiveUse) : [];
  const evidenceWire = wire.evidence && typeof wire.evidence === "object" && !Array.isArray(wire.evidence)
    ? wire.evidence as Record<string, unknown>
    : null;
  if (!section || !cardID || !presentations.has(presentation) || !primary || support.some((item) => !item) || !evidenceWire) return null;
  const sectionTriggers = Array.isArray(evidenceWire.sectionTriggers)
    ? evidenceWire.sectionTriggers.map((trigger) => cleanString(trigger, 40) as PerformanceTriggerV1)
    : [];
  if (sectionTriggers.some((trigger) => !effectTriggers.has(trigger))) return null;
  const lineIndices = Array.isArray(evidenceWire.lineIndices)
    ? evidenceWire.lineIndices.filter((lineIndex): lineIndex is number => Number.isInteger(lineIndex))
    : [];
  const targetLine = lyrics.lines.find((line) => line.lineIndex === lineIndices[0]);
  if (presentation === "hero" && !targetLine) return null;
  const recipe: EffectRecipeV1 = {
    version: "effect-recipe-v1",
    id: cleanString(wire.id, 160) || `ai-effect:${section.id}:${cardID}`,
    cardID,
    sectionID: section.id,
    fromMs: presentation === "hero" ? targetLine!.fromMs : section.fromMs,
    toMs: presentation === "hero" ? targetLine!.toMs : section.toMs,
    presentation,
    primary,
    support: support as EffectPrimitiveUseV1[],
    evidence: {
      songMotif: cleanString(evidenceWire.songMotif, 160),
      sectionTriggers,
      lineIndices,
      rationale: cleanString(evidenceWire.rationale, 400),
      confidence: clamp(finite(evidenceWire.confidence, 0), 0, 1),
    },
  };
  return validateEffectRecipeV1(recipe, section, validLineIndices) ? recipe : null;
};

export const adaptLegacyDirectorResponseV1 = (
  lyrics: LyricDocumentV0,
  expectedTrackID: string,
  expectedLyricsHash: string,
  value: unknown,
  source: "ai" | "cache" = "ai",
): DirectorPlanV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Partial<LegacyDirectorWireV1>;
  if (
    wire.version !== "lyric-performance-v4"
    || wire.trackID !== expectedTrackID
    || wire.lyricsHash !== expectedLyricsHash
    || wire.degraded === true
    || wire.partial === true
  ) return null;
  const directorVersion = cleanString(wire.directorVersion, 120);
  const concept = cleanString(wire.stageBible?.concept, 160);
  const motif = cleanString(wire.stageBible?.motif, 160);
  const intensityArc = cleanString(wire.stageBible?.intensityArc, 200);
  if (!directorVersion || !concept || !motif) return null;

  const local = compileLocalDirectorPlanV1(lyrics);
  const validLineIndices = new Set(lyrics.lines.map((line) => line.lineIndex));
  const remoteByLine = new Map<number, DirectorLineDirectiveV1>();
  if (Array.isArray(wire.stageDirectives)) {
    wire.stageDirectives.forEach((candidate) => {
      const directive = sanitizeWireDirective(candidate, validLineIndices);
      if (directive && !remoteByLine.has(directive.lineIndex)) remoteByLine.set(directive.lineIndex, directive);
    });
  }
  if (remoteByLine.size === 0) return null;

  const artSeed = numericHash([concept, motif, directorVersion]);
  const sections = local.sections.map((section, index) => {
    const directed = Array.from(remoteByLine.values()).filter((directive) =>
      directive.lineIndex >= section.fromLineIndex && directive.lineIndex <= section.toLineIndex
    );
    const directedIntensity = directed.length > 0
      ? directed.reduce((total, directive) => total + directive.intensity, 0) / directed.length
      : section.intensity;
    return {
      ...section,
      id: `ai:${index}:${section.fromLineIndex}-${section.toLineIndex}`,
      artDirection: artDirections[(artSeed + index * 7) % artDirections.length]!,
      paletteIndex: (artSeed + index * 5) % 12,
      intensity: clamp(directedIntensity, 0.35, 1),
    };
  });
  const directives = local.directives.map((directive) => remoteByLine.get(directive.lineIndex) ?? directive);
  const blocking = blockingFromSectionsV1(sections);
  const blockedSections = applySongBlockingV1(sections, blocking);
  return finalizePlan({
    version: "director-plan-v1",
    recordingID: lyrics.recordingID,
    lyricsIdentity: stableHash32(lyrics),
    source,
    directorVersion,
    concept,
    motif,
    intensityArc: intensityArc || local.intensityArc,
    world: performanceWorldFromWireV1(undefined, [concept, motif, directorVersion], source),
    blocking,
    sections: blockedSections,
    directives,
    effects: compileLocalEffectRecipesV1(lyrics, blockedSections, motif),
    gestures: local.gestures,
    dramaticScore: compileLocalDramaticScoreV1(lyrics, blockedSections),
  });
};

export const adaptFullscreenDirectorResponseV1 = (
  lyrics: LyricDocumentV0,
  expectedTrackID: string,
  expectedLyricsHash: string,
  value: unknown,
  source: "ai" | "cache" = "ai",
): DirectorPlanV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Partial<FullscreenDirectorWireV1>;
  const lyricsIdentity = stableHash32(lyrics);
  if (
    wire.version !== "lyricstage-fullscreen-director-v1"
    || wire.trackID !== expectedTrackID
    || wire.recordingID !== lyrics.recordingID
    || wire.lyricsHash !== expectedLyricsHash
    || wire.lyricsIdentity !== lyricsIdentity
    || wire.degraded === true
  ) return null;
  const directorVersion = cleanString(wire.directorVersion, 120);
  const concept = cleanString(wire.concept, 160);
  const motif = cleanString(wire.motif, 160);
  const intensityArc = cleanString(wire.intensityArc, 200);
  if (!directorVersion || !concept || !motif || !intensityArc) return null;

  const validLines = new Map(lyrics.lines.map((line) => [line.lineIndex, line]));
  if (!Array.isArray(wire.sections) || !Array.isArray(wire.directives)) return null;
  const sections: DirectorSectionV1[] = [];
  for (const [index, candidate] of wire.sections.entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const raw = candidate as Record<string, unknown>;
    const fromLineIndex = Number.isInteger(raw.fromLineIndex) ? raw.fromLineIndex as number : -1;
    const toLineIndex = Number.isInteger(raw.toLineIndex) ? raw.toLineIndex as number : -1;
    const first = validLines.get(fromLineIndex);
    const last = validLines.get(toLineIndex);
    const artDirection = cleanString(raw.artDirection, 30) as PerformanceArtDirectionV1;
    const layout = cleanString(raw.layout, 30) as PerformanceLayoutV1;
    const typography = cleanString(raw.typography, 30) as PerformanceTypographyV1;
    if (
      !first || !last || fromLineIndex > toLineIndex
      || (index > 0 && fromLineIndex !== sections[index - 1]!.toLineIndex + 1)
      || !artDirections.includes(artDirection)
      || !allLayouts.includes(layout)
      || !typographies.includes(typography)
    ) return null;
    const paletteIndex = Number.isInteger(raw.paletteIndex) ? raw.paletteIndex as number : -1;
    if (paletteIndex < 0 || paletteIndex >= 12) return null;
    const covered = lyrics.lines.filter((line) => line.lineIndex >= fromLineIndex && line.lineIndex <= toLineIndex);
    sections.push({
      id: `ai:${index}:${fromLineIndex}-${toLineIndex}`,
      fromLineIndex,
      toLineIndex,
      fromMs: first.fromMs,
      toMs: Math.max(...covered.map((line) => line.toMs)),
      artDirection,
      layout,
      typography,
      paletteIndex,
      intensity: clamp(finite(raw.intensity, 0.65), 0, 1),
    });
  }
  const firstLineIndex = lyrics.lines[0]?.lineIndex;
  const lastLineIndex = lyrics.lines.at(-1)?.lineIndex;
  if (
    sections.length === 0
    || sections[0]!.fromLineIndex !== firstLineIndex
    || sections.at(-1)!.toLineIndex !== lastLineIndex
  ) return null;

  const directivesByLine = new Map<number, DirectorLineDirectiveV1>();
  for (const candidate of wire.directives) {
    const directive = sanitizeWireDirective(candidate, new Set(validLines.keys()));
    if (!directive || directivesByLine.has(directive.lineIndex)) return null;
    directivesByLine.set(directive.lineIndex, directive);
  }
  const directives = lyrics.lines.map((line) => directivesByLine.get(line.lineIndex)).filter(Boolean) as DirectorLineDirectiveV1[];
  if (directives.length !== lyrics.lines.length) return null;
  const blocking = blockingFromSectionsV1(sections);
  const blockedSections = applySongBlockingV1(sections, blocking);
  return finalizePlan({
    version: "director-plan-v1",
    recordingID: lyrics.recordingID,
    lyricsIdentity,
    source,
    directorVersion,
    concept,
    motif,
    intensityArc,
    world: performanceWorldFromWireV1((wire as Record<string, unknown>).world, [concept, motif, directorVersion], source),
    blocking,
    sections: blockedSections,
    directives,
    effects: compileLocalEffectRecipesV1(lyrics, blockedSections, motif),
    gestures: compileLocalLyricGesturesV1(lyrics),
    dramaticScore: compileLocalDramaticScoreV1(lyrics, blockedSections),
  });
};

export const adaptFullscreenDirectorResponseV2 = (
  lyrics: LyricDocumentV0,
  expectedTrackID: string,
  expectedLyricsHash: string,
  value: unknown,
  source: "ai" | "cache" = "ai",
): DirectorPlanV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Partial<FullscreenDirectorWireV2>;
  if (wire.version !== "lyricstage-fullscreen-director-v2" || !Array.isArray(wire.effects)) return null;
  const base = adaptFullscreenDirectorResponseV1(lyrics, expectedTrackID, expectedLyricsHash, {
    ...wire,
    version: "lyricstage-fullscreen-director-v1",
  }, source);
  if (!base) return null;
  const validLines = new Set(lyrics.lines.map((line) => line.lineIndex));
  const effects = wire.effects.map((effect) => sanitizeWireEffect(effect, base.sections, lyrics, validLines));
  if (effects.some((effect) => !effect)) return null;
  const typedEffects = effects as EffectRecipeV1[];
  if (new Set(typedEffects.map((effect) => effect.sectionID)).size !== typedEffects.length) return null;
  const resolvedEffects = typedEffects.length > 0
    ? typedEffects
    : compileLocalEffectRecipesV1(lyrics, base.sections, base.motif);
  const { planIdentity: _ignored, ...withoutIdentity } = base;
  return finalizePlan({
    ...withoutIdentity,
    world: performanceWorldFromWireV1(wire.world, [base.concept, base.motif, base.directorVersion], source),
    effects: resolvedEffects,
  });
};

export const adaptFullscreenDirectorResponseV3 = (
  lyrics: LyricDocumentV0,
  expectedTrackID: string,
  expectedLyricsHash: string,
  value: unknown,
  source: "ai" | "cache" = "ai",
): DirectorPlanV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Partial<FullscreenDirectorWireV3>;
  if (
    wire.version !== "lyricstage-fullscreen-director-v3"
    || !Array.isArray(wire.effects)
    || !Array.isArray(wire.gestures)
  ) return null;
  const base = adaptFullscreenDirectorResponseV2(lyrics, expectedTrackID, expectedLyricsHash, {
    ...wire,
    version: "lyricstage-fullscreen-director-v2",
  }, source);
  if (!base) return null;
  const blocking = sanitizeSongBlockingV1(wire.blocking, base.sections);
  const gestures = sanitizeLyricGesturesV1(lyrics, wire.gestures);
  if (!blocking || !gestures || gestures.length === 0) return null;
  const sections = applySongBlockingV1(base.sections, blocking);
  const { planIdentity: _ignored, ...withoutIdentity } = base;
  return finalizePlan({ ...withoutIdentity, blocking, sections, gestures });
};

export const adaptFullscreenDirectorResponseV4 = (
  lyrics: LyricDocumentV0,
  expectedTrackID: string,
  expectedLyricsHash: string,
  value: unknown,
  source: "ai" | "cache" = "ai",
): DirectorPlanV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Partial<FullscreenDirectorWireV4>;
  if (wire.version !== "lyricstage-fullscreen-director-v4") return null;
  const base = adaptFullscreenDirectorResponseV3(lyrics, expectedTrackID, expectedLyricsHash, {
    ...wire,
    version: "lyricstage-fullscreen-director-v3",
  }, source);
  if (!base) return null;
  const dramaticScore = sanitizeDramaticScoreV1(lyrics, wire.dramaticScore);
  if (!dramaticScore) return null;
  const { planIdentity: _ignored, ...withoutIdentity } = base;
  return finalizePlan({ ...withoutIdentity, dramaticScore });
};

export const isDirectorPlanV1ForLyrics = (
  value: unknown,
  lyrics: LyricDocumentV0,
): value is DirectorPlanV1 => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as Partial<DirectorPlanV1>;
  if (
    plan.version !== "director-plan-v1"
    || plan.recordingID !== lyrics.recordingID
    || plan.lyricsIdentity !== stableHash32(lyrics)
    || !cleanString(plan.planIdentity, 80)
    || !cleanString(plan.directorVersion, 120)
    || !cleanString(plan.concept, 160)
    || !cleanString(plan.motif, 160)
    || !cleanString(plan.intensityArc, 200)
    || !plan.world
    || !plan.blocking
    || (plan.source !== "local" && plan.source !== "ai" && plan.source !== "cache")
    || !Array.isArray(plan.sections)
    || plan.sections.length === 0
    || !Array.isArray(plan.directives)
    || !Array.isArray(plan.effects)
    || !Array.isArray(plan.gestures)
    || !plan.dramaticScore
  ) return false;
  const complete = plan as DirectorPlanV1;
  if (complete.planIdentity !== planIdentity(complete)) return false;
  const lineIndices = lyrics.lines.map((line) => line.lineIndex);
  const validLines = new Set(lineIndices);
  const sectionsCoverLyrics = complete.sections[0]?.fromLineIndex === lineIndices[0]
    && complete.sections.at(-1)?.toLineIndex === lineIndices.at(-1)
    && complete.sections.every((section, index) => index === 0
      || section.fromLineIndex === complete.sections[index - 1]!.toLineIndex + 1);
  if (!sectionsCoverLyrics || complete.directives.length !== lyrics.lines.length) return false;
  const directiveLines = new Set<number>();
  const validEffects = complete.effects.every((effect) => {
    const section = complete.sections.find((candidate) => candidate.id === effect.sectionID);
    return section ? validateEffectRecipeV1(effect, section, validLines) : false;
  });
  const validWorld = spatialModes.has(complete.world.spatialMode)
    && motionLaws.has(complete.world.motionLaw)
    && artworkRoles.has(complete.world.artworkRole)
    && textures.has(complete.world.texture)
    && [complete.world.depth, complete.world.fluidity, complete.world.elasticity, complete.world.atmosphere]
      .every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && cleanString(complete.world.rationale, 320).length > 0;
  const validBlocking = sanitizeSongBlockingV1(complete.blocking, complete.sections);
  const validGestures = sanitizeLyricGesturesV1(lyrics, complete.gestures);
  const validDramaticScore = sanitizeDramaticScoreV1(lyrics, complete.dramaticScore);
  const blockedLayoutsMatch = validBlocking
    ? applySongBlockingV1(complete.sections, validBlocking).every((section, index) => section.layout === complete.sections[index]!.layout)
    : false;
  return validWorld && validEffects && Boolean(validBlocking) && Boolean(validGestures) && Boolean(validDramaticScore) && blockedLayoutsMatch && complete.sections.every((section) => (
    section
    && Number.isInteger(section.fromLineIndex)
    && Number.isInteger(section.toLineIndex)
    && validLines.has(section.fromLineIndex)
    && validLines.has(section.toLineIndex)
    && section.fromLineIndex <= section.toLineIndex
    && typeof section.fromMs === "number"
    && typeof section.toMs === "number"
    && section.fromMs < section.toMs
    && artDirections.includes(section.artDirection)
    && allLayouts.includes(section.layout)
    && typographies.includes(section.typography)
    && Number.isInteger(section.paletteIndex)
    && section.paletteIndex >= 0
    && section.paletteIndex < 12
    && Number.isFinite(section.intensity)
    && section.intensity >= 0
    && section.intensity <= 1
  )) && complete.directives.every((directive) => (
    directive
    && validLines.has(directive.lineIndex)
    && behaviors.has(directive.behavior)
    && !directiveLines.has(directive.lineIndex)
    && directiveLines.add(directive.lineIndex)
    && alignments.has(directive.alignment)
    && (directive.direction === -1 || directive.direction === 1)
    && Number.isFinite(directive.intensity)
    && directive.intensity >= 0.35
    && directive.intensity <= 1.25
    && Number.isFinite(directive.fontScale)
    && directive.fontScale >= 0.78
    && directive.fontScale <= 1.22
    && Number.isFinite(directive.glyphStagger)
    && directive.glyphStagger >= 0
    && directive.glyphStagger <= 0.14
    && paletteRoles.has(directive.paletteRole)
  ));
};

export const directorSectionAtV1 = (
  plan: DirectorPlanV1,
  timeMs: number,
): DirectorSectionV1 => timeMs < plan.sections[0]!.fromMs
  ? plan.sections[0]!
  : plan.sections.find((section) => timeMs >= section.fromMs && timeMs < section.toMs)
    ?? plan.sections.at(-1)!;

export interface DirectorPlanHandoffV1 {
  active: DirectorPlanV1;
  pending?: DirectorPlanV1;
  activateAtMs?: number;
}

export const queueDirectorPlanV1 = (
  state: DirectorPlanHandoffV1,
  next: DirectorPlanV1,
  currentTimeMs: number,
): DirectorPlanHandoffV1 => {
  if (
    next.recordingID !== state.active.recordingID
    || next.lyricsIdentity !== state.active.lyricsIdentity
    || next.planIdentity === state.active.planIdentity
  ) return state;
  const activateAtMs = next.sections
    .map((section) => section.fromMs)
    .find((fromMs) => fromMs > currentTimeMs + 80);
  return activateAtMs === undefined
    ? state
    : { active: state.active, pending: next, activateAtMs };
};

export const sampleDirectorPlanHandoffV1 = (
  state: DirectorPlanHandoffV1,
  timeMs: number,
): DirectorPlanHandoffV1 => state.pending && state.activateAtMs !== undefined && timeMs >= state.activateAtMs
  ? { active: state.pending }
  : state;

export const directorPlanToRecipeV0 = (plan: DirectorPlanV1) => ({
  version: "director-recipe-v0" as const,
  recordingID: plan.recordingID,
  lyricsHash: plan.lyricsIdentity,
  recipes: plan.directives.map((directive) => ({
    lineIndex: directive.lineIndex,
    family: directive.behavior === "echo"
      ? "chorusMemory" as const
      : directive.behavior === "focus" || directive.behavior === "stretch" || directive.behavior === "ripple"
        ? "semanticLens" as const
        : directive.behavior === "assemble" || directive.behavior === "converge" || directive.behavior === "gravityDrop"
          ? "railHandoff" as const
          : "fallback" as const,
    intensity: directive.intensity,
  })),
});
