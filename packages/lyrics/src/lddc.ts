import type { LyricDocumentV0, LyricLineV0, LyricWordV0 } from "@lyricstage/contracts";
import { buildLyricsLookupIdentity, type LyricsLookupIdentityV0 } from "./identity";
import type { LyricsCandidateV0, LyricsLookupTrackV0 } from "./types";

export interface LDDCLyricsConfigurationV0 {
  endpoint: string;
  token: string;
}

interface LDDCWord {
  startMilliseconds?: unknown;
  endMilliseconds?: unknown;
  text?: unknown;
}

interface LDDCLine {
  startMilliseconds?: unknown;
  endMilliseconds?: unknown;
  text?: unknown;
  words?: unknown;
}

interface LDDCCandidate {
  source?: unknown;
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  album?: unknown;
  durationSeconds?: unknown;
  timingKind?: unknown;
  lyricLines?: unknown;
}

const timestamp = (milliseconds: number): string => {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const fraction = milliseconds % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
};

const provider = (value: unknown): LyricsCandidateV0["provider"] | undefined =>
  value === "applemusic" || value === "kugou" || value === "netease" || value === "tencent" ? value : undefined;

const parseWords = (
  value: unknown,
  lineFromMs: number,
  lineToMs: number,
): LyricWordV0[] | undefined => {
  if (!Array.isArray(value)) return [];
  if (value.length > 300) return undefined;
  let previousFromMs = -1;
  const words: LyricWordV0[] = [];
  for (const raw of value as LDDCWord[]) {
    const fromMs = Math.round(Number(raw.startMilliseconds));
    const toMs = Math.round(Number(raw.endMilliseconds));
    const text = typeof raw.text === "string" ? raw.text : "";
    if (
      !Number.isFinite(fromMs)
      || !Number.isFinite(toMs)
      || fromMs < lineFromMs
      || toMs > lineToMs
      || toMs <= fromMs
      || fromMs < previousFromMs
      || text.length === 0
      || text.length > 160
    ) return undefined;
    words.push({ wordIndex: words.length, fromMs, toMs, text });
    previousFromMs = fromMs;
  }
  return words;
};

const candidateFromLDDC = (
  value: LDDCCandidate,
  fallbackDurationMs: number,
): LyricsCandidateV0 | undefined => {
  const source = provider(value.source);
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const artist = typeof value.artist === "string" ? value.artist.trim() : "";
  if (!source || !id || !title || !artist || !Array.isArray(value.lyricLines)) return undefined;
  let previous = -1;
  const rows: string[] = [];
  const lines: LyricLineV0[] = [];
  let totalWords = 0;
  for (const raw of value.lyricLines.slice(0, 500) as LDDCLine[]) {
    const start = Math.round(Number(raw.startMilliseconds));
    const end = Math.round(Number(raw.endMilliseconds));
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < previous || end <= start || !text) return undefined;
    const words = parseWords(raw.words, start, end);
    if (!words) return undefined;
    totalWords += words.length;
    if (totalWords > 12_000) return undefined;
    previous = start;
    rows.push(`[${timestamp(Math.round(start))}]${text}`);
    lines.push({
      lineIndex: lines.length,
      fromMs: start,
      toMs: end,
      text,
      ...(words.length > 0 ? { words } : {}),
      voiceRole: "lead",
    });
  }
  if (rows.length === 0) return undefined;
  const durationSeconds = Number(value.durationSeconds);
  const album = typeof value.album === "string" ? value.album.trim() : "";
  const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.round(durationSeconds * 1000)
    : fallbackDurationMs;
  const hasWordTiming = value.timingKind === "word" && totalWords > 0;
  if (value.timingKind === "word" && !hasWordTiming) return undefined;
  const wordTimedDocument: LyricDocumentV0 | undefined = hasWordTiming
    ? {
        version: "lyric-document-v0",
        recordingID: `lyricsCandidate:${source}:${encodeURIComponent(id)}`,
        durationMs: Math.max(fallbackDurationMs, ...lines.map((line) => line.toMs)),
        lines,
      }
    : undefined;
  return {
    provider: source,
    id,
    title,
    artist,
    ...(album ? { album } : {}),
    durationMs,
    syncedLyrics: rows.join("\n"),
    timingKind: hasWordTiming ? "word" : "line",
    ...(wordTimedDocument ? { wordTimedDocument } : {}),
  };
};

export const lookupLDDCLyrics = async (
  track: LyricsLookupTrackV0,
  configuration: LDDCLyricsConfigurationV0,
  signal?: AbortSignal,
  identity: LyricsLookupIdentityV0 = buildLyricsLookupIdentity(track),
  targetArtists?: string[],
): Promise<LyricsCandidateV0[]> => {
  const base = new URL(configuration.endpoint);
  const url = new URL("v1/lyrics/resolve", base.href.endsWith("/") ? base : `${base.href}/`);
  const artists = targetArtists ?? (identity.isCover ? identity.coverPerformers : identity.originalArtists);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${configuration.token}`,
    },
    body: JSON.stringify({
      schema: "bilimusic-lddc-lyrics-v1",
      requestID: `youtube:${track.trackID}:automatic:${targetArtists ? "original" : "preferred"}`,
      title: identity.canonicalTitle,
      artists: artists.length > 0 ? artists : [track.artist],
      aliases: identity.titles.filter((title) => title !== identity.canonicalTitle),
      durationMilliseconds: track.durationMs,
      requireDurationMatch: true,
      maxCandidates: 6,
    }),
    signal,
  });
  if (!response.ok) throw new Error(`LDDC HTTP ${response.status}`);
  const envelope = await response.json() as { schema?: unknown; candidates?: unknown };
  if (envelope.schema !== "bilimusic-lddc-lyrics-v1" || !Array.isArray(envelope.candidates)) {
    throw new Error("LDDC 歌词响应格式异常");
  }
  return (envelope.candidates as LDDCCandidate[])
    .slice(0, 12)
    .flatMap((candidate) => {
      const parsed = candidateFromLDDC(candidate, track.durationMs);
      return parsed ? [parsed] : [];
    });
};
