import {
  lyricsLookupVersion,
  type LyricsCandidateV0,
  type LyricsLookupResponseV0,
  type LyricsLookupTrackV0,
} from "./types";
import {
  buildLyricsLookupIdentity,
  comparableLyricsText,
  identityCandidateScore,
  isRelevantIdentityCandidate,
  isSafeIdentityMatch,
  type LyricsLookupIdentityV0,
} from "./identity";

interface LRCLibRecord {
  id?: string | number;
  name?: string;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number | string;
  instrumental?: boolean;
  syncedLyrics?: string | null;
}

const clientHeader = "LyricStage/0.1 (personal YouTube Music companion)";
export const lyricsLookupTimeoutMilliseconds = 12_000;

const parseRecord = (value: unknown): LyricsCandidateV0 | undefined => {
  const record = value as LRCLibRecord | undefined;
  if (!record || record.instrumental === true) return undefined;
  const id = typeof record.id === "number" || typeof record.id === "string" ? String(record.id) : "";
  const title = typeof record.trackName === "string"
    ? record.trackName.trim()
    : typeof record.name === "string" ? record.name.trim() : "";
  const artist = typeof record.artistName === "string" ? record.artistName.trim() : "";
  const album = typeof record.albumName === "string" ? record.albumName.trim() : "";
  const durationSeconds = typeof record.duration === "number"
    ? record.duration
    : typeof record.duration === "string" ? Number(record.duration) : Number.NaN;
  const syncedLyrics = typeof record.syncedLyrics === "string" ? record.syncedLyrics.trim() : "";
  if (!id || !title || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !syncedLyrics) return undefined;
  if (syncedLyrics.length > 256_000) return undefined;
  return {
    provider: "lrclib",
    id,
    title,
    artist,
    ...(album ? { album } : {}),
    durationMs: Math.round(durationSeconds * 1000),
    syncedLyrics,
  };
};

export const rankedLRCLibCandidates = (
  track: LyricsLookupTrackV0,
  values: unknown[],
  identity: LyricsLookupIdentityV0 = buildLyricsLookupIdentity(track),
): LyricsCandidateV0[] => {
  const seen = new Set<string>();
  return values
    .map(parseRecord)
    .filter((candidate): candidate is LyricsCandidateV0 => candidate !== undefined)
    .filter((candidate) => seen.has(candidate.id) ? false : (seen.add(candidate.id), true))
    .filter((candidate) => isRelevantIdentityCandidate(track, identity, candidate))
    .sort((left, right) => {
      const scoreDelta = identityCandidateScore(track, identity, right) - identityCandidateScore(track, identity, left);
      if (scoreDelta !== 0) return scoreDelta;
      return Math.abs(track.durationMs - left.durationMs) - Math.abs(track.durationMs - right.durationMs);
    })
    .slice(0, 5);
};

export const isSafeAutomaticMatch = (
  track: LyricsLookupTrackV0,
  candidate: LyricsCandidateV0,
  identity: LyricsLookupIdentityV0 = buildLyricsLookupIdentity(track),
): boolean => isSafeIdentityMatch(track, identity, candidate);

const requestJSON = async (url: URL, signal?: AbortSignal): Promise<{ status: number; value?: unknown }> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Lrclib-Client": clientHeader,
    },
    signal,
  });
  if (response.status === 404) return { status: 404 };
  if (!response.ok) throw new Error(`LRCLIB HTTP ${response.status}`);
  return { status: response.status, value: await response.json() };
};

export const lookupLRCLibLyrics = async (
  track: LyricsLookupTrackV0,
  signal?: AbortSignal,
  identity: LyricsLookupIdentityV0 = buildLyricsLookupIdentity(track),
): Promise<LyricsLookupResponseV0> => {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("歌词搜索超时", "TimeoutError")),
    lyricsLookupTimeoutMilliseconds,
  );

  try {
  const exactURL = new URL("https://lrclib.net/api/get");
  exactURL.searchParams.set("track_name", identity.canonicalTitle);
  const exactArtists = identity.isCover ? identity.coverPerformers : identity.originalArtists;
  if (exactArtists[0]) exactURL.searchParams.set("artist_name", exactArtists[0]);
  exactURL.searchParams.set("duration", String(Math.round(track.durationMs / 1000)));

  const exact = await requestJSON(exactURL, controller.signal);
  const exactCandidate = exact.value === undefined ? undefined : parseRecord(exact.value);
  if (exactCandidate && isSafeAutomaticMatch(track, exactCandidate, identity)) {
    return {
      type: "lyrics-lookup-result",
      version: lyricsLookupVersion,
      trackID: track.trackID,
      status: "match",
      source: "network",
      match: exactCandidate,
      candidates: [exactCandidate],
    };
  }

  const searches: unknown[] = [];
  const seenURLs = new Set<string>();
  const seenArtists = new Set<string>();
  const targetedArtists = [
    ...(identity.isCover ? identity.coverPerformers : []),
    ...identity.originalArtists,
  ].filter((artist) => {
    const key = comparableLyricsText(artist);
    return !key || seenArtists.has(key) ? false : (seenArtists.add(key), true);
  });
  const searchPlans = identity.titles.slice(0, 3).flatMap((title, index) => {
    const plans: URL[] = [];
    if (index === 0) {
      for (const artist of targetedArtists) {
        const strict = new URL("https://lrclib.net/api/search");
        strict.searchParams.set("track_name", title);
        strict.searchParams.set("artist_name", artist);
        plans.push(strict);
      }
    }
    const broad = new URL("https://lrclib.net/api/search");
    broad.searchParams.set("q", title);
    plans.push(broad);
    return plans;
  }).filter((url) => seenURLs.has(url.href) ? false : (seenURLs.add(url.href), true));
  for (const searchURL of searchPlans) {
    const search = await requestJSON(searchURL, controller.signal);
    if (Array.isArray(search.value)) searches.push(...search.value);
  }
  const candidates = rankedLRCLibCandidates(track, [
    ...(exactCandidate ? [exactCandidate] : []),
    ...searches,
  ], identity);
  const match = candidates.find((candidate) => isSafeAutomaticMatch(track, candidate, identity));
  return {
    type: "lyrics-lookup-result",
    version: lyricsLookupVersion,
    trackID: track.trackID,
    status: match ? "match" : candidates.length > 0 ? "candidates" : "miss",
    source: "network",
    ...(match ? { match } : {}),
    candidates,
  };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
};
