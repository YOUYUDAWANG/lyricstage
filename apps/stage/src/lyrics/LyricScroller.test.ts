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
      density: "fullscreen",
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
      density: "column",
      reduceMotion: false,
      onSeek: () => undefined,
    }));
    expect(html).not.toContain("aria-current=\"true\"");
    expect(html).toContain("data-has-active=\"false\"");
  });

  it("keeps YouLy character styling exclusive to the persistent column", () => {
    const base = lyricFixtures.duetOverlap;
    const first = base.lines[0]!;
    const lyrics = {
      ...base,
      lines: [{
        ...first,
        text: "光へ",
        words: [
          { wordIndex: 0, fromMs: first.fromMs, toMs: first.fromMs + 1_200, text: "光へ" },
        ],
      }],
    };
    const props = {
      lyrics,
      lyricTimeMs: first.fromMs + 600,
      lyricsOffsetMs: 0,
      durationMs: lyrics.durationMs,
      reduceMotion: false,
      onSeek: () => undefined,
    } as const;
    const column = renderToStaticMarkup(createElement(LyricScroller, { ...props, density: "column" }));
    const fullscreen = renderToStaticMarkup(createElement(LyricScroller, { ...props, density: "fullscreen" }));
    expect(column).toContain("lyric-scroller-char");
    expect(column).toContain("youly-phase-active");
    expect(fullscreen).not.toContain("lyric-scroller-char");
    expect(fullscreen).not.toContain("youly-phase-active");
  });
});
