import {
  YouTubeMusicSourceRegistryV0,
  youtubeMusicRecordingID,
  type YouTubeMusicTransportActionV0,
  type YouTubeMusicBridgeStateV0,
  type YouTubeMusicBridgeUpdateV0,
} from "@lyricstage/companion";
import { parseLyricDocumentV0, stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import {
  buildLyricsLookupIdentity,
  isLyricsCandidateV0,
  isLyricsLookupTrackV0,
  lookupResponseContainsCandidate,
  effectiveMusicDurationMs,
  lookupLayeredLyrics,
  lyricsLookupVersion,
  manualLyricsLookupIdentity,
  sanitizeManualLyricsSearchQuery,
  type LDDCLyricsConfigurationV0,
  type LyricsCandidateV0,
  type LyricsLookupResponseV0,
  type LyricsLookupTrackV0,
  type NonMusicSegmentMs,
} from "@lyricstage/lyrics";
import {
  adaptFullscreenDirectorResponseV1,
  adaptFullscreenDirectorResponseV2,
  adaptFullscreenDirectorResponseV3,
  adaptFullscreenDirectorResponseV4,
  analyzeDirectorCacheSummariesV1,
  advanceRollingPerformanceStateV1,
  buildDirectorRequestPayloadV1,
  compileLocalDirectorBibleV1,
  compileLocalContinuitySceneCardsV2,
  directorBYOKCacheIdentityV1,
  directorBYOKDiagnosticsFromErrorV1,
  directorBibleRequestProfileV1,
  executeDirectorBYOKProfileV1,
  executeDirectorBYOKV1,
  initialRollingPerformanceStateV1,
  checkpointRollingPerformanceStateV1,
  isRollingPerformanceStateV1,
  sanitizeDirectorBibleV1,
  sanitizeDirectorCacheSummaryV1,
  sanitizeSceneCardV1,
  windowIntentRequestProfileV2,
  summarizeDirectorCacheEntryV1,
  isDirectorPlanV1ForLyrics,
  listDirectorProviderModelsV1,
  publicDirectorBYOKConfigurationV1,
  sanitizeDirectorProviderConnectionV1,
  sanitizeDirectorBYOKConfigurationV1,
  sanitizeProviderEndpointV1,
  sanitizeMusicMapV1,
  sanitizeVocalTimingMapV1,
  type DirectorBYOKConfigurationV1,
  type DirectorBibleV1,
  type DirectorCacheSummaryV1,
  type DirectorPlanV1,
  type DirectorProviderConfigurationV1,
  type DirectorResolutionResponseV1,
  type DirectorTimingV1,
  type MusicMapV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
  type VocalTimingMapV1,
} from "@lyricstage/performance";
import {
  backgroundStorageKeys,
  directorCacheEpoch,
  directorCacheLimit,
  rollingDirectorEpoch,
  sponsorBlockCategories,
  type RollingGenerationLedgerV1,
  type StoredDirectorBibleCache,
  type StoredDirectorBibleCacheEntry,
  type StoredDirectorCache,
  type StoredDirectorSceneCache,
  type StoredDirectorSceneCacheEntry,
} from "./backgroundStorage";
import {
  negativeSceneCacheIdentityV1, RollingSceneNegativeCacheV1,
  rollingGenerationLimitsV2,
  rollingRequestAllowedV2,
  rollingSceneProviderBudgetMsV2,
  scenePackSchemaVersion,
  semanticCueBudgetExceededV2,
} from "./backgroundNegativeSceneCache";
import type {
  AudioAnalysisReplayState,
  AudioCaptureOperation,
  AudioCaptureOwnerScope,
  AudioCaptureState,
  ExtensionChrome,
  ExtensionPort,
  ExtensionTab,
  OffscreenAudioCaptureStatus,
} from "./backgroundRuntime";
import { LyricsStorageRepository } from "./lyricsCacheRuntime";
import {
  RollingRequestOwnership,
  type RollingOwnerKey,
} from "./rollingRequestOwnership";
import { sanitizedRollingReason } from "./backgroundDirectorErrors";

const chromeAPI = (globalThis as typeof globalThis & { chrome: ExtensionChrome }).chrome;
const stagePorts = new Map<ExtensionPort, number | undefined>();
const sourceRegistry = new YouTubeMusicSourceRegistryV0();
const {
  lyricsCache: lyricsCacheStorageKey,
  privateLyricsConfiguration: privateLyricsConfigurationStorageKey,
  legacyDirectorConfiguration: legacyDirectorConfigurationStorageKey,
  directorConfiguration: directorConfigurationStorageKey,
  legacyDirectorCache: legacyDirectorCacheStorageKey,
  directorCache: directorCacheStorageKey,
  directorLastTiming: directorLastTimingStorageKey,
  directorBibleCache: directorBibleCacheStorageKey,
  directorSceneCache: directorSceneCacheStorageKey,
} = backgroundStorageKeys;
const lyricsLookupTasks = new Map<string, Promise<LyricsLookupResponseV0>>();
const manualLyricsLookupTasks = new Map<string, Promise<LyricsLookupResponseV0>>();
const lyricsStorage = new LyricsStorageRepository(chromeAPI.storage.local);
const directorLookupTasks = new Map<string, Promise<DirectorResolutionResponseV1>>();
let lyricsCacheWrite = Promise.resolve();
let localLyricsWrite = Promise.resolve();
let directorCacheWrite = Promise.resolve();
let rollingDirectorCacheWrite = Promise.resolve();
const rollingSceneNegativeCache = new RollingSceneNegativeCacheV1();
let sourceLeaseTimer: ReturnType<typeof setInterval> | undefined;
let offscreenCreation: Promise<void> | undefined;

let audioCapture: AudioCaptureState | undefined;
let pendingAudioCapture: AudioCaptureState | undefined;
let recoveringAudioCapture: AudioCaptureState | undefined;
let audioCaptureGeneration = 0;
let audioCaptureSequence = 0;
let audioCaptureRehydrated = false;
let audioCaptureRehydrationTask: Promise<void> | undefined;
const audioAnalysisReplayByTab = new Map<number, AudioAnalysisReplayState>();
let lastBroadcastAuthoritativeTabID: number | undefined;

const rollingRequestOwnership = new RollingRequestOwnership();

const privateLyricsConfiguration = async (): Promise<LDDCLyricsConfigurationV0 | undefined> => {
  const value = (await chromeAPI.storage.local.get(privateLyricsConfigurationStorageKey))[privateLyricsConfigurationStorageKey] as
    Partial<LDDCLyricsConfigurationV0> | undefined;
  if (typeof value?.endpoint !== "string" || typeof value.token !== "string") return undefined;
  const endpoint = sanitizeProviderEndpointV1(value.endpoint);
  const token = value.token.trim();
  if (!endpoint || !token || token.length > 500) return undefined;
  return { endpoint, token };
};

const savePrivateLyricsConfiguration = async (
  endpointValue: unknown,
  tokenValue: unknown,
): Promise<{ configured: boolean; endpoint: string }> => {
  const endpointInput = typeof endpointValue === "string" ? endpointValue.trim() : "";
  const suppliedToken = typeof tokenValue === "string" ? tokenValue.trim() : "";
  if (!endpointInput) {
    await chromeAPI.storage.local.set({ [privateLyricsConfigurationStorageKey]: null });
    await chromeAPI.storage.local.set({ [lyricsCacheStorageKey]: {} });
    return { configured: false, endpoint: "" };
  }
  const endpoint = sanitizeProviderEndpointV1(endpointInput);
  if (!endpoint) throw new Error("歌词后端地址无效");
  const existing = await privateLyricsConfiguration();
  const sameEndpoint = existing?.endpoint.replace(/\/+$/u, "") === endpoint.replace(/\/+$/u, "");
  const token = suppliedToken || (sameEndpoint ? existing?.token ?? "" : "");
  if (!token || token.length > 500) throw new Error("请输入歌词后端令牌");
  await chromeAPI.storage.local.set({
    [privateLyricsConfigurationStorageKey]: { endpoint, token },
    [lyricsCacheStorageKey]: {},
  });
  return { configured: true, endpoint };
};

const directorConfiguration = async (): Promise<DirectorBYOKConfigurationV1 | undefined> => {
  const value = (await chromeAPI.storage.local.get(directorConfigurationStorageKey))[directorConfigurationStorageKey];
  return sanitizeDirectorBYOKConfigurationV1(value);
};

const sameProviderTarget = (
  candidate: Record<string, unknown>,
  existing: DirectorProviderConfigurationV1 | undefined,
): boolean => {
  if (!existing) return false;
  return candidate.protocol === existing.protocol
    && typeof candidate.endpoint === "string"
    && candidate.endpoint.trim().replace(/\/+$/u, "") === existing.endpoint;
};

const mergeStoredProviderKey = (
  value: unknown,
  existing: DirectorProviderConfigurationV1 | undefined,
): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  const suppliedKey = typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "";
  return {
    ...candidate,
    apiKey: suppliedKey || (sameProviderTarget(candidate, existing) ? existing?.apiKey ?? "" : ""),
  };
};

const saveDirectorConfiguration = async (value: unknown): Promise<{ configured: boolean }> => {
  if (!value) {
    await chromeAPI.storage.local.set({
      [directorConfigurationStorageKey]: null,
      [legacyDirectorConfigurationStorageKey]: null,
      [directorCacheStorageKey]: {},
      [legacyDirectorCacheStorageKey]: {},
      [directorLastTimingStorageKey]: null,
    });
    rollingRequestOwnership.invalidateAll();
    return { configured: false };
  }
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("导演配置格式无效");
  const existing = await directorConfiguration();
  const candidate = value as Record<string, unknown>;
  const merged = {
    ...candidate,
    primary: mergeStoredProviderKey(candidate.primary, existing?.primary),
    ...(candidate.fallback ? { fallback: mergeStoredProviderKey(candidate.fallback, existing?.fallback) } : {}),
  };
  const configuration = sanitizeDirectorBYOKConfigurationV1(merged);
  if (!configuration) {
    throw new Error("请检查协议、地址、模型与 API Key；HTTP 仅允许本机或私有网络模型");
  }
  await chromeAPI.storage.local.set({
    [directorConfigurationStorageKey]: configuration,
    [legacyDirectorConfigurationStorageKey]: null,
    [directorCacheStorageKey]: {},
    [legacyDirectorCacheStorageKey]: {},
    [directorLastTimingStorageKey]: null,
  });
  rollingRequestOwnership.invalidateAll();
  return { configured: true };
};

const discoverDirectorModels = async (
  value: unknown,
  slotValue: unknown,
): Promise<{ models: Awaited<ReturnType<typeof listDirectorProviderModelsV1>>["models"] }> => {
  const slot = slotValue === "fallback" ? "fallback" : "primary";
  const existing = await directorConfiguration();
  const merged = mergeStoredProviderKey(value, existing?.[slot]);
  const provider = sanitizeDirectorProviderConnectionV1(merged);
  if (!provider) {
    throw new Error("请检查协议、API 地址与 Key；远程 HTTPS 接口必须提供 Key");
  }
  const result = await listDirectorProviderModelsV1(provider);
  return { models: result.models };
};

const lyricsFingerprint = (track: LyricsLookupTrackV0): string =>
  JSON.stringify([
    track.provider,
    track.trackID,
    track.title.trim(),
    track.artist.trim(),
    Math.round(track.durationMs / 1000),
  ]);

const lyricsErrorResponse = (
  trackID: string,
  error: unknown,
): LyricsLookupResponseV0 => ({
  type: "lyrics-lookup-result",
  version: lyricsLookupVersion,
  trackID,
  status: "error",
  source: "network",
  candidates: [],
  message: error instanceof Error ? error.message.slice(0, 300) : "歌词搜索失败",
});

