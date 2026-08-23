import type { LyricDocumentV0, LyricLineV0 } from "@lyricstage/contracts";
import type {
  DirectorSectionV1,
  PerformanceLayoutV1,
  PerformancePaletteRoleV1,
} from "./directorPlan";

export type LayoutTransitionPurposeV1 =
  | "perspectiveShift"
  | "voiceReframe"
  | "silenceOpen"
  | "finalExpansion";

export type LayoutTransitionStrengthV1 = "major" | "exceptional";

export interface LayoutTransitionEvidenceV1 {
  sectionTriggers: string[];
  lineIndices: number[];
  audioLandmarkIDs: string[];
  rationale: string;
  confidence: number;
}

export interface LayoutTransitionV1 {
  atSectionIndex: number;
  toLayout: PerformanceLayoutV1;
  purpose: LayoutTransitionPurposeV1;
  strength: LayoutTransitionStrengthV1;
  evidence: LayoutTransitionEvidenceV1;
}

export interface SongBlockingV1 {
  version: "song-blocking-v1";
  baseLayout: PerformanceLayoutV1;
  transitions: LayoutTransitionV1[];
}

export type LyricGestureScopeV1 = "glyph" | "token" | "phrase";
export type LyricGestureDriverV1 = "lineEnter" | "wordWindow" | "lineHold" | "lineExit" | "structuralMoment";
export type LyricGestureSpaceV1 = "lyricLocal" | "lyricToArtwork" | "fullStage";
export type LyricGestureSemanticRoleV1 =
  | "identity"
  | "motion"
  | "distance"
  | "question"
  | "repetition"
  | "rupture"
  | "resolution"
  | "collective";

export type LyricGesturePrimitiveV1 =
  | "glyph.weightPulse"
  | "glyph.strokeTrace"
  | "glyph.offsetSnap"
  | "token.underlinePath"
  | "token.halo"
  | "token.echo"
  | "token.elasticFocus"
  | "phrase.breathe"
  | "phrase.arc"
  | "phrase.breakReform"
  | "phrase.handoff"
  | "phrase.contour";

export interface LyricGestureV1 {
  version: "lyric-gesture-v1";
  id: string;
  lineIndex: number;
  scope: LyricGestureScopeV1;
  target: {
    fromGrapheme: number;
    toGrapheme: number;
    expectedText: string;
  };
  primitive: LyricGesturePrimitiveV1;
  driver: LyricGestureDriverV1;
  space: LyricGestureSpaceV1;
  envelope: { attackMs: number; holdMs: number; releaseMs: number };
  intensity: number;
  direction: -1 | 1;
  paletteRole: PerformancePaletteRoleV1;
  evidence: {
    semanticRole: LyricGestureSemanticRoleV1;
    rationale: string;
    confidence: number;
  };
}

const layouts = new Set<PerformanceLayoutV1>(["monument", "editorialSplit", "railLeading", "railTrailing", "duetDivide"]);
const purposes = new Set<LayoutTransitionPurposeV1>(["perspectiveShift", "voiceReframe", "silenceOpen", "finalExpansion"]);
const scopes = new Set<LyricGestureScopeV1>(["glyph", "token", "phrase"]);
const drivers = new Set<LyricGestureDriverV1>(["lineEnter", "wordWindow", "lineHold", "lineExit", "structuralMoment"]);
const spaces = new Set<LyricGestureSpaceV1>(["lyricLocal", "lyricToArtwork", "fullStage"]);
const semanticRoles = new Set<LyricGestureSemanticRoleV1>(["identity", "motion", "distance", "question", "repetition", "rupture", "resolution", "collective"]);
const paletteRoles = new Set<PerformancePaletteRoleV1>(["primary", "accent", "warm", "secondary"]);
export const lyricGesturePrimitivesV1 = new Set<LyricGesturePrimitiveV1>([
  "glyph.weightPulse", "glyph.strokeTrace", "glyph.offsetSnap",
  "token.underlinePath", "token.halo", "token.echo", "token.elasticFocus",
  "phrase.breathe", "phrase.arc", "phrase.breakReform", "phrase.handoff", "phrase.contour",
]);

const clean = (value: unknown, maximum: number): string => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const finite = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

export const lyricGraphemesV1 = (text: string): string[] => {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (entry) => entry.segment);
  }
  return Array.from(text);
};

