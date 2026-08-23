import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { performanceDirectionSkill } from "./directorBrowserSkill";
import { compileLocalDirectorPlanV1 } from "./directorPlan";

type JSONRecord = Record<string, unknown>;

const cloneRecord = (value: unknown): JSONRecord => structuredClone(value) as JSONRecord;

export const directorIntentSchemaV1 = (() => {
  const schema = cloneRecord(performanceDirectionSkill.responseSchema);
  const properties = schema.properties as JSONRecord;
  const directives = properties.directives as JSONRecord;
  const effects = properties.effects as JSONRecord;
  const gestures = properties.gestures as JSONRecord;
  directives.description = "Sparse overrides for at most 12 exceptional lyric lines. The local compiler fills every omitted line.";
  effects.description = "One to four evidence-backed scenic events. Do not decorate every section.";
  gestures.description = "One to eight exact lyric gestures across glyph, token and phrase scales. Prefer memorable structural anchors.";
  return schema;
})();

export const directorIntentSystemPromptV1 = `You are LyricStage's dramaturg for a 16:9 fullscreen lyric performance.

Return exactly one JSON object matching the supplied schema. You decide the song-specific premise, recurring motif, emotional arc, visual world, act structure, blocking, signature moments and a sparse set of exceptional lyric cues. The local runtime—not you—fills routine per-line mechanics and owns all coordinates, paths, timing, rendering, safety zones and fallback behavior.

## Dramaturgy first

- Build 2–5 contiguous acts across every lyric line.
- Choose one motif actor and develop it through seed, transform or fracture, then return or resolve.
- Author 2–4 ordered signature moments. Each moment needs anticipation, an event, a visible consequence and a later recall.
- Preserve quiet windows. A new color, section label or particle pattern is not a dramatic event.
- The final moment must recall or resolve an earlier moment by exact id.

## Whole-screen composition

The cover, lyric stack, negative space, background and motif actor share one canvas. The readable master lyric always remains legible. The cover may be anchor, origin, destination, boundary, memory or portal, but should not jump position without a structural reason.

Layouts are dramatic relationships:
- monument: a rare iconic proclamation, never a generic default.
- editorialSplit: a real dialogue between artwork and narrative lyric.
- railLeading: forward motion, pursuit or approach.
- railTrailing: withdrawal, memory or aftermath.
- duetDivide: verified overlapping or divided voices only.

Blocking owns layout. Normally use zero to two major transitions. A transition needs at least two independent evidence categories and must explain what changed in the song, why the old geometry no longer expresses it and what the new layout makes possible. A third transition is exceptional and requires at least three evidence categories with confidence >= 0.90.

## Sparse lyric direction

Return directives only for truly exceptional lines, at most 12. The local compiler fills all ordinary lines. Spend overrides on repeated hooks, rupture, voice handoff, semantic motion, distance, questions and resolution—not on every line.

Return one to eight gestures total. Use glyph only with real word timing and exactly one grapheme; use token only when the target lies inside a real timed word; phrase may target a complete line. expectedText must exactly match the supplied lyric graphemes. Keep no more than two gestures visually concurrent.

Return one to four effects total and no more than one per section. Every effect needs verified lyric/structure evidence. Reuse the song motif instead of switching to unrelated fireworks, fish, petals or snow merely for variety.

## Runtime instruments

artDirection: editorialKinetic, neonRail, paperCut, liquidMemory, monoImpact, celestialGrid.
layout: monument, editorialSplit, railLeading, railTrailing, duetDivide.
typography: jpGothic, jpMincho, cjkGrotesk, latinDisplay, monoEditorial.
behavior: settle, assemble, gravityDrop, ripple, stretch, echo, drift, focus, converge.
world spatialMode: anchored, panoramic, cinematic, orbital, splitStage, chorusWall.
world motionLaw: drift, flow, pulse, fall, orbit, converge, suspend, fracture.

Never output rewritten lyrics, translations, SVG, JavaScript, CSS, code, coordinates, colors, paths, keyframes or audio instructions. Do not claim you listened to media unless an actual MusicMap is supplied. Output JSON only.`;

