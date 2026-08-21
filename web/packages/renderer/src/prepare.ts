import { stableHash32, type LyricDocumentV0, type LyricLineV0 } from "@lyricstage/contracts";
import { prepareTimeline, type PerformancePlanV0 } from "@lyricstage/core";
import type {
  PreparedGlyphV0,
  PreparedStageV0,
  PreparedVisualLineV0,
  StagePaletteV0,
  StageViewportV0,
  TextMeasurerV0,
} from "./types";

const palettes: StagePaletteV0[] = [
  {
    ground: "#09090b",
    groundLift: "#18131d",
    ink: "#f8f4ee",
    inkMuted: "rgba(248,244,238,.34)",
    signal: "#ff4d7d",
    signalAlt: "#6ce5ff",
  },
  {
    ground: "#080b10",
    groundLift: "#0f1d25",
    ink: "#f3f7f7",
    inkMuted: "rgba(243,247,247,.32)",
    signal: "#f6c344",
    signalAlt: "#67d7c4",
  },
  {
    ground: "#0d0910",
    groundLift: "#251223",
    ink: "#fff7f2",
    inkMuted: "rgba(255,247,242,.32)",
    signal: "#ff693d",
    signalAlt: "#a895ff",
  },
];

const graphemes = (text: string): string[] => {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (item) => item.segment);
  }
  return Array.from(text);
};

const revealTimes = (line: LyricLineV0): number[] => {
  const pieces = graphemes(line.text);
  const result = pieces.map(() => line.fromMs);
  if (!line.words || line.words.length === 0) return result;

  const offsets: number[] = [];
  let offset = 0;
  for (const piece of pieces) {
    offsets.push(offset);
    offset += piece.length;
  }

  let searchFrom = 0;
  for (const word of line.words) {
    const start = line.text.indexOf(word.text, searchFrom);
    if (start < 0) continue;
    const end = start + word.text.length;
    offsets.forEach((glyphOffset, index) => {
      if (glyphOffset >= start && glyphOffset < end) result[index] = word.fromMs;
    });
    searchFrom = end;
  }
  return result;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const baseGeometry = (
  line: LyricLineV0,
  family: PreparedVisualLineV0["family"],
  viewport: StageViewportV0,
): { x: number; y: number; maxWidth: number; fontSize: number } => {
  const { width, height } = viewport;
  if (line.voiceRole === "duetA") {
    return { x: width * 0.075, y: height * 0.34, maxWidth: width * 0.39, fontSize: clamp(height * 0.065, 40, 78) };
  }
  if (line.voiceRole === "duetB") {
    return { x: width * 0.535, y: height * 0.58, maxWidth: width * 0.39, fontSize: clamp(height * 0.065, 40, 78) };
  }
  if (family === "chorusMemory") {
    return { x: width * 0.09, y: height * 0.42, maxWidth: width * 0.77, fontSize: clamp(height * 0.105, 54, 116) };
  }
  if (family === "railHandoff") {
    return { x: width * 0.09, y: height * 0.49, maxWidth: width * 0.82, fontSize: clamp(height * 0.086, 48, 96) };
  }
  return { x: width * 0.09, y: height * 0.48, maxWidth: width * 0.76, fontSize: clamp(height * 0.076, 44, 86) };
};

const prepareLine = (
  line: LyricLineV0,
  scene: PerformancePlanV0["scenes"][number],
  viewport: StageViewportV0,
  measure: TextMeasurerV0,
): PreparedVisualLineV0 => {
  const pieces = graphemes(line.text);
  const times = revealTimes(line);
  let geometry = baseGeometry(line, scene.family, viewport);
  let glyphs: PreparedGlyphV0[] = [];
  let lineHeight = 0;
  let rows = 0;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const font = `750 ${geometry.fontSize}px ${viewport.fontFamily}`;
    lineHeight = geometry.fontSize * 1.18;
    let x = geometry.x;
    let y = geometry.y;
    rows = 1;
    glyphs = pieces.map((piece, index) => {
      const width = measure(piece, font);
      if (x > geometry.x && x + width > geometry.x + geometry.maxWidth) {
        x = geometry.x;
        y += lineHeight;
        rows += 1;
      }
      const glyph = { text: piece, x, y, width, revealMs: times[index] };
      x += width;
      return glyph;
    });
    if (rows * lineHeight <= viewport.height * 0.48 || geometry.fontSize <= 30) break;
    geometry = { ...geometry, fontSize: Math.max(30, geometry.fontSize * 0.84) };
  }

  const font = `750 ${geometry.fontSize}px ${viewport.fontFamily}`;
  const maxRight = glyphs.reduce((maximum, glyph) => Math.max(maximum, glyph.x + glyph.width), geometry.x);
  return {
    lineIndex: line.lineIndex,
    text: line.text,
    family: scene.family,
    voiceRole: line.voiceRole ?? "lead",
    font,
    fontSize: geometry.fontSize,
    lineHeight,
    glyphs,
    bounds: {
      x: geometry.x,
      y: geometry.y - geometry.fontSize,
      width: maxRight - geometry.x,
      height: rows * lineHeight,
    },
    scene,
  };
};

export const prepareStage = (
  lyrics: LyricDocumentV0,
  plan: PerformancePlanV0,
  viewport: StageViewportV0,
  measure: TextMeasurerV0,
): PreparedStageV0 => {
  const paletteIndex = Number.parseInt(plan.planIdentity.slice(0, 4), 16) % palettes.length;
  const lines = lyrics.lines.map((line) =>
    prepareLine(line, plan.scenes[line.lineIndex], viewport, measure),
  );
  return {
    version: "prepared-stage-v0",
    identity: stableHash32({
      plan: plan.planIdentity,
      rendererVersion: viewport.rendererVersion,
      viewport: [viewport.width, viewport.height],
      fontFamily: viewport.fontFamily,
    }),
    viewport,
    lyrics,
    plan,
    timeline: prepareTimeline(plan),
    lines,
    palette: palettes[paletteIndex],
  };
};
