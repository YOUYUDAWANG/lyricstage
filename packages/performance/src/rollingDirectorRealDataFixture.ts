import type { LyricDocumentV0 } from "@lyricstage/contracts";

// A realistic whole-song timing shape without embedding third-party lyrics.
// It intentionally mixes short/long lines, CJK/Latin text, repeated hooks,
// punctuation and simultaneous entries so rolling coverage sees production-like
// input while the fixture remains portable and redistributable.
const lineStartsSeconds = [
  0, 8, 11, 13, 15, 18, 21, 25, 27, 30, 33, 36, 38, 39, 42, 43,
  45, 48, 49, 54, 55, 59, 61, 65, 67, 74, 77, 80, 83, 86, 91, 97,
  99, 100, 102, 103, 104, 106, 109, 115, 121, 122, 125, 126, 128, 132,
  138, 144, 150, 150, 160, 168, 173, 176, 179, 180, 185, 186, 190, 192,
  196, 197,
] as const;

const fixturePhrases = [
  "夜明け前のアンテナが光る",
  "Trace the signal, keep it near",
  "まだ名前のないリズム",
  "one step / two steps / breathe",
  "窓の向こうへ手を伸ばす",
  "ほどけた声を結び直して",
  "Echo, echo — answer me",
  "同じ合図が違って聞こえる",
  "静かな余白に星を置く",
  "走れ、走れ、朝まで",
  "We return to the opening line",
  "光へ / trace the morning ✦",
  "ふたりの声が重なる",
  "left voice: stay",
  "right voice: go",
  "最後の合図を忘れない",
] as const;

const realisticLineText = (lineIndex: number): string => {
  const phrase = fixturePhrases[lineIndex % fixturePhrases.length]!;
  const repetition = Math.floor(lineIndex / fixturePhrases.length);
  return repetition === 0 ? phrase : `${phrase} (${repetition + 1})`;
};

export const realisticLyrics = (): LyricDocumentV0 => ({
  version: "lyric-document-v0",
  recordingID: "fixture:rolling-realistic-song",
  durationMs: 206_000,
  lines: lineStartsSeconds.map((startSeconds, lineIndex) => {
    const nextSeconds = lineStartsSeconds[lineIndex + 1] ?? 206;
    const fromMs = startSeconds * 1_000;
    return {
      lineIndex,
      fromMs,
      toMs: Math.min(206_000, Math.max(fromMs + 900, nextSeconds * 1_000)),
      text: realisticLineText(lineIndex),
    };
  }),
});
