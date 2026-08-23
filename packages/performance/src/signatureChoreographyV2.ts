import type { LyricDocumentV0, LyricLineV0 } from "@lyricstage/contracts";
import type { EffectPrimitiveIDV1, EffectRecipeV1, StagePresentationV1 } from "./effectGrammar";
import { lyricGraphemesV1, type LyricGesturePrimitiveV1, type LyricGestureV1 } from "./lyricChoreography";
import type { SceneDramaticPurposeV2 } from "./directorScenePackV2";
import type { LinePerformanceV2 } from "./directorLinePerformanceV2";
import {
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
  type DirectorBibleV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
} from "./rollingDirector";

export const signatureChoreographyClipIDsV2 = [
  "motif-introduce",
  "chorus-lift",
  "duet-handoff",
  "silence-vacuum",
  "bridge-fracture",
  "refrain-upgrade",
  "motif-recall",
  "final-resolve",
] as const;

export type SignatureChoreographyClipIDV2 = typeof signatureChoreographyClipIDsV2[number];
export type SignatureChoreographySelectionV2 = SignatureChoreographyClipIDV2 | "none";

export interface SignatureChoreographyClipV2 {
  id: SignatureChoreographyClipIDV2;
  purpose: string;
  allowedPurposes: readonly SceneDramaticPurposeV2[];
  phrasePrimitive: Extract<LyricGesturePrimitiveV1, `phrase.${string}`>;
  accentPrimitive: Exclude<LyricGesturePrimitiveV1, `phrase.${string}`>;
  anticipation: EffectPrimitiveIDV1;
  event: EffectPrimitiveIDV1;
  support: readonly EffectPrimitiveIDV1[];
  consequence: EffectPrimitiveIDV1;
  presentation: StagePresentationV1;
  observableFact: string;
  reducedMotionStrategy: string;
}

