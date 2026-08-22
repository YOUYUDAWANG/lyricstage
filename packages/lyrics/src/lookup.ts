import {
  buildLyricsLookupIdentity,
  comparableLyricsText,
  identityCandidateScore,
  isRelevantIdentityCandidate,
  isSafeIdentityMatch,
  preferredOriginalFallbackCandidate,
  type LyricsLookupIdentityV0,
} from "./identity";
import { lookupKugouLyrics } from "./kugou";
import { lookupLDDCLyrics, type LDDCLyricsConfigurationV0 } from "./lddc";
import { lookupLRCLibLyrics } from "./lrclib";
import {
  lyricsLookupVersion,
  type LyricsCandidateV0,
  type LyricsLookupResponseV0,
  type LyricsLookupTrackV0,
} from "./types";

export interface LayeredLyricsLookupOptionsV0 {
  signal?: AbortSignal;
  lddc?: LDDCLyricsConfigurationV0;
  identity?: LyricsLookupIdentityV0;
}

export const lookupLayeredLyrics = async (
  track: LyricsLookupTrackV0,
  options: LayeredLyricsLookupOptionsV0 = {},
): Promise<LyricsLookupResponseV0> => {
  const identity = options.identity ?? buildLyricsLookupIdentity(track);
  const pooled: LyricsCandidateV0[] = [];
  const failures: unknown[] = [];
  let successfulSources = 0;
  const append = async (task: Promise<LyricsCandidateV0[]>): Promise<boolean> => {
    try {
      const candidates = await task;
      successfulSources += 1;
      pooled.push(...candidates);
      return candidates.some((candidate) => isSafeIdentityMatch(track, identity, candidate));
    } catch (error) {
      failures.push(error);
      return false;
    }
  };
  if (options.lddc && await append(lookupLDDCLyrics(track, options.lddc, options.signal, identity))) {
    return responseFromCandidates(track, identity, pooled);
  }
  if (await append(lookupLRCLibLyrics(track, options.signal, identity)
    .then((response) => response.candidates))) {
    return responseFromCandidates(track, identity, pooled);
  }
  if (options.lddc && identity.isCover && identity.originalArtists.length > 0) {
    await append(lookupLDDCLyrics(
      track,
      options.lddc,
      options.signal,
      identity,
      identity.originalArtists,
    ));
  }
  await append(lookupKugouLyrics(track, options.signal, identity));
  if (successfulSources === 0) throw failures[0] ?? new Error("歌词源暂时不可用");
  return responseFromCandidates(track, identity, pooled);
};

const responseFromCandidates = (
  track: LyricsLookupTrackV0,
  identity: ReturnType<typeof buildLyricsLookupIdentity>,
  pooled: LyricsCandidateV0[],
): LyricsLookupResponseV0 => {
  const seen = new Set<string>();
  const seenVersions = new Set<string>();
  const candidates = pooled
    .filter((candidate) => {
      const key = `${candidate.provider}:${candidate.id}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .filter((candidate) => isRelevantIdentityCandidate(track, identity, candidate))
    .filter((candidate) => {
      const key = [
        candidate.provider,
        comparableLyricsText(candidate.title),
        comparableLyricsText(candidate.artist),
        Math.round(candidate.durationMs / 1000),
      ].join(":");
      return seenVersions.has(key) ? false : (seenVersions.add(key), true);
    })
    .sort((left, right) => {
      const score = identityCandidateScore(track, identity, right) - identityCandidateScore(track, identity, left);
      if (score !== 0) return score;
      return Math.abs(track.durationMs - left.durationMs) - Math.abs(track.durationMs - right.durationMs);
    })
    .slice(0, 5);
  const sameRecordingMatch = candidates.find((candidate) => isSafeIdentityMatch(track, identity, candidate));
  const originalFallbackMatch = sameRecordingMatch
    ? undefined
    : preferredOriginalFallbackCandidate(track, identity, candidates);
  const match = sameRecordingMatch ?? originalFallbackMatch;
  return {
    type: "lyrics-lookup-result",
    version: lyricsLookupVersion,
    trackID: track.trackID,
    status: match ? "match" : candidates.length > 0 ? "candidates" : "miss",
    source: "network",
    ...(match ? { match } : {}),
    ...(originalFallbackMatch
      ? { matchKind: "originalFallback" as const }
      : match ? { matchKind: "sameRecording" as const } : {}),
    candidates,
  };
};
