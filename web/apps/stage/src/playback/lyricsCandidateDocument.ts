import {
  parseLyricDocumentV0,
  type LyricDocumentV0,
  type ValidationResult,
} from "@lyricstage/contracts";
import { parseLyricSource } from "@lyricstage/core";
import type { LyricsCandidateV0 } from "@lyricstage/lyrics";

export const lyricDocumentFromCandidate = (
  candidate: LyricsCandidateV0,
  recordingID: string,
  durationMs: number,
): ValidationResult<LyricDocumentV0> => {
  if (!candidate.wordTimedDocument) {
    return parseLyricSource(
      candidate.syncedLyrics,
      candidate.fileName ?? `${candidate.provider}-${candidate.id}.lrc`,
      recordingID,
      durationMs,
    );
  }
  return parseLyricDocumentV0({
    ...candidate.wordTimedDocument,
    recordingID,
    durationMs: Math.max(
      Math.round(durationMs),
      candidate.wordTimedDocument.durationMs,
      ...candidate.wordTimedDocument.lines.map((line) => line.toMs),
    ),
  });
};
