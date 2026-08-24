const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const segmentDisplayGraphemes = (text: string): string[] => {
  if (!text) return [];
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
};

export const graphemeWipeProgress = (
  wordProgress: number,
  graphemeIndex: number,
  graphemeCount: number,
): number => {
  if (graphemeCount <= 0) return 0;
  return clamp01(clamp01(wordProgress) * graphemeCount - graphemeIndex);
};

export const youlyWordGrowthScale = (
  wordProgress: number,
  graphemeCount: number,
  durationMs: number,
  reduceMotion: boolean,
): number => {
  if (reduceMotion || graphemeCount === 0 || graphemeCount > 7 || durationMs < 1_000) return 1;
  return 1 + Math.sin(clamp01(wordProgress) * Math.PI) * 0.035;
};

export const youlyLineVisualClass = (
  phase: "past" | "active" | "future",
  proximity: "active" | "near" | "middle" | "far",
): string => [
  phase === "active" ? "youly-phase-active" : "youly-phase-inactive",
  `youly-proximity-${proximity}`,
].join(" ");