const exactWordRanges = (line: LyricLineV0): Array<{ from: number; to: number }> => {
  const linePieces = lyricGraphemesV1(line.text);
  const output: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  for (const word of line.words ?? []) {
    const wordPieces = lyricGraphemesV1(word.text);
    let match = -1;
    for (let start = cursor; start <= linePieces.length - wordPieces.length; start += 1) {
      if (wordPieces.every((piece, index) => linePieces[start + index] === piece)) {
        match = start;
        break;
      }
    }
    if (match < 0) continue;
    output.push({ from: match, to: match + wordPieces.length });
    cursor = match + wordPieces.length;
  }
  return output;
};

const evidenceCategories = (triggers: string[]): number => {
  const categories = new Set<string>();
  triggers.forEach((trigger) => {
    if (["section_boundary", "silence_gap", "final_resolution", "repeated_hook"].includes(trigger)) categories.add("structure");
    else if (["duet_overlap", "voice_handoff", "collective_chorus"].includes(trigger)) categories.add("voice");
    else if (trigger.startsWith("semantic_") || trigger === "question_suspension") categories.add("semantic");
    else if (trigger.startsWith("audio_") || trigger.startsWith("density_")) categories.add("audio");
  });
  return categories.size;
};

const transitionPurposeMatchesEvidence = (purpose: LayoutTransitionPurposeV1, triggers: string[]): boolean => {
  const evidence = new Set(triggers);
  if (purpose === "voiceReframe") {
    return ["duet_overlap", "voice_handoff", "collective_chorus"].some((trigger) => evidence.has(trigger));
  }
  if (purpose === "silenceOpen") {
    return evidence.has("silence_gap") || evidence.has("density_release");
  }
  if (purpose === "finalExpansion") {
    return evidence.has("final_resolution") && [
      "repeated_hook", "density_lift", "density_release", "collective_chorus",
      "semantic_distance", "semantic_motion", "semantic_contrast",
    ].some((trigger) => evidence.has(trigger));
  }
  return [
    "semantic_distance", "semantic_motion", "semantic_contrast", "question_suspension",
    "repeated_hook", "density_lift", "density_release",
  ].some((trigger) => evidence.has(trigger));
};

export const blockingFromSectionsV1 = (sections: DirectorSectionV1[]): SongBlockingV1 => {
  const baseLayout = sections[0]?.layout ?? "monument";
  const transitions: LayoutTransitionV1[] = [];
  let current = baseLayout;
  let previousSection = sections[0];
  sections.forEach((section, atSectionIndex) => {
    if (atSectionIndex === 0 || section.layout === current || transitions.length >= 4) return;
    if (previousSection && section.fromLineIndex - previousSection.fromLineIndex < 6 && section.fromMs - previousSection.fromMs < 20_000) return;
    transitions.push({
      atSectionIndex,
      toLayout: section.layout,
      purpose: section.layout === "duetDivide" ? "voiceReframe" : atSectionIndex === sections.length - 1 ? "finalExpansion" : "perspectiveShift",
      strength: "major",
      evidence: {
        sectionTriggers: [section.layout === "duetDivide" ? "duet_overlap" : atSectionIndex === sections.length - 1 ? "final_resolution" : "section_boundary", "density_lift"],
        lineIndices: [section.fromLineIndex],
        audioLandmarkIDs: [],
        rationale: "Compatibility blocking preserves the first two meaningful spatial changes.",
        confidence: 0.8,
      },
    });
    current = section.layout;
    previousSection = section;
  });
  return { version: "song-blocking-v1", baseLayout, transitions };
};

