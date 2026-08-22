import { describe, expect, it } from "vitest";
import type { LyricsCandidateV0 } from "@lyricstage/lyrics";
import { lyricDocumentFromCandidate } from "./lyricsCandidateDocument";

const baseCandidate = (): LyricsCandidateV0 => ({
  provider: "kugou",
  id: "word-1",
  title: "逐字歌",
  artist: "歌手",
  durationMs: 10_000,
  syncedLyrics: "[00:01.000]目覚め",
});

describe("lyrics candidate document", () => {
  it("preserves genuine LDDC word timing and rebinds the recording identity", () => {
    const candidate: LyricsCandidateV0 = {
      ...baseCandidate(),
      wordTimedDocument: {
        version: "lyric-document-v0",
        recordingID: "lyricsCandidate:kugou:word-1",
        durationMs: 10_000,
        lines: [{
          lineIndex: 0,
          fromMs: 1_000,
          toMs: 2_000,
          text: "目覚め",
          voiceRole: "lead",
          words: [
            { wordIndex: 0, fromMs: 1_000, toMs: 1_500, text: "目" },
            { wordIndex: 1, fromMs: 1_500, toMs: 2_000, text: "覚め" },
          ],
        }],
      },
    };
    const result = lyricDocumentFromCandidate(candidate, "youtubeMusic:video", 12_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recordingID).toBe("youtubeMusic:video");
    expect(result.value.durationMs).toBe(12_000);
    expect(result.value.lines[0]?.words?.map((word) => [word.text, word.fromMs, word.toMs])).toEqual([
      ["目", 1_000, 1_500],
      ["覚め", 1_500, 2_000],
    ]);
  });

  it("keeps ordinary LRC as the line-timed fallback", () => {
    const result = lyricDocumentFromCandidate(baseCandidate(), "youtubeMusic:video", 10_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[0]?.text).toBe("目覚め");
    expect(result.value.lines[0]?.words).toBeUndefined();
  });
});
