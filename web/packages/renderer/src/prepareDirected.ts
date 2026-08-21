import { stableHash32, type LyricDocumentV0, type LyricLineV0 } from "@lyricstage/contracts";
import type {
  DirectorLineDirectiveV1,
  DirectorPlanV1,
  DirectorSectionV1,
  PerformanceTypographyV1,
} from "@lyricstage/performance";
import type {
  DirectedStagePaletteV1,
  DirectedStageViewportV1,
  DirectedTextMeasurerV1,
  PreparedDirectedGlyphV1,
  PreparedDirectedLineV1,
  PreparedDirectedStageV1,
} from "./directedTypes";

export const directedPalettesV1: DirectedStagePaletteV1[] = [
  { ground: "#07070a", groundLift: "#24121d", ink: "#fff8f2", inkMuted: "rgba(255,248,242,.34)", signal: "#ff3f74", signalAlt: "#79e7ff", warm: "#ffb36a", secondary: "#b9a0ff", veil: "rgba(255,63,116,.12)" },
  { ground: "#040b10", groundLift: "#0c2630", ink: "#effcff", inkMuted: "rgba(239,252,255,.32)", signal: "#00e7d7", signalAlt: "#6ca8ff", warm: "#ffc857", secondary: "#d3fff9", veil: "rgba(0,231,215,.11)" },
  { ground: "#120a07", groundLift: "#382115", ink: "#fff7e7", inkMuted: "rgba(255,247,231,.34)", signal: "#ff7a45", signalAlt: "#ffd166", warm: "#ffad66", secondary: "#e7c8a0", veil: "rgba(255,122,69,.12)" },
  { ground: "#080711", groundLift: "#201a48", ink: "#f8f5ff", inkMuted: "rgba(248,245,255,.32)", signal: "#8c7bff", signalAlt: "#66f2d5", warm: "#ff8cbe", secondary: "#c4baff", veil: "rgba(140,123,255,.13)" },
  { ground: "#090909", groundLift: "#252525", ink: "#ffffff", inkMuted: "rgba(255,255,255,.30)", signal: "#f5ff37", signalAlt: "#eeeeee", warm: "#ff785a", secondary: "#b7b7b7", veil: "rgba(245,255,55,.09)" },
  { ground: "#060d18", groundLift: "#102c4a", ink: "#f4f8ff", inkMuted: "rgba(244,248,255,.31)", signal: "#70a7ff", signalAlt: "#f3a7ff", warm: "#ffd09a", secondary: "#9fe8ff", veil: "rgba(112,167,255,.12)" },
  { ground: "#0d060c", groundLift: "#431329", ink: "#fff4f8", inkMuted: "rgba(255,244,248,.33)", signal: "#ff477e", signalAlt: "#f7d154", warm: "#ff9a6c", secondary: "#ff9ed2", veil: "rgba(255,71,126,.12)" },
  { ground: "#04110d", groundLift: "#12382b", ink: "#f2fff9", inkMuted: "rgba(242,255,249,.32)", signal: "#62e6a7", signalAlt: "#d7f36b", warm: "#ffc77d", secondary: "#8ad7ff", veil: "rgba(98,230,167,.11)" },
  { ground: "#100a04", groundLift: "#3e2411", ink: "#fff9ed", inkMuted: "rgba(255,249,237,.33)", signal: "#ff9f1c", signalAlt: "#ffe66d", warm: "#ff6b35", secondary: "#f4d7a1", veil: "rgba(255,159,28,.12)" },
  { ground: "#070a12", groundLift: "#15243b", ink: "#f5f7ff", inkMuted: "rgba(245,247,255,.31)", signal: "#4cc9f0", signalAlt: "#f72585", warm: "#ffb86b", secondary: "#b8c0ff", veil: "rgba(76,201,240,.11)" },
  { ground: "#10050a", groundLift: "#40111c", ink: "#fff5f1", inkMuted: "rgba(255,245,241,.32)", signal: "#ff2d55", signalAlt: "#ffcc70", warm: "#ff795d", secondary: "#e9b4ff", veil: "rgba(255,45,85,.13)" },
  { ground: "#050c0f", groundLift: "#17313a", ink: "#f0fbff", inkMuted: "rgba(240,251,255,.31)", signal: "#18d9c5", signalAlt: "#a6ffcb", warm: "#ffd08a", secondary: "#74a9ff", veil: "rgba(24,217,197,.11)" },
];

export const directedPaletteForIndexV1 = (index: number): DirectedStagePaletteV1 =>
  directedPalettesV1[((index % directedPalettesV1.length) + directedPalettesV1.length) % directedPalettesV1.length]!;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const graphemes = (text: string): string[] => {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (item) => item.segment);
  }
  return Array.from(text);
};

