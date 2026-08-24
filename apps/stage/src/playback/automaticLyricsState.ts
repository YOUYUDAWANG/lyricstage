import type { YouTubeMusicSnapshotV0 } from "@lyricstage/companion";
import {
  buildLyricsLookupIdentity,
  publicLyricsSearchIdentity,
  type LyricsCandidateV0,
  type LyricsLookupResponseV0,
  type LyricsSearchIdentityV0,
} from "@lyricstage/lyrics";
import { lyricsTrackFromSnapshot } from "./youtubeMusicLyrics";

export type AutomaticLyricsState = {
  status: "idle" | "searching" | "matched" | "candidates" | "miss" | "error" | "manual";
  source?: LyricsLookupResponseV0["source"];
  trackID?: string;
  trackIdentity?: string;
  candidates: LyricsCandidateV0[];
  selectedCandidateKey?: string;
  resolvedIdentity?: LyricsSearchIdentityV0;
};

export const columnLyricsSearchIdentity = (
  snapshot: YouTubeMusicSnapshotV0 | undefined,
  resolved: LyricsSearchIdentityV0 | undefined,
): LyricsSearchIdentityV0 | undefined => {
  if (resolved) return resolved;
  const track = snapshot ? lyricsTrackFromSnapshot(snapshot) : undefined;
  return track ? publicLyricsSearchIdentity(track, buildLyricsLookupIdentity(track)) : undefined;
};

export const normalizeManualLyricsFields = (title: string, artist: string, originalArtist: string) => ({
  title: title.normalize("NFKC").trim(),
  artist: artist.normalize("NFKC").trim(),
  originalArtist: originalArtist.normalize("NFKC").trim(),
});
