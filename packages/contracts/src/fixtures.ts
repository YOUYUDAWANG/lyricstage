import duetOverlap from "../fixtures/duet-overlap.json";
import lineOnlyJA from "../fixtures/line-only-ja.json";
import longLine from "../fixtures/long-line.json";
import longSongStructure from "../fixtures/long-song-structure.json";
import repeatedHook from "../fixtures/repeated-hook.json";
import wordTimedMixed from "../fixtures/word-timed-mixed.json";
import type { LyricDocumentV0 } from "./types";

export const lyricFixtures = {
  lineOnlyJA: lineOnlyJA as LyricDocumentV0,
  wordTimedMixed: wordTimedMixed as LyricDocumentV0,
  longLine: longLine as LyricDocumentV0,
  repeatedHook: repeatedHook as LyricDocumentV0,
  duetOverlap: duetOverlap as LyricDocumentV0,
  longSongStructure: longSongStructure as LyricDocumentV0,
} as const;