const revealTimes = (line: LyricLineV0): number[] => {
  const pieces = graphemes(line.text);
  const result = pieces.map(() => line.fromMs);
  if (!line.words?.length) return result;
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

const fontFamilyFor = (typography: PerformanceTypographyV1): string => {
  if (typography === "jpMincho") return '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif';
  if (typography === "monoEditorial") return '"SFMono-Regular", "Roboto Mono", ui-monospace, monospace';
  if (typography === "latinDisplay") return '"Avenir Next Condensed", "Avenir Next", "Helvetica Neue", system-ui, sans-serif';
  if (typography === "cjkGrotesk") return '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", system-ui, sans-serif';
  return '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP", system-ui, sans-serif';
};

const fontWeightFor = (typography: PerformanceTypographyV1): number =>
  typography === "jpMincho" ? 600 : typography === "monoEditorial" ? 680 : 760;

const normalizeText = (text: string): string =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();

interface DirectedGeometry {
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  alignment: DirectorLineDirectiveV1["alignment"];
}

const geometryFor = (
  line: LyricLineV0,
  section: DirectorSectionV1,
  directive: DirectorLineDirectiveV1,
  viewport: DirectedStageViewportV1,
): DirectedGeometry => {
  const { width, height } = viewport;
  const scale = directive.fontScale * (0.92 + section.intensity * 0.12);
  const base = (fraction: number, min: number, max: number) => clamp(height * fraction * scale, min, max);
  if (graphemes(line.text).length > 34) {
    return {
      x: width * 0.07,
      y: height * 0.50,
      maxWidth: width * 0.86,
      fontSize: base(0.075, 34, 82),
      alignment: "leading",
    };
  }
  if (section.layout === "duetDivide") {
    const trailing = line.voiceRole === "duetB" || directive.alignment === "trailing";
    return {
      x: width * (trailing ? 0.53 : 0.065),
      y: height * (trailing ? 0.67 : 0.38),
      maxWidth: width * 0.405,
      fontSize: base(0.065, 34, 82),
      alignment: trailing ? "trailing" : "leading",
    };
  }
  if (section.layout === "editorialSplit") {
    const trailing = directive.alignment === "trailing" || (directive.alignment === "center" && directive.direction < 0);
    return {
      x: width * (trailing ? 0.535 : 0.065),
      y: height * (trailing ? 0.68 : 0.39),
      maxWidth: width * 0.40,
      fontSize: base(0.071, 38, 88),
      alignment: directive.alignment === "center" ? "leading" : directive.alignment,
    };
  }
  if (section.layout === "railTrailing") {
    return { x: width * 0.18, y: height * 0.66, maxWidth: width * 0.755, fontSize: base(0.078, 42, 96), alignment: "trailing" };
  }
  if (section.layout === "railLeading") {
    return { x: width * 0.065, y: height * 0.66, maxWidth: width * 0.80, fontSize: base(0.078, 42, 96), alignment: "leading" };
  }
  return { x: width * 0.10, y: height * 0.55, maxWidth: width * 0.80, fontSize: base(0.105, 52, 126), alignment: directive.alignment };
};

const prepareLine = (
  line: LyricLineV0,
  section: DirectorSectionV1,
  directive: DirectorLineDirectiveV1,
  viewport: DirectedStageViewportV1,
  measure: DirectedTextMeasurerV1,
  repetitionIndex: number,
  repetitionCount: number,
): PreparedDirectedLineV1 => {
  const pieces = graphemes(line.text);
  const times = revealTimes(line);
  let geometry = geometryFor(line, section, directive, viewport);
  let glyphs: PreparedDirectedGlyphV1[] = [];
  let lineHeight = 0;
  let rowWidths: number[] = [];
  const wordAware = pieces.some((piece) => /\s/u.test(piece));
  const groups: number[][] = [];
  if (wordAware) {
    let group: number[] = [];
    pieces.forEach((piece, index) => {
      group.push(index);
      if (/\s/u.test(piece)) {
        groups.push(group);
        group = [];
      }
    });
    if (group.length > 0) groups.push(group);
  } else {
    pieces.forEach((_piece, index) => groups.push([index]));
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const family = fontFamilyFor(section.typography);
    const font = `${fontWeightFor(section.typography)} ${geometry.fontSize}px ${family}`;
    lineHeight = geometry.fontSize * (section.typography === "jpMincho" ? 1.28 : 1.17);
    rowWidths = [0];
    let row = 0;
    const widths = pieces.map((piece) => measure(piece, font));
    const naturalWidth = widths.reduce((total, width) => total + width, 0);
    const compactCJKLine = !wordAware && pieces.length <= 18;
    const compactLatinLine = wordAware && pieces.length <= 32 && groups.length <= 7;
    if (
      (compactCJKLine || compactLatinLine)
      && naturalWidth > geometry.maxWidth
      && geometry.fontSize > 32
    ) {
      const fittedSize = geometry.fontSize * geometry.maxWidth / naturalWidth * 0.975;
      if (fittedSize < geometry.fontSize - 0.5) {
        geometry = { ...geometry, fontSize: Math.max(32, fittedSize) };
        continue;
      }
    }
    glyphs = [];
    groups.forEach((indices) => {
      const groupWidth = indices.reduce((total, index) => total + widths[index]!, 0);
      if (rowWidths[row]! > 0 && rowWidths[row]! + groupWidth > geometry.maxWidth) {
        row += 1;
        rowWidths[row] = 0;
      }
      indices.forEach((index) => {
        const width = widths[index]!;
        if (rowWidths[row]! > 0 && rowWidths[row]! + width > geometry.maxWidth) {
          row += 1;
          rowWidths[row] = 0;
        }
        glyphs.push({ text: pieces[index]!, index, row, x: rowWidths[row]!, y: geometry.y + row * lineHeight, width, revealMs: times[index]! });
        rowWidths[row]! += width;
      });
    });
    const maximumRows = section.layout === "duetDivide" || section.layout === "editorialSplit" ? 2 : 3;
    if ((rowWidths.length <= maximumRows && rowWidths.length * lineHeight <= viewport.height * 0.48) || geometry.fontSize <= 28) break;
    geometry = { ...geometry, fontSize: Math.max(28, geometry.fontSize * 0.84) };
  }

  const rowOffsets = rowWidths.map((rowWidth) => {
    if (geometry.alignment === "trailing") return geometry.x + geometry.maxWidth - rowWidth;
    if (geometry.alignment === "center") return geometry.x + (geometry.maxWidth - rowWidth) / 2;
    return geometry.x;
  });
  glyphs = glyphs.map((glyph) => ({ ...glyph, x: glyph.x + rowOffsets[glyph.row]! }));
  const minX = glyphs.reduce((value, glyph) => Math.min(value, glyph.x), viewport.width);
  const maxX = glyphs.reduce((value, glyph) => Math.max(value, glyph.x + glyph.width), 0);
  const family = fontFamilyFor(section.typography);
  return {
    lineIndex: line.lineIndex,
    fromMs: line.fromMs,
    toMs: line.toMs,
    text: line.text,
    voiceRole: line.voiceRole ?? "lead",
    font: `${fontWeightFor(section.typography)} ${geometry.fontSize}px ${family}`,
    fontFamily: family,
    fontSize: geometry.fontSize,
    lineHeight,
    glyphs,
    bounds: { x: minX, y: geometry.y - geometry.fontSize, width: maxX - minX, height: rowWidths.length * lineHeight },
    section,
    directive,
    repetitionIndex,
    repetitionCount,
  };
};

export const prepareDirectedStageV1 = (
  lyrics: LyricDocumentV0,
  plan: DirectorPlanV1,
  viewport: DirectedStageViewportV1,
  measure: DirectedTextMeasurerV1,
): PreparedDirectedStageV1 => {
  const sections = [...plan.sections].sort((left, right) => left.fromLineIndex - right.fromLineIndex);
  const directives = new Map(plan.directives.map((directive) => [directive.lineIndex, directive]));
  const repeatTotals = new Map<string, number>();
  const repeatSeen = new Map<string, number>();
  lyrics.lines.forEach((line) => {
    const key = normalizeText(line.text);
    repeatTotals.set(key, (repeatTotals.get(key) ?? 0) + 1);
  });
  const lines = lyrics.lines.map((line) => {
    const section = sections.find((candidate) => line.lineIndex >= candidate.fromLineIndex && line.lineIndex <= candidate.toLineIndex) ?? sections[0]!;
    const directive = directives.get(line.lineIndex) ?? {
      lineIndex: line.lineIndex,
      behavior: "settle" as const,
      alignment: "center" as const,
      direction: 1 as const,
      intensity: 0.58,
      fontScale: 1,
      glyphStagger: 0,
      paletteRole: "primary" as const,
    };
    const key = normalizeText(line.text);
    const repetitionIndex = repeatSeen.get(key) ?? 0;
    repeatSeen.set(key, repetitionIndex + 1);
    return prepareLine(line, section, directive, viewport, measure, repetitionIndex, repeatTotals.get(key) ?? 1);
  });
  return {
    version: "prepared-directed-stage-v1",
    identity: stableHash32({ plan: plan.planIdentity, rendererVersion: viewport.rendererVersion, viewport: [viewport.width, viewport.height] }),
    viewport,
    lyrics,
    plan,
    lines,
    linesByIndex: new Map(lines.map((line) => [line.lineIndex, line])),
  };
};
