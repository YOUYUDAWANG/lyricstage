import { describe, expect, it } from "vitest";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import {
  buildYouLyColumnLines,
  youLyLineIndexAtTime,
  youLyScrollCompensationPx,
  youLyScrollLookAheadMs,
} from "./youlyColumnModel";

const lyrics: LyricDocumentV0 = {
  version: "lyric-document-v0",
  recordingID: "youly-adapter",
  durationMs: 30_000,
  lines: [
    { lineIndex: 0, fromMs: 8_000, toMs: 10_000, text: "光へ", words: [{ wordIndex: 0, fromMs: 8_000, toMs: 9_200, text: "光へ" }] },
    { lineIndex: 1, fromMs: 20_000, toMs: 22_000, text: "answer", voiceRole: "duetB" },
  ],
};

describe("YouLy Column adapter", () => {
  it("retains YouLy 4.4.3 gap thresholds and margins", () => {
    const lines = buildYouLyColumnLines(lyrics, false);
    expect(lines.map((line) => line.key)).toEqual([
      "gap:prelude",
      "line:0",
      "gap:line:0:line:1",
      "line:1",
    ]);
    expect(lines[0]).toMatchObject({ fromMs: 0, toMs: 7_340, gap: true });
    expect(lines[2]).toMatchObject({ fromMs: 10_310, toMs: 19_340, gap: true });
  });

  it("uses the source growable rule and voice side mapping", () => {
    const lines = buildYouLyColumnLines(lyrics, false);
    expect(lines[1]?.syllables[0]?.growable).toBe(true);
    expect(lines[3]?.side).toBe("right");
    expect(buildYouLyColumnLines(lyrics, true)[1]?.syllables[0]?.growable).toBe(false);
  });

  it("finds active lines with a sequential hint and bounded look-ahead", () => {
    const lines = buildYouLyColumnLines(lyrics, false);
    expect(youLyLineIndexAtTime(lines, 8_500, 0)).toBe(1);
    expect(youLyLineIndexAtTime(lines, 15_000, 1)).toBe(2);
    expect(youLyScrollLookAheadMs(lines, 1)).toBe(500);
  });

  it("cancels the first-frame displacement caused by a scrollTop change", () => {
    expect(youLyScrollCompensationPx(413, 464)).toBe(51);
    expect(youLyScrollCompensationPx(464, 413)).toBe(-51);
  });

  it("keeps RTL text on its source direction and disables character growth", () => {
    const rtlLyrics: LyricDocumentV0 = {
      ...lyrics,
      recordingID: "youly-rtl",
      lines: [{
        lineIndex: 0,
        fromMs: 0,
        toMs: 2_000,
        text: "مرحبا",
        voiceRole: "duetB",
        words: [{ wordIndex: 0, fromMs: 0, toMs: 1_500, text: "مرحبا" }],
      }],
    };
    const [line] = buildYouLyColumnLines(rtlLyrics, false);
    expect(line).toMatchObject({ rtl: true, side: "right" });
    expect(line?.syllables[0]?.growable).toBe(false);
  });
});
