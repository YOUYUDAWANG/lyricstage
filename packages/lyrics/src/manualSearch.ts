import type { LyricsLookupIdentityV0 } from "./identity";

export interface ManualLyricsSearchQueryV0 {
  title: string;
  artist: string;
  originalArtist: string;
}

export const sanitizeManualLyricsSearchQuery = (
  titleValue: unknown,
  artistValue: unknown,
  originalArtistValue: unknown = "",
): ManualLyricsSearchQueryV0 | undefined => {
  const title = typeof titleValue === "string" ? titleValue.normalize("NFKC").trim() : "";
  const artist = typeof artistValue === "string" ? artistValue.normalize("NFKC").trim() : "";
  const originalArtist = typeof originalArtistValue === "string" ? originalArtistValue.normalize("NFKC").trim() : "";
  if (!title || title.length > 500 || artist.length > 500 || originalArtist.length > 500) return undefined;
  return { title, artist, originalArtist };
};

export const manualLyricsLookupIdentity = (
  query: ManualLyricsSearchQueryV0,
  base?: LyricsLookupIdentityV0,
): LyricsLookupIdentityV0 => {
  const isCover = base?.isCover === true;
  const originalArtists = query.originalArtist
    ? [query.originalArtist]
    : isCover ? base?.originalArtists ?? [] : query.artist ? [query.artist] : base?.originalArtists ?? [];
  const coverPerformers = isCover
    ? query.artist ? [query.artist] : base?.coverPerformers ?? []
    : [];
  return {
    canonicalTitle: query.title,
    titles: [query.title],
    originalArtists,
    coverPerformers,
    isCover,
  };
};