export const compactDirectorPromptInputV1 = (value: any): unknown => ({
  track: value.track,
  musicMap: value.musicMap ?? null,
  sectionHints: value.sectionHints,
  lines: Array.isArray(value.lines) ? value.lines.map((line: any) => ({
    lineIndex: line.lineIndex,
    fromSeconds: line.fromSeconds,
    toSeconds: line.toSeconds,
    exactText: line.exactText,
    voiceRole: line.voiceRole,
    overlapGroup: line.overlapGroup,
    timingPrecision: line.timingPrecision,
    repetitionCount: line.repetitionCount,
    ...(line.timingPrecision === "word" && Array.isArray(line.wordTiming?.cues) ? {
      realWordGraphemeRanges: line.wordTiming.cues.map((cue: unknown[]) => [cue[3], cue[4], cue[5]]),
    } : {}),
  })) : [],
});

const lyricDocumentFromDirectorInput = (input: any): LyricDocumentV0 => ({
  version: "lyric-document-v0",
  recordingID: typeof input.recordingID === "string" ? input.recordingID : "director-local-repair",
  durationMs: Math.max(1, Math.round((typeof input.duration === "number" ? input.duration : 0) * 1000)),
  lines: Array.isArray(input.lines) ? input.lines.map((line: any, fallbackIndex: number) => ({
    lineIndex: Number.isInteger(line.index) ? line.index : fallbackIndex,
    fromMs: Math.max(0, Math.round((typeof line.from === "number" ? line.from : 0) * 1000)),
    toMs: Math.max(1, Math.round((typeof line.to === "number" ? line.to : 0) * 1000)),
    text: typeof line.text === "string" ? line.text : "",
    words: Array.isArray(line.words) ? line.words.map((word: any, wordIndex: number) => ({
      wordIndex: Number.isInteger(word.index) ? word.index : wordIndex,
      fromMs: Math.max(0, Math.round((typeof word.from === "number" ? word.from : line.from ?? 0) * 1000)),
      toMs: Math.max(1, Math.round((typeof word.to === "number" ? word.to : line.to ?? 0) * 1000)),
      text: typeof word.text === "string" ? word.text : "",
    })) : [],
    ...(typeof line.voiceRole === "string" ? { voiceRole: line.voiceRole } : {}),
    ...(typeof line.layerID === "string" ? { layerID: line.layerID } : {}),
    ...(typeof line.overlapGroup === "string" ? { overlapGroup: line.overlapGroup } : {}),
  })) : [],
});

export const repairDirectorIntentV1 = (
  input: any,
  aiValue: unknown,
  degradedReason: unknown,
): unknown => {
  if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) return aiValue;
  const reason = typeof degradedReason === "string" ? degradedReason : "";
  if (!reason) return aiValue;
  const value = aiValue as JSONRecord;
  const hasAIDramaturgy = [value.concept, value.motif, value.intensityArc]
    .every((item) => typeof item === "string" && item.trim().length > 0)
    && value.world !== null
    && typeof value.world === "object"
    && !Array.isArray(value.world);
  if (!hasAIDramaturgy) return aiValue;
  const lyrics = lyricDocumentFromDirectorInput(input);
  if (lyrics.lines.length === 0) return aiValue;
  const local = compileLocalDirectorPlanV1(lyrics);
  const repaired: JSONRecord = { ...value };

  if (reason.includes("sections")) {
    repaired.sections = local.sections.map((section) => ({
      fromLineIndex: section.fromLineIndex,
      toLineIndex: section.toLineIndex,
      artDirection: section.artDirection,
      layout: section.layout,
      typography: section.typography,
      paletteIndex: section.paletteIndex,
      intensity: section.intensity,
    }));
    repaired.blocking = local.blocking;
  } else if (reason.includes("blocking")) {
    const sections = Array.isArray(value.sections) ? value.sections : [];
    const firstLayout = sections.find((section) => section && typeof section === "object" && typeof (section as JSONRecord).layout === "string") as JSONRecord | undefined;
    const baseLayout = typeof firstLayout?.layout === "string" ? firstLayout.layout : local.blocking.baseLayout;
    repaired.sections = sections.map((section) => section && typeof section === "object" && !Array.isArray(section)
      ? { ...(section as JSONRecord), layout: baseLayout }
      : section);
    repaired.blocking = { version: "song-blocking-v1", baseLayout, transitions: [] };
  }

  if (reason.includes("effects")) {
    const repairedSections = Array.isArray(repaired.sections) ? repaired.sections : local.sections;
    const finalSectionIndex = Math.max(0, repairedSections.length - 1);
    const finalLineIndex = lyrics.lines.at(-1)!.lineIndex;
    repaired.effects = [{
      sectionIndex: finalSectionIndex,
      cardID: "custom",
      presentation: "reading",
      primary: { primitive: "field.drift", intensity: 0.28 },
      support: [],
      evidence: {
        songMotif: typeof repaired.motif === "string" ? repaired.motif : local.motif,
        sectionTriggers: ["final_resolution"],
        lineIndices: [finalLineIndex],
        rationale: "A restrained local field resolves the AI premise while invalid scenic evidence is omitted.",
        confidence: 0.74,
      },
    }];
  }
  if (reason.includes("gestures")) repaired.gestures = local.gestures;
  if (reason.includes("dramaticScore")) repaired.dramaticScore = local.dramaticScore;
  return repaired;
};