export const signatureChoreographyClipsV2: readonly SignatureChoreographyClipV2[] = [
  {
    id: "motif-introduce", purpose: "Give the whole-song motif its first visible form.",
    allowedPurposes: ["establish", "develop"], phrasePrimitive: "phrase.arc", accentPrimitive: "glyph.strokeTrace",
    anticipation: "field.drift", event: "field.ribbon", support: ["motif.recall"], consequence: "memory.trail",
    presentation: "section", observableFact: "a traced path remains attached to the lyric field",
    reducedMotionStrategy: "retain the traced path and remove spatial travel",
  },
  {
    id: "chorus-lift", purpose: "Turn a chorus arrival into a collective spatial lift.",
    allowedPurposes: ["develop", "turn"], phrasePrimitive: "phrase.arc", accentPrimitive: "token.echo",
    anticipation: "geometry.suspend", event: "geometry.expand", support: ["cover.island"], consequence: "density.lift",
    presentation: "hero", observableFact: "the chorus leaves the lyric field wider and heavier",
    reducedMotionStrategy: "replace expansion with a stable scale and contrast hierarchy",
  },
  {
    id: "duet-handoff", purpose: "Make voice ownership pass visibly across the stage.",
    allowedPurposes: ["develop", "turn"], phrasePrimitive: "phrase.handoff", accentPrimitive: "token.underlinePath",
    anticipation: "field.ribbon", event: "geometry.mirror", support: ["memory.trail"], consequence: "motif.recall",
    presentation: "duet", observableFact: "a connection remains between the departing and arriving voices",
    reducedMotionStrategy: "hold two stable voice zones linked by a visible trace",
  },
  {
    id: "silence-vacuum", purpose: "Let absence reorganize the stage instead of merely dimming it.",
    allowedPurposes: ["turn", "aftermath"], phrasePrimitive: "phrase.breathe", accentPrimitive: "glyph.weightPulse",
    anticipation: "density.release", event: "field.aperture", support: [], consequence: "motif.recall",
    presentation: "aperture", observableFact: "an intentional empty region remains in the composition",
    reducedMotionStrategy: "preserve the empty region without animated evacuation",
  },
  {
    id: "bridge-fracture", purpose: "Break an established spatial rule and leave a displaced trace.",
    allowedPurposes: ["turn"], phrasePrimitive: "phrase.breakReform", accentPrimitive: "glyph.offsetSnap",
    anticipation: "geometry.suspend", event: "geometry.cut", support: ["memory.trail"], consequence: "density.release",
    presentation: "hero", observableFact: "the lyric field remains visibly displaced after the break",
    reducedMotionStrategy: "show the broken alignment as a static before-and-after contrast",
  },
  {
    id: "refrain-upgrade", purpose: "Return a familiar refrain with a materially changed hierarchy.",
    allowedPurposes: ["develop", "turn"], phrasePrimitive: "phrase.arc", accentPrimitive: "token.echo",
    anticipation: "motif.recall", event: "memory.echo", support: ["cover.portal", "motif.recall"], consequence: "memory.trail",
    presentation: "hero", observableFact: "the repeated lyric keeps an enlarged echo of its earlier form",
    reducedMotionStrategy: "stack the original and upgraded refrain as stable layers",
  },
  {
    id: "motif-recall", purpose: "Recall the same observable motif after it has changed.",
    allowedPurposes: ["aftermath", "resolve"], phrasePrimitive: "phrase.handoff", accentPrimitive: "glyph.strokeTrace",
    anticipation: "memory.trail", event: "motif.recall", support: ["memory.echo"], consequence: "motif.recall",
    presentation: "section", observableFact: "the earlier trace returns with a recognizable changed geometry",
    reducedMotionStrategy: "crossfade between two static states of the same trace",
  },
  {
    id: "final-resolve", purpose: "Consume the visual promise and settle the final composition.",
    allowedPurposes: ["resolve"], phrasePrimitive: "phrase.handoff", accentPrimitive: "glyph.weightPulse",
    anticipation: "motif.recall", event: "geometry.converge", support: ["density.release", "cover.island"], consequence: "transition.bloom",
    presentation: "hero", observableFact: "separated motif parts visibly meet and leave one resolved remnant",
    reducedMotionStrategy: "show the separated and resolved states through opacity and hierarchy only",
  },
] as const;

const clipByID = new Map(signatureChoreographyClipsV2.map((clip) => [clip.id, clip]));

export interface SignatureChoreographyContextV2 {
  purpose: SceneDramaticPurposeV2;
  linePerformances: readonly LinePerformanceV2[];
}

export const signatureChoreographyFitsV2 = (
  lyrics: LyricDocumentV0,
  scene: { toLineIndex: number; purpose: SceneDramaticPurposeV2; linePerformances: readonly LinePerformanceV2[] },
  selection: SignatureChoreographySelectionV2,
): boolean => {
  if (selection === "none") return true;
  const clip = clipByID.get(selection);
  if (!clip?.allowedPurposes.includes(scene.purpose)) return false;
  const roles = new Set(scene.linePerformances.map((performance) => performance.dramaticRole));
  if ((selection === "chorus-lift" || selection === "refrain-upgrade") && !roles.has("refrain")) return false;
  if (selection === "bridge-fracture" && !roles.has("rupture")) return false;
  if (selection === "final-resolve" && scene.toLineIndex !== lyrics.lines.at(-1)?.lineIndex) return false;
  return true;
};

const phaseRanges = (card: SceneCardV1, anchor: LyricLineV0) => {
  const durationMs = card.toMs - card.fromMs;
  if (durationMs < 900) return {
    anticipation: undefined,
    event: [card.fromMs, card.toMs] as const,
    consequence: undefined,
  };
  const edgeMs = Math.min(1_200, durationMs * 0.22);
  let eventFromMs = Math.max(card.fromMs + edgeMs, anchor.fromMs);
  let eventToMs = Math.min(card.toMs - edgeMs, anchor.toMs);
  if (eventToMs - eventFromMs < Math.min(600, durationMs * 0.18)) {
    eventFromMs = card.fromMs + durationMs * 0.3;
    eventToMs = card.fromMs + durationMs * 0.68;
  }
  return {
    anticipation: [card.fromMs, eventFromMs] as const,
    event: [eventFromMs, eventToMs] as const,
    consequence: [eventToMs, card.toMs] as const,
  };
};

