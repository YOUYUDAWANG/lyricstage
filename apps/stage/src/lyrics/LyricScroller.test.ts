import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { LyricScroller } from "./LyricScroller";

describe("LyricScroller", () => {
  it("renders native seek buttons and exposes every overlapping active line", () => {
    const lyrics = lyricFixtures.duetOverlap;
    const html = renderToStaticMarkup(createElement(LyricScroller, {
      lyrics,
      lyricTimeMs: 12_600,
      lyricsOffsetMs: 0,
      durationMs: lyrics.durationMs,
      reduceMotion: false,
      onSeek: () => undefined,
    }));
    expect(html.match(/<button/gu)).toHaveLength(lyrics.lines.length);
    expect(html.match(/aria-current="true"/gu)).toHaveLength(2);
    expect(html).toContain("data-density=\"fullscreen\"");
    expect(html).not.toContain("role=\"button\"");
  });

  it("does not pretend the previous line is active during an instrumental gap", () => {
    const lyrics = {
      ...lyricFixtures.duetOverlap,
      lines: [
        { ...lyricFixtures.duetOverlap.lines[0]!, fromMs: 0, toMs: 1_000 },
        { ...lyricFixtures.duetOverlap.lines[1]!, fromMs: 3_000, toMs: 4_000 },
      ],
    };
    const html = renderToStaticMarkup(createElement(LyricScroller, {
      lyrics,
      lyricTimeMs: 2_000,
      lyricsOffsetMs: 0,
      durationMs: lyrics.durationMs,
      reduceMotion: false,
      onSeek: () => undefined,
    }));
    expect(html).not.toContain("aria-current=\"true\"");
    expect(html).toContain("data-has-active=\"false\"");
  });

});
