import type { YouTubeMusicSnapshotV0 } from "@lyricstage/companion";
import {
  isLyricsLookupResponseV0,
  type LyricsCandidateV0,
  type LyricsLookupResponseV0,
  type LyricsLookupTrackV0,
} from "@lyricstage/lyrics";

interface ExtensionRuntime {
  id?: string;
  sendMessage(message: unknown): Promise<unknown>;
}

const extensionRuntime = (): ExtensionRuntime | undefined => {
  const runtime = (globalThis as typeof globalThis & {
    chrome?: { runtime?: ExtensionRuntime };
  }).chrome?.runtime;
  return runtime?.id && typeof runtime.sendMessage === "function" ? runtime : undefined;
};

export const lyricsTrackFromSnapshot = (
  snapshot: YouTubeMusicSnapshotV0,
): LyricsLookupTrackV0 | undefined => {
  const rawDurationMs = snapshot.playback.durationMs;
  if (!Number.isFinite(rawDurationMs) || rawDurationMs <= 0) return undefined;
  const durationMs = Math.max(1, Math.round(rawDurationMs));
  return {
    provider: "youtubeMusic",
    trackID: snapshot.track.trackID,
    title: snapshot.track.title,
    artist: snapshot.track.artist,
    durationMs,
  };
};

export const lyricsTrackIdentity = (track: LyricsLookupTrackV0): string => JSON.stringify([
  track.trackID,
  track.title.trim(),
  track.artist.trim(),
  Math.round(track.durationMs / 1000),
]);

export const requestAutomaticLyrics = async (
  track: LyricsLookupTrackV0,
): Promise<LyricsLookupResponseV0> => {
  const runtime = extensionRuntime();
  if (!runtime) throw new Error("自动歌词只在伴生扩展中可用");
  const response = await runtime.sendMessage({ type: "youtube-music-resolve-lyrics", track });
  if (!isLyricsLookupResponseV0(response) || response.trackID !== track.trackID) {
    throw new Error("歌词服务返回格式异常");
  }
  return response;
};

export const requestManualLyrics = async (
  track: LyricsLookupTrackV0,
  title: string,
  artist: string,
  originalArtist = "",
): Promise<LyricsLookupResponseV0> => {
  const runtime = extensionRuntime();
  if (!runtime) throw new Error("手动歌词搜索只在伴生扩展中可用");
  const response = await runtime.sendMessage({
    type: "youtube-music-search-lyrics",
    track,
    query: { title, artist, originalArtist },
  });
  if (!isLyricsLookupResponseV0(response) || response.trackID !== track.trackID) {
    throw new Error("歌词服务返回格式异常");
  }
  return response;
};

export const rememberLyricsCandidate = async (
  track: LyricsLookupTrackV0,
  candidate: LyricsCandidateV0,
): Promise<void> => {
  const runtime = extensionRuntime();
  if (!runtime) return;
  const response = await runtime.sendMessage({ type: "youtube-music-accept-lyrics", track, candidate });
  const result = response as { ok?: boolean; reason?: string } | undefined;
  if (result?.ok !== true) throw new Error(result?.reason || "歌词缓存写入失败");
};

export const rememberLocalLyrics = async (
  track: LyricsLookupTrackV0,
  fileName: string,
  rawLyrics: string,
): Promise<void> => {
  const runtime = extensionRuntime();
  if (!runtime) return;
  const response = await runtime.sendMessage({
    type: "youtube-music-save-local-lyrics",
    track,
    fileName,
    rawLyrics,
  });
  const result = response as { ok?: boolean; reason?: string } | undefined;
  if (result?.ok !== true) throw new Error(result?.reason || "本地歌词保存失败");
};
