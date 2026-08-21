import type { LyricDocumentV0 } from "@lyricstage/contracts";

export type NonMusicSegmentMs = [number, number];

export const mergeNonMusicSegments = (
  segments: readonly NonMusicSegmentMs[],
): NonMusicSegmentMs[] => {
  const sorted = segments
    .filter(([fromMs, toMs]) =>
      Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs >= 0 && toMs > fromMs
    )
    .map(([fromMs, toMs]): NonMusicSegmentMs => [Math.round(fromMs), Math.round(toMs)])
    .filter(([fromMs, toMs]) => toMs > fromMs)
    .sort((left, right) => left[0] - right[0]);
  const merged: NonMusicSegmentMs[] = [];
  for (const segment of sorted) {
    const previous = merged.at(-1);
    if (previous && segment[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], segment[1]);
    } else {
      merged.push(segment);
    }
  }
  return merged;
};

export const effectiveMusicDurationMs = (
  durationMs: number,
  segments: readonly NonMusicSegmentMs[],
): number => Math.max(
  1,
  durationMs - mergeNonMusicSegments(segments).reduce((total, [fromMs, toMs]) =>
    total + Math.max(0, Math.min(durationMs, toMs) - Math.min(durationMs, fromMs)), 0),
);

export const videoTimeForMusicTime = (
  musicTimeMs: number,
  segments: readonly NonMusicSegmentMs[],
): number => {
  let cumulativeOffset = 0;
  for (const [videoFromMs, videoToMs] of mergeNonMusicSegments(segments)) {
    const musicTriggerMs = videoFromMs - cumulativeOffset;
    if (musicTimeMs < musicTriggerMs) break;
    cumulativeOffset += videoToMs - videoFromMs;
  }
  return musicTimeMs + cumulativeOffset;
};

export const applyNonMusicSegments = (
  lyrics: LyricDocumentV0,
  segments: readonly NonMusicSegmentMs[],
  videoDurationMs: number,
): LyricDocumentV0 => {
  const merged = mergeNonMusicSegments(segments);
  if (merged.length === 0) return lyrics;
  const lines = lyrics.lines.map((line) => ({
    ...line,
    fromMs: videoTimeForMusicTime(line.fromMs, merged),
    toMs: videoTimeForMusicTime(line.toMs, merged),
    ...(line.words
      ? {
          words: line.words.map((word) => ({
            ...word,
            fromMs: videoTimeForMusicTime(word.fromMs, merged),
            toMs: videoTimeForMusicTime(word.toMs, merged),
          })),
        }
      : {}),
  }));
  const latestLyricTimeMs = lines.reduce((latest, line) => Math.max(
    latest,
    line.toMs,
    ...(line.words ?? []).map((word) => word.toMs),
  ), 0);
  return {
    ...lyrics,
    durationMs: Math.max(lyrics.durationMs, Math.round(videoDurationMs), latestLyricTimeMs),
    lines,
  };
};