export const sanitizeSongBlockingV1 = (
  value: unknown,
  sections: DirectorSectionV1[],
): SongBlockingV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value) || sections.length === 0) return null;
  const wire = value as Record<string, unknown>;
  const baseLayout = clean(wire.baseLayout, 30) as PerformanceLayoutV1;
  if (wire.version !== "song-blocking-v1" || !layouts.has(baseLayout) || !Array.isArray(wire.transitions) || wire.transitions.length > 4) return null;
  const output: LayoutTransitionV1[] = [];
  let current = baseLayout;
  let previousSectionIndex = -1;
  for (const candidate of wire.transitions) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    const atSectionIndex = Number.isInteger(item.atSectionIndex) ? item.atSectionIndex as number : -1;
    const toLayout = clean(item.toLayout, 30) as PerformanceLayoutV1;
    const purpose = clean(item.purpose, 30) as LayoutTransitionPurposeV1;
    const strength = item.strength === "exceptional" ? "exceptional" : item.strength === "major" ? "major" : null;
    const evidenceWire = item.evidence && typeof item.evidence === "object" && !Array.isArray(item.evidence)
      ? item.evidence as Record<string, unknown>
      : null;
    const section = sections[atSectionIndex];
    if (!section || atSectionIndex <= 0 || atSectionIndex <= previousSectionIndex || !layouts.has(toLayout) || toLayout === current || !purposes.has(purpose) || !strength || !evidenceWire) return null;
    const sectionTriggers = Array.isArray(evidenceWire.sectionTriggers)
      ? [...new Set(evidenceWire.sectionTriggers.map((trigger) => clean(trigger, 40)).filter(Boolean))]
      : [];
    const lineIndices = Array.isArray(evidenceWire.lineIndices)
      ? [...new Set(evidenceWire.lineIndices.filter((lineIndex): lineIndex is number => Number.isInteger(lineIndex)
        && lineIndex >= section.fromLineIndex && lineIndex <= section.toLineIndex))]
      : [];
    const audioLandmarkIDs = Array.isArray(evidenceWire.audioLandmarkIDs)
      ? [...new Set(evidenceWire.audioLandmarkIDs.map((id) => clean(id, 80)).filter(Boolean))].slice(0, 8)
      : [];
    const confidence = clamp(finite(evidenceWire.confidence, 0), 0, 1);
    const rationale = clean(evidenceWire.rationale, 400);
    const previous = previousSectionIndex >= 0 ? sections[previousSectionIndex]! : sections[0]!;
    const separated = section.fromLineIndex - previous.fromLineIndex >= 6 || section.fromMs - previous.fromMs >= 20_000;
    if (
      !rationale || lineIndices.length === 0 || sectionTriggers.length === 0 || !separated
      || !transitionPurposeMatchesEvidence(purpose, sectionTriggers)
      || (strength !== "major" && strength !== "exceptional")
      || confidence < 0.78 || evidenceCategories(sectionTriggers) < 2
    ) return null;
    output.push({ atSectionIndex, toLayout, purpose, strength, evidence: { sectionTriggers, lineIndices, audioLandmarkIDs, rationale, confidence } });
    previousSectionIndex = atSectionIndex;
    current = toLayout;
  }
  return { version: "song-blocking-v1", baseLayout, transitions: output };
};

export const applySongBlockingV1 = (sections: DirectorSectionV1[], blocking: SongBlockingV1): DirectorSectionV1[] => {
  let layout = blocking.baseLayout;
  const transitions = new Map(blocking.transitions.map((transition) => [transition.atSectionIndex, transition.toLayout]));
  return sections.map((section, index) => {
    layout = transitions.get(index) ?? layout;
    return { ...section, layout };
  });
};

const primitiveMatchesScope = (primitive: LyricGesturePrimitiveV1, scope: LyricGestureScopeV1): boolean => primitive.startsWith(`${scope}.`);