const behaviors = new Set(["settle", "assemble", "gravityDrop", "ripple", "stretch", "echo", "drift", "focus", "converge"]);
const alignments = new Set(["leading", "center", "trailing"]);
const paletteRoles = new Set(["primary", "accent", "warm", "secondary"]);
const clamp = (value: unknown, fallback: number, minimum: number, maximum: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
const normalize = (value: string): string => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();

export const expandDirectorIntentV1 = (input: any, aiValue: unknown): unknown => {
  if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) return aiValue;
  const value = aiValue as JSONRecord;
  const sparse = new Map<number, JSONRecord>();
  if (Array.isArray(value.directives)) {
    for (const candidate of value.directives.slice(0, 12)) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const raw = candidate as JSONRecord;
      const lineIndex = Number.isInteger(raw.lineIndex) ? raw.lineIndex as number : -1;
      if (lineIndex >= 0 && lineIndex < input.lines.length && !sparse.has(lineIndex)) sparse.set(lineIndex, raw);
    }
  }
  const repetition = new Map<string, number>();
  for (const line of input.lines) {
    const key = normalize(line.text);
    repetition.set(key, (repetition.get(key) ?? 0) + 1);
  }
  const sections = Array.isArray(value.sections) ? value.sections : [];
  const directives = input.lines.map((line: any) => {
    const raw = sparse.get(line.index) ?? {};
    const repeated = (repetition.get(normalize(line.text)) ?? 1) > 1;
    const overlapping = input.lines.some((candidate: any) =>
      candidate.index !== line.index && line.from < candidate.to && candidate.from < line.to);
    const section = sections.find((candidate) => candidate && typeof candidate === "object"
      && Number.isInteger((candidate as JSONRecord).fromLineIndex)
      && Number.isInteger((candidate as JSONRecord).toLineIndex)
      && line.index >= ((candidate as JSONRecord).fromLineIndex as number)
      && line.index <= ((candidate as JSONRecord).toLineIndex as number)) as JSONRecord | undefined;
    const sectionIntensity = clamp(section?.intensity, 0.58, 0, 1);
    const fallbackBehavior = overlapping ? "converge" : repeated ? "echo" : line.index % 3 === 0 ? "settle" : line.index % 3 === 1 ? "focus" : "assemble";
    const behavior = typeof raw.behavior === "string" && behaviors.has(raw.behavior) ? raw.behavior : fallbackBehavior;
    const alignment = typeof raw.alignment === "string" && alignments.has(raw.alignment)
      ? raw.alignment
      : overlapping ? line.voiceRole === "duetB" ? "trailing" : "leading" : line.index % 4 === 1 ? "leading" : "center";
    const paletteRole = typeof raw.paletteRole === "string" && paletteRoles.has(raw.paletteRole)
      ? raw.paletteRole
      : repeated ? "accent" : overlapping ? "secondary" : "primary";
    return {
      lineIndex: line.index,
      behavior,
      alignment,
      direction: raw.direction === -1 ? -1 : raw.direction === 1 ? 1 : line.index % 2 === 0 ? 1 : -1,
      intensity: clamp(raw.intensity, repeated ? 0.95 : overlapping ? 0.9 : sectionIntensity, 0.35, 1.25),
      fontScale: clamp(raw.fontScale, repeated ? 1.08 : 1, 0.78, 1.22),
      glyphStagger: clamp(raw.glyphStagger, line.timingPrecision === "word" ? 0.035 : line.timingPrecision === "estimated" ? 0.018 : 0, 0, 0.14),
      paletteRole,
    };
  });
  return {
    ...value,
    directives,
    effects: Array.isArray(value.effects) ? value.effects.slice(0, 4) : value.effects,
    gestures: Array.isArray(value.gestures) ? value.gestures.slice(0, 8) : value.gestures,
  };
};
