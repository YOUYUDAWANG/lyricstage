import {
  parseLyricDocumentV0,
  type LyricDocumentV0,
} from "@lyricstage/contracts";

export const lyricsLookupVersion = "lyrics-lookup-v0" as const;

export interface LyricsLookupTrackV0 {
  provider: "youtubeMusic";
  trackID: string;
  title: string;
  artist: string;
  durationMs: number;
}

export interface LyricsCandidateV0 {
  provider: "applemusic" | "lrclib" | "kugou" | "netease" | "tencent" | "local";
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
  syncedLyrics: string;
  timingKind?: "word" | "line";
  wordTimedDocument?: LyricDocumentV0;
  fileName?: string;
  nonMusicSegmentsMs?: Array<[number, number]>;
}

export interface LyricsLookupResponseV0 {
  type: "lyrics-lookup-result";
  version: typeof lyricsLookupVersion;
  trackID: string;
  status: "match" | "candidates" | "miss" | "error";
  source: "network" | "cache";
  match?: LyricsCandidateV0;
  matchKind?: "sameRecording" | "originalFallback";
  assistance?: "ai" | "aiUnavailable";
  identityResolution?: {
    method: "gemma4GoogleSearch";
    canonicalTitle: string;
    originalArtists: string[];
    confidence: number;
    sources: Array<{ uri: string; title: string; domain: string }>;
  };
  candidates: LyricsCandidateV0[];
  message?: string;
}

export const lyricsProviderLabel = (provider: LyricsCandidateV0["provider"]): string => ({
  applemusic: "Apple Music",
  lrclib: "LRCLIB",
  kugou: "酷狗",
  netease: "网易云",
  tencent: "QQ 音乐",
  local: "本地",
})[provider];

export const isLyricsLookupTrackV0 = (value: unknown): value is LyricsLookupTrackV0 => {
  const track = value as Partial<LyricsLookupTrackV0> | undefined;
  return (
    track?.provider === "youtubeMusic" &&
    typeof track.trackID === "string" && track.trackID.length > 0 && track.trackID.length <= 200 &&
    typeof track.title === "string" && track.title.trim().length > 0 && track.title.length <= 500 &&
    typeof track.artist === "string" && track.artist.length <= 500 &&
    typeof track.durationMs === "number" && Number.isFinite(track.durationMs) &&
    track.durationMs > 0 && track.durationMs <= 24 * 60 * 60 * 1000
  );
};

export const isLyricsCandidateV0 = (value: unknown): value is LyricsCandidateV0 => {
  const candidate = value as Partial<LyricsCandidateV0> | undefined;
  const wordTimedDocumentValid = candidate?.wordTimedDocument === undefined
    || parseLyricDocumentV0(candidate.wordTimedDocument).ok;
  return (
    candidate !== undefined &&
    ["applemusic", "lrclib", "kugou", "netease", "tencent", "local"].includes(candidate.provider ?? "") &&
    typeof candidate.id === "string" && candidate.id.length > 0 && candidate.id.length <= 80 &&
    typeof candidate.title === "string" && candidate.title.trim().length > 0 && candidate.title.length <= 500 &&
    typeof candidate.artist === "string" && candidate.artist.length <= 500 &&
    (candidate.album === undefined || (typeof candidate.album === "string" && candidate.album.length <= 500)) &&
    (candidate.fileName === undefined || (typeof candidate.fileName === "string" && candidate.fileName.length <= 200)) &&
    typeof candidate.durationMs === "number" && Number.isFinite(candidate.durationMs) &&
    candidate.durationMs > 0 && candidate.durationMs <= 24 * 60 * 60 * 1000 &&
    typeof candidate.syncedLyrics === "string" &&
    candidate.syncedLyrics.length > 0 && candidate.syncedLyrics.length <= 256_000 &&
    (candidate.timingKind === undefined || candidate.timingKind === "word" || candidate.timingKind === "line") &&
    (candidate.timingKind !== "word" || candidate.wordTimedDocument !== undefined) &&
    wordTimedDocumentValid &&
    (
      candidate.nonMusicSegmentsMs === undefined ||
      (
        Array.isArray(candidate.nonMusicSegmentsMs) &&
        candidate.nonMusicSegmentsMs.length <= 100 &&
        candidate.nonMusicSegmentsMs.every((segment) =>
          Array.isArray(segment) &&
          segment.length === 2 &&
          segment.every((time) => typeof time === "number" && Number.isFinite(time) && time >= 0) &&
          segment[0] < segment[1]
        )
      )
    )
  );
};

export const isLyricsLookupResponseV0 = (value: unknown): value is LyricsLookupResponseV0 => {
  const response = value as Partial<LyricsLookupResponseV0> | undefined;
  return (
    response?.type === "lyrics-lookup-result" &&
    response.version === lyricsLookupVersion &&
    typeof response.trackID === "string" && response.trackID.length > 0 &&
    ["match", "candidates", "miss", "error"].includes(response.status ?? "") &&
    (response.source === "network" || response.source === "cache") &&
    Array.isArray(response.candidates) && response.candidates.length <= 5 &&
    response.candidates.every(isLyricsCandidateV0) &&
    (response.match === undefined || isLyricsCandidateV0(response.match)) &&
    (response.matchKind === undefined || response.matchKind === "sameRecording" || response.matchKind === "originalFallback") &&
    (response.assistance === undefined || response.assistance === "ai" || response.assistance === "aiUnavailable") &&
    (
      response.identityResolution === undefined ||
      (
        response.identityResolution.method === "gemma4GoogleSearch" &&
        typeof response.identityResolution.canonicalTitle === "string" &&
        response.identityResolution.canonicalTitle.length > 0 && response.identityResolution.canonicalTitle.length <= 500 &&
        Array.isArray(response.identityResolution.originalArtists) &&
        response.identityResolution.originalArtists.length <= 8 &&
        response.identityResolution.originalArtists.every((artist) => typeof artist === "string" && artist.length <= 500) &&
        typeof response.identityResolution.confidence === "number" &&
        Number.isFinite(response.identityResolution.confidence) &&
        response.identityResolution.confidence >= 0 && response.identityResolution.confidence <= 1 &&
        Array.isArray(response.identityResolution.sources) && response.identityResolution.sources.length > 0 &&
        response.identityResolution.sources.length <= 8 &&
        response.identityResolution.sources.every((source) =>
          typeof source?.uri === "string" && source.uri.startsWith("https://") && source.uri.length <= 2_000 &&
          typeof source.title === "string" && source.title.length <= 500 &&
          typeof source.domain === "string" && source.domain.length <= 200
        )
      )
    ) &&
    (response.message === undefined || (typeof response.message === "string" && response.message.length <= 500))
  );
};

export const lookupResponseContainsCandidate = (
  response: LyricsLookupResponseV0,
  candidate: LyricsCandidateV0,
): boolean => response.candidates.some((known) =>
  known.provider === candidate.provider &&
  known.id === candidate.id &&
  known.title === candidate.title &&
  known.artist === candidate.artist &&
  known.durationMs === candidate.durationMs &&
  known.syncedLyrics === candidate.syncedLyrics &&
  known.timingKind === candidate.timingKind &&
  JSON.stringify(known.wordTimedDocument ?? null) === JSON.stringify(candidate.wordTimedDocument ?? null) &&
  known.fileName === candidate.fileName &&
  JSON.stringify(known.nonMusicSegmentsMs ?? []) === JSON.stringify(candidate.nonMusicSegmentsMs ?? [])
);
