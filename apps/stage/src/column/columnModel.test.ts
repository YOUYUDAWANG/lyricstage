import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import {
  columnToolAfterLyricsSearch,
  eventPathStartsInEditableControl,
  lineMaskProgress,
  linePhase,
  mapVoiceClass,
  resolveColumnSurfaceState,
  toggledColumnTool,
  wordProgress,
} from "./columnModel";

describe("columnModel", () => {
  it("keeps exactly one visible lyric tool and closes it on a second click", () => {
    expect(toggledColumnTool(null, "timing")).toBe("timing");
    expect(toggledColumnTool("timing", "search")).toBe("search");
    expect(toggledColumnTool("search", "versions")).toBe("versions");
    expect(toggledColumnTool("versions", "versions")).toBeNull();
  });

  it("moves a successful manual search from the covered form to its candidate list", () => {
    expect(columnToolAfterLyricsSearch("search", "searching", "candidates", 2)).toBe("versions");
    expect(columnToolAfterLyricsSearch("search", "searching", "miss", 0)).toBe("search");
    expect(columnToolAfterLyricsSearch("search", "searching", "error", 0)).toBe("search");
    expect(columnToolAfterLyricsSearch("search", "candidates", "candidates", 2)).toBe("search");
  });

  it("recognizes editable origins across a retargeted Shadow DOM event path", () => {
    expect(eventPathStartsInEditableControl([{ tagName: "INPUT" }, { tagName: "DIV" }])).toBe(true);
    expect(eventPathStartsInEditableControl([{ tagName: "DIV", isContentEditable: true }])).toBe(true);
    expect(eventPathStartsInEditableControl([{ tagName: "DIV", getAttribute: (name: string) => name === "role" ? "textbox" : null }])).toBe(true);
    expect(eventPathStartsInEditableControl([{ tagName: "BUTTON" }])).toBe(false);
  });

  it("maps lifecycle states without collapsing to a blank surface", () => {
    expect(
      resolveColumnSurfaceState({
        bridgeAvailable: false,
        bridgeConnected: false,
        hasSnapshot: false,
        disconnected: true,
        automaticStatus: "error",
        hasMatchingLyrics: false,
        timeMs: 0,
        lyrics: null,
      }),
    ).toBe("bridgeUnavailable");

    expect(
      resolveColumnSurfaceState({
        bridgeAvailable: true,
        bridgeConnected: false,
        hasSnapshot: false,
        disconnected: false,
        automaticStatus: "idle",
        hasMatchingLyrics: false,
        timeMs: 0,
        lyrics: null,
      }),
    ).toBe("awaitingTrack");

    expect(
      resolveColumnSurfaceState({
        bridgeAvailable: true,
        bridgeConnected: true,
        hasSnapshot: true,
        disconnected: false,
        automaticStatus: "searching",
        hasMatchingLyrics: false,
        timeMs: 0,
        lyrics: null,
      }),
    ).toBe("searching");

    expect(
      resolveColumnSurfaceState({
        bridgeAvailable: true,
        bridgeConnected: true,
        hasSnapshot: true,
        disconnected: false,
        automaticStatus: "candidates",
        hasMatchingLyrics: false,
        timeMs: 0,
        lyrics: null,
      }),
    ).toBe("candidates");

    expect(
      resolveColumnSurfaceState({
        bridgeAvailable: true,
        bridgeConnected: true,
        hasSnapshot: true,
        disconnected: false,
        automaticStatus: "miss",
        hasMatchingLyrics: false,
        timeMs: 0,
        lyrics: null,
      }),
    ).toBe("miss");
  });

  it("distinguishes prelude, singing, interlude, paused and disconnected", () => {
    const lyrics = {
      ...lyricFixtures.repeatedHook,
      lines: lyricFixtures.repeatedHook.lines.map((line, index) =>
        index === 0 ? { ...line, fromMs: 4000, toMs: 8000 } : line,
      ),
    };
    const base = {
      bridgeAvailable: true,
      bridgeConnected: true,
      hasSnapshot: true,
      disconnected: false,
      automaticStatus: "matched" as const,
      hasMatchingLyrics: true,
      lyrics,
    };

    expect(resolveColumnSurfaceState({ ...base, timeMs: 500, playbackState: "playing" })).toBe("prelude");
    expect(resolveColumnSurfaceState({ ...base, timeMs: 5000, playbackState: "playing" })).toBe("singing");
    expect(resolveColumnSurfaceState({ ...base, timeMs: 37000, playbackState: "playing" })).toBe("interlude");
    expect(resolveColumnSurfaceState({ ...base, timeMs: 5000, playbackState: "paused" })).toBe("paused");
    expect(
      resolveColumnSurfaceState({
        ...base,
        disconnected: true,
        bridgeConnected: false,
        timeMs: 5000,
        playbackState: "playing",
      }),
    ).toBe("disconnected");
  });

  it("applies word mask progress only when real word timing exists", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const line = lyrics.lines[0];
    const plain = lyricFixtures.repeatedHook.lines[0];
    expect(mapVoiceClass("duetA")).toBe("duet");
    expect(mapVoiceClass("harmony")).toBe("backing");
    expect(linePhase(line, line.fromMs - 10, new Set())).toBe("future");
    expect(linePhase(line, line.fromMs + 10, new Set([line.lineIndex]))).toBe("active");
    expect(wordProgress(line, line.words![0].fromMs, 0)).toBe(0);
    expect(wordProgress(line, line.words![0].toMs, 0)).toBe(1);
    expect(lineMaskProgress(line, line.toMs)).toBe(1);
    // Plain lines keep full-line highlight in UI; mask helper is unused without words.
    expect(plain.words).toBeUndefined();
    expect(lineMaskProgress(plain, plain.fromMs)).toBe(0);
    expect(lineMaskProgress(plain, plain.toMs)).toBe(1);
  });
});
