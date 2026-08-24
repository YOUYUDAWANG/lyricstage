import type { LyricLineV0 } from "@lyricstage/contracts";

export type LyricFollowMode = "following" | "browsing" | "returning";

export type LyricFollowEvent =
  | "user-browse"
  | "return-requested"
  | "return-completed"
  | "seek-failed"
  | "track-changed";

export const nextLyricFollowMode = (
  mode: LyricFollowMode,
  event: LyricFollowEvent,
): LyricFollowMode => {
  if (event === "track-changed") return "following";
  if (event === "user-browse" || event === "seek-failed") return "browsing";
  if (event === "return-requested") return "returning";
  if (event === "return-completed" && mode === "returning") return "following";
  return mode;
};

export const activeLyricLineIndices = (
  lines: readonly LyricLineV0[],
  timeMs: number,
): number[] => lines
  .filter((line) => timeMs >= line.fromMs && timeMs < line.toMs)
  .map((line) => line.lineIndex)
  .sort((left, right) => left - right);

export const activeLyricKey = (indices: Iterable<number>): string =>
  Array.from(indices).sort((left, right) => left - right).join(",");

export const nextLyricStartIntervalMs = (
  lines: readonly LyricLineV0[],
  activeIndices: ReadonlySet<number>,
): number | null => {
  const active = lines.filter((line) => activeIndices.has(line.lineIndex));
  if (active.length === 0) return null;
  const activeFromMs = Math.min(...active.map((line) => line.fromMs));
  const nextFromMs = lines
    .filter((line) => !activeIndices.has(line.lineIndex) && line.fromMs > activeFromMs)
    .reduce<number | null>((nearest, line) => nearest === null ? line.fromMs : Math.min(nearest, line.fromMs), null);
  return nextFromMs === null ? null : Math.max(0, nextFromMs - activeFromMs);
};

export const lyricScrollDurationMs = (
  nextStartIntervalMs: number | null,
  distancePx: number,
  reduceMotion: boolean,
): number => {
  if (reduceMotion || Math.abs(distancePx) < 1) return 0;
  const interval = nextStartIntervalMs ?? 4_000;
  const base = interval < 800
    ? 260
    : interval < 1_600
      ? 360
      : interval < 4_000
        ? 480
        : 560;
  const distanceAdjustment = Math.abs(distancePx) > 720 ? 80 : Math.abs(distancePx) > 360 ? 40 : 0;
  const doesNotOutliveNextLine = Math.max(120, interval - 80);
  return Math.min(640, doesNotOutliveNextLine, base + distanceAdjustment);
};

const sampleBezierAxis = (time: number, first: number, second: number): number => {
  const inverse = 1 - time;
  return 3 * inverse * inverse * time * first
    + 3 * inverse * time * time * second
    + time * time * time;
};

const sampleBezierDerivative = (time: number, first: number, second: number): number =>
  3 * (1 - time) * (1 - time) * first
  + 6 * (1 - time) * time * (second - first)
  + 3 * time * time * (1 - second);

/** cubic-bezier(0.77, 0, 0.175, 1), solved for x before sampling y. */
export const lyricScrollProgress = (rawProgress: number): number => {
  const progress = Math.min(1, Math.max(0, rawProgress));
  if (progress === 0 || progress === 1) return progress;
  let time = progress;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const error = sampleBezierAxis(time, 0.77, 0.175) - progress;
    const derivative = sampleBezierDerivative(time, 0.77, 0.175);
    if (Math.abs(error) < 0.0001 || Math.abs(derivative) < 0.0001) break;
    time = Math.min(1, Math.max(0, time - error / derivative));
  }
  return sampleBezierAxis(time, 0, 1);
};

export const lyricLineTabIndex = (
  lineIndex: number,
  activeIndices: readonly number[],
  firstLineIndex: number,
): 0 | -1 => lineIndex === (activeIndices[0] ?? firstLineIndex) ? 0 : -1;