const effectForPhase = (
  bible: DirectorBibleV1,
  card: SceneCardV1,
  clip: SignatureChoreographyClipV2,
  phase: "anticipation" | "event" | "consequence",
  range: readonly [number, number],
): EffectRecipeV1 => ({
  version: "effect-recipe-v1",
  id: `signature-clip-v2:${clip.id}:${card.sceneIndex}:${phase}`,
  cardID: "custom",
  sectionID: card.sceneID,
  fromMs: range[0],
  toMs: range[1],
  presentation: phase === "event" ? clip.presentation : "section",
  primary: {
    primitive: phase === "event" ? clip.event : clip[phase],
    intensity: phase === "event" ? 0.88 : phase === "anticipation" ? 0.58 : 0.64,
    direction: card.sceneIndex % 2 === 0 ? 1 : -1,
  },
  support: phase === "event" ? clip.support.map((primitive) => ({ primitive, intensity: 0.68 })) : [],
  evidence: {
    songMotif: bible.motifActor.relationship,
    sectionTriggers: card.evidence.sectionTriggers,
    lineIndices: card.evidence.lineIndices,
    rationale: `${clip.id} ${phase}: ${clip.purpose}`,
    confidence: Math.max(0.72, card.evidence.confidence),
  },
});

const gestureFor = (
  clip: SignatureChoreographyClipV2,
  line: LyricLineV0,
  performance: LinePerformanceV2 | undefined,
  layer: "phrase" | "accent",
): LyricGestureV1 | undefined => {
  const graphemes = lyricGraphemesV1(line.text);
  if (graphemes.length === 0) return undefined;
  const focus = performance?.focus;
  const requestedAccent = clip.accentPrimitive;
  const firstWord = line.words?.[0]?.text;
  const firstWordPieces = firstWord ? lyricGraphemesV1(firstWord) : [];
  const firstWordFrom = firstWordPieces.length > 0
    ? graphemes.findIndex((piece, start) => firstWordPieces.every((wordPiece, offset) => graphemes[start + offset] === wordPiece))
    : -1;
  const accentPrimitive = requestedAccent.startsWith("glyph.") && firstWordFrom < 0 ? "token.halo" : requestedAccent;
  const fromGrapheme = layer === "phrase" ? 0
    : accentPrimitive.startsWith("glyph.") ? firstWordFrom : focus?.fromGrapheme ?? 0;
  const toGrapheme = layer === "phrase" ? graphemes.length
    : accentPrimitive.startsWith("glyph.") ? fromGrapheme + 1 : focus?.toGrapheme ?? Math.min(2, graphemes.length);
  return {
    version: "lyric-gesture-v1",
    id: `signature-clip-v2:${clip.id}:${line.lineIndex}:${layer}`,
    lineIndex: line.lineIndex,
    scope: layer === "phrase" ? "phrase" : accentPrimitive.startsWith("glyph.") ? "glyph" : "token",
    target: { fromGrapheme, toGrapheme, expectedText: graphemes.slice(fromGrapheme, toGrapheme).join("") },
    primitive: layer === "phrase" ? clip.phrasePrimitive : accentPrimitive,
    driver: layer === "phrase" ? "structuralMoment" : "lineEnter",
    space: clip.id === "duet-handoff" ? "fullStage" : layer === "phrase" ? "lyricToArtwork" : "lyricLocal",
    envelope: layer === "phrase" ? { attackMs: 420, holdMs: 520, releaseMs: 760 } : { attackMs: 220, holdMs: 360, releaseMs: 540 },
    intensity: Math.min(1, Math.max(0.62, performance?.intensity ?? 0.78)),
    direction: performance?.exit === "exit-recede" || performance?.exit === "exit-cut" ? -1 : 1,
    paletteRole: clip.id === "bridge-fracture" ? "accent" : clip.id === "final-resolve" ? "warm" : "primary",
    evidence: {
      semanticRole: clip.id === "bridge-fracture" ? "rupture"
        : clip.id === "final-resolve" || clip.id === "motif-recall" ? "resolution"
          : clip.id === "chorus-lift" || clip.id === "refrain-upgrade" ? "repetition" : "motion",
      rationale: `${clip.id} ${layer} layer: ${clip.purpose}`,
      confidence: 0.82,
    },
  };
};

