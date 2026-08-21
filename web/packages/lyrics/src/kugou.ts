import {
  buildLyricsLookupIdentity,
  identityCandidateScore,
  isRelevantIdentityCandidate,
  type LyricsLookupIdentityV0,
} from "./identity";
import type { LyricsCandidateV0, LyricsLookupTrackV0 } from "./types";

interface KugouSearchHit {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
}

const kugouHeaders = {
  "User-Agent": "IPhone-8990-searchSong",
  "UNI-UserAgent": "iOS11.4-Phone8990-1009-0-WiFi",
};

const stringValue = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const parseFileName = (value: string): { artist: string; title: string } => {
  const parts = value.split(" - ");
  return parts.length > 1
    ? { artist: parts[0]?.trim() ?? "", title: parts.slice(1).join(" - ").trim() }
    : { artist: "", title: value.trim() };
};

const requestJSON = async (url: URL, signal?: AbortSignal): Promise<Record<string, unknown>> => {
  const response = await fetch(url, { headers: kugouHeaders, signal });
  if (!response.ok) throw new Error(`Kugou HTTP ${response.status}`);
  const value = await response.json() as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("酷狗歌词响应格式异常");
  return value as Record<string, unknown>;
};

const searchKugou = async (keyword: string, signal?: AbortSignal): Promise<KugouSearchHit[]> => {
  const url = new URL("http://mobilecdn.kugou.com/api/v3/search/song");
  const query = {
    api_ver: "1",
    area_code: "1",
    correct: "1",
    pagesize: "10",
    plat: "2",
    tag: "1",
    sver: "5",
    showtype: "10",
    page: "1",
    keyword,
    version: "8990",
  };
  Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
  const root = await requestJSON(url, signal);
  const data = root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : {};
  const info = Array.isArray(data.info) ? data.info : [];
  return info.flatMap((raw): KugouSearchHit[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    const id = stringValue(row.hash ?? row.audio_id ?? row.id).trim();
    const parsed = parseFileName(stringValue(row.filename ?? row.fileName));
    const title = stringValue(row.songName ?? row.songname ?? row.song_name).trim() || parsed.title;
    const artist = stringValue(row.singername ?? row.singerName ?? row.author_name).trim() || parsed.artist;
    const durationSeconds = Number(row.duration);
    if (!id || !title || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
    const album = stringValue(row.album_name ?? row.albumName).trim();
    return [{
      id,
      title,
      artist,
      ...(album ? { album } : {}),
      durationMs: Math.round(durationSeconds * 1000),
    }];
  });
};

const decodeBase64UTF8 = (encoded: string): string => {
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/u, "");
};

const fetchKugouLyrics = async (
  hit: KugouSearchHit,
  signal?: AbortSignal,
): Promise<LyricsCandidateV0 | undefined> => {
  const searchURL = new URL("http://krcs.kugou.com/search");
  Object.entries({ keyword: " - ", ver: "1", hash: hit.id, client: "mobi", man: "yes" })
    .forEach(([name, value]) => searchURL.searchParams.set(name, value));
  const search = await requestJSON(searchURL, signal);
  const candidates = Array.isArray(search.candidates) ? search.candidates : [];
  const rawCandidate = candidates[0];
  if (!rawCandidate || typeof rawCandidate !== "object" || Array.isArray(rawCandidate)) return undefined;
  const lyricCandidate = rawCandidate as Record<string, unknown>;
  const accessKey = stringValue(lyricCandidate.accesskey).trim();
  const lyricID = stringValue(lyricCandidate.id).trim();
  if (!accessKey || !lyricID) return undefined;

  const downloadURL = new URL("http://lyrics.kugou.com/download");
  Object.entries({
    charset: "utf8",
    accesskey: accessKey,
    id: lyricID,
    client: "android",
    fmt: "lrc",
    ver: "1",
  }).forEach(([name, value]) => downloadURL.searchParams.set(name, value));
  const download = await requestJSON(downloadURL, signal);
  const encoded = typeof download.content === "string" ? download.content : "";
  if (!encoded) return undefined;
  const syncedLyrics = decodeBase64UTF8(encoded).trim();
  if (!/^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/mu.test(syncedLyrics)) return undefined;
  return {
    provider: "kugou",
    ...hit,
    syncedLyrics,
  };
};

export const lookupKugouLyrics = async (
  track: LyricsLookupTrackV0,
  signal?: AbortSignal,
  identity: LyricsLookupIdentityV0 = buildLyricsLookupIdentity(track),
): Promise<LyricsCandidateV0[]> => {
  const focusArtists = identity.isCover ? identity.coverPerformers : identity.originalArtists;
  const queries = [
    identity.canonicalTitle,
    focusArtists[0] ? `${identity.canonicalTitle} ${focusArtists[0]}` : "",
    identity.originalArtists[0] ? `${identity.canonicalTitle} ${identity.originalArtists[0]}` : "",
    identity.titles[1] ?? "",
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const batches = await Promise.allSettled(queries.slice(0, 4).map((query) => searchKugou(query, signal)));
  const seen = new Set<string>();
  const hits = batches.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((hit) => seen.has(hit.id) ? false : (seen.add(hit.id), true))
    .filter((hit) => isRelevantIdentityCandidate(
      track,
      identity,
      { provider: "kugou", ...hit, syncedLyrics: "pending" },
    ))
    .sort((left, right) => identityCandidateScore(
      track,
      identity,
      { provider: "kugou", ...right, syncedLyrics: "pending" },
    ) - identityCandidateScore(
      track,
      identity,
      { provider: "kugou", ...left, syncedLyrics: "pending" },
    ))
    .slice(0, 5);
  const resolved = await Promise.allSettled(hits.map((hit) => fetchKugouLyrics(hit, signal)));
  return resolved.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
};
