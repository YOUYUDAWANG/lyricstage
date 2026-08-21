import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import {
  alignTimedLineSegments,
  isStageHideRequest,
  MESSAGE_REQUEST_HIDE,
  retainCandidatesAfterChoice,
  segmentsTextContent,
  shouldRequestParentHideOnEsc,
} from "./timedLineText";

describe("alignTimedLineSegments", () => {
  it("keeps the full word-timed-mixed body including spaces, slash and emoji", () => {
    const line = lyricFixtures.wordTimedMixed.lines[0];
    const expected = "光へ / trace the morning ✦";
    expect(line.text).toBe(expected);
    const segments = alignTimedLineSegments(line);
    expect(segmentsTextContent(segments)).toBe(expected);
    expect(segments.some((segment) => segment.kind === "gap" && segment.text.includes(" / "))).toBe(true);
    expect(segments.some((segment) => segment.kind === "word" && segment.text === "✦")).toBe(true);
    expect(segments.every((segment) => segment.kind !== "word" || segment.timingKind === "native")).toBe(true);
  });

  it("estimates lightweight word timing for a Japanese line without mutating its text", () => {
    const line = {
      lineIndex: 0,
      fromMs: 1_000,
      toMs: 5_000,
      text: "君がいなくなったって",
    };
    const segments = alignTimedLineSegments(line);
    const words = segments.filter((segment) => segment.kind === "word");
    expect(segmentsTextContent(segments)).toBe(line.text);
    expect(words.length).toBeGreaterThan(2);
    expect(words.every((word) => word.timingKind === "estimated")).toBe(true);
    expect(words[0]?.fromMs).toBe(line.fromMs);
    expect(words.at(-1)?.toMs).toBeLessThan(line.toMs);
    expect(words.every((word, index) => index === 0 || word.fromMs === words[index - 1]!.toMs)).toBe(true);
  });

  it("preserves mixed Japanese, Latin, spaces and punctuation in estimated timing", () => {
    const line = {
      lineIndex: 1,
      fromMs: 2_000,
      toMs: 7_500,
      text: "まだ夢を見てる / still dreaming ✦",
    };
    const segments = alignTimedLineSegments(line);
    expect(segmentsTextContent(segments)).toBe(line.text);
    expect(segments.filter((segment) => segment.kind === "word").length).toBeGreaterThan(3);
  });

  it("keeps very short or non-lyrical lines plain", () => {
    const short = { lineIndex: 0, fromMs: 0, toMs: 250, text: "Hey" };
    const empty = { lineIndex: 1, fromMs: 0, toMs: 2_000, text: "   " };
    expect(alignTimedLineSegments(short)).toEqual([{ kind: "plain", text: "Hey" }]);
    expect(alignTimedLineSegments(empty)).toEqual([{ kind: "plain", text: "   " }]);
  });

  it("falls back to full line.text when a token cannot be found in order", () => {
    const line = {
      ...lyricFixtures.wordTimedMixed.lines[0],
      words: [
        { wordIndex: 0, fromMs: 1000, toMs: 2000, text: "missing-token" },
        { wordIndex: 1, fromMs: 2000, toMs: 3000, text: "trace" },
      ],
    };
    const segments = alignTimedLineSegments(line);
    expect(segments).toEqual([{ kind: "plain", text: line.text }]);
    expect(segmentsTextContent(segments)).toBe(line.text);
  });

  it("falls back when repeated tokens would skip earlier gaps incorrectly by failing join", () => {
    const line = {
      lineIndex: 0,
      fromMs: 0,
      toMs: 4000,
      text: "啊 啊 啊",
      words: [
        { wordIndex: 0, fromMs: 0, toMs: 1000, text: "啊" },
        { wordIndex: 1, fromMs: 1000, toMs: 2000, text: "啊" },
        { wordIndex: 2, fromMs: 2000, toMs: 3000, text: "啊" },
      ],
    };
    const segments = alignTimedLineSegments(line);
    expect(segmentsTextContent(segments)).toBe("啊 啊 啊");
    expect(segments.filter((segment) => segment.kind === "gap").map((segment) => segment.text)).toEqual([
      " ",
      " ",
    ]);
  });
});

describe("candidate retention and Esc routing", () => {
  it("keeps the full candidate list after a choice", () => {
    const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(retainCandidatesAfterChoice(pool, pool[1])).toEqual(pool);
    expect(retainCandidatesAfterChoice([], { id: "only" })).toEqual([{ id: "only" }]);
  });

  it("Esc never requests parent hide in enhanced native model", () => {
    expect(shouldRequestParentHideOnEsc("column")).toBe(false);
    expect(shouldRequestParentHideOnEsc("fullscreen")).toBe(false);
    expect(isStageHideRequest({ type: MESSAGE_REQUEST_HIDE })).toBe(true);
    expect(isStageHideRequest({ type: "other" })).toBe(false);
  });
});