export const applySignatureChoreographyV2 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  card: SceneCardV1,
  context: SignatureChoreographyContextV2,
  selection: SignatureChoreographySelectionV2,
): SceneCardV1 | null => {
  if (selection === "none") return card;
  const clip = clipByID.get(selection);
  if (!clip || !signatureChoreographyFitsV2(lyrics, { ...context, toLineIndex: card.toLineIndex }, selection)) return null;
  const performances = [...context.linePerformances].sort((left, right) => right.intensity - left.intensity || left.lineIndex - right.lineIndex);
  const primaryPerformance = performances[0];
  const secondaryPerformance = performances.find((performance) => performance.lineIndex !== primaryPerformance?.lineIndex) ?? primaryPerformance;
  const primaryLine = lyrics.lines.find((line) => line.lineIndex === primaryPerformance?.lineIndex)
    ?? lyrics.lines.find((line) => line.lineIndex === card.fromLineIndex);
  const secondaryLine = lyrics.lines.find((line) => line.lineIndex === secondaryPerformance?.lineIndex) ?? primaryLine;
  if (!primaryLine || !secondaryLine) return null;
  const authoredGestures = [
    gestureFor(clip, primaryLine, primaryPerformance, "phrase"),
    gestureFor(clip, secondaryLine, secondaryPerformance, "accent"),
  ].filter((gesture): gesture is LyricGestureV1 => Boolean(gesture));
  if (authoredGestures.length < 2) return null;
  const authoredLines = new Set(authoredGestures.map((gesture) => gesture.lineIndex));
  const overlapsAuthored = (gesture: LyricGestureV1) => {
    const line = lyrics.lines.find((candidate) => candidate.lineIndex === gesture.lineIndex);
    return line && [primaryLine, secondaryLine].some((anchor) => line.fromMs < anchor.toMs && anchor.fromMs < line.toMs);
  };
  const gestures = [...authoredGestures, ...card.gestures.filter((gesture) => !authoredLines.has(gesture.lineIndex) && !overlapsAuthored(gesture))].slice(0, 6);
  const phases = phaseRanges(card, primaryLine);
  const effects = (Object.entries(phases) as Array<["anticipation" | "event" | "consequence", readonly [number, number] | undefined]>)
    .filter((entry): entry is ["anticipation" | "event" | "consequence", readonly [number, number]] => Boolean(entry[1]))
    .map(([phase, range]) => effectForPhase(bible, card, clip, phase, range));
  const { sceneID: _oldSceneID, ...withoutSceneID } = card;
  const value: Omit<SceneCardV1, "sceneID"> = {
    ...withoutSceneID,
    intention: `${card.intention} Choreography ${clip.id}: ${clip.purpose}`.slice(0, 320),
    presentation: clip.presentation,
    gestures,
    effects,
    consequence: { ...card.consequence, rationale: `${clip.observableFact}; ${card.consequence.rationale}`.slice(0, 320) },
  };
  const sceneID = sceneCardIdentityV1(value);
  const candidate: SceneCardV1 = { ...value, sceneID, effects: effects.map((effect) => ({ ...effect, sectionID: sceneID })) };
  return sanitizeSceneCardV1(lyrics, bible, state, candidate);
};
