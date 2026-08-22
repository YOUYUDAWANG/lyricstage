import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { stableHash32 } from "@lyricstage/contracts";
import { sanitizeMusicMapV1, type MusicMapV1 } from "./musicMap";
import { estimateWordTimingV1 } from "./estimatedWordTiming";

export interface DirectorRequestTrackV1 {
  trackID: string;
  title: string;
  artist: string;
  durationMs: number;
}

export interface DirectorMediaContextV1 {
  kind: "public-youtube-video";
  videoID: string;
  youtubeURL: string;
  analysis: "whole-song";
  requestedInsights: Array<"structure" | "energy" | "timbre" | "emotion" | "audio-lyric-relationship">;
}

export interface DirectorRequestPayloadV1 {
  body: string;
  lyricsHash: string;
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const voiceRoleForDirector = (role: LyricDocumentV0["lines"][number]["voiceRole"]): string => {
  if (role === "harmony") return "backing";
  if (role === "choir") return "together";
  if (role === "duetA" || role === "duetB") return role;
  return "lead";
};

export const buildDirectorRequestPayloadV1 = async (
  track: DirectorRequestTrackV1,
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
  options: { lineTimingOnly?: boolean } = {},
): Promise<DirectorRequestPayloadV1 | undefined> => {
  if (lyrics.lines.length === 0 || lyrics.lines.length > 180) return undefined;
  const lyricsHash = await sha256Hex(JSON.stringify(lyrics));
  const directorDurationMs = Math.max(1_000, Math.round(track.durationMs));
  const lines = lyrics.lines.map((line) => {
    const safeFromMs = Math.max(0, Math.min(line.fromMs, directorDurationMs - 1));
    const safeToMs = Math.max(safeFromMs + 1, Math.min(line.toMs, directorDurationMs));
    const nativeWords = options.lineTimingOnly ? [] : (line.words ?? []).slice(0, 120).flatMap((word) => {
      const fromMs = Math.max(safeFromMs, Math.min(word.fromMs, safeToMs - 1));
      const toMs = Math.min(safeToMs, word.toMs);
      return toMs > fromMs ? [{ ...word, fromMs, toMs }] : [];
    });
    const estimatedWords = !options.lineTimingOnly && nativeWords.length === 0
      ? estimateWordTimingV1(line.text, safeFromMs, safeToMs)
      : [];
    const timingPrecision = nativeWords.length > 0
      ? "word"
      : estimatedWords.length > 0
        ? "estimated"
        : "line";
    const words = nativeWords.map((word, index) => ({
      index,
      from: word.fromMs / 1000,
      to: word.toMs / 1000,
      text: word.text,
    }));
    const estimatedWordCues = estimatedWords.map((word) => ({
      index: word.index,
      from: word.fromMs / 1000,
      to: word.toMs / 1000,
      text: word.text,
    }));
    return {
      index: line.lineIndex,
      from: safeFromMs / 1000,
      to: safeToMs / 1000,
      text: line.text,
      timingPrecision,
      words,
      estimatedWords: estimatedWordCues,
      voiceRole: voiceRoleForDirector(line.voiceRole),
      layerID: line.layerID,
      overlapGroup: line.overlapGroup,
    };
  });
  const base = {
    version: "lyricstage-fullscreen-director-request-v1",
    trackID: track.trackID,
    recordingID: lyrics.recordingID,
    lyricsIdentity: stableHash32(lyrics),
    title: track.title,
    artist: track.artist,
    duration: Math.round(track.durationMs / 1000),
    lyricsHash,
    target: { device: "Chrome fullscreen", os: "Web" },
    ...(musicMap ? { musicMap: sanitizeMusicMapV1(musicMap) } : {}),
    ...(/^[\w-]{11}$/u.test(track.trackID) ? {
      mediaContext: {
        kind: "public-youtube-video",
        videoID: track.trackID,
        youtubeURL: `https://www.youtube.com/watch?v=${track.trackID}`,
        analysis: "whole-song",
        requestedInsights: ["structure", "energy", "timbre", "emotion", "audio-lyric-relationship"],
      } satisfies DirectorMediaContextV1,
    } : {}),
  };
  if (musicMap && !base.musicMap) return undefined;
  let body = JSON.stringify({ ...base, lines });
  if (new TextEncoder().encode(body).byteLength > 90_000) {
    body = JSON.stringify({
      ...base,
      lines: lines.map((line) => ({
        ...line,
        timingPrecision: "line",
        words: [],
        estimatedWords: [],
      })),
    });
  }
  return new TextEncoder().encode(body).byteLength <= 90_000 ? { body, lyricsHash } : undefined;
};
