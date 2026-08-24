import {
  buildLyricsLookupIdentity,
  comparableLyricsText,
  identityCandidateScore,
  isRelevantIdentityCandidate,
  isSafeIdentityMatch,
  publicLyricsSearchIdentity,
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

export const layeredLyricsLookupTimeoutMilliseconds = 16_000;
export const lddcLyricsLookupTimeoutMilliseconds = 4_000;

const throwIfAborted = (signal: AbortSignal): void => {
  if (!signal.aborted) return;
  throw signal.reason ?? new DOMException("歌词搜索已取消", "AbortError");
};

const withSourceDeadline = async <T>(
  parent: AbortSignal,
  milliseconds: number,
  load: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent.reason);
  if (parent.aborted) abortFromParent();
  else parent.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("私有歌词源超时", "TimeoutError")),
    milliseconds,
  );
  try {
    return await load(controller.signal);
  } finally {
    clearTimeout(timeout);
    parent.removeEventListener("abort", abortFromParent);
  }
};

export const lookupLayeredLyrics = async (
  track: LyricsLookupTrackV0,
  options: LayeredLyricsLookupOptionsV0 = {},
): Promise<LyricsLookupResponseV0> => {
  const identity = options.identity ?? buildLyricsLookupIdentity(track);
  const pooled: LyricsCandidateV0[] = [];
  const failures: unknown[] = [];
  let successfulSources = 0;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(
    options.signal?.reason ?? new DOMException("歌词搜索已取消", "AbortError"),
  );
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("歌词搜索超时", "TimeoutError")),
    layeredLyricsLookupTimeoutMilliseconds,
  );
  const append = async (load: () => Promise<LyricsCandidateV0[]>): Promise<boolean> => {
    throwIfAborted(controller.signal);
    try {
      const candidates = await load();
      throwIfAborted(controller.signal);
      successfulSources += 1;
      pooled.push(...candidates);
      return candidates.some((candidate) => isSafeIdentityMatch(track, identity, candidate));
    } catch (error) {
      throwIfAborted(controller.signal);
      failures.push(error);
      return false;
    }
  };
  try {
    if (options.lddc && await append(
      () => withSourceDeadline(controller.signal, lddcLyricsLookupTimeoutMilliseconds, (signal) =>
        lookupLDDCLyrics(track, options.lddc!, signal, identity)),
    )) {
      return responseFromCandidates(track, identity, pooled);
    }
    if (await append(
      () => lookupLRCLibLyrics(track, controller.signal, identity).then((response) => response.candidates),
    )) {
      return responseFromCandidates(track, identity, pooled);
    }
    if (options.lddc && identity.isCover && identity.originalArtists.length > 0) {
      await append(() => withSourceDeadline(controller.signal, lddcLyricsLookupTimeoutMilliseconds, (signal) =>
        lookupLDDCLyrics(track, options.lddc!, signal, identity, identity.originalArtists)));
    }
    await append(() => lookupKugouLyrics(track, controller.signal, identity));
    if (successfulSources === 0) throw failures[0] ?? new Error("歌词源暂时不可用");
    return responseFromCandidates(track, identity, pooled);
  } catch (error) {
    const reason = controller.signal.reason as { name?: unknown } | undefined;
    if (!options.signal?.aborted && reason?.name === "TimeoutError" && successfulSources > 0) {
      return responseFromCandidates(track, identity, pooled);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
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
    resolvedIdentity: publicLyricsSearchIdentity(track, identity),
    ...(match ? { match } : {}),
    ...(originalFallbackMatch
      ? { matchKind: "originalFallback" as const }
      : match ? { matchKind: "sameRecording" as const } : {}),
    candidates,
  };
};
