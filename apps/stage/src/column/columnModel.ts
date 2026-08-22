import type { LyricDocumentV0, LyricLineV0, VoiceRole } from "@lyricstage/contracts";
import { sampleTimeline, type PreparedTimelineV0 } from "@lyricstage/core";

export type ColumnSurfaceState =
  | "boot"
  | "awaitingTrack"
  | "searching"
  | "candidates"
  | "miss"
  | "error"
  | "prelude"
  | "interlude"
  | "singing"
  | "paused"
  | "disconnected";

export type ColumnLinePhase = "past" | "active" | "future";
export type ColumnVoiceClass = "lead" | "backing" | "duet";

export type AutomaticLyricsStatus =
  | "idle"
  | "searching"
  | "matched"
  | "candidates"
  | "miss"
  | "error"
  | "manual";

export interface ColumnStateInput {
  bridgeAvailable: boolean;
  bridgeConnected: boolean;
  hasSnapshot: boolean;
  disconnected: boolean;
  automaticStatus: AutomaticLyricsStatus;
  hasMatchingLyrics: boolean;
  playbackState?: "playing" | "paused" | "buffering" | "ended";
  timeMs: number;
  lyrics: LyricDocumentV0 | null;
}

export const mapVoiceClass = (role: VoiceRole | undefined): ColumnVoiceClass => {
  switch (role) {
    case "duetA":
    case "duetB":
      return "duet";
    case "harmony":
    case "choir":
      return "backing";
    default:
      return "lead";
  }
};

export const resolveColumnSurfaceState = (input: ColumnStateInput): ColumnSurfaceState => {
  if (!input.bridgeAvailable) return "error";
  if (input.disconnected) return "disconnected";
  if (!input.hasSnapshot) return "awaitingTrack";

  if (!input.hasMatchingLyrics) {
    switch (input.automaticStatus) {
      case "searching":
        return "searching";
      case "candidates":
        return "candidates";
      case "miss":
      case "manual":
        return "miss";
      case "error":
        return "error";
      default:
        return "awaitingTrack";
    }
  }

  if (input.playbackState === "paused" || input.playbackState === "ended") return "paused";
  if (!input.lyrics || input.lyrics.lines.length === 0) return "prelude";

  const firstFrom = input.lyrics.lines[0]?.fromMs ?? 0;
  if (input.timeMs < firstFrom) return "prelude";

  const singing = input.lyrics.lines.some(
    (line) => input.timeMs >= line.fromMs && input.timeMs < line.toMs,
  );
  return singing ? "singing" : "interlude";
};

export const linePhase = (
  line: LyricLineV0,
  timeMs: number,
  activeIndices: ReadonlySet<number>,
): ColumnLinePhase => {
  if (activeIndices.has(line.lineIndex)) return "active";
  if (timeMs < line.fromMs) return "future";
  return "past";
};

export const wordProgress = (line: LyricLineV0, timeMs: number, wordIndex: number): number => {
  const word = line.words?.[wordIndex];
  if (!word) return timeMs >= line.fromMs ? 1 : 0;
  if (timeMs <= word.fromMs) return 0;
  if (timeMs >= word.toMs) return 1;
  const span = Math.max(1, word.toMs - word.fromMs);
  return Math.min(1, Math.max(0, (timeMs - word.fromMs) / span));
};

export const lineMaskProgress = (line: LyricLineV0, timeMs: number): number => {
  if (!line.words || line.words.length === 0) {
    if (timeMs < line.fromMs) return 0;
    if (timeMs >= line.toMs) return 1;
    return Math.min(1, Math.max(0, (timeMs - line.fromMs) / Math.max(1, line.toMs - line.fromMs)));
  }
  let filled = 0;
  for (let index = 0; index < line.words.length; index += 1) {
    filled += wordProgress(line, timeMs, index);
  }
  return filled / line.words.length;
};

export const activeLineIndicesAt = (timeline: PreparedTimelineV0, timeMs: number): number[] =>
  sampleTimeline(timeline, timeMs);

export const formatClock = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};
