import {
  artistMatchesAny,
  comparableLyricsText,
  type LyricsLookupIdentityV0,
} from "./identity";
import type { LyricsCandidateV0, LyricsLookupTrackV0 } from "./types";

export const aiLyricsLookupAssistVersion = "lyricstage-lyrics-lookup-assist-v1" as const;

export interface AILyricsLookupAssistRequestV1 {
  version: typeof aiLyricsLookupAssistVersion;
  track: LyricsLookupTrackV0;
  localIdentity: LyricsLookupIdentityV0;
  candidates: Array<Pick<LyricsCandidateV0, "provider" | "id" | "title" | "artist" | "durationMs">>;
}

export interface AILyricsLookupAssistResultV1 {
  version: typeof aiLyricsLookupAssistVersion;
  trackID: string;
  canonicalTitle: string;
  titleAliases: string[];
  recordingArtists: string[];
  originalArtists: string[];
  isCover: boolean;
  preferredCandidate?: { provider: LyricsCandidateV0["provider"]; id: string };
  confidence: number;
}

const clean = (value: unknown, maximum = 500): string =>
  typeof value === "string" ? value.normalize("NFKC").trim().slice(0, maximum) : "";

const unique = (values: unknown, maximum: number): string[] => {
  const seen = new Set<string>();
  return (Array.isArray(values) ? values : []).flatMap((value) => {
    const normalized = clean(value);
    const key = comparableLyricsText(normalized);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  }).slice(0, maximum);
};

export const buildAILyricsLookupAssistRequestV1 = (
  track: LyricsLookupTrackV0,
  localIdentity: LyricsLookupIdentityV0,
  candidates: LyricsCandidateV0[],
): AILyricsLookupAssistRequestV1 => ({
  version: aiLyricsLookupAssistVersion,
  track,
  localIdentity,
  candidates: candidates.slice(0, 5).map(({ provider, id, title, artist, durationMs }) => ({
    provider,
    id,
    title,
    artist,
    durationMs,
  })),
});

export const sanitizeAILyricsLookupAssistResultV1 = (
  request: AILyricsLookupAssistRequestV1,
  raw: unknown,
): AILyricsLookupAssistResultV1 | undefined => {
  const value = raw as Record<string, unknown> | undefined;
  if (!value || value.version !== aiLyricsLookupAssistVersion || clean(value.trackID, 200) !== request.track.trackID) {
    return undefined;
  }
  const canonicalTitle = clean(value.canonicalTitle);
  const recordingArtists = unique(value.recordingArtists, 8);
  const originalArtists = unique(value.originalArtists, 8);
  const isCover = value.isCover === true;
  const confidence = Number(value.confidence);
  if (!canonicalTitle || !Number.isFinite(confidence) || confidence < 0.72 || confidence > 1) return undefined;
  if (request.track.artist.trim() && recordingArtists.length > 0
    && !artistMatchesAny(recordingArtists, request.track.artist)) return undefined;
  const preferred = value.preferredCandidate as Record<string, unknown> | undefined;
  const preferredCandidate = preferred
    ? request.candidates.find((candidate) =>
      candidate.provider === preferred.provider && candidate.id === preferred.id)
    : undefined;
  return {
    version: aiLyricsLookupAssistVersion,
    trackID: request.track.trackID,
    canonicalTitle,
    titleAliases: unique([canonicalTitle, ...unique(value.titleAliases, 8)], 8),
    recordingArtists,
    originalArtists,
    isCover,
    ...(preferredCandidate ? { preferredCandidate: {
      provider: preferredCandidate.provider,
      id: preferredCandidate.id,
    } } : {}),
    confidence,
  };
};

export const mergeAILyricsLookupAssistIdentityV1 = (
  track: LyricsLookupTrackV0,
  local: LyricsLookupIdentityV0,
  result: AILyricsLookupAssistResultV1,
): LyricsLookupIdentityV0 => {
  const titles = unique([
    result.canonicalTitle,
    ...result.titleAliases,
    local.canonicalTitle,
    ...local.titles,
  ], 16);
  const originals = unique([...result.originalArtists, ...local.originalArtists], 12);
  const isCover = result.isCover || local.isCover;
  return {
    canonicalTitle: titles[0] ?? local.canonicalTitle,
    titles,
    originalArtists: originals,
    coverPerformers: isCover
      ? unique([...result.recordingArtists, ...local.coverPerformers, track.artist], 12)
      : [],
    isCover,
  };
};
