import type { LyricsLookupResponseV0 } from "@lyricstage/lyrics";
import type {
  DirectorBibleV1,
  DirectorCacheSummaryV1,
  DirectorPlanV1,
  RollingPerformanceStateV1,
  SceneCardV1,
} from "@lyricstage/performance";

export const backgroundStorageKeys = {
  lyricsCache: "lyricstage-youtube-music-lyrics-v9",
  localLyrics: "lyricstage-local-lyrics-v0",
  privateLyricsConfiguration: "lyricstage-private-lyrics-backend-v0",
  legacyDirectorConfiguration: "lyricstage-director-backend-v1",
  directorConfiguration: "lyricstage-director-byok-v1",
  legacyDirectorCache: "lyricstage-director-cache-v4",
  directorCache: "lyricstage-director-cache-v5",
  directorLastTiming: "lyricstage-director-last-timing-v1",
  directorBibleCache: "lyricstage-director-bible-cache-v1",
  directorSceneCache: "lyricstage-director-scene-cache-v1",
} as const;

export const directorCacheEpoch = "fullscreen-director-v4-client-contract-v8.7-byok-intent-v1";
export const rollingDirectorEpoch = "rolling-director-generation-v1.1";
export const lyricsCacheLimit = 100;
export const lyricsCacheByteLimit = 1_500_000;
export const localLyricsByteLimit = 1_500_000;
export const directorCacheLimit = 100;
export const sponsorBlockCategories = [
  "sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "filler", "music_offtopic",
] as const;

export interface StoredLyricsCacheEntry {
  fingerprint: string;
  expiresAtUnixMs: number;
  updatedAtUnixMs?: number;
  response: LyricsLookupResponseV0;
}
export type StoredLyricsCache = Record<string, StoredLyricsCacheEntry>;

export interface StoredLocalLyricsEntry {
  fingerprint: string;
  fileName: string;
  rawLyrics: string;
  updatedAtUnixMs: number;
}
export type StoredLocalLyrics = Record<string, StoredLocalLyricsEntry>;

const jsonByteLength = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : new TextEncoder().encode(serialized).byteLength;
};

/**
 * Keeps the caller's newest-first ordering while applying both count and exact
 * UTF-8 JSON byte budgets. Chrome storage quotas are byte based, so a record
 * count alone is not a meaningful bound for large synchronized lyrics.
 */
export const boundedStorageRecord = <T>(
  entries: Array<[string, T]>,
  maxEntries: number,
  maxBytes: number,
): Record<string, T> => {
  const selected: Array<[string, T]> = [];
  let bytes = 2; // Opening and closing braces.
  for (const [key, value] of entries) {
    if (selected.length >= maxEntries) break;
    const serializedValue = JSON.stringify(value);
    if (serializedValue === undefined) continue;
    const contribution = jsonByteLength(key) + 1 + new TextEncoder().encode(serializedValue).byteLength
      + (selected.length > 0 ? 1 : 0);
    if (bytes + contribution > maxBytes) continue;
    selected.push([key, value]);
    bytes += contribution;
  }
  return Object.fromEntries(selected);
};

export interface StoredDirectorCacheEntry {
  fingerprint: string;
  expiresAtUnixMs: number;
  plan: DirectorPlanV1;
}
export type StoredDirectorCache = Record<string, StoredDirectorCacheEntry>;

export interface StoredDirectorBibleCacheEntry {
  fingerprint: string;
  epoch: string;
  createdAtUnixMs: number;
  expiresAtUnixMs: number;
  trackTitle: string;
  trackArtist: string;
  summary?: DirectorCacheSummaryV1;
  bible: DirectorBibleV1;
}

export interface StoredDirectorSceneCacheEntry {
  fingerprint: string;
  epoch: string;
  createdAtUnixMs: number;
  expiresAtUnixMs: number;
  trackID: string;
  trackTitle: string;
  trackArtist: string;
  bibleIdentity: string;
  fromLineIndex: number;
  entryStateHash: string;
  entryState: RollingPerformanceStateV1;
  cards: SceneCardV1[];
  summary?: DirectorCacheSummaryV1;
}
export type StoredDirectorBibleCache = Record<string, StoredDirectorBibleCacheEntry>;
export type StoredDirectorSceneCache = Record<string, StoredDirectorSceneCacheEntry>;

export interface RollingGenerationLedgerV1 {
  fingerprint: string;
  generation: number;
  bibleLogicalRequests: number;
  sceneLogicalRequests: number;
  providerAttempts: number;
  providerMs: number;
  consecutiveFailures: number;
  inFlight?: Promise<void>;
  inFlightKind?: "bible" | "scene-pack";
  inFlightWindow?: { fromLineIndex: number; toLineIndex: number };
  generatedCoverage: Array<{ fromLineIndex: number; toLineIndex: number; sceneIDs: string[] }>;
}
