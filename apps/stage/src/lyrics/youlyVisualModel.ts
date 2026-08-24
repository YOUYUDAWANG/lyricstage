export const segmentDisplayGraphemes = (text: string): string[] => {
  if (!text) return [];
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
};
