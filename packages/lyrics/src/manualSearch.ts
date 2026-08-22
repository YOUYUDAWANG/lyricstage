import type { LyricsLookupIdentityV0 } from "./identity";

export interface ManualLyricsSearchQueryV0 {
  title: string;
  artist: string;
}

export const sanitizeManualLyricsSearchQuery = (
  titleValue: unknown,
  artistValue: unknown,
): ManualLyricsSearchQueryV0 | undefined => {
  const title = typeof titleValue === "string" ? titleValue.normalize("NFKC").trim() : "";
  const artist = typeof artistValue === "string" ? artistValue.normalize("NFKC").trim() : "";
  if (!title || title.length > 500 || artist.length > 500) return undefined;
  return { title, artist };
};

export const manualLyricsLookupIdentity = (
  query: ManualLyricsSearchQueryV0,
): LyricsLookupIdentityV0 => ({
  canonicalTitle: query.title,
  titles: [query.title],
  originalArtists: query.artist ? [query.artist] : [],
  coverPerformers: [],
  isCover: false,
});
