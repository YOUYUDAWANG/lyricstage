export interface EstimatedWordTimingV1 {
  index: number;
  text: string;
  fromMs: number;
  toMs: number;
  precision: "estimated";
}

const graphemes = (text: string): string[] => {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
      (entry) => entry.segment,
    );
  }
  return Array.from(text);
};

const tokenWeight = (text: string): number => {
  let weight = 0;
  for (const grapheme of graphemes(text)) {
    if (/^\s+$/u.test(grapheme)) {
      weight += 0.12;
    } else if (/^[、。，．！？!?…・/\\|｜:：;；()[\]{}「」『』【】]+$/u.test(grapheme)) {
      weight += 0.28;
    } else if (/^[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮー]$/u.test(grapheme)) {
      weight += 0.45;
    } else if (/^[っッ]$/u.test(grapheme)) {
      weight += 0.6;
    } else if (/^[A-Za-z]$/u.test(grapheme)) {
      weight += /[AEIOUYaeiouy]/u.test(grapheme) ? 0.72 : 0.38;
    } else if (/^[0-9]$/u.test(grapheme)) {
      weight += 0.62;
    } else {
      weight += 1;
    }
  }
  return Math.max(0.35, weight);
};

const tokens = (text: string): string[] => {
  const raw = typeof Intl.Segmenter === "function"
    ? Array.from(
        new Intl.Segmenter("ja", { granularity: "word" }).segment(text),
        (entry) => ({ text: entry.segment, wordLike: entry.isWordLike === true }),
      )
    : (text.match(/[A-Za-z0-9]+|\s+|./gu) ?? []).map((entry) => ({
        text: entry,
        wordLike: /[\p{L}\p{N}]/u.test(entry),
      }));
  const result: string[] = [];
  let leading = "";
  for (const entry of raw) {
    if (entry.wordLike) {
      result.push(leading + entry.text);
      leading = "";
    } else if (result.length > 0) {
      result[result.length - 1] += entry.text;
    } else {
      leading += entry.text;
    }
  }
  if (leading) {
    if (result.length > 0) result[result.length - 1] += leading;
    else result.push(leading);
  }
  return result.filter(Boolean);
};

export const estimateWordTimingV1 = (
  text: string,
  fromMs: number,
  toMs: number,
): EstimatedWordTimingV1[] => {
  const durationMs = toMs - fromMs;
  if (!text.trim() || durationMs < 400) return [];
  const pieces = tokens(text);
  if (pieces.length < 2 || pieces.length > 120) return [];
  const weights = pieces.map(tokenWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return [];

  const tailMs = Math.min(450, Math.max(80, durationMs * 0.08));
  const estimatedEndMs = Math.max(fromMs + 320, toMs - tailMs);
  const spanMs = estimatedEndMs - fromMs;
  let cursorMs = fromMs;
  return pieces.map((piece, index) => {
    const isLast = index === pieces.length - 1;
    const nextMs = isLast
      ? estimatedEndMs
      : cursorMs + spanMs * (weights[index]! / totalWeight);
    const timing: EstimatedWordTimingV1 = {
      index,
      text: piece,
      fromMs: cursorMs,
      toMs: nextMs,
      precision: "estimated",
    };
    cursorMs = nextMs;
    return timing;
  });
};
