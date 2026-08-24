import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { YouLyColumnScroller, youLyBrowseReturnDelayMs } from "./YouLyColumnScroller";

const lyrics: LyricDocumentV0 = {
  version: "lyric-document-v0",
  recordingID: "youly-renderer",
  durationMs: 16_000,
  lines: [{
    lineIndex: 0,
    fromMs: 8_000,
    toMs: 10_000,
    text: "光へ",
    voiceRole: "duetB",
    words: [{ wordIndex: 0, fromMs: 8_000, toMs: 9_200, text: "光へ" }],
  }],
};

describe("YouLyColumnScroller", () => {
  it("renders the source-compatible line, word, syllable and character hierarchy", () => {
    const html = renderToStaticMarkup(createElement(YouLyColumnScroller, {
      lyrics,
      lyricsOffsetMs: 0,
      durationMs: lyrics.durationMs,
      reduceMotion: false,
      onSeek: () => undefined,
    }));
    expect(html).toContain("youly-column-container blur-inactive-enabled hide-offscreen");
    expect(html).toContain("youly-line singer-right");
    expect(html).toContain("youly-line-container");
    expect(html).toContain("youly-main-vocal-container");
    expect(html).toContain("youly-word growable");
    expect(html.match(/youly-char/g)).toHaveLength(2);
  });

  it("keeps the source gap line instead of inventing a normal lyric row", () => {
    const html = renderToStaticMarkup(createElement(YouLyColumnScroller, {
      lyrics,
      lyricsOffsetMs: 0,
      durationMs: lyrics.durationMs,
      reduceMotion: false,
      onSeek: () => undefined,
    }));
    expect(html).toContain("lyrics-gap");
    expect(html).toContain("aria-label=\"间奏\"");
  });

  it("returns to the current lyric five seconds after manual browsing without a button", () => {
    const html = renderToStaticMarkup(createElement(YouLyColumnScroller, {
      lyrics,
      lyricsOffsetMs: 0,
      durationMs: lyrics.durationMs,
      reduceMotion: false,
      onSeek: () => undefined,
    }));
    expect(youLyBrowseReturnDelayMs).toBe(5_000);
    expect(html).not.toContain("回到当前歌词");
    expect(html).not.toContain("youly-return-current");
  });
});
