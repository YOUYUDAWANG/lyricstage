import {
  artistMatchesAny,
  buildLyricsLookupIdentity,
  comparableLyricsText,
  type LyricsLookupIdentityV0,
} from "./identity";
import type { LyricsLookupTrackV0 } from "./types";

export const aiMusicIdentityRequestVersion = "lyricstage-music-identity-request-v1" as const;
export const aiMusicIdentityResponseVersion = "lyricstage-music-identity-v1" as const;

export interface AIMusicIdentitySourceV1 {
  uri: string;
  title: string;
  domain: string;
}

export interface AIMusicIdentityResultV1 {
  version: typeof aiMusicIdentityResponseVersion;
  resolverVersion: string;
  trackID: string;
  status: "grounded" | "ambiguous" | "notFound" | "unavailable";
  canonicalTitle: string;
  titleAliases: string[];
  performers: string[];
  originalArtists: string[];
  creators: Array<{
    name: string;
    role: "lyricist" | "composer" | "arranger" | "producer" | "other";
  }>;
  isCover: boolean;
  confidence: number;
  evidenceSummary: string;
  searchQueries: string[];
  sources: AIMusicIdentitySourceV1[];
  reason?: string;
  model?: string;
  cache?: "hit" | "miss";
}

export interface AIMusicIdentityRequestV1 {
  version: typeof aiMusicIdentityRequestVersion;
  trackID: string;
  title: string;
  artist: string;
  durationMs: number;
  localHints: LyricsLookupIdentityV0;
}

const validStrings = (value: unknown, maximumItems: number, maximumLength = 500): value is string[] =>
  Array.isArray(value) && value.length <= maximumItems && value.every((item) =>
    typeof item === "string" && item.length <= maximumLength
  );

export const buildAIMusicIdentityRequest = (
  track: LyricsLookupTrackV0,
  localHints = buildLyricsLookupIdentity(track),
): AIMusicIdentityRequestV1 => ({
  version: aiMusicIdentityRequestVersion,
  trackID: track.trackID,
  title: track.title,
  artist: track.artist,
  durationMs: track.durationMs,
  localHints,
});

export const isAIMusicIdentityResultV1 = (value: unknown): value is AIMusicIdentityResultV1 => {
  const result = value as Partial<AIMusicIdentityResultV1> | undefined;
  return result?.version === aiMusicIdentityResponseVersion &&
    typeof result.resolverVersion === "string" && result.resolverVersion.length <= 100 &&
    typeof result.trackID === "string" && result.trackID.length > 0 && result.trackID.length <= 200 &&
    ["grounded", "ambiguous", "notFound", "unavailable"].includes(result.status ?? "") &&
    typeof result.canonicalTitle === "string" && result.canonicalTitle.length <= 500 &&
    validStrings(result.titleAliases, 8) &&
    validStrings(result.performers, 8) &&
    validStrings(result.originalArtists, 8) &&
    Array.isArray(result.creators) && result.creators.length <= 12 && result.creators.every((creator) =>
      creator && typeof creator === "object" &&
      typeof creator.name === "string" && creator.name.length <= 500 &&
      ["lyricist", "composer", "arranger", "producer", "other"].includes(creator.role)
    ) &&
    typeof result.isCover === "boolean" &&
    typeof result.confidence === "number" && Number.isFinite(result.confidence) &&
    result.confidence >= 0 && result.confidence <= 1 &&
    typeof result.evidenceSummary === "string" && result.evidenceSummary.length <= 800 &&
    validStrings(result.searchQueries, 8) &&
    Array.isArray(result.sources) && result.sources.length <= 8 && result.sources.every((source) => {
      if (!source || typeof source !== "object" || typeof source.uri !== "string" || source.uri.length > 2_000) return false;
      if (typeof source.title !== "string" || source.title.length > 500) return false;
      if (typeof source.domain !== "string" || source.domain.length > 200) return false;
      try { return new URL(source.uri).protocol === "https:"; } catch { return false; }
    });
};

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const cleaned = value.normalize("NFKC").trim();
    const key = comparableLyricsText(cleaned);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [cleaned];
  });
};

export const mergeGroundedLyricsIdentity = (
  track: LyricsLookupTrackV0,
  localIdentity: LyricsLookupIdentityV0,
  result: AIMusicIdentityResultV1,
): LyricsLookupIdentityV0 | undefined => {
  if (
    result.trackID !== track.trackID ||
    result.status !== "grounded" ||
    result.confidence < 0.65 ||
    result.sources.length === 0 ||
    !result.canonicalTitle.trim() ||
    (track.artist.trim() && !artistMatchesAny(result.performers, track.artist)) ||
    (result.isCover && result.originalArtists.length === 0)
  ) return undefined;
  const isCover = result.isCover || localIdentity.isCover;
  return {
    canonicalTitle: result.canonicalTitle.trim(),
    titles: unique([
      result.canonicalTitle,
      ...result.titleAliases,
      localIdentity.canonicalTitle,
      ...localIdentity.titles,
    ]).slice(0, 16),
    originalArtists: unique([
      ...result.originalArtists,
      ...localIdentity.originalArtists,
    ]).slice(0, 12),
    coverPerformers: isCover
      ? unique([...result.performers, ...localIdentity.coverPerformers, track.artist]).slice(0, 12)
      : [],
    isCover,
  };
};
