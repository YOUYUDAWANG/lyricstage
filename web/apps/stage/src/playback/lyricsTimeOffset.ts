export const MAX_LYRICS_OFFSET_MS = 10_000;
export const LYRICS_OFFSET_STEP_MS = 500;

export const clampLyricsOffsetMs = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_LYRICS_OFFSET_MS, Math.max(-MAX_LYRICS_OFFSET_MS, Math.round(value)));
};

export const lyricsTimeForPlaybackMs = (
  playbackTimeMs: number,
  lyricsOffsetMs: number,
  durationMs: number,
): number => Math.min(
  Math.max(0, durationMs),
  Math.max(0, playbackTimeMs - clampLyricsOffsetMs(lyricsOffsetMs)),
);

export const playbackTimeForLyricsMs = (
  lyricsTimeMs: number,
  lyricsOffsetMs: number,
  durationMs: number,
): number => Math.min(
  Math.max(0, durationMs),
  Math.max(0, lyricsTimeMs + clampLyricsOffsetMs(lyricsOffsetMs)),
);

export const formatLyricsOffset = (lyricsOffsetMs: number): string => {
  const bounded = clampLyricsOffsetMs(lyricsOffsetMs);
  if (bounded === 0) return "同步";
  const seconds = (Math.abs(bounded) / 1000).toFixed(1);
  return bounded < 0 ? `提前 ${seconds}s` : `延后 ${seconds}s`;
};

export const lyricsOffsetForIdentity = (
  loadedIdentity: string | null,
  currentIdentity: string | null,
  lyricsOffsetMs: number,
): number => loadedIdentity !== null && loadedIdentity === currentIdentity
  ? clampLyricsOffsetMs(lyricsOffsetMs)
  : 0;
