import type { LyricDocumentV0, LyricLineV0 } from "@lyricstage/contracts";
import { alignTimedLineSegments } from "../column/timedLineText";

export interface YouLySyllableModel {
  text: string;
  leadingText: string;
  fromMs: number;
  toMs: number;
  timingKind: "native" | "estimated";
  growable: boolean;
}

export interface YouLyLineModel {
  key: string;
  lineIndex: number | null;
  fromMs: number;
  toMs: number;
  text: string;
  side: "left" | "right";
  rtl: boolean;
  gap: boolean;
  syllables: YouLySyllableModel[];
  trailingText: string;
}

const isRTL = (text: string): boolean => /[\u0590-\u08ff\ufb1d-\ufefc]/u.test(text);

const lineSide = (line: LyricLineV0): "left" | "right" =>
  line.voiceRole === "duetB" ? "right" : "left";

const graphemeCount = (text: string): number => {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)).length;
  }
  return Array.from(text).length;
};

const lineModel = (line: LyricLineV0, reduceMotion: boolean): YouLyLineModel => {
  const rtl = isRTL(line.text);
  let pendingText = "";
  const syllables: YouLySyllableModel[] = [];
  for (const segment of alignTimedLineSegments(line)) {
    if (segment.kind !== "word") {
      pendingText += segment.text;
      continue;
    }
    const durationMs = segment.toMs - segment.fromMs;
    syllables.push({
      text: segment.text,
      leadingText: pendingText,
      fromMs: segment.fromMs,
      toMs: segment.toMs,
      timingKind: segment.timingKind,
      growable: !reduceMotion && !rtl && graphemeCount(segment.text.trim()) <= 7 && durationMs >= 1_000,
    });
    pendingText = "";
  }
  return {
    key: `line:${line.lineIndex}`,
    lineIndex: line.lineIndex,
    fromMs: line.fromMs,
    toMs: line.toMs,
    text: line.text,
    side: lineSide(line),
    rtl,
    gap: false,
    syllables,
    trailingText: pendingText,
  };
};

const gapModel = (
  key: string,
  fromMs: number,
  toMs: number,
  side: "left" | "right",
  rtl: boolean,
): YouLyLineModel => ({
  key,
  lineIndex: null,
  fromMs,
  toMs,
  text: "•••",
  side,
  rtl,
  gap: true,
  syllables: Array.from({ length: 3 }, (_, index) => {
    const segmentMs = (toMs - fromMs) / 3;
    const syllableFromMs = fromMs + segmentMs * index + segmentMs * 0.3;
    return {
      text: "•",
      leadingText: "",
      fromMs: syllableFromMs,
      toMs: syllableFromMs + segmentMs * 0.7,
      timingKind: "native" as const,
      growable: false,
    };
  }),
  trailingText: "",
});

/**
 * Adapts LyricStage timing truth into the persistent DOM structure used by
 * YouLy+ 4.4.3. The 7s gap threshold and 0.31s/0.66s margins are retained
 * from its renderer instead of inferred locally.
 */
export const buildYouLyColumnLines = (
  lyrics: LyricDocumentV0,
  reduceMotion: boolean,
): YouLyLineModel[] => {
  const source = lyrics.lines.map((line) => lineModel(line, reduceMotion));
  if (source.length === 0) return [];
  const result: YouLyLineModel[] = [];
  const first = source[0]!;
  if (first.fromMs >= 7_000) {
    result.push(gapModel("gap:prelude", 0, first.fromMs - 660, first.side, first.rtl));
  }
  source.forEach((line, index) => {
    result.push(line);
    const next = source[index + 1];
    if (next && next.fromMs - line.toMs >= 7_000) {
      result.push(gapModel(`gap:${line.key}:${next.key}`, line.toMs + 310, next.fromMs - 660, next.side, next.rtl));
    }
  });
  return result;
};

export const youLyLineIndexAtTime = (
  lines: readonly YouLyLineModel[],
  timeMs: number,
  hint = 0,
): number => {
  if (hint >= 0 && hint < lines.length) {
    const current = lines[hint]!;
    if (timeMs >= current.fromMs && timeMs < current.toMs) return hint;
    const next = lines[hint + 1];
    if (next && timeMs >= next.fromMs && timeMs < next.toMs) return hint + 1;
  }
  let low = 0;
  let high = lines.length - 1;
  let previous = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const line = lines[middle]!;
    if (timeMs >= line.fromMs && timeMs < line.toMs) return middle;
    if (timeMs < line.fromMs) high = middle - 1;
    else {
      low = middle + 1;
      previous = middle;
    }
  }
  return previous;
};

export const youLyScrollLookAheadMs = (
  lines: readonly YouLyLineModel[],
  activeIndex: number,
): number => {
  const current = lines[activeIndex];
  const next = lines[activeIndex + 1];
  if (!current || !next) return 350;
  return Math.min(500, Math.max(350, next.fromMs - current.fromMs));
};

/**
 * Keeps a lyric row visually stationary for the first frame after the viewport
 * scroll position changes. Moving scrollTop down moves content up, so the row
 * needs an equal positive translateY before it animates back to zero.
 */
export const youLyScrollCompensationPx = (
  currentScrollTop: number,
  targetScrollTop: number,
): number => targetScrollTop - currentScrollTop;
