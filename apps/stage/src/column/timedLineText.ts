import type { LyricLineV0 } from "@lyricstage/contracts";
import type { LyricsCandidateV0 } from "@lyricstage/lyrics";
import { estimateWordTimingV1 } from "@lyricstage/performance";

export type TimedLineSegment =
  | { kind: "gap"; text: string }
  | {
      kind: "word";
      text: string;
      wordIndex: number;
      fromMs: number;
      toMs: number;
      timingKind: "native" | "estimated";
    }
  | { kind: "plain"; text: string };

const joinSegments = (segments: TimedLineSegment[]): string =>
  segments.map((segment) => segment.text).join("");

const estimateLineSegments = (line: LyricLineV0): TimedLineSegment[] => {
  const estimated = estimateWordTimingV1(line.text, line.fromMs, line.toMs);
  if (estimated.length === 0) return [{ kind: "plain", text: line.text }];
  return estimated.map((word) => {
    const segment: TimedLineSegment = {
      kind: "word",
      text: word.text,
      wordIndex: word.index,
      fromMs: word.fromMs,
      toMs: word.toMs,
      timingKind: "estimated",
    };
    return segment;
  });
};

/**
 * Build display segments from line.text as the sole body.
 * words only supply timing anchors; gaps between tokens are preserved.
 * If any word cannot be found in order, fall back to the full line.text.
 */
export const alignTimedLineSegments = (line: LyricLineV0): TimedLineSegment[] => {
  const words = line.words ?? [];
  if (words.length === 0) return estimateLineSegments(line);

  const segments: TimedLineSegment[] = [];
  let cursor = 0;
  for (const word of words) {
    if (!word.text) return [{ kind: "plain", text: line.text }];
    const index = line.text.indexOf(word.text, cursor);
    if (index < 0) return [{ kind: "plain", text: line.text }];
    if (index > cursor) {
      segments.push({ kind: "gap", text: line.text.slice(cursor, index) });
    }
    segments.push({
      kind: "word",
      text: word.text,
      wordIndex: word.wordIndex,
      fromMs: word.fromMs,
      toMs: word.toMs,
      timingKind: "native",
    });
    cursor = index + word.text.length;
  }
  if (cursor < line.text.length) {
    segments.push({ kind: "gap", text: line.text.slice(cursor) });
  }
  if (joinSegments(segments) !== line.text) {
    return [{ kind: "plain", text: line.text }];
  }
  return segments;
};

export const segmentsTextContent = (segments: TimedLineSegment[]): string => joinSegments(segments);

export const wordProgressFromTiming = (
  timeMs: number,
  fromMs: number,
  toMs: number,
): number => {
  if (timeMs <= fromMs) return 0;
  if (timeMs >= toMs) return 1;
  return Math.min(1, Math.max(0, (timeMs - fromMs) / Math.max(1, toMs - fromMs)));
};

/** Keep the full candidate pool after an explicit choice. */
export const retainCandidatesAfterChoice = <T,>(
  previous: readonly T[],
  chosen: T,
): T[] => (previous.length > 0 ? [...previous] : [chosen]);

export const alternativeLyricsCandidates = (
  candidates: readonly LyricsCandidateV0[],
  selectedCandidateKey?: string,
  limit = 5,
): LyricsCandidateV0[] => candidates
  .filter((candidate) => `${candidate.provider}:${candidate.id}` !== selectedCandidateKey)
  .slice(0, Math.max(0, limit));

export const MESSAGE_REQUEST_HIDE = "lyricstage-request-hide" as const;

export const isStageHideRequest = (
  data: unknown,
): data is { type: typeof MESSAGE_REQUEST_HIDE } =>
  typeof data === "object"
  && data !== null
  && (data as { type?: unknown }).type === MESSAGE_REQUEST_HIDE;

/** In the enhanced native lyrics model, Esc does not switch tabs or hide the panel. */
export const shouldRequestParentHideOnEsc = (_presentation: "column" | "fullscreen"): boolean =>
  false;