export const sanitizeLyricGesturesV1 = (lyrics: LyricDocumentV0, value: unknown): LyricGestureV1[] | null => {
  if (!Array.isArray(value) || value.length > 48) return null;
  const lineByIndex = new Map(lyrics.lines.map((line) => [line.lineIndex, line]));
  const counts = { glyph: 0, token: 0, phrase: 0, fullStage: 0 };
  const ids = new Set<string>();
  const output: LyricGestureV1[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const wire = candidate as Record<string, unknown>;
    const id = clean(wire.id, 160);
    const lineIndex = Number.isInteger(wire.lineIndex) ? wire.lineIndex as number : -1;
    const line = lineByIndex.get(lineIndex);
    const scope = clean(wire.scope, 20) as LyricGestureScopeV1;
    const primitive = clean(wire.primitive, 40) as LyricGesturePrimitiveV1;
    const driver = clean(wire.driver, 30) as LyricGestureDriverV1;
    const space = clean(wire.space, 30) as LyricGestureSpaceV1;
    const targetWire = wire.target && typeof wire.target === "object" && !Array.isArray(wire.target) ? wire.target as Record<string, unknown> : null;
    const envelopeWire = wire.envelope && typeof wire.envelope === "object" && !Array.isArray(wire.envelope) ? wire.envelope as Record<string, unknown> : null;
    const evidenceWire = wire.evidence && typeof wire.evidence === "object" && !Array.isArray(wire.evidence) ? wire.evidence as Record<string, unknown> : null;
    if (!id || ids.has(id) || !line || !scopes.has(scope) || !lyricGesturePrimitivesV1.has(primitive) || !primitiveMatchesScope(primitive, scope) || !drivers.has(driver) || !spaces.has(space) || !targetWire || !envelopeWire || !evidenceWire) return null;
    const pieces = lyricGraphemesV1(line.text);
    const fromGrapheme = Number.isInteger(targetWire.fromGrapheme) ? targetWire.fromGrapheme as number : -1;
    const toGrapheme = Number.isInteger(targetWire.toGrapheme) ? targetWire.toGrapheme as number : -1;
    const expectedText = clean(targetWire.expectedText, 240);
    if (fromGrapheme < 0 || toGrapheme <= fromGrapheme || toGrapheme > pieces.length || pieces.slice(fromGrapheme, toGrapheme).join("") !== expectedText) return null;
    if ((scope === "glyph" && toGrapheme - fromGrapheme !== 1) || (scope === "phrase" && (fromGrapheme !== 0 || toGrapheme !== pieces.length))) return null;
    const nativeWordRanges = exactWordRanges(line);
    const targetInsideNativeWord = nativeWordRanges.some((range) => fromGrapheme >= range.from && toGrapheme <= range.to);
    if (scope === "glyph" && !targetInsideNativeWord) return null;
    if (driver === "wordWindow" && !targetInsideNativeWord) return null;
    const semanticRole = clean(evidenceWire.semanticRole, 30) as LyricGestureSemanticRoleV1;
    const confidence = clamp(finite(evidenceWire.confidence, 0), 0, 1);
    const rationale = clean(evidenceWire.rationale, 360);
    if (!semanticRoles.has(semanticRole) || !rationale || confidence < (space === "fullStage" ? 0.82 : 0.62)) return null;
    counts[scope] += 1;
    if (space === "fullStage") counts.fullStage += 1;
    if (counts.glyph > 24 || counts.token > 16 || counts.phrase > 8 || counts.fullStage > 6) return null;
    const paletteRole = clean(wire.paletteRole, 20) as PerformancePaletteRoleV1;
    output.push({
      version: "lyric-gesture-v1",
      id,
      lineIndex,
      scope,
      target: { fromGrapheme, toGrapheme, expectedText },
      primitive,
      driver,
      space,
      envelope: {
        attackMs: Math.round(clamp(finite(envelopeWire.attackMs, 280), 80, 900)),
        holdMs: Math.round(clamp(finite(envelopeWire.holdMs, 220), 0, 1_600)),
        releaseMs: Math.round(clamp(finite(envelopeWire.releaseMs, 420), 100, 1_200)),
      },
      intensity: clamp(finite(wire.intensity, 0.62), 0.2, 1),
      direction: finite(wire.direction, 1) < 0 ? -1 : 1,
      paletteRole: paletteRoles.has(paletteRole) ? paletteRole : "accent",
      evidence: { semanticRole, rationale, confidence },
    });
    ids.add(id);
  }
  return output;
};

export const compileLocalLyricGesturesV1 = (lyrics: LyricDocumentV0): LyricGestureV1[] => {
  const candidates: unknown[] = [];
  const repetitions = new Map<string, number>();
  lyrics.lines.forEach((line) => repetitions.set(line.text, (repetitions.get(line.text) ?? 0) + 1));
  for (const line of lyrics.lines) {
    const pieces = lyricGraphemesV1(line.text);
    if ((repetitions.get(line.text) ?? 0) > 1 && candidates.length < 3) {
      candidates.push({
        id: `local:phrase:${line.lineIndex}`,
        lineIndex: line.lineIndex,
        scope: "phrase",
        target: { fromGrapheme: 0, toGrapheme: pieces.length, expectedText: line.text },
        primitive: "phrase.handoff",
        driver: "lineEnter",
        space: "lyricLocal",
        envelope: { attackMs: 320, holdMs: 260, releaseMs: 520 },
        intensity: 0.48,
        direction: line.lineIndex % 2 === 0 ? 1 : -1,
        paletteRole: "accent",
        evidence: { semanticRole: "repetition", rationale: "The repeated line recalls a restrained local handoff.", confidence: 0.72 },
      });
    }
    const firstWord = line.words?.[0];
    if (firstWord && candidates.length < 6) {
      const wordPieces = lyricGraphemesV1(firstWord.text);
      const start = pieces.findIndex((piece, index) => wordPieces.every((wordPiece, offset) => pieces[index + offset] === wordPiece));
      if (start >= 0) candidates.push({
        id: `local:token:${line.lineIndex}`,
        lineIndex: line.lineIndex,
        scope: "token",
        target: { fromGrapheme: start, toGrapheme: start + wordPieces.length, expectedText: firstWord.text },
        primitive: "token.underlinePath",
        driver: "wordWindow",
        space: "lyricLocal",
        envelope: { attackMs: 240, holdMs: 120, releaseMs: 360 },
        intensity: 0.42,
        direction: 1,
        paletteRole: "primary",
        evidence: { semanticRole: "identity", rationale: "A real word window receives a quiet reading accent.", confidence: 0.68 },
      });
    }
  }
  return sanitizeLyricGesturesV1(lyrics, candidates) ?? [];
};