const fetchNonMusicSegments = async (videoID: string): Promise<NonMusicSegmentMs[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const encoded = new TextEncoder().encode(videoID);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const prefix = Array.from(new Uint8Array(digest).slice(0, 3))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 5);
    const url = new URL(`https://sponsor.ajay.app/api/skipSegments/${prefix}`);
    url.searchParams.set("categories", JSON.stringify(sponsorBlockCategories));
    url.searchParams.set("actionTypes", JSON.stringify(["skip", "mute", "full"]));
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`SponsorBlock HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) return [];
    const video = payload.find((item) =>
      item && typeof item === "object" && (item as { videoID?: unknown }).videoID === videoID
    ) as { segments?: unknown } | undefined;
    if (!Array.isArray(video?.segments)) return [];
    return video.segments.flatMap((entry): NonMusicSegmentMs[] => {
      const segment = entry && typeof entry === "object"
        ? (entry as { segment?: unknown }).segment
        : undefined;
      if (
        !Array.isArray(segment) ||
        segment.length !== 2 ||
        segment.some((time) => typeof time !== "number" || !Number.isFinite(time) || time < 0) ||
        segment[0] >= segment[1]
      ) return [];
      return [[Math.round(segment[0] * 1000), Math.round(segment[1] * 1000)]];
    }).slice(0, 100);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
};

const localLyricsCandidate = async (
  track: LyricsLookupTrackV0,
): Promise<LyricsCandidateV0 | undefined> => {
  const entry = await lyricsStorage.localEntry(track.trackID);
  if (
    !entry ||
    entry.fingerprint !== lyricsFingerprint(track) ||
    typeof entry.fileName !== "string" ||
    typeof entry.rawLyrics !== "string" ||
    entry.rawLyrics.length === 0 ||
    entry.rawLyrics.length > 256_000
  ) return undefined;
  return {
    provider: "local",
    id: `local:${track.trackID}`,
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs,
    syncedLyrics: entry.rawLyrics,
    fileName: entry.fileName,
  };
};

const saveLocalLyrics = (
  track: LyricsLookupTrackV0,
  fileName: string,
  rawLyrics: string,
): Promise<void> => {
  localLyricsWrite = localLyricsWrite.catch(() => undefined).then(() =>
    lyricsStorage.saveLocal(track.trackID, {
      fingerprint: lyricsFingerprint(track),
      fileName: fileName.slice(0, 200),
      rawLyrics,
      updatedAtUnixMs: Date.now(),
    }),
  );
  return localLyricsWrite;
};

const cachedLyrics = (track: LyricsLookupTrackV0): Promise<LyricsLookupResponseV0 | undefined> =>
  lyricsStorage.cached(track.trackID, lyricsFingerprint(track));

const rememberIssuedLyricsResponse = (
  track: LyricsLookupTrackV0,
  response: LyricsLookupResponseV0,
): void => lyricsStorage.rememberIssued(lyricsFingerprint(track), response);

const issuedLyricsResponse = async (
  track: LyricsLookupTrackV0,
  candidate: LyricsCandidateV0,
): Promise<LyricsLookupResponseV0 | undefined> =>
  lyricsStorage.issued(lyricsFingerprint(track), candidate);

const saveLyricsCache = (
  track: LyricsLookupTrackV0,
  response: LyricsLookupResponseV0,
  ttlMilliseconds: number,
  cacheKey = track.trackID,
  requireEntry = false,
): Promise<void> => {
  lyricsCacheWrite = lyricsCacheWrite.catch(() => undefined).then(() => lyricsStorage.save(
    cacheKey,
    lyricsFingerprint(track),
    response,
    ttlMilliseconds,
    requireEntry,
  ));
  return lyricsCacheWrite;
};

const resolveAutomaticLyrics = async (track: LyricsLookupTrackV0): Promise<LyricsLookupResponseV0> => {
  try {
    const local = await localLyricsCandidate(track);
    if (local) {
      return {
        type: "lyrics-lookup-result",
        version: lyricsLookupVersion,
        trackID: track.trackID,
        status: "match",
        source: "cache",
        match: local,
        candidates: [local],
      };
    }
  } catch {
    // A broken local library must not block the online fallback.
  }
  let cached: LyricsLookupResponseV0 | undefined;
  try {
    cached = await cachedLyrics(track);
  } catch {
    // Cache availability must never turn an otherwise valid network lookup into an error.
  }
  if (cached) return cached;
  const fingerprint = lyricsFingerprint(track);
  const existing = lyricsLookupTasks.get(fingerprint);
  if (existing) return existing;
  const task: Promise<LyricsLookupResponseV0> = (async (): Promise<LyricsLookupResponseV0> => {
    try {
      const nonMusicSegmentsMs = await fetchNonMusicSegments(track.trackID);
      const lookupTrack = nonMusicSegmentsMs.length > 0
        ? {
            ...track,
            durationMs: effectiveMusicDurationMs(track.durationMs, nonMusicSegmentsMs),
          }
        : track;
      const lddc = await privateLyricsConfiguration();
      const localIdentity = buildLyricsLookupIdentity(lookupTrack);
      const found = await lookupLayeredLyrics(lookupTrack, { lddc, identity: localIdentity });
      const decorate = (candidate: LyricsCandidateV0): LyricsCandidateV0 =>
        nonMusicSegmentsMs.length > 0 ? { ...candidate, nonMusicSegmentsMs } : candidate;
      const response: LyricsLookupResponseV0 = {
        ...found,
        trackID: track.trackID,
        ...(found.match ? { match: decorate(found.match) } : {}),
        candidates: found.candidates.map(decorate),
      };
      const ttl = response.status === "match"
        ? 30 * 24 * 60 * 60 * 1000
        : response.status === "candidates"
          ? 24 * 60 * 60 * 1000
          : 6 * 60 * 60 * 1000;
      rememberIssuedLyricsResponse(track, response);
      await saveLyricsCache(track, response, ttl).catch(() => undefined);
      return response;
    } catch (error) {
      return lyricsErrorResponse(track.trackID, error);
    } finally {
      lyricsLookupTasks.delete(fingerprint);
    }
  })();
  lyricsLookupTasks.set(fingerprint, task);
  return task;
};

const resolveManualLyrics = async (
  track: LyricsLookupTrackV0,
  titleValue: unknown,
  artistValue: unknown,
): Promise<LyricsLookupResponseV0> => {
  const query = sanitizeManualLyricsSearchQuery(titleValue, artistValue);
  if (!query) {
    return lyricsErrorResponse(track.trackID, new Error("请输入有效的歌名；歌手可以留空"));
  }
  const { title, artist } = query;
  const taskKey = JSON.stringify([lyricsFingerprint(track), title, artist]);
  const existing = manualLyricsLookupTasks.get(taskKey);
  if (existing) return existing;
  const task: Promise<LyricsLookupResponseV0> = (async () => {
    try {
      const nonMusicSegmentsMs = await fetchNonMusicSegments(track.trackID);
      const lookupTrack = nonMusicSegmentsMs.length > 0
        ? { ...track, durationMs: effectiveMusicDurationMs(track.durationMs, nonMusicSegmentsMs) }
        : track;
      const identity = manualLyricsLookupIdentity(query);
      const found = await lookupLayeredLyrics(lookupTrack, {
        lddc: await privateLyricsConfiguration(),
        identity,
      });
      const decorate = (candidate: LyricsCandidateV0): LyricsCandidateV0 =>
        nonMusicSegmentsMs.length > 0 ? { ...candidate, nonMusicSegmentsMs } : candidate;
      const candidates = found.candidates.map(decorate);
      const response: LyricsLookupResponseV0 = {
        type: "lyrics-lookup-result",
        version: lyricsLookupVersion,
        trackID: track.trackID,
        status: candidates.length > 0 ? "candidates" : "miss",
        source: "network",
        candidates,
        message: candidates.length > 0
          ? `手动搜索“${title}”${artist ? ` / ${artist}` : ""}返回 ${candidates.length} 个候选，请选择版本。`
          : `没有找到“${title}”${artist ? ` / ${artist}` : ""}的同步歌词。`,
      };
      rememberIssuedLyricsResponse(track, response);
      if (candidates.length > 0) {
        const manualCacheKey = `manual:${track.trackID}:${stableHash32({ title, artist })}`;
        await saveLyricsCache(
          track,
          response,
          24 * 60 * 60 * 1000,
          manualCacheKey,
        ).catch(() => undefined);
      }
      return response;
    } catch (error) {
      return lyricsErrorResponse(track.trackID, error);
    } finally {
      manualLyricsLookupTasks.delete(taskKey);
    }
  })();
  manualLyricsLookupTasks.set(taskKey, task);
  return task;
};

const acceptLyricsCandidate = async (
  track: LyricsLookupTrackV0,
  candidate: LyricsCandidateV0,
): Promise<void> => {
  const issued = await issuedLyricsResponse(track, candidate);
  const wasIssued = issued ? lookupResponseContainsCandidate(issued, candidate) : false;
  if (!wasIssued) throw new Error("candidate-not-issued-for-track");
  const response: LyricsLookupResponseV0 = {
    type: "lyrics-lookup-result",
    version: lyricsLookupVersion,
    trackID: track.trackID,
    status: "match",
    source: "cache",
    match: candidate,
    candidates: issued?.candidates ?? [candidate],
  };
  await saveLyricsCache(track, response, 30 * 24 * 60 * 60 * 1000, track.trackID, true);
};

const directorFingerprint = (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  configuration: DirectorBYOKConfigurationV1,
): string => stableHash32({
  version: "director-cache-fingerprint-v2",
  epoch: directorCacheEpoch,
  provider: directorBYOKCacheIdentityV1(configuration),
  track: lyricsFingerprint(track),
  lyrics,
});

const readDirectorCache = async (): Promise<StoredDirectorCache> => {
  const stored = (await chromeAPI.storage.local.get(directorCacheStorageKey))[directorCacheStorageKey];
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? stored as StoredDirectorCache
    : {};
};

const cachedDirectorPlan = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  configuration: DirectorBYOKConfigurationV1,
): Promise<DirectorPlanV1 | undefined> => {
  const entry = (await readDirectorCache())[track.trackID];
  if (
    !entry
    || entry.fingerprint !== directorFingerprint(track, lyrics, configuration)
    || entry.expiresAtUnixMs <= Date.now()
    || !isDirectorPlanV1ForLyrics(entry.plan, lyrics)
  ) return undefined;
  return entry.plan;
};

const saveDirectorPlanCache = (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  plan: DirectorPlanV1,
  configuration: DirectorBYOKConfigurationV1,
): Promise<void> => {
  directorCacheWrite = directorCacheWrite.catch(() => undefined).then(async () => {
    const now = Date.now();
    const entries = Object.entries(await readDirectorCache()).filter(([trackID, entry]) =>
      trackID !== track.trackID
      && typeof entry?.expiresAtUnixMs === "number"
      && entry.expiresAtUnixMs > now
    );
    entries.push([track.trackID, {
      fingerprint: directorFingerprint(track, lyrics, configuration),
      expiresAtUnixMs: now + 30 * 24 * 60 * 60 * 1000,
      plan,
    }]);
    const bounded = Object.fromEntries(
      entries
        .sort((left, right) => right[1].expiresAtUnixMs - left[1].expiresAtUnixMs)
        .slice(0, directorCacheLimit),
    );
    await chromeAPI.storage.local.set({ [directorCacheStorageKey]: bounded });
  });
  return directorCacheWrite;
};

const rollingDirectorFingerprint = (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  configuration: DirectorBYOKConfigurationV1,
): string => stableHash32({
  version: "rolling-director-fingerprint-v1",
  epoch: rollingDirectorEpoch,
  provider: directorBYOKCacheIdentityV1(configuration),
  track: lyricsFingerprint(track),
  lyrics,
});

const readDirectorBibleCache = async (): Promise<StoredDirectorBibleCache> => {
  const stored = (await chromeAPI.storage.local.get(directorBibleCacheStorageKey))[directorBibleCacheStorageKey];
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored as StoredDirectorBibleCache : {};
};

const readDirectorSceneCache = async (): Promise<StoredDirectorSceneCache> => {
  const stored = (await chromeAPI.storage.local.get(directorSceneCacheStorageKey))[directorSceneCacheStorageKey];
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored as StoredDirectorSceneCache : {};
};

const cachedDirectorBible = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  fingerprint: string,
): Promise<{ bible: DirectorBibleV1; expiresAtUnixMs: number } | undefined> => {
  const entry = (await readDirectorBibleCache())[track.trackID];
  if (!entry || entry.epoch !== rollingDirectorEpoch || entry.fingerprint !== fingerprint
    || entry.expiresAtUnixMs <= Date.now()) return undefined;
  const bible = sanitizeDirectorBibleV1(lyrics, entry.bible);
  return bible ? { bible, expiresAtUnixMs: entry.expiresAtUnixMs } : undefined;
};

const saveDirectorBibleCache = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  fingerprint: string,
  bible: DirectorBibleV1,
  timing?: unknown,
  source: "network" | "local" = "network",
): Promise<number> => {
  const createdAtUnixMs = Date.now();
  const expiresAtUnixMs = createdAtUnixMs + 30 * 24 * 60 * 60 * 1_000;
  const summary = summarizeDirectorCacheEntryV1({
    lyrics, track, cacheEpoch: rollingDirectorEpoch, source, createdAtUnixMs, expiresAtUnixMs,
    bible, cards: [], timing,
  }) ?? undefined;
  rollingDirectorCacheWrite = rollingDirectorCacheWrite.catch(() => undefined).then(async () => {
    const entries = Object.entries(await readDirectorBibleCache()).filter(([trackID, entry]) =>
      trackID !== track.trackID && entry.expiresAtUnixMs > Date.now());
    entries.push([track.trackID, {
      fingerprint, epoch: rollingDirectorEpoch, createdAtUnixMs, expiresAtUnixMs,
      trackTitle: track.title.slice(0, 120), trackArtist: track.artist.slice(0, 160), summary, bible,
    }]);
    await chromeAPI.storage.local.set({
      [directorBibleCacheStorageKey]: Object.fromEntries(entries.sort((a, b) => b[1].expiresAtUnixMs - a[1].expiresAtUnixMs).slice(0, 100)),
    });
  });
  await rollingDirectorCacheWrite;
  return expiresAtUnixMs;
};

const sceneCacheIdentity = (
  fingerprint: string,
  trackID: string,
  bibleIdentity: string,
  fromLineIndex: number,
  entryStateHash: string,
): string => stableHash32({
  schemaVersion: scenePackSchemaVersion,
  fingerprint,
  trackID,
  bibleIdentity,
  fromLineIndex,
  entryStateHash,
});
const cachedDirectorScenes = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  fingerprint: string,
): Promise<SceneCardV1[]> => {
  const now = Date.now();
  const entries = Object.values(await readDirectorSceneCache()).filter((entry) =>
    entry.epoch === rollingDirectorEpoch && entry.fingerprint === fingerprint && entry.trackID === track.trackID
    && entry.schemaVersion === scenePackSchemaVersion && ["ai-positive", "local-repair"].includes(entry.provenance)
    && entry.bibleIdentity === bible.bibleIdentity && entry.expiresAtUnixMs > now);
  const cards: SceneCardV1[] = [];
  let accumulatedState = initialRollingPerformanceStateV1(bible);
  for (const entry of entries.sort((a, b) => a.fromLineIndex - b.fromLineIndex)) {
    const storedState = isRollingPerformanceStateV1(entry.entryState, bible) ? entry.entryState : undefined;
    const lastAccepted = cards.at(-1);
    const checkpoint = !lastAccepted || entry.fromLineIndex > lastAccepted.toLineIndex + 1
      ? checkpointRollingPerformanceStateV1(lyrics, bible, entry.fromLineIndex)
      : undefined;
    let state = accumulatedState.stateHash === entry.entryStateHash
      ? accumulatedState
      : storedState?.stateHash === entry.entryStateHash
        ? storedState
        : checkpoint?.stateHash === entry.entryStateHash
          ? checkpoint
          : undefined;
    if (!state || state.stateHash !== entry.entryStateHash) continue;
    let acceptedAny = false;
    for (const candidate of entry.cards) {
      const card = sanitizeSceneCardV1(lyrics, bible, state, candidate);
      if (!card) break;
      if (!cards.some((existing) => existing.sceneID === card.sceneID)) cards.push(card);
      state = advanceRollingPerformanceStateV1(state, card);
      acceptedAny = true;
    }
    if (acceptedAny) accumulatedState = state;
  }
  return cards.sort((a, b) => a.fromLineIndex - b.fromLineIndex);
};
const saveDirectorSceneCache = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  fingerprint: string,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  cards: SceneCardV1[],
  priorCards: SceneCardV1[],
  bibleExpiresAtUnixMs: number,
  timing?: unknown,
  reachedFinalWindow = false,
  isCurrent?: () => boolean, provenance: StoredDirectorSceneCacheEntry["provenance"] = "ai-positive",
): Promise<void> => {
  const createdAtUnixMs = Date.now();
  const fromLineIndex = cards[0]!.fromLineIndex;
  const key = sceneCacheIdentity(fingerprint, track.trackID, bible.bibleIdentity, fromLineIndex, state.stateHash);
  const entry: StoredDirectorSceneCacheEntry = {
    fingerprint,
    epoch: rollingDirectorEpoch,
    schemaVersion: scenePackSchemaVersion,
    provenance,
    createdAtUnixMs,
    expiresAtUnixMs: Math.min(bibleExpiresAtUnixMs, createdAtUnixMs + 30 * 24 * 60 * 60 * 1_000),
    trackID: track.trackID,
    trackTitle: track.title.slice(0, 120),
    trackArtist: track.artist.slice(0, 160),
    bibleIdentity: bible.bibleIdentity,
    fromLineIndex,
    entryStateHash: state.stateHash,
    entryState: state,
    cards,
  };
  entry.summary = summarizeDirectorCacheEntryV1({
    lyrics, track, cacheEpoch: rollingDirectorEpoch, source: provenance === "ai-positive" ? "network" : "local",
    createdAtUnixMs: entry.createdAtUnixMs, expiresAtUnixMs: entry.expiresAtUnixMs, bible,
    cards: [...new Map([...priorCards, ...cards].map((card) => [card.sceneID, card])).values()],
    timing, reachedFinalWindow,
  }) ?? undefined;
  rollingDirectorCacheWrite = rollingDirectorCacheWrite.catch(() => undefined).then(async () => {
    if (isCurrent && !isCurrent()) return;
    const entries = Object.entries(await readDirectorSceneCache()).filter(([entryKey, stored]) =>
      entryKey !== key && stored.expiresAtUnixMs > Date.now());
    if (isCurrent && !isCurrent()) return;
    entries.push([key, entry]);
    await chromeAPI.storage.local.set({
      [directorSceneCacheStorageKey]: Object.fromEntries(entries.sort((a, b) => b[1].expiresAtUnixMs - a[1].expiresAtUnixMs).slice(0, 180)),
    });
  });
  await rollingDirectorCacheWrite;
};
const directorCacheSummariesV1 = async (): Promise<DirectorCacheSummaryV1[]> => {
  const candidates = [
    ...Object.values(await readDirectorBibleCache()).map((entry) => entry.summary),
    ...Object.values(await readDirectorSceneCache()).map((entry) => entry.summary),
  ].map(sanitizeDirectorCacheSummaryV1).filter((summary): summary is DirectorCacheSummaryV1 => Boolean(summary))
    .sort((left, right) => right.createdAtUnixMs - left.createdAtUnixMs || right.semanticDirectiveCount - left.semanticDirectiveCount || right.sceneCardCount - left.sceneCardCount);
  const newestByTrack = new Map<string, DirectorCacheSummaryV1>();
  candidates.forEach((summary) => {
    if (!newestByTrack.has(summary.trackIDDisplay)) newestByTrack.set(summary.trackIDDisplay, summary);
  });
  return analyzeDirectorCacheSummariesV1([...newestByTrack.values()].slice(0, 100));
};

const markDirectorCacheReachedFinalWindowV1 = async (trackID: string): Promise<void> => {
  rollingDirectorCacheWrite = rollingDirectorCacheWrite.catch(() => undefined).then(async () => {
    const bibleCache = await readDirectorBibleCache();
    const bibleEntry = bibleCache[trackID];
    if (bibleEntry?.summary && !bibleEntry.summary.reachedFinalWindow) {
      bibleEntry.summary = analyzeDirectorCacheSummariesV1([{ ...bibleEntry.summary, reachedFinalWindow: true }])[0];
    }
    const sceneCache = await readDirectorSceneCache();
    Object.values(sceneCache).forEach((entry) => {
      if (entry.trackID === trackID && entry.summary && !entry.summary.reachedFinalWindow) {
        entry.summary = analyzeDirectorCacheSummariesV1([{ ...entry.summary, reachedFinalWindow: true }])[0];
      }
    });
    await chromeAPI.storage.local.set({
      [directorBibleCacheStorageKey]: bibleCache,
      [directorSceneCacheStorageKey]: sceneCache,
    });
  });
  await rollingDirectorCacheWrite;
};
const rollingEntryStatesForWindow = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  fingerprint: string,
  fromLineIndex: number,
): Promise<RollingPerformanceStateV1[]> => {
  const candidates: RollingPerformanceStateV1[] = [];
  const checkpoint = checkpointRollingPerformanceStateV1(lyrics, bible, fromLineIndex);
  if (checkpoint) candidates.push(checkpoint);
  const entries = Object.values(await readDirectorSceneCache()).filter((entry) =>
    entry.epoch === rollingDirectorEpoch && entry.fingerprint === fingerprint && entry.trackID === track.trackID
    && entry.schemaVersion === scenePackSchemaVersion && ["ai-positive", "local-repair"].includes(entry.provenance)
    && entry.bibleIdentity === bible.bibleIdentity && entry.expiresAtUnixMs > Date.now());
  let accumulatedState = initialRollingPerformanceStateV1(bible);
  let lastAccepted: SceneCardV1 | undefined;
  for (const entry of entries.sort((a, b) => a.fromLineIndex - b.fromLineIndex)) {
    const gapCheckpoint = !lastAccepted || entry.fromLineIndex > lastAccepted.toLineIndex + 1
      ? checkpointRollingPerformanceStateV1(lyrics, bible, entry.fromLineIndex)
      : undefined;
    let state = accumulatedState.stateHash === entry.entryStateHash
      ? accumulatedState
      : isRollingPerformanceStateV1(entry.entryState, bible) && entry.entryState.stateHash === entry.entryStateHash
        ? entry.entryState
      : gapCheckpoint?.stateHash === entry.entryStateHash
        ? gapCheckpoint
        : undefined;
    if (!state) continue;
    if (state.lastToLineIndex === null || state.lastToLineIndex < fromLineIndex) candidates.push(state);
    let acceptedAny = false;
    for (const candidate of entry.cards) {
      const card = sanitizeSceneCardV1(lyrics, bible, state, candidate);
      if (!card) break;
      state = advanceRollingPerformanceStateV1(state, card);
      lastAccepted = card;
      acceptedAny = true;
      if (state.lastToLineIndex !== null && state.lastToLineIndex < fromLineIndex) candidates.push(state);
    }
    if (acceptedAny) accumulatedState = state;
  }
  return [...new Map(candidates.map((state) => [state.stateHash, state])).values()];
};

interface RollingTimingV1 {
  version: "rolling-director-timing-v1";
  cache: "hit" | "miss";
  providerMs: number;
  contractMs: number;
  attempts: number;
  inputBytes: number;
  outputBytes: number;
}

const rollingTiming = (execution?: { diagnostics: { providerMs: number; contractMs: number; attempts: unknown[]; inputBytes: number; outputBytes: number } }, cache: "hit" | "miss" = "miss"): RollingTimingV1 => ({
  version: "rolling-director-timing-v1",
  cache,
  providerMs: execution?.diagnostics.providerMs ?? 0,
  contractMs: execution?.diagnostics.contractMs ?? 0,
  attempts: execution?.diagnostics.attempts.length ?? 0,
  inputBytes: execution?.diagnostics.inputBytes ?? 0,
  outputBytes: execution?.diagnostics.outputBytes ?? 0,
});

const rollingFingerprintStillCurrent = async (
  owner: RollingOwnerKey,
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  fingerprint: string,
  generation: number,
): Promise<boolean> => {
  if (!rollingRequestOwnership.isCurrent(owner, fingerprint, generation)) return false;
  const current = await directorConfiguration();
  return Boolean(current && rollingDirectorFingerprint(track, lyrics, current) === fingerprint);
};

const rollingSceneStillCurrent = async (
  owner: RollingOwnerKey,
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  fingerprint: string,
  generation: number,
  sceneEpoch: number,
): Promise<boolean> => rollingRequestOwnership.isSceneCurrent(owner, fingerprint, generation, sceneEpoch)
  && rollingFingerprintStillCurrent(owner, track, lyrics, fingerprint, generation);

const updateRollingLedgerFromExecution = (
  ledger: RollingGenerationLedgerV1,
  diagnosticsValue: { providerMs: number; attempts: unknown[] } | undefined,
  succeeded: boolean,
): void => {
  ledger.providerAttempts += diagnosticsValue?.attempts.length ?? 0;
  ledger.providerMs += diagnosticsValue?.providerMs ?? 0;
  ledger.consecutiveFailures = succeeded ? 0 : ledger.consecutiveFailures + 1;
};

const saveDirectorTiming = async (timing: DirectorTimingV1): Promise<void> => {
  await chromeAPI.storage.local.set({ [directorLastTimingStorageKey]: timing });
};

const readDirectorTiming = async (): Promise<DirectorTimingV1 | undefined> => {
  const value = (await chromeAPI.storage.local.get(directorLastTimingStorageKey))[directorLastTimingStorageKey];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DirectorTimingV1
    : undefined;
};

const directorError = (reason: string, timing?: DirectorTimingV1): DirectorResolutionResponseV1 => ({
  type: "director-resolution-v1",
  status: "error",
  source: "network",
  reason: reason.slice(0, 420),
  ...(timing ? { timing } : {}),
});

const resolveAutomaticDirector = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
): Promise<DirectorResolutionResponseV1> => {
  const startedAt = Date.now();
  const configuration = await directorConfiguration();
  if (!configuration) {
    return {
      type: "director-resolution-v1",
      status: "unavailable",
      source: "local",
      reason: "director-not-configured",
    };
  }
  const cacheStartedAt = Date.now();
  const cached = await cachedDirectorPlan(track, lyrics, configuration);
  const cacheMs = Date.now() - cacheStartedAt;
  if (cached) {
    const timing: DirectorTimingV1 = {
      version: "director-timing-v1",
      cache: "hit",
      totalMs: Date.now() - startedAt,
      cacheMs,
      requestBuildMs: 0,
      providerMs: 0,
      contractMs: 0,
      adaptationMs: 0,
      inputBytes: 0,
      outputBytes: 0,
      attempts: [],
      completedAt: new Date().toISOString(),
    };
    await saveDirectorTiming(timing);
    return { type: "director-resolution-v1", status: "ready", source: "cache", plan: cached, timing };
  }
  const fingerprint = directorFingerprint(track, lyrics, configuration);
  const existing = directorLookupTasks.get(fingerprint);
  if (existing) return existing;

  const task = (async (): Promise<DirectorResolutionResponseV1> => {
    const requestBuildStartedAt = Date.now();
    let payload = await buildDirectorRequestPayloadV1(track, lyrics, musicMap);
    if (payload && new TextEncoder().encode(payload.body).byteLength > 60_000) {
      payload = await buildDirectorRequestPayloadV1(track, lyrics, musicMap, { lineTimingOnly: true });
    }
    const requestBuildMs = Date.now() - requestBuildStartedAt;
    if (!payload) return directorError("歌曲过长，使用本地演出");
    try {
      const remainingBudgetMs = Math.max(1, 45_000 - (Date.now() - startedAt));
      const execution = await executeDirectorBYOKV1(
        configuration,
        JSON.parse(payload.body) as unknown,
        fetch,
        remainingBudgetMs,
      );
      const adaptationStartedAt = Date.now();
      const plan = adaptFullscreenDirectorResponseV4(
        lyrics,
        track.trackID,
        payload.lyricsHash,
        execution.response,
        "ai",
      ) ?? adaptFullscreenDirectorResponseV3(
        lyrics,
        track.trackID,
        payload.lyricsHash,
        execution.response,
        "ai",
      ) ?? adaptFullscreenDirectorResponseV2(
        lyrics,
        track.trackID,
        payload.lyricsHash,
        execution.response,
        "ai",
      ) ?? adaptFullscreenDirectorResponseV1(
        lyrics,
        track.trackID,
        payload.lyricsHash,
        execution.response,
        "ai",
      );
      const adaptationMs = Date.now() - adaptationStartedAt;
      const timing: DirectorTimingV1 = {
        version: "director-timing-v1",
        cache: "miss",
        totalMs: Date.now() - startedAt,
        cacheMs,
        requestBuildMs,
        providerMs: execution.diagnostics.providerMs,
        contractMs: execution.diagnostics.contractMs,
        adaptationMs,
        inputBytes: execution.diagnostics.inputBytes,
        outputBytes: execution.diagnostics.outputBytes,
        attempts: execution.diagnostics.attempts,
        completedAt: new Date().toISOString(),
      };
      if (!plan) {
        const degradedReason = execution.response && typeof execution.response === "object" && !Array.isArray(execution.response)
          && typeof (execution.response as { degradedReason?: unknown }).degradedReason === "string"
          ? (execution.response as { degradedReason: string }).degradedReason.slice(0, 120)
          : "";
        await saveDirectorTiming(timing);
        return directorError(degradedReason
          ? `导演降级：${degradedReason}`
          : "导演响应未通过本地合同", timing);
      }
      await saveDirectorPlanCache(track, lyrics, plan, configuration);
      timing.totalMs = Date.now() - startedAt;
      await saveDirectorTiming(timing);
      return { type: "director-resolution-v1", status: "ready", source: "network", plan, timing };
    } catch (error) {
      let reason = error instanceof Error ? error.message : "AI 导演请求失败";
      for (const provider of [configuration.primary, configuration.fallback]) {
        if (provider?.apiKey) reason = reason.replaceAll(provider.apiKey, "[redacted]");
      }
      const diagnostics = directorBYOKDiagnosticsFromErrorV1(error);
      const timing: DirectorTimingV1 = {
        version: "director-timing-v1",
        cache: "miss",
        totalMs: Date.now() - startedAt,
        cacheMs,
        requestBuildMs,
        providerMs: diagnostics?.providerMs ?? 0,
        contractMs: diagnostics?.contractMs ?? 0,
        adaptationMs: 0,
        inputBytes: diagnostics?.inputBytes ?? 0,
        outputBytes: diagnostics?.outputBytes ?? 0,
        attempts: diagnostics?.attempts ?? [],
        completedAt: new Date().toISOString(),
      };
      await saveDirectorTiming(timing);
      return directorError(reason, timing);
    } finally {
      directorLookupTasks.delete(fingerprint);
    }
  })();
  directorLookupTasks.set(fingerprint, task);
  return task;
};

type RollingSourceV1 = "cache" | "network" | "local";

interface DirectorBibleResolutionV1 {
  type: "director-bible-resolution-v1";
  status: "ready" | "unavailable" | "error" | "stale";
  source: RollingSourceV1;
  bible?: DirectorBibleV1;
  reason?: string;
  timing: RollingTimingV1;
}

interface DirectorCoverageResolutionV1 {
  type: "director-coverage-resolution-v1";
  status: "ready" | "unavailable" | "error" | "stale";
  source: RollingSourceV1;
  cards: SceneCardV1[];
  coverage: {
    fromMs: number;
    toMs: number;
    aheadMs: number;
    activation: "immediate" | "next-boundary" | "local";
  };
  reason?: string;
  timing: RollingTimingV1;
}

const resolveDirectorBibleV1 = async (
  owner: RollingOwnerKey,
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
): Promise<DirectorBibleResolutionV1> => {
  const { ownerOrder } = rollingRequestOwnership.begin(owner, "bible");
  const configuration = await directorConfiguration();
  if (!configuration) return { type: "director-bible-resolution-v1", status: "unavailable", source: "local", reason: "director-not-configured", timing: rollingTiming() };
  const fingerprint = rollingDirectorFingerprint(track, lyrics, configuration);
  const { accepted, generation, signal } = rollingRequestOwnership.activate(owner, fingerprint, ownerOrder);
  if (!accepted) return { type: "director-bible-resolution-v1", status: "stale", source: "local", reason: "stale-generation", timing: rollingTiming() };
  const cached = await cachedDirectorBible(track, lyrics, fingerprint);
  if (cached) return { type: "director-bible-resolution-v1", status: "ready", source: "cache", bible: cached.bible, timing: rollingTiming(undefined, "hit") };
  const ledger = rollingRequestOwnership.ledger(owner, fingerprint, generation);
  if (ledger.inFlight) {
    await ledger.inFlight.catch(() => undefined);
    const afterWait = await cachedDirectorBible(track, lyrics, fingerprint);
    if (afterWait) return { type: "director-bible-resolution-v1", status: "ready", source: "cache", bible: afterWait.bible, timing: rollingTiming(undefined, "hit") };
  }
  if (!rollingRequestAllowedV2(ledger, "bible")) return { type: "director-bible-resolution-v1", status: "unavailable", source: "local", reason: "rolling-budget-exhausted", timing: rollingTiming() };
  ledger.bibleLogicalRequests += 1;
  ledger.inFlightKind = "bible";
  let result: DirectorBibleResolutionV1 | undefined;
  const operation = (async () => {
    try {
      const remainingAttempts = rollingGenerationLimitsV2.maximumProviderAttempts - ledger.providerAttempts;
      const remainingProviderMs = rollingGenerationLimitsV2.maximumProviderMs - ledger.providerMs;
      const execution = await executeDirectorBYOKProfileV1(
        configuration,
        { lyrics, promptInput: { track: { trackID: track.trackID, title: track.title, artist: track.artist, durationMs: track.durationMs }, musicMap, lines: lyrics.lines } },
        directorBibleRequestProfileV1,
        fetch,
        Math.min(45_000, remainingProviderMs),
        remainingAttempts,
        signal,
      );
      updateRollingLedgerFromExecution(ledger, execution.diagnostics, true);
      if (!await rollingFingerprintStillCurrent(owner, track, lyrics, fingerprint, generation)) {
        result = { type: "director-bible-resolution-v1", status: "stale", source: "local", reason: "stale-generation", timing: rollingTiming(execution) };
        return;
      }
      await saveDirectorBibleCache(track, lyrics, fingerprint, execution.response, rollingTiming(execution));
      result = { type: "director-bible-resolution-v1", status: "ready", source: "network", bible: execution.response, timing: rollingTiming(execution) };
    } catch (error) {
      const diagnosticsValue = directorBYOKDiagnosticsFromErrorV1(error);
      if (!await rollingFingerprintStillCurrent(owner, track, lyrics, fingerprint, generation)) {
        result = { type: "director-bible-resolution-v1", status: "stale", source: "local", reason: "stale-generation", timing: rollingTiming(diagnosticsValue ? { diagnostics: diagnosticsValue } : undefined) };
        return;
      }
      updateRollingLedgerFromExecution(ledger, diagnosticsValue, false);
      const timing = rollingTiming(diagnosticsValue ? { diagnostics: diagnosticsValue } : undefined);
      const localBible = compileLocalDirectorBibleV1(lyrics);
      await saveDirectorBibleCache(track, lyrics, fingerprint, localBible, timing, "local");
      result = {
        type: "director-bible-resolution-v1",
        status: "ready",
        source: "local",
        bible: localBible,
        reason: sanitizedRollingReason(error, configuration),
        timing,
      };
    }
  })();
  ledger.inFlight = operation;
  await operation.finally(() => {
    if (ledger.inFlight === operation) {
      ledger.inFlight = undefined;
      ledger.inFlightKind = undefined;
    }
  });
  return result!;
};

const coverageForCards = (cards: SceneCardV1[], atMs: number): { fromMs: number; toMs: number; aheadMs: number } => {
  const sorted = [...cards].sort((a, b) => a.fromMs - b.fromMs);
  const activeIndex = sorted.findIndex((card) => atMs >= card.fromMs && atMs < card.toMs);
  if (activeIndex < 0) return { fromMs: atMs, toMs: atMs, aheadMs: 0 };
  let toMs = sorted[activeIndex]!.toMs;
  let lastLineIndex = sorted[activeIndex]!.toLineIndex;
  for (const card of sorted.slice(activeIndex + 1)) {
    if (card.fromLineIndex !== lastLineIndex + 1) break;
    toMs = Math.max(toMs, card.toMs);
    lastLineIndex = card.toLineIndex;
  }
  return { fromMs: sorted[activeIndex]!.fromMs, toMs, aheadMs: Math.max(0, toMs - atMs) };
};

const mergeValidatedSceneCards = (...groups: readonly SceneCardV1[][]): SceneCardV1[] => {
  const firstAcceptedByID = new Map<string, SceneCardV1>();
  groups.flat().forEach((card) => {
    if (!firstAcceptedByID.has(card.sceneID)) firstAcceptedByID.set(card.sceneID, card);
  });
  return [...firstAcceptedByID.values()]
    .sort((left, right) => left.fromLineIndex - right.fromLineIndex || left.sceneIndex - right.sceneIndex);
};

const sceneWindowFor = (
  lyrics: LyricDocumentV0,
  targetMs: number,
  desiredHorizonMs: number,
): { fromLineIndex: number; toLineIndex: number; fromMs: number; toMs: number } | undefined => {
  let start = lyrics.lines.findIndex((line) => targetMs >= line.fromMs && targetMs < line.toMs);
  if (start < 0) start = lyrics.lines.findIndex((line) => line.fromMs >= targetMs);
  const safeStart = start < 0 ? lyrics.lines.length - 1 : start;
  const first = lyrics.lines[safeStart];
  if (!first) return undefined;
  const targetToMs = Math.min(first.fromMs + 75_000, Math.max(first.fromMs + 45_000, targetMs + Math.min(60_000, desiredHorizonMs)));
  let end = safeStart;
  while (end + 1 < lyrics.lines.length && lyrics.lines[end]!.toMs < targetToMs
    && lyrics.lines[end + 1]!.toMs - first.fromMs <= 75_000) end += 1;
  const last = lyrics.lines[end]!;
  return { fromLineIndex: first.lineIndex, toLineIndex: last.lineIndex, fromMs: first.fromMs, toMs: last.toMs };
};

const resolveDirectorCoverageV1 = async (
  owner: RollingOwnerKey,
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  playheadMs: number,
  desiredHorizonMs: number,
  options: { musicMap?: MusicMapV1; paused?: boolean; seekTargetMs?: number; state?: RollingPerformanceStateV1 },
): Promise<DirectorCoverageResolutionV1> => {
  const requestOrder = rollingRequestOwnership.begin(owner, "scene");
  const configuration = await directorConfiguration();
  const empty = (status: DirectorCoverageResolutionV1["status"], reason: string): DirectorCoverageResolutionV1 => ({
    type: "director-coverage-resolution-v1", status, source: "local", cards: [],
    coverage: { fromMs: playheadMs, toMs: playheadMs, aheadMs: 0, activation: "local" }, reason, timing: rollingTiming(),
  });
  if (!configuration) return empty("unavailable", "director-not-configured");
  const sanitizedBible = sanitizeDirectorBibleV1(lyrics, bible);
  if (!sanitizedBible) return empty("error", "director-bible-invalid");
  const fingerprint = rollingDirectorFingerprint(track, lyrics, configuration);
  const { accepted, generation } = rollingRequestOwnership.activate(owner, fingerprint, requestOrder.ownerOrder);
  if (!accepted) return empty("stale", "stale-generation");
  const bibleCache = await cachedDirectorBible(track, lyrics, fingerprint);
  if (!bibleCache || bibleCache.bible.bibleIdentity !== sanitizedBible.bibleIdentity) return empty("error", "director-bible-cache-miss");
  let cards = await cachedDirectorScenes(track, lyrics, sanitizedBible, fingerprint);
  const targetMs = options.seekTargetMs ?? playheadMs;
  if (targetMs >= lyrics.durationMs - 20_000) await markDirectorCacheReachedFinalWindowV1(track.trackID);
  let coverage = coverageForCards(cards, targetMs);
  const window = sceneWindowFor(lyrics, targetMs, desiredHorizonMs);
  const sceneRequestKey = window
    ? `${window.fromLineIndex}:${window.toLineIndex}:${options.seekTargetMs === undefined ? "rolling" : `seek:${Math.round(options.seekTargetMs)}`}`
    : "";
  let sceneActivation = options.seekTargetMs !== undefined && window
    ? rollingRequestOwnership.activateScene(owner, fingerprint, generation, sceneRequestKey, requestOrder.sceneOrder!)
    : undefined;
  if (sceneActivation && !sceneActivation.accepted) return empty("stale", "stale-scene-request");
  if (coverage.aheadMs >= 35_000) return {
    type: "director-coverage-resolution-v1", status: "ready", source: "cache", cards, coverage: { ...coverage, activation: "immediate" }, timing: rollingTiming(undefined, "hit"),
  };
  if (options.paused && options.seekTargetMs === undefined) return { ...empty("unavailable", "paused-no-horizon-expansion"), cards, coverage: { ...coverage, activation: "local" } };
  if (options.seekTargetMs === undefined && playheadMs >= lyrics.durationMs - 20_000) return { ...empty("unavailable", "final-window"), cards, coverage: { ...coverage, activation: "local" } };
  if (!window) return empty("error", "scene-window-invalid");
  sceneActivation ??= rollingRequestOwnership.activateScene(owner, fingerprint, generation, sceneRequestKey, requestOrder.sceneOrder!);
  if (!sceneActivation.accepted) return empty("stale", "stale-scene-request");
  const { epoch: sceneEpoch, signal: sceneSignal, superseded } = sceneActivation;
  const sceneIsCurrent = (): boolean =>
    rollingRequestOwnership.isSceneCurrent(owner, fingerprint, generation, sceneEpoch);
  const staleScene = (timing: RollingTimingV1 = rollingTiming()): DirectorCoverageResolutionV1 => ({
    ...empty("stale", "stale-scene-request"), timing,
  });
  const provenanceStates = await rollingEntryStatesForWindow(track, lyrics, sanitizedBible, fingerprint, window.fromLineIndex);
  const suppliedState = options.state && isRollingPerformanceStateV1(options.state, sanitizedBible) ? options.state : undefined;
  const matchedSuppliedState = suppliedState
    ? provenanceStates.find((candidate) => candidate.stateHash === suppliedState.stateHash)
    : undefined;
  // The Stage state is only a continuity hint. A valid-but-stale hint can race a
  // newly cached Bible or scene checkpoint, so never let it block a refill. It
  // remains untrusted unless it exactly matches state reconstructed from cache
  // provenance; otherwise continue with the newest trusted background state.
  const state = matchedSuppliedState ?? provenanceStates.sort((left, right) =>
    (right.lastToLineIndex ?? -1) - (left.lastToLineIndex ?? -1))[0];
  if (!state || (state.lastToLineIndex !== null && state.lastToLineIndex >= window.fromLineIndex)) return empty("error", "scene-entry-state-invalid");
  if (!sceneIsCurrent()) return staleScene();
  const exactKey = sceneCacheIdentity(fingerprint, track.trackID, sanitizedBible.bibleIdentity, window.fromLineIndex, state.stateHash);
  const exactEntry = (await readDirectorSceneCache())[exactKey];
  if (!sceneIsCurrent()) return staleScene();
  if (exactEntry && exactEntry.epoch === rollingDirectorEpoch
    && exactEntry.schemaVersion === scenePackSchemaVersion && exactEntry.provenance === "ai-positive"
    && exactEntry.expiresAtUnixMs > Date.now()) {
    cards = await cachedDirectorScenes(track, lyrics, sanitizedBible, fingerprint);
    if (!sceneIsCurrent()) return staleScene();
    coverage = coverageForCards(cards, targetMs);
    if (coverage.aheadMs > 0) {
      return { type: "director-coverage-resolution-v1", status: "ready", source: "cache", cards, coverage: { ...coverage, activation: "immediate" }, timing: rollingTiming(undefined, "hit") };
    }
  }
  const ledger = rollingRequestOwnership.ledger(owner, fingerprint, generation);
  const negativeKey = negativeSceneCacheIdentityV1(
    fingerprint, sanitizedBible.bibleIdentity, window.fromLineIndex, state.stateHash,
  );
  const activeNegativeReason = rollingSceneNegativeCache.reason(negativeKey);
  if (ledger.inFlight && !(superseded && ledger.inFlightKind === "scene-pack")) {
    await ledger.inFlight.catch(() => undefined);
    cards = await cachedDirectorScenes(track, lyrics, sanitizedBible, fingerprint);
    if (!sceneIsCurrent()) return staleScene();
    coverage = coverageForCards(cards, targetMs);
    if (coverage.aheadMs > 0) return { type: "director-coverage-resolution-v1", status: "ready", source: "cache", cards, coverage: { ...coverage, activation: "immediate" }, timing: rollingTiming(undefined, "hit") };
  }
  const commitLocalContinuity = async (reason: string, timing: RollingTimingV1): Promise<DirectorCoverageResolutionV1> => {
    const localCards = compileLocalContinuitySceneCardsV2(
      lyrics, sanitizedBible, state, cards, window.fromLineIndex, window.toLineIndex,
    );
    if (localCards.length === 0 || !await rollingSceneStillCurrent(owner, track, lyrics, fingerprint, generation, sceneEpoch)) {
      return staleScene(timing);
    }
    await saveDirectorSceneCache(
      track, lyrics, fingerprint, sanitizedBible, state, localCards, cards, bibleCache.expiresAtUnixMs,
      timing, targetMs >= lyrics.durationMs - 20_000, sceneIsCurrent, "local-repair",
    );
    if (!sceneIsCurrent()) return staleScene(timing);
    ledger.generatedCoverage = [...ledger.generatedCoverage, {
      fromLineIndex: localCards[0]!.fromLineIndex,
      toLineIndex: localCards.at(-1)!.toLineIndex,
      sceneIDs: localCards.map((card) => card.sceneID),
    }].slice(-12);
    cards = mergeValidatedSceneCards(cards, localCards);
    coverage = coverageForCards(cards, targetMs);
    const activation = localCards[0]!.fromMs - playheadMs < 8_000 ? "next-boundary" as const : "immediate" as const;
    return {
      type: "director-coverage-resolution-v1", status: "ready", source: "local", cards,
      coverage: { ...coverage, activation }, reason: `scene-local-continuity-fallback:${reason}`, timing,
    };
  };
  if (activeNegativeReason) {
    return commitLocalContinuity(`scene-negative-cache:${activeNegativeReason}`, rollingTiming(undefined, "hit"));
  }
  if (ledger.inFlight && !(superseded && ledger.inFlightKind === "scene-pack")) {
    await ledger.inFlight.catch(() => undefined);
    cards = await cachedDirectorScenes(track, lyrics, sanitizedBible, fingerprint);
    coverage = coverageForCards(cards, targetMs);
    if (coverage.aheadMs > 0) return { type: "director-coverage-resolution-v1", status: "ready", source: "cache", cards, coverage: { ...coverage, activation: "immediate" }, timing: rollingTiming(undefined, "hit") };
    const negativeReasonAfterFlight = rollingSceneNegativeCache.reason(negativeKey);
    if (negativeReasonAfterFlight) {
      return commitLocalContinuity(`scene-negative-cache:${negativeReasonAfterFlight}`, rollingTiming(undefined, "hit"));
    }
  }
  if (!rollingRequestAllowedV2(ledger, "scene-pack")) {
    return commitLocalContinuity("rolling-budget-exhausted", rollingTiming());
  }
  ledger.sceneLogicalRequests += 1;
  ledger.inFlightKind = "scene-pack";
  ledger.inFlightWindow = { fromLineIndex: window.fromLineIndex, toLineIndex: window.toLineIndex };
  let result: DirectorCoverageResolutionV1 | undefined;
  const operation = (async () => {
    try {
      const execution = await executeDirectorBYOKProfileV1(
        configuration,
        {
          lyrics, bible: sanitizedBible, state,
          promptInput: {
            bible: sanitizedBible, state, fromLineIndex: window.fromLineIndex, toLineIndex: window.toLineIndex,
            lines: lyrics.lines, musicMap: options.musicMap,
            diversityLedger: {
              recentLayouts: cards.slice(-8).map((card) => card.layout),
              recentStageActions: cards.slice(-8).flatMap((card) => card.signatureMoment ? [card.signatureMoment.stageAction] : []),
              recentEffectPrimitives: cards.slice(-8).flatMap((card) => card.effects.map((effect) => effect.primary.primitive)),
              recentGesturePrimitives: cards.slice(-8).flatMap((card) => card.gestures.map((gesture) => gesture.primitive)),
            },
          },
        },
        windowIntentRequestProfileV2,
        fetch,
        rollingSceneProviderBudgetMsV2(rollingGenerationLimitsV2.maximumProviderMs - ledger.providerMs),
        rollingGenerationLimitsV2.maximumProviderAttempts - ledger.providerAttempts,
        sceneSignal,
      );
      if (!await rollingSceneStillCurrent(owner, track, lyrics, fingerprint, generation, sceneEpoch)) {
        result = staleScene(rollingTiming(execution));
        return;
      }
      updateRollingLedgerFromExecution(ledger, execution.diagnostics, true);
      const generated = execution.response;
      if (semanticCueBudgetExceededV2(cards, generated)) {
        updateRollingLedgerFromExecution(ledger, undefined, false);
        rollingSceneNegativeCache.remember(negativeKey, "window-intent-cue-budget-exhausted");
        result = await commitLocalContinuity("window-intent-cue-budget-exhausted", rollingTiming(execution));
        return;
      }
      const generatedSpanMs = generated.length > 0 ? generated.at(-1)!.toMs - generated[0]!.fromMs : 0;
      const availableLyricSpanMs = Math.max(0, lyrics.lines.at(-1)!.toMs - window.fromMs);
      const minimumPackSpanMs = Math.min(45_000, availableLyricSpanMs);
      const coversRequestedWindow = generated[0]?.fromLineIndex === window.fromLineIndex
        && generated.at(-1)?.toLineIndex === window.toLineIndex
        && generated.every((card, index) => index === 0 || card.fromLineIndex === generated[index - 1]!.toLineIndex + 1);
      if (!coversRequestedWindow || generatedSpanMs < minimumPackSpanMs || generatedSpanMs > 75_000) {
        updateRollingLedgerFromExecution(ledger, undefined, false);
        rollingSceneNegativeCache.remember(negativeKey, "scene-pack-coverage-invalid");
        result = await commitLocalContinuity("scene-pack-coverage-invalid", rollingTiming(execution));
        return;
      }
      await saveDirectorSceneCache(
        track, lyrics, fingerprint, sanitizedBible, state, execution.response, cards, bibleCache.expiresAtUnixMs,
        rollingTiming(execution), targetMs >= lyrics.durationMs - 20_000, sceneIsCurrent,
      );
      if (!sceneIsCurrent()) {
        result = staleScene(rollingTiming(execution));
        return;
      }
      rollingSceneNegativeCache.delete(negativeKey);
      ledger.generatedCoverage = [...ledger.generatedCoverage, {
        fromLineIndex: execution.response[0]!.fromLineIndex,
        toLineIndex: execution.response.at(-1)!.toLineIndex,
        sceneIDs: execution.response.map((card) => card.sceneID),
      }].slice(-12);
      cards = mergeValidatedSceneCards(
        cards,
        await cachedDirectorScenes(track, lyrics, sanitizedBible, fingerprint),
        execution.response,
      );
      if (!sceneIsCurrent()) {
        result = staleScene(rollingTiming(execution));
        return;
      }
      coverage = coverageForCards(cards, targetMs);
      const intendedBoundaryMs = execution.response[0]?.fromMs ?? window.fromMs;
      const activation = intendedBoundaryMs - playheadMs < 8_000 ? "next-boundary" as const : "immediate" as const;
      result = { type: "director-coverage-resolution-v1", status: "ready", source: "network", cards, coverage: { ...coverage, activation }, timing: rollingTiming(execution) };
    } catch (error) {
      const diagnosticsValue = directorBYOKDiagnosticsFromErrorV1(error);
      if (!await rollingSceneStillCurrent(owner, track, lyrics, fingerprint, generation, sceneEpoch)) {
        result = staleScene(rollingTiming(diagnosticsValue ? { diagnostics: diagnosticsValue } : undefined));
        return;
      }
      updateRollingLedgerFromExecution(ledger, diagnosticsValue, false);
      const reason = sanitizedRollingReason(error, configuration);
      rollingSceneNegativeCache.remember(negativeKey, reason);
      result = await commitLocalContinuity(
        reason,
        rollingTiming(diagnosticsValue ? { diagnostics: diagnosticsValue } : undefined),
      );
    }
  })();
  ledger.inFlight = operation;
  await operation.finally(() => {
    if (ledger.inFlight === operation) {
      ledger.inFlight = undefined;
      ledger.inFlightKind = undefined;
      ledger.inFlightWindow = undefined;
    }
  });
  return result!;
};

const bridgeState = (): YouTubeMusicBridgeStateV0 => sourceRegistry.state();

const sourceTabIDForSender = (sender?: { tab?: ExtensionTab; url?: string }): number | undefined =>
  (
    sender?.tab?.url?.startsWith("https://music.youtube.com/")
    || sender?.url?.startsWith("https://music.youtube.com/")
  )
    ? sender.tab?.id
    : undefined;

const rollingOwnerKeyForSender = (sender?: { tab?: ExtensionTab }): RollingOwnerKey =>
  typeof sender?.tab?.id === "number" ? `tab:${sender.tab.id}` : "extension";

const bridgeStateForPort = (port: ExtensionPort): YouTubeMusicBridgeStateV0 => {
  const tabID = stagePorts.get(port);
  return tabID === undefined ? bridgeState() : sourceRegistry.stateForTab(tabID);
};

const postToPort = (port: ExtensionPort, message: unknown) => {
  try {
    port.postMessage(message);
  } catch {
    stagePorts.delete(port);
  }
};

const audioAnalysisOwnershipResetMessage = (trackID: string) => ({
  type: "youtube-music-audio-analysis-status",
  status: "idle",
  trackID,
});

const broadcastBridgeState = () => {
  const previousAuthoritativeTabID = lastBroadcastAuthoritativeTabID;
  const authoritativeTabID = sourceRegistry.sourceTabID;
  const authorityChanged = previousAuthoritativeTabID !== authoritativeTabID;
  if (authorityChanged) {
    const currentCapture = audioCapture ?? pendingAudioCapture ?? recoveringAudioCapture;
    if (
      currentCapture?.ownerScope === "followAuthority"
      && currentCapture.tabID !== authoritativeTabID
    ) {
      void stopAudioAnalysis(
        currentCapture.trackID,
        currentCapture.tabID,
        currentCapture.captureID,
      );
    }
    stagePorts.forEach((boundTabID, port) => {
      if (boundTabID === undefined) {
        // Reset the standalone clock before it sees the promoted tab's
        // snapshot. Two tabs playing the same recording have independent
        // sequence/timestamp domains, so the old clock cannot rank them.
        postToPort(port, { type: "youtube-music-source-ownership-reset" });
      }
    });
  }
  stagePorts.forEach((_tabID, port) => postToPort(port, bridgeStateForPort(port)));
  lastBroadcastAuthoritativeTabID = authoritativeTabID;
  if (authorityChanged && authoritativeTabID !== undefined) {
    stagePorts.forEach((boundTabID, port) => {
      if (boundTabID !== undefined) return;
      const snapshot = sourceRegistry.snapshotForTab(authoritativeTabID);
      if (snapshot) {
        // A standalone Stage can move between two tabs that happen to play the
        // same recording. Reset the prior tab's capture ownership before
        // replaying the new tab, otherwise track identity alone cannot
        // distinguish their capture epochs.
        postToPort(port, audioAnalysisOwnershipResetMessage(snapshot.track.trackID));
      }
      replayAudioAnalysisToPort(port);
    });
  }
};

const broadcastForSource = (tabID: number | undefined, message: unknown) => {
  if (tabID === undefined) return;
  stagePorts.forEach((boundTabID, port) => {
    if (boundTabID === tabID || (boundTabID === undefined && sourceRegistry.sourceTabID === tabID)) {
      postToPort(port, message);
    }
  });
};

const audioAnalysisStatusMessage = (capture: AudioAnalysisReplayState) => ({
  type: "youtube-music-audio-analysis-status",
  status: capture.status,
  trackID: capture.trackID,
  captureID: capture.captureID,
  ...(capture.status === "error" && capture.reason ? { reason: capture.reason } : {}),
});

const audioAnalysisMessages = (capture: AudioAnalysisReplayState): unknown[] => [
  ...(capture.mapForwarded && capture.latestMusicMap ? [{
    type: "youtube-music-music-map-update",
    trackID: capture.trackID,
    captureID: capture.captureID,
    musicMap: capture.latestMusicMap,
  }] : []),
  ...(capture.latestVocalMap ? [{
    type: "youtube-music-vocal-timing-update",
    trackID: capture.trackID,
    captureID: capture.captureID,
    vocalTimingMap: capture.latestVocalMap,
  }] : []),
  audioAnalysisStatusMessage(capture),
];

const rememberAudioAnalysis = (capture: AudioCaptureState) => {
  const { startTask: _startTask, ...replay } = capture;
  audioAnalysisReplayByTab.set(capture.tabID, replay);
};

const rememberIdleAudioAnalysis = (capture: AudioCaptureState) => {
  const idle: AudioAnalysisReplayState = {
    captureID: capture.captureID,
    trackID: capture.trackID,
    tabID: capture.tabID,
    durationMs: capture.durationMs,
    generation: capture.generation,
    ownerScope: capture.ownerScope,
    status: "idle",
    mapForwarded: false,
  };
  audioAnalysisReplayByTab.set(capture.tabID, idle);
  broadcastForSource(capture.tabID, audioAnalysisStatusMessage(idle));
};

const replayAudioAnalysisToPort = (port: ExtensionPort) => {
  const boundTabID = stagePorts.get(port);
  const sourceTabID = boundTabID ?? sourceRegistry.sourceTabID;
  if (sourceTabID === undefined) return;
  const capture = audioAnalysisReplayByTab.get(sourceTabID);
  const snapshot = sourceRegistry.snapshotForTab(sourceTabID);
  if (!capture) return;
  if (!snapshot || snapshot.track.trackID !== capture.trackID) {
    audioAnalysisReplayByTab.delete(sourceTabID);
    return;
  }
  audioAnalysisMessages(capture).forEach((message) => postToPort(port, message));
};

const replayAudioAnalysisForSource = (tabID: number) => {
  const capture = audioAnalysisReplayByTab.get(tabID);
  const snapshot = sourceRegistry.snapshotForTab(tabID);
  if (!capture) return;
  if (!snapshot || snapshot.track.trackID !== capture.trackID) {
    audioAnalysisReplayByTab.delete(tabID);
    return;
  }
  audioAnalysisMessages(capture).forEach((message) => broadcastForSource(tabID, message));
};

const clearSource = () => {
  broadcastBridgeState();
};

const ensureOffscreenDocument = async (): Promise<void> => {
  const url = chromeAPI.runtime.getURL("offscreen.html");
  if (chromeAPI.runtime.getContexts) {
    const contexts = await chromeAPI.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url],
    });
    if (contexts.length > 0) return;
  }
  if (!offscreenCreation) {
    offscreenCreation = chromeAPI.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Analyze the current YouTube Music tab locally for synchronized lyric performance.",
    }).finally(() => { offscreenCreation = undefined; });
  }
  await offscreenCreation;
};

const captureClock = (tabID: number) => {
  const snapshot = sourceRegistry.snapshotForTab(tabID);
  if (!snapshot) return undefined;
  return {
    currentTimeMs: snapshot.playback.currentTimeMs,
    playbackRate: snapshot.playback.playbackRate,
    state: snapshot.playback.state,
  };
};

const captureSourceStillOwned = (capture: AudioCaptureState): boolean => {
  const snapshot = sourceRegistry.snapshotForTab(capture.tabID);
  return snapshot?.track.trackID === capture.trackID
    && (
      capture.ownerScope === "boundTab"
      || sourceRegistry.sourceTabID === capture.tabID
    );
};

const isCurrentPendingCapture = (capture: AudioCaptureState): boolean =>
  pendingAudioCapture === capture && capture.generation === audioCaptureGeneration;

const isCurrentActiveCapture = (capture: AudioCaptureState): boolean =>
  audioCapture === capture && capture.generation === audioCaptureGeneration;

const isCurrentCapture = (capture: AudioCaptureState): boolean =>
  isCurrentPendingCapture(capture) || isCurrentActiveCapture(capture);

const captureMatches = (
  capture: AudioCaptureState | undefined,
  trackID?: string,
  tabID?: number,
  captureID?: string,
): capture is AudioCaptureState => Boolean(
  capture
  && (!trackID || capture.trackID === trackID)
  && (tabID === undefined || capture.tabID === tabID)
  && (!captureID || capture.captureID === captureID),
);

const captureForOffscreenTerminalTuple = (request: {
  captureID?: unknown;
  trackID?: unknown;
  tabID?: unknown;
  generation?: unknown;
  ownerScope?: unknown;
}): AudioCaptureState | undefined => [audioCapture, recoveringAudioCapture]
  .find((capture) => capture !== undefined
    && request.captureID === capture.captureID
    && request.trackID === capture.trackID
    && request.tabID === capture.tabID
    && request.generation === capture.generation
    && request.ownerScope === capture.ownerScope);

const sendOffscreenCaptureStop = (capture: AudioCaptureState): Promise<unknown> =>
  chromeAPI.runtime.sendMessage({
    type: "lyricstage-audio-capture-stop",
    trackID: capture.trackID,
    captureID: capture.captureID,
    tabID: capture.tabID,
    generation: capture.generation,
    ownerScope: capture.ownerScope,
  }).catch(() => undefined);

const sanitizeOffscreenAudioCaptureStatus = (value: unknown): OffscreenAudioCaptureStatus | null | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const status = value as Record<string, unknown>;
  if (status.type !== "lyricstage-audio-capture-status") return undefined;
  if (status.active === false) return null;
  if (
    status.active !== true
    || typeof status.captureID !== "string"
    || status.captureID.length === 0
    || typeof status.trackID !== "string"
    || status.trackID.length === 0
    || typeof status.tabID !== "number"
    || !Number.isInteger(status.tabID)
    || status.tabID < 0
    || typeof status.generation !== "number"
    || !Number.isInteger(status.generation)
    || status.generation < 1
    || typeof status.durationMs !== "number"
    || !Number.isFinite(status.durationMs)
    || status.durationMs <= 0
    || (status.status !== "analyzing" && status.status !== "ready" && status.status !== "error")
    || (status.ownerScope !== "boundTab" && status.ownerScope !== "followAuthority")
  ) return undefined;
  const latestMusicMap = sanitizeMusicMapV1(status.latestMusicMap);
  const latestVocalMap = sanitizeVocalTimingMapV1(status.latestVocalMap);
  return {
    captureID: status.captureID,
    trackID: status.trackID,
    tabID: status.tabID,
    generation: status.generation,
    durationMs: Math.round(Math.min(7_200_000, status.durationMs)),
    status: status.status,
    ownerScope: status.ownerScope,
    ...(latestMusicMap ? { latestMusicMap } : {}),
    ...(latestVocalMap ? { latestVocalMap } : {}),
  };
};

const queryOffscreenAudioCapture = async (): Promise<OffscreenAudioCaptureStatus | null | undefined> => {
  try {
    const url = chromeAPI.runtime.getURL("offscreen.html");
    if (chromeAPI.runtime.getContexts) {
      const contexts = await chromeAPI.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [url],
      });
      if (contexts.length === 0) return null;
    }
    const response = await chromeAPI.runtime.sendMessage({
      type: "lyricstage-audio-capture-status-request",
    });
    return sanitizeOffscreenAudioCaptureStatus(response);
  } catch {
    return undefined;
  }
};

const queryOffscreenAudioCaptureWithRetry = async (): Promise<OffscreenAudioCaptureStatus | null> => {
  const retryDelays = [0, 100, 300];
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    const delay = retryDelays[attempt] ?? 0;
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    const status = await queryOffscreenAudioCapture();
    if (status !== undefined) return status;
  }
  const stopped = await chromeAPI.runtime.sendMessage({
    type: "lyricstage-audio-capture-stop-all",
  }).then(
    (response) => (response as { ok?: unknown } | undefined)?.ok === true,
    () => false,
  );
  if (!stopped) await chromeAPI.offscreen.closeDocument?.().catch(() => undefined);
  return null;
};

interface SourceSnapshotWaiter {
  tabID: number;
  trackID: string;
  resolve(matched: boolean): void;
  timeout: ReturnType<typeof setTimeout>;
}

const sourceSnapshotWaiters = new Set<SourceSnapshotWaiter>();

const settleSourceSnapshotWaiters = (tabID: number, forceMismatch = false) => {
  const snapshot = sourceRegistry.snapshotForTab(tabID);
  for (const waiter of sourceSnapshotWaiters) {
    if (waiter.tabID !== tabID) continue;
    if (!forceMismatch && !snapshot) continue;
    clearTimeout(waiter.timeout);
    sourceSnapshotWaiters.delete(waiter);
    waiter.resolve(!forceMismatch && snapshot?.track.trackID === waiter.trackID);
  }
};

const waitForMatchingSourceSnapshot = (tabID: number, trackID: string): Promise<boolean> => {
  const current = sourceRegistry.snapshotForTab(tabID);
  if (current) return Promise.resolve(current.track.trackID === trackID);
  return new Promise((resolve) => {
    const waiter: SourceSnapshotWaiter = {
      tabID,
      trackID,
      resolve,
      timeout: setTimeout(() => {
        sourceSnapshotWaiters.delete(waiter);
        resolve(false);
      }, 3_000),
    };
    sourceSnapshotWaiters.add(waiter);
  });
};

const captureFromOffscreenStatus = (status: OffscreenAudioCaptureStatus): AudioCaptureState => {
  const mapForwarded = status.status === "ready" && status.latestMusicMap !== undefined;
  return {
    captureID: status.captureID,
    trackID: status.trackID,
    tabID: status.tabID,
    generation: status.generation,
    durationMs: status.durationMs,
    status: mapForwarded ? "ready" : status.status,
    ownerScope: status.ownerScope,
    latestMusicMap: status.latestMusicMap,
    latestVocalMap: status.latestVocalMap,
    mapForwarded,
  };
};

const sameOffscreenCapture = (
  left: OffscreenAudioCaptureStatus,
  right: OffscreenAudioCaptureStatus,
): boolean => left.captureID === right.captureID
  && left.trackID === right.trackID
  && left.tabID === right.tabID
  && left.generation === right.generation
  && left.ownerScope === right.ownerScope;

const rehydrateAudioCapture = async (): Promise<void> => {
  const initial = await queryOffscreenAudioCaptureWithRetry();
  if (!initial) return;
  audioCaptureGeneration = Math.max(audioCaptureGeneration, initial.generation);
  const recovering = captureFromOffscreenStatus(initial);
  recoveringAudioCapture = recovering;
  const sourceMatched = await waitForMatchingSourceSnapshot(initial.tabID, initial.trackID);
  if (recoveringAudioCapture !== recovering) return;
  if (!sourceMatched) {
    recoveringAudioCapture = undefined;
    await sendOffscreenCaptureStop(recovering);
    return;
  }

  const latest = await queryOffscreenAudioCaptureWithRetry();
  if (recoveringAudioCapture !== recovering) return;
  if (!latest) {
    recoveringAudioCapture = undefined;
    return;
  }
  if (!sameOffscreenCapture(initial, latest)) {
    recoveringAudioCapture = undefined;
    await Promise.all([sendOffscreenCaptureStop(recovering), sendOffscreenCaptureStop(captureFromOffscreenStatus(latest))]);
    return;
  }
  const snapshot = sourceRegistry.snapshotForTab(latest.tabID);
  if (
    !snapshot
    || snapshot.track.trackID !== latest.trackID
    || (latest.ownerScope === "followAuthority" && sourceRegistry.sourceTabID !== latest.tabID)
  ) {
    recoveringAudioCapture = undefined;
    await sendOffscreenCaptureStop(captureFromOffscreenStatus(latest));
    return;
  }

  const restored = captureFromOffscreenStatus(latest);
  recoveringAudioCapture = undefined;
  audioCaptureGeneration = Math.max(audioCaptureGeneration, restored.generation);
  audioCapture = restored;
  rememberAudioAnalysis(restored);
  startSourceLeaseMonitor();
  replayAudioAnalysisForSource(restored.tabID);
  const clock = captureClock(restored.tabID);
  if (clock) void chromeAPI.runtime.sendMessage({
    type: "lyricstage-audio-clock",
    captureID: restored.captureID,
    trackID: restored.trackID,
    tabID: restored.tabID,
    generation: restored.generation,
    ownerScope: restored.ownerScope,
    clock,
  }).catch(() => undefined);
};

const ensureAudioCaptureRehydrated = (): Promise<void> => {
  if (audioCaptureRehydrated) return Promise.resolve();
  if (!audioCaptureRehydrationTask) {
    audioCaptureRehydrationTask = rehydrateAudioCapture()
      .catch(() => undefined)
      .finally(() => {
        audioCaptureRehydrated = true;
        audioCaptureRehydrationTask = undefined;
      });
  }
  return audioCaptureRehydrationTask;
};

const stopAudioAnalysis = (
  trackID?: string,
  tabID?: number,
  captureID?: string,
): Promise<void> => {
  const pending = pendingAudioCapture;
  const active = audioCapture;
  const recovering = recoveringAudioCapture;
  const stopped = [pendingAudioCapture, audioCapture, recoveringAudioCapture]
    .filter((capture, index, captures): capture is AudioCaptureState =>
      captureMatches(capture, trackID, tabID, captureID)
      && captures.indexOf(capture) === index);
  if (stopped.length === 0) return Promise.resolve();

  audioCaptureGeneration = Math.max(
    audioCaptureGeneration,
    ...stopped.map((capture) => capture.generation),
  ) + 1;
  if (pending && stopped.includes(pending)) pendingAudioCapture = undefined;
  if (active && stopped.includes(active)) audioCapture = undefined;
  if (recovering && stopped.includes(recovering)) recoveringAudioCapture = undefined;
  stopped.forEach(rememberIdleAudioAnalysis);
  stopSourceLeaseMonitorIfIdle();
  return Promise.all(stopped.map(sendOffscreenCaptureStop)).then(() => undefined);
};

const startReservedAudioCapture = async (
  capture: AudioCaptureState,
  superseded: AudioCaptureState[],
): Promise<void> => {
  await Promise.all(superseded.map(sendOffscreenCaptureStop));
  if (!isCurrentPendingCapture(capture) || !captureSourceStillOwned(capture)) {
    throw new Error("capture-superseded");
  }
  await ensureOffscreenDocument();
  if (!isCurrentPendingCapture(capture) || !captureSourceStillOwned(capture)) {
    throw new Error("capture-superseded");
  }
  const streamID = await chromeAPI.tabCapture.getMediaStreamId({ targetTabId: capture.tabID });
  if (!isCurrentPendingCapture(capture) || !captureSourceStillOwned(capture)) {
    throw new Error("capture-superseded");
  }
  const snapshot = sourceRegistry.snapshotForTab(capture.tabID);
  const clock = snapshot?.track.trackID === capture.trackID ? captureClock(capture.tabID) : undefined;
  if (!clock) throw new Error("clock-not-ready");

  pendingAudioCapture = undefined;
  audioCapture = capture;
  rememberAudioAnalysis(capture);
  await chromeAPI.runtime.sendMessage({
    type: "lyricstage-audio-capture-start",
    streamID,
    captureID: capture.captureID,
    trackID: capture.trackID,
    tabID: capture.tabID,
    generation: capture.generation,
    ownerScope: capture.ownerScope,
    durationMs: capture.durationMs,
    clock,
  });
  if (!isCurrentActiveCapture(capture)) {
    await sendOffscreenCaptureStop(capture);
    throw new Error("capture-superseded");
  }
};

const requestAudioAnalysis = (
  trackID: string,
  durationMs: number,
  preferredTabID?: number,
  ownerScope: AudioCaptureOwnerScope = "followAuthority",
): AudioCaptureOperation => {
  const tabID = preferredTabID ?? sourceRegistry.sourceTabID;
  const snapshot = tabID === undefined ? undefined : sourceRegistry.snapshotForTab(tabID);
  if (
    !snapshot
    || tabID === undefined
    || snapshot.track.trackID !== trackID
    || (ownerScope === "followAuthority" && sourceRegistry.sourceTabID !== tabID)
  ) throw new Error("source-not-ready");
  const authorizationPending = pendingAudioCapture?.tabID === tabID
    && pendingAudioCapture.trackID === trackID
    && pendingAudioCapture.expiresAtUnixMs !== undefined
    ? pendingAudioCapture
    : undefined;
  const upgradingPendingScope = authorizationPending?.ownerScope === "followAuthority"
    && ownerScope === "boundTab";
  if (authorizationPending && !upgradingPendingScope) {
    const expiresAtUnixMs = authorizationPending.expiresAtUnixMs;
    if (expiresAtUnixMs !== undefined && expiresAtUnixMs < Date.now()) {
      void stopAudioAnalysis(trackID, tabID, authorizationPending.captureID);
    } else {
      replayAudioAnalysisForSource(tabID);
      throw new Error(authorizationPending.reason ?? "capture-authorization-pending");
    }
  }
  const sameOwner = [pendingAudioCapture, audioCapture]
    .find((capture) => capture?.tabID === tabID && capture.trackID === trackID);
  const requiresBoundRestart = sameOwner?.ownerScope === "followAuthority"
    && ownerScope === "boundTab";
  if (sameOwner && !requiresBoundRestart) {
    replayAudioAnalysisForSource(tabID);
    return { capture: sameOwner, task: sameOwner.startTask ?? Promise.resolve() };
  }

  const superseded = [pendingAudioCapture, audioCapture]
    .filter((capture, index, captures): capture is AudioCaptureState =>
      capture !== undefined && captures.indexOf(capture) === index);
  const generation = ++audioCaptureGeneration;
  const boundedDuration = Math.round(Math.min(7_200_000, Math.max(1, durationMs)));
  const capture: AudioCaptureState = {
    captureID: `capture-${Date.now().toString(36)}-${++audioCaptureSequence}`,
    trackID,
    tabID,
    durationMs: boundedDuration,
    generation,
    ownerScope,
    status: "analyzing",
    mapForwarded: false,
  };

  pendingAudioCapture = capture;
  audioCapture = undefined;
  superseded.forEach(rememberIdleAudioAnalysis);
  rememberAudioAnalysis(capture);
  broadcastForSource(tabID, audioAnalysisStatusMessage(audioAnalysisReplayByTab.get(tabID)!));
  startSourceLeaseMonitor();
  const task = startReservedAudioCapture(capture, superseded);
  capture.startTask = task;
  return { capture, task };
};

const captureStartFailure = (
  capture: AudioCaptureState,
  error: unknown,
  allowPendingAuthorization: boolean,
): { reason: string; needsInvocation: boolean; current: boolean } => {
  const rawReason = error instanceof Error ? error.message.slice(0, 160) : "capture-failed";
  const needsInvocation = allowPendingAuthorization
    && (rawReason.includes("has not been invoked") || rawReason.includes("activeTab"));
  if (!isCurrentCapture(capture)) return { reason: rawReason, needsInvocation, current: false };

  const reason = needsInvocation
    ? "请在 15 秒内点击浏览器工具栏的 LyricStage 图标完成一次音频授权"
    : rawReason;
  capture.status = "error";
  capture.reason = reason;
  capture.startTask = undefined;
  if (needsInvocation && isCurrentPendingCapture(capture)) {
    capture.expiresAtUnixMs = Date.now() + 15_000;
  } else {
    capture.expiresAtUnixMs = undefined;
    if (isCurrentPendingCapture(capture)) pendingAudioCapture = undefined;
    if (isCurrentActiveCapture(capture)) audioCapture = undefined;
    audioCaptureGeneration += 1;
    void sendOffscreenCaptureStop(capture);
    stopSourceLeaseMonitorIfIdle();
  }
  rememberAudioAnalysis(capture);
  broadcastForSource(capture.tabID, audioAnalysisStatusMessage(audioAnalysisReplayByTab.get(capture.tabID)!));
  return { reason, needsInvocation, current: true };
};

const resumePendingAudioAnalysis = (): AudioCaptureOperation | undefined => {
  const capture = pendingAudioCapture;
  if (!capture || capture.expiresAtUnixMs === undefined) return undefined;
  if (capture.expiresAtUnixMs < Date.now()) {
    void stopAudioAnalysis(capture.trackID, capture.tabID, capture.captureID);
    return undefined;
  }
  capture.status = "analyzing";
  capture.reason = undefined;
  capture.expiresAtUnixMs = undefined;
  rememberAudioAnalysis(capture);
  broadcastForSource(capture.tabID, audioAnalysisStatusMessage(audioAnalysisReplayByTab.get(capture.tabID)!));
  const task = startReservedAudioCapture(capture, []);
  capture.startTask = task;
  return { capture, task };
};

const startSourceLeaseMonitor = () => {
  if (sourceLeaseTimer !== undefined) return;
  sourceLeaseTimer = setInterval(() => {
    sourceRegistry.expire();
    const currentCapture = audioCapture ?? pendingAudioCapture;
    const currentSnapshot = currentCapture
      ? sourceRegistry.snapshotForTab(currentCapture.tabID)
      : undefined;
    if (
      currentCapture
      && (
        !currentSnapshot
        || currentSnapshot.track.trackID !== currentCapture.trackID
        || (
          currentCapture.ownerScope === "followAuthority"
          && sourceRegistry.sourceTabID !== currentCapture.tabID
        )
        || (
          currentCapture.expiresAtUnixMs !== undefined
          && currentCapture.expiresAtUnixMs < Date.now()
        )
      )
    ) {
      void stopAudioAnalysis(currentCapture.trackID, currentCapture.tabID, currentCapture.captureID);
      audioAnalysisReplayByTab.delete(currentCapture.tabID);
    }
    for (const [tabID, replay] of audioAnalysisReplayByTab) {
      const snapshot = sourceRegistry.snapshotForTab(tabID);
      if (!snapshot || snapshot.track.trackID !== replay.trackID) {
        audioAnalysisReplayByTab.delete(tabID);
      }
    }
    broadcastBridgeState();
  }, 1000);
};

const stopSourceLeaseMonitorIfIdle = () => {
  if (
    stagePorts.size > 0
    || pendingAudioCapture !== undefined
    || audioCapture !== undefined
    || recoveringAudioCapture !== undefined
    || sourceLeaseTimer === undefined
  ) return;
  clearInterval(sourceLeaseTimer);
  sourceLeaseTimer = undefined;
};

const focusOrCreateYouTubeMusic = async () => {
  const [existing] = await chromeAPI.tabs.query({ url: "https://music.youtube.com/*" });
  if (existing?.id !== undefined) {
    await chromeAPI.tabs.update(existing.id, { active: true });
    return;
  }
  await chromeAPI.tabs.create({ url: "https://music.youtube.com/", active: true });
};

interface StageActivationResponse {
  ok: boolean;
  reason?: string;
}

const showInPageStage = async (): Promise<StageActivationResponse> => {
  sourceRegistry.expire();
  const tabID = sourceRegistry.sourceTabID;
  if (tabID === undefined) {
    await focusOrCreateYouTubeMusic();
    return { ok: false, reason: "source-not-ready" };
  }
  await chromeAPI.tabs.update(tabID, { active: true });
  try {
    const response = await chromeAPI.tabs.sendMessage(tabID, { type: "youtube-music-activate-lyrics" });
    const result = response as StageActivationResponse | undefined;
    return result?.ok === true
      ? { ok: true }
      : { ok: false, reason: result?.reason || "stage-not-ready" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 120) : "content-script-unavailable",
    };
  }
};

const seekInYouTubeMusic = async (
  timeMs: number,
  expectedTrackID: string,
  preferredTabID?: number,
): Promise<StageActivationResponse> => {
  if (!Number.isFinite(timeMs) || timeMs < 0 || !expectedTrackID) {
    return { ok: false, reason: "invalid-seek" };
  }
  sourceRegistry.expire();
  const tabID = preferredTabID ?? sourceRegistry.sourceTabID;
  const snapshot = tabID === undefined ? undefined : sourceRegistry.snapshotForTab(tabID);
  if (tabID === undefined || !snapshot) return { ok: false, reason: "source-not-ready" };
  if (snapshot.track.trackID !== expectedTrackID) return { ok: false, reason: "track-changed" };
  try {
    const response = await chromeAPI.tabs.sendMessage(tabID, {
      type: "youtube-music-seek-to",
      timeMs,
      expectedTrackID,
    });
    const result = response as StageActivationResponse | undefined;
    return result?.ok === true
      ? { ok: true }
      : { ok: false, reason: result?.reason || "seek-failed" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 120) : "content-script-unavailable",
    };
  }
};

const transportInYouTubeMusic = async (
  action: YouTubeMusicTransportActionV0,
  expectedTrackID: string,
  preferredTabID?: number,
): Promise<StageActivationResponse> => {
  if (!expectedTrackID) return { ok: false, reason: "invalid-track" };
  sourceRegistry.expire();
  const tabID = preferredTabID ?? sourceRegistry.sourceTabID;
  const snapshot = tabID === undefined ? undefined : sourceRegistry.snapshotForTab(tabID);
  if (tabID === undefined || !snapshot) return { ok: false, reason: "source-not-ready" };
  if (snapshot.track.trackID !== expectedTrackID) return { ok: false, reason: "track-changed" };
  try {
    const response = await chromeAPI.tabs.sendMessage(tabID, {
      type: "youtube-music-transport-command",
      action,
      expectedTrackID,
    });
    const result = response as StageActivationResponse | undefined;
    return result?.ok === true
      ? { ok: true }
      : { ok: false, reason: result?.reason || "transport-failed" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 120) : "content-script-unavailable",
    };
  }
};

chromeAPI.runtime.onConnect.addListener((port) => {
  if (port.name !== "lyricstage-stage") return;
  stagePorts.set(port, sourceTabIDForSender(port.sender));
  startSourceLeaseMonitor();
  postToPort(port, bridgeStateForPort(port));
  replayAudioAnalysisToPort(port);
  port.onMessage.addListener((message) => {
    if ((message as { type?: string })?.type === "youtube-music-request-status") {
      postToPort(port, bridgeStateForPort(port));
      replayAudioAnalysisToPort(port);
    }
  });
  port.onDisconnect.addListener(() => {
    stagePorts.delete(port);
    stopSourceLeaseMonitorIfIdle();
  });
});

chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const request = message as {
    type?: string;
    snapshot?: unknown;
    track?: unknown;
    lyrics?: unknown;
    candidate?: unknown;
    fileName?: unknown;
    rawLyrics?: unknown;
    timeMs?: unknown;
    action?: unknown;
    endpoint?: unknown;
    token?: unknown;
    configuration?: unknown;
    provider?: unknown;
    slot?: unknown;
    query?: unknown;
    musicMap?: unknown;
    vocalTimingMap?: unknown;
    trackID?: unknown;
    captureID?: unknown;
    tabID?: unknown;
    generation?: unknown;
    ownerScope?: unknown;
    expectedTrackID?: unknown;
    durationMs?: unknown;
    reason?: unknown;
    bible?: unknown;
    state?: unknown;
    playheadMs?: unknown;
    desiredHorizonMs?: unknown;
    paused?: unknown;
    seekTargetMs?: unknown;
  };
  const fromOffscreen = sender.url === chromeAPI.runtime.getURL("offscreen.html");
  if (request.type === "youtube-music-source-snapshot") {
    const tabID = sender.tab?.id;
    const previousTrackID = tabID === undefined
      ? undefined
      : sourceRegistry.snapshotForTab(tabID)?.track.trackID;
    if (!sourceRegistry.accept(tabID, request.snapshot) || tabID === undefined) {
      sendResponse({ ok: false });
      return;
    }
    const acceptedTrackID = sourceRegistry.snapshotForTab(tabID)?.track.trackID;
    if (previousTrackID !== undefined && previousTrackID !== acceptedTrackID) {
      rollingRequestOwnership.release(`tab:${tabID}`);
    }
    settleSourceSnapshotWaiters(tabID);
    broadcastBridgeState();
    const currentCapture = audioCapture ?? pendingAudioCapture;
    if (currentCapture?.tabID === tabID) {
      const snapshot = sourceRegistry.snapshotForTab(tabID);
      if (snapshot?.track.trackID === currentCapture.trackID) {
        if (snapshot.playback.state === "ended") {
          void stopAudioAnalysis(
            currentCapture.trackID,
            currentCapture.tabID,
            currentCapture.captureID,
          );
        } else if (audioCapture === currentCapture) {
          const clock = captureClock(tabID);
          if (clock) void chromeAPI.runtime.sendMessage({
            type: "lyricstage-audio-clock",
            captureID: currentCapture.captureID,
            trackID: currentCapture.trackID,
            tabID: currentCapture.tabID,
            generation: currentCapture.generation,
            ownerScope: currentCapture.ownerScope,
            clock,
          }).catch(() => undefined);
        }
      } else if (snapshot?.track.trackID !== currentCapture.trackID) {
        void stopAudioAnalysis(currentCapture.trackID, currentCapture.tabID, currentCapture.captureID);
      }
    }
    const currentSnapshot = sourceRegistry.snapshotForTab(tabID);
    if (currentSnapshot && currentSnapshot.playback.durationMs > 0
      && currentSnapshot.playback.currentTimeMs >= currentSnapshot.playback.durationMs - 20_000) {
      void markDirectorCacheReachedFinalWindowV1(currentSnapshot.track.trackID);
    }
    if (audioAnalysisReplayByTab.get(tabID)?.trackID !== currentSnapshot?.track.trackID) {
      audioAnalysisReplayByTab.delete(tabID);
    }
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "youtube-music-source-disconnect") {
    const tabID = sender.tab?.id;
    const removedAuthoritative = tabID !== undefined && sourceRegistry.remove(tabID);
    sendResponse({ ok: tabID !== undefined, authoritativeChanged: removedAuthoritative });
    if (tabID !== undefined) {
      rollingRequestOwnership.release(`tab:${tabID}`);
      settleSourceSnapshotWaiters(tabID, true);
      const currentCapture = audioCapture?.tabID === tabID
        ? audioCapture
        : pendingAudioCapture?.tabID === tabID
          ? pendingAudioCapture
          : recoveringAudioCapture?.tabID === tabID ? recoveringAudioCapture : undefined;
      if (currentCapture) void stopAudioAnalysis(currentCapture.trackID, tabID, currentCapture.captureID);
      audioAnalysisReplayByTab.delete(tabID);
      clearSource();
    }
    return;
  }

  if (request.type === "youtube-music-request-status") {
    const tabID = sourceTabIDForSender(sender);
    sendResponse(tabID === undefined ? bridgeState() : sourceRegistry.stateForTab(tabID));
    return;
  }

  if (request.type === "youtube-music-start-audio-analysis") {
    if (typeof request.trackID !== "string" || typeof request.durationMs !== "number" || !Number.isFinite(request.durationMs)) {
      sendResponse({ ok: false, reason: "invalid-audio-analysis-request" });
      return;
    }
    const trackID = request.trackID;
    const durationMs = request.durationMs;
    const senderTabID = sourceTabIDForSender(sender);
    void ensureAudioCaptureRehydrated().then(() => {
      // An embedded Stage remains bound to its sender tab. A standalone Stage
      // must resolve the authoritative source after rehydration, because the
      // authority may have changed while it awaited the offscreen handshake.
      const sourceTabID = senderTabID ?? sourceRegistry.sourceTabID;
      const ownerScope: AudioCaptureOwnerScope = senderTabID === undefined
        ? "followAuthority"
        : "boundTab";
      let operation: AudioCaptureOperation;
      try {
        operation = requestAudioAnalysis(trackID, durationMs, sourceTabID, ownerScope);
      } catch (error) {
        sendResponse({
          ok: false,
          reason: error instanceof Error ? error.message.slice(0, 160) : "capture-failed",
        });
        return;
      }
      void operation.task.then(
        () => sendResponse({ ok: true, captureID: operation.capture.captureID }),
        (error) => {
          const failure = captureStartFailure(operation.capture, error, true);
          sendResponse({ ok: false, captureID: operation.capture.captureID, reason: failure.reason });
        },
      );
    });
    return true;
  }

  if (request.type === "youtube-music-resume-pending-audio-analysis") {
    void ensureAudioCaptureRehydrated().then(() => {
      const operation = resumePendingAudioAnalysis();
      if (!operation) {
        sendResponse({ ok: false, pending: false });
        return;
      }
      void operation.task.then(
        () => sendResponse({ ok: true, pending: true, captureID: operation.capture.captureID }),
        (error) => {
          const failure = captureStartFailure(operation.capture, error, false);
          sendResponse({
            ok: false,
            pending: true,
            captureID: operation.capture.captureID,
            reason: failure.reason,
          });
        },
      );
    });
    return true;
  }

  if (request.type === "youtube-music-stop-audio-analysis") {
    void ensureAudioCaptureRehydrated().then(() => stopAudioAnalysis(
      typeof request.trackID === "string" ? request.trackID : undefined,
      sourceTabIDForSender(sender),
      typeof request.captureID === "string" ? request.captureID : undefined,
    )).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }

  if (request.type === "lyricstage-audio-capture-ready") {
    if (
      !fromOffscreen
      || typeof request.captureID !== "string"
      || typeof request.trackID !== "string"
      || typeof request.tabID !== "number"
      || typeof request.generation !== "number"
      || request.captureID !== audioCapture?.captureID
      || request.trackID !== audioCapture.trackID
      || request.tabID !== audioCapture.tabID
      || request.generation !== audioCapture.generation
      || request.ownerScope !== audioCapture.ownerScope
    ) return;
    if (audioCapture.status !== "ready") audioCapture.status = "analyzing";
    audioCapture.reason = undefined;
    rememberAudioAnalysis(audioCapture);
    broadcastForSource(audioCapture.tabID, audioAnalysisStatusMessage(audioAnalysisReplayByTab.get(audioCapture.tabID)!));
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "lyricstage-audio-capture-error") {
    const failed = fromOffscreen ? captureForOffscreenTerminalTuple(request) : undefined;
    if (!failed) return;
    failed.status = "error";
    failed.reason = typeof request.reason === "string"
      ? request.reason.slice(0, 160)
      : "capture-failed";
    rememberAudioAnalysis(failed);
    broadcastForSource(failed.tabID, audioAnalysisStatusMessage(audioAnalysisReplayByTab.get(failed.tabID)!));
    if (audioCapture === failed) audioCapture = undefined;
    if (recoveringAudioCapture === failed) {
      recoveringAudioCapture = undefined;
      settleSourceSnapshotWaiters(failed.tabID, true);
    }
    audioCaptureGeneration = Math.max(audioCaptureGeneration, failed.generation) + 1;
    stopSourceLeaseMonitorIfIdle();
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "lyricstage-audio-capture-ended") {
    const ended = fromOffscreen ? captureForOffscreenTerminalTuple(request) : undefined;
    if (!ended) return;
    if (audioCapture === ended) audioCapture = undefined;
    if (recoveringAudioCapture === ended) {
      recoveringAudioCapture = undefined;
      settleSourceSnapshotWaiters(ended.tabID, true);
    }
    audioCaptureGeneration = Math.max(audioCaptureGeneration, ended.generation) + 1;
    rememberIdleAudioAnalysis(ended);
    stopSourceLeaseMonitorIfIdle();
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "lyricstage-audio-map-update") {
    const musicMap = sanitizeMusicMapV1(request.musicMap);
    if (
      !fromOffscreen
      || !musicMap
      || typeof request.captureID !== "string"
      || typeof request.trackID !== "string"
      || typeof request.tabID !== "number"
      || typeof request.generation !== "number"
      || request.captureID !== audioCapture?.captureID
      || request.trackID !== audioCapture.trackID
      || request.tabID !== audioCapture.tabID
      || request.generation !== audioCapture.generation
      || request.ownerScope !== audioCapture.ownerScope
    ) return;
    audioCapture.latestMusicMap = musicMap;
    const coverageReady = musicMap.analyzedMs >= Math.min(28_000, Math.max(8_000, musicMap.durationMs * 0.08));
    if (coverageReady && !audioCapture.mapForwarded) {
      audioCapture.mapForwarded = true;
      audioCapture.status = "ready";
      audioCapture.reason = undefined;
      broadcastForSource(audioCapture.tabID, {
        type: "youtube-music-music-map-update",
        trackID: audioCapture.trackID,
        captureID: audioCapture.captureID,
        musicMap,
      });
      broadcastForSource(audioCapture.tabID, audioAnalysisStatusMessage({ ...audioCapture, status: "ready" }));
    }
    rememberAudioAnalysis(audioCapture);
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "lyricstage-vocal-timing-update") {
    const vocalTimingMap = sanitizeVocalTimingMapV1(request.vocalTimingMap);
    if (
      !fromOffscreen
      || !vocalTimingMap
      || typeof request.captureID !== "string"
      || typeof request.trackID !== "string"
      || typeof request.tabID !== "number"
      || typeof request.generation !== "number"
      || request.captureID !== audioCapture?.captureID
      || request.trackID !== audioCapture?.trackID
      || request.tabID !== audioCapture.tabID
      || request.generation !== audioCapture.generation
      || request.ownerScope !== audioCapture.ownerScope
    ) return;
    audioCapture.latestVocalMap = vocalTimingMap;
    rememberAudioAnalysis(audioCapture);
    broadcastForSource(audioCapture.tabID, {
      type: "youtube-music-vocal-timing-update",
      trackID: audioCapture.trackID,
      captureID: audioCapture.captureID,
      vocalTimingMap,
    });
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "youtube-music-private-lyrics-config") {
    void privateLyricsConfiguration().then((configuration) => sendResponse({
      configured: configuration !== undefined,
      endpoint: configuration?.endpoint ?? "",
    }), () => sendResponse({ configured: false, endpoint: "", reason: "读取歌词配置失败，请重试" }));
    return true;
  }

  if (request.type === "youtube-music-save-private-lyrics-config") {
    void savePrivateLyricsConfiguration(request.endpoint, request.token).then(
      sendResponse,
      (error) => sendResponse({
        configured: false,
        endpoint: typeof request.endpoint === "string" ? request.endpoint : "",
        reason: error instanceof Error ? error.message.slice(0, 120) : "歌词后端配置失败",
      }),
    );
    return true;
  }

  if (request.type === "youtube-music-director-config") {
    void Promise.all([directorConfiguration(), readDirectorTiming()]).then(([configuration, lastTiming]) => sendResponse(configuration
      ? { ...publicDirectorBYOKConfigurationV1(configuration), ...(lastTiming ? { lastTiming } : {}) }
      : { version: "lyricstage-director-byok-v1", configured: false, ...(lastTiming ? { lastTiming } : {}) }),
    () => sendResponse({
      version: "lyricstage-director-byok-v1",
      configured: false,
      reason: "读取 AI 导演配置失败，请重试",
    }));
    return true;
  }

  if (request.type === "youtube-music-director-cache-summaries-v1") {
    void directorCacheSummariesV1().then(
      (summaries) => sendResponse({ type: "director-cache-summaries-v1", summaries }),
      () => sendResponse({ type: "director-cache-summaries-v1", summaries: [], reason: "director-cache-review-unavailable" }),
    );
    return true;
  }

  if (request.type === "youtube-music-save-director-config") {
    void saveDirectorConfiguration(request.configuration).then(
      async (result) => {
        const configuration = await directorConfiguration();
        sendResponse(configuration ? publicDirectorBYOKConfigurationV1(configuration) : result);
      },
      (error) => sendResponse({
        configured: false,
        reason: error instanceof Error ? error.message.slice(0, 120) : "导演配置失败",
      }),
    );
    return true;
  }

  if (request.type === "youtube-music-list-director-models") {
    void discoverDirectorModels(request.provider, request.slot).then(
      sendResponse,
      (error) => sendResponse({
        models: [],
        reason: error instanceof Error ? error.message.slice(0, 240) : "连接模型提供商失败",
      }),
    );
    return true;
  }

  if (request.type === "youtube-music-resolve-lyrics") {
    if (!isLyricsLookupTrackV0(request.track)) {
      sendResponse({
        type: "lyrics-lookup-result",
        version: lyricsLookupVersion,
        trackID: "invalid",
        status: "error",
        source: "network",
        candidates: [],
        message: "歌曲信息不完整，暂时不能搜索歌词",
      } satisfies LyricsLookupResponseV0);
      return;
    }
    void resolveAutomaticLyrics(request.track).then(sendResponse, (error) => {
      sendResponse(lyricsErrorResponse(request.track && isLyricsLookupTrackV0(request.track) ? request.track.trackID : "invalid", error));
    });
    return true;
  }

  if (request.type === "youtube-music-search-lyrics") {
    if (!isLyricsLookupTrackV0(request.track)) {
      sendResponse(lyricsErrorResponse("invalid", new Error("歌曲信息不完整，暂时不能搜索歌词")));
      return;
    }
    const query = request.query && typeof request.query === "object"
      ? request.query as { title?: unknown; artist?: unknown }
      : {};
    const track = request.track;
    void resolveManualLyrics(track, query.title, query.artist).then(
      sendResponse,
      (error) => sendResponse(lyricsErrorResponse(track.trackID, error)),
    );
    return true;
  }

  if (request.type === "youtube-music-resolve-director-bible-v1") {
    const parsedLyrics = parseLyricDocumentV0(request.lyrics);
    const parsedMusicMap = request.musicMap === undefined ? undefined : sanitizeMusicMapV1(request.musicMap);
    if (!isLyricsLookupTrackV0(request.track) || !parsedLyrics.ok
      || (request.musicMap !== undefined && !parsedMusicMap)) {
      sendResponse({ type: "director-bible-resolution-v1", status: "error", source: "local", reason: "invalid-rolling-bible-request", timing: rollingTiming() });
      return;
    }
    if (parsedLyrics.value.recordingID !== youtubeMusicRecordingID(request.track.trackID)) {
      sendResponse({ type: "director-bible-resolution-v1", status: "error", source: "local", reason: "recording-identity-mismatch", timing: rollingTiming() });
      return;
    }
    void resolveDirectorBibleV1(rollingOwnerKeyForSender(sender), request.track, parsedLyrics.value, parsedMusicMap).then(
      sendResponse,
      () => sendResponse({ type: "director-bible-resolution-v1", status: "error", source: "local", reason: "rolling-bible-unavailable", timing: rollingTiming() }),
    );
    return true;
  }

  if (request.type === "youtube-music-resolve-director-coverage-v1") {
    const parsedLyrics = parseLyricDocumentV0(request.lyrics);
    const parsedMusicMap = request.musicMap === undefined ? undefined : sanitizeMusicMapV1(request.musicMap);
    if (!isLyricsLookupTrackV0(request.track) || !parsedLyrics.ok
      || (request.musicMap !== undefined && !parsedMusicMap)
      || typeof request.playheadMs !== "number" || !Number.isFinite(request.playheadMs)
      || typeof request.desiredHorizonMs !== "number" || !Number.isFinite(request.desiredHorizonMs)
      || request.playheadMs < 0 || request.playheadMs > (parsedLyrics.ok ? parsedLyrics.value.durationMs : 0)
      || request.desiredHorizonMs < 0 || request.desiredHorizonMs > 120_000
      || (request.seekTargetMs !== undefined && (typeof request.seekTargetMs !== "number" || !Number.isFinite(request.seekTargetMs)
        || request.seekTargetMs < 0 || request.seekTargetMs > (parsedLyrics.ok ? parsedLyrics.value.durationMs : 0)))) {
      sendResponse({
        type: "director-coverage-resolution-v1", status: "error", source: "local", cards: [],
        coverage: { fromMs: 0, toMs: 0, aheadMs: 0, activation: "local" }, reason: "invalid-rolling-coverage-request", timing: rollingTiming(),
      });
      return;
    }
    if (parsedLyrics.value.recordingID !== youtubeMusicRecordingID(request.track.trackID)) {
      sendResponse({
        type: "director-coverage-resolution-v1", status: "error", source: "local", cards: [],
        coverage: { fromMs: request.playheadMs, toMs: request.playheadMs, aheadMs: 0, activation: "local" }, reason: "recording-identity-mismatch", timing: rollingTiming(),
      });
      return;
    }
    const bible = sanitizeDirectorBibleV1(parsedLyrics.value, request.bible);
    if (!bible) {
      sendResponse({
        type: "director-coverage-resolution-v1", status: "error", source: "local", cards: [],
        coverage: { fromMs: request.playheadMs, toMs: request.playheadMs, aheadMs: 0, activation: "local" }, reason: "director-bible-invalid", timing: rollingTiming(),
      });
      return;
    }
    const state = request.state && isRollingPerformanceStateV1(request.state, bible)
      ? request.state as RollingPerformanceStateV1
      : undefined;
    if (request.state !== undefined && !state) {
      sendResponse({
        type: "director-coverage-resolution-v1", status: "error", source: "local", cards: [],
        coverage: { fromMs: request.playheadMs, toMs: request.playheadMs, aheadMs: 0, activation: "local" }, reason: "scene-entry-state-invalid", timing: rollingTiming(),
      });
      return;
    }
    void resolveDirectorCoverageV1(rollingOwnerKeyForSender(sender), request.track, parsedLyrics.value, bible, request.playheadMs, request.desiredHorizonMs, {
      musicMap: parsedMusicMap,
      paused: request.paused === true,
      ...(typeof request.seekTargetMs === "number" ? { seekTargetMs: request.seekTargetMs } : {}),
      ...(state ? { state } : {}),
    }).then(
      sendResponse,
      () => sendResponse({
        type: "director-coverage-resolution-v1", status: "error", source: "local", cards: [],
        coverage: { fromMs: request.playheadMs, toMs: request.playheadMs, aheadMs: 0, activation: "local" }, reason: "rolling-coverage-unavailable", timing: rollingTiming(),
      }),
    );
    return true;
  }

  if (request.type === "youtube-music-resolve-performance") {
    const parsedLyrics = parseLyricDocumentV0(request.lyrics);
    const musicMap = request.musicMap === undefined ? undefined : sanitizeMusicMapV1(request.musicMap);
    if (!isLyricsLookupTrackV0(request.track)) {
      sendResponse(directorError("导演请求的歌曲信息无效"));
      return;
    }
    if (!parsedLyrics.ok) {
      const issue = parsedLyrics.issues[0];
      sendResponse(directorError(`歌词合同无效${issue ? `：${issue.path} ${issue.message}` : ""}`));
      return;
    }
    if (request.musicMap !== undefined && !musicMap) {
      sendResponse(directorError("音乐地图合同无效"));
      return;
    }
    if (parsedLyrics.value.recordingID !== youtubeMusicRecordingID(request.track.trackID)) {
      sendResponse(directorError("歌曲与歌词 recording identity 不一致"));
      return;
    }
    void resolveAutomaticDirector(request.track, parsedLyrics.value, musicMap).then(
      sendResponse,
      (error) => sendResponse(directorError(error instanceof Error ? error.message : "导演服务不可用")),
    );
    return true;
  }

  if (request.type === "youtube-music-accept-lyrics") {
    if (!isLyricsLookupTrackV0(request.track) || !isLyricsCandidateV0(request.candidate)) {
      sendResponse({ ok: false });
      return;
    }
    void acceptLyricsCandidate(request.track, request.candidate).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({
        ok: false,
        reason: error instanceof Error ? error.message.slice(0, 120) : "cache-write-failed",
      }),
    );
    return true;
  }

  if (request.type === "youtube-music-save-local-lyrics") {
    if (
      !isLyricsLookupTrackV0(request.track) ||
      typeof request.fileName !== "string" ||
      request.fileName.length === 0 ||
      request.fileName.length > 200 ||
      typeof request.rawLyrics !== "string" ||
      request.rawLyrics.length === 0 ||
      request.rawLyrics.length > 256_000
    ) {
      sendResponse({ ok: false, reason: "invalid-local-lyrics" });
      return;
    }
    void saveLocalLyrics(request.track, request.fileName, request.rawLyrics).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false, reason: "local-lyrics-write-failed" }),
    );
    return true;
  }

  if (request.type === "youtube-music-open-stage") {
    void showInPageStage().then(sendResponse, (error) => sendResponse({
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 120) : "source-unavailable",
    }));
    return true;
  }

  if (request.type === "youtube-music-seek") {
    if (typeof request.timeMs !== "number" || typeof request.expectedTrackID !== "string") {
      sendResponse({ ok: false, reason: "invalid-seek" });
      return;
    }
    void seekInYouTubeMusic(
      request.timeMs,
      request.expectedTrackID,
      sourceTabIDForSender(sender),
    ).then(sendResponse, () => sendResponse({
      ok: false,
      reason: "seek-failed",
    }));
    return true;
  }

  if (request.type === "youtube-music-transport") {
    if (
      !["play", "pause", "previous", "next"].includes(String(request.action))
      || typeof request.expectedTrackID !== "string"
    ) {
      sendResponse({ ok: false, reason: "invalid-transport" });
      return;
    }
    void transportInYouTubeMusic(
      request.action as YouTubeMusicTransportActionV0,
      request.expectedTrackID,
      sourceTabIDForSender(sender),
    ).then(
      sendResponse,
      () => sendResponse({ ok: false, reason: "transport-failed" }),
    );
    return true;
  }

  if (request.type === "youtube-music-open-source") {
    void focusOrCreateYouTubeMusic().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({
        ok: false,
        reason: error instanceof Error ? error.message.slice(0, 120) : "source-unavailable",
      }),
    );
    return true;
  }
});

chromeAPI.tabs.onRemoved.addListener((tabID) => {
  rollingRequestOwnership.release(`tab:${tabID}`);
  sourceRegistry.remove(tabID);
  settleSourceSnapshotWaiters(tabID, true);
  const currentCapture = audioCapture?.tabID === tabID
    ? audioCapture
    : pendingAudioCapture?.tabID === tabID
      ? pendingAudioCapture
      : recoveringAudioCapture?.tabID === tabID ? recoveringAudioCapture : undefined;
  if (currentCapture) void stopAudioAnalysis(currentCapture.trackID, tabID, currentCapture.captureID);
  void ensureAudioCaptureRehydrated().then(() => {
    const recovered = audioCapture?.tabID === tabID ? audioCapture : undefined;
    if (recovered) void stopAudioAnalysis(recovered.trackID, tabID, recovered.captureID);
  });
  audioAnalysisReplayByTab.delete(tabID);
  clearSource();
});

chromeAPI.tabs.onUpdated.addListener((tabID, change) => {
  if (
    change.url !== undefined &&
    !change.url.startsWith("https://music.youtube.com/")
  ) {
    rollingRequestOwnership.release(`tab:${tabID}`);
    sourceRegistry.remove(tabID);
    settleSourceSnapshotWaiters(tabID, true);
    const currentCapture = audioCapture?.tabID === tabID
      ? audioCapture
      : pendingAudioCapture?.tabID === tabID
        ? pendingAudioCapture
        : recoveringAudioCapture?.tabID === tabID ? recoveringAudioCapture : undefined;
    if (currentCapture) void stopAudioAnalysis(currentCapture.trackID, tabID, currentCapture.captureID);
    void ensureAudioCaptureRehydrated().then(() => {
      const recovered = audioCapture?.tabID === tabID ? audioCapture : undefined;
      if (recovered) void stopAudioAnalysis(recovered.trackID, tabID, recovered.captureID);
    });
    audioAnalysisReplayByTab.delete(tabID);
    clearSource();
  }
});

// MV3 workers are disposable. Reconcile the durable offscreen document on
// every worker start instead of relying on a keepalive to preserve JS state.
void ensureAudioCaptureRehydrated();
