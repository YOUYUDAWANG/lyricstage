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
  isLyricsLookupResponseV0,
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
  buildDirectorRequestPayloadV1,
  directorBYOKCacheIdentityV1,
  executeDirectorBYOKV1,
  isDirectorPlanV1ForLyrics,
  listDirectorProviderModelsV1,
  publicDirectorBYOKConfigurationV1,
  sanitizeDirectorProviderConnectionV1,
  sanitizeDirectorBYOKConfigurationV1,
  sanitizeMusicMapV1,
  sanitizeVocalTimingMapV1,
  type DirectorBYOKConfigurationV1,
  type DirectorPlanV1,
  type DirectorProviderConfigurationV1,
  type DirectorResolutionResponseV1,
  type MusicMapV1,
  type VocalTimingMapV1,
} from "@lyricstage/performance";

interface ExtensionPort {
  name: string;
  sender?: { tab?: ExtensionTab; url?: string };
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

interface ExtensionTab {
  id?: number;
  url?: string;
}

interface ExtensionChrome {
  runtime: {
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
    getContexts?(options: { contextTypes: string[]; documentUrls: string[] }): Promise<unknown[]>;
    onConnect: { addListener(listener: (port: ExtensionPort) => void): void };
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: { tab?: ExtensionTab; url?: string },
          sendResponse: (response: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
  offscreen: {
    createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
    closeDocument?(): Promise<void>;
  };
  tabCapture: {
    getMediaStreamId(options: { targetTabId: number }): Promise<string>;
  };
  tabs: {
    create(options: { url: string; active?: boolean }): Promise<ExtensionTab>;
    query(options: Record<string, unknown>): Promise<ExtensionTab[]>;
    sendMessage(tabID: number, message: unknown): Promise<unknown>;
    update(tabID: number, options: { active: boolean }): Promise<ExtensionTab>;
    onRemoved: { addListener(listener: (tabID: number) => void): void };
    onUpdated: {
      addListener(listener: (tabID: number, change: { url?: string }) => void): void;
    };
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
}

const chromeAPI = (globalThis as typeof globalThis & { chrome: ExtensionChrome }).chrome;
const stagePorts = new Map<ExtensionPort, number | undefined>();
const sourceRegistry = new YouTubeMusicSourceRegistryV0();
const lyricsCacheStorageKey = "lyricstage-youtube-music-lyrics-v9";
const localLyricsStorageKey = "lyricstage-local-lyrics-v0";
const privateLyricsConfigurationStorageKey = "lyricstage-private-lyrics-backend-v0";
const legacyDirectorConfigurationStorageKey = "lyricstage-director-backend-v1";
const directorConfigurationStorageKey = "lyricstage-director-byok-v1";
const legacyDirectorCacheStorageKey = "lyricstage-director-cache-v4";
const directorCacheStorageKey = "lyricstage-director-cache-v5";
const directorCacheEpoch = "fullscreen-director-v4-client-contract-v8.6-byok-v1";
const lyricsCacheLimit = 100;
const directorCacheLimit = 100;
const lyricsLookupTasks = new Map<string, Promise<LyricsLookupResponseV0>>();
const manualLyricsLookupTasks = new Map<string, Promise<LyricsLookupResponseV0>>();
const directorLookupTasks = new Map<string, Promise<DirectorResolutionResponseV1>>();
let lyricsCacheWrite = Promise.resolve();
let localLyricsWrite = Promise.resolve();
let directorCacheWrite = Promise.resolve();
let sourceLeaseTimer: ReturnType<typeof setInterval> | undefined;
let offscreenCreation: Promise<void> | undefined;
type AudioAnalysisStatus = "analyzing" | "ready" | "error";
type AudioCaptureOwnerScope = "boundTab" | "followAuthority";

interface AudioCaptureState {
  captureID: string;
  trackID: string;
  tabID: number;
  durationMs: number;
  generation: number;
  ownerScope: AudioCaptureOwnerScope;
  status: AudioAnalysisStatus;
  reason?: string;
  latestMusicMap?: MusicMapV1;
  latestVocalMap?: VocalTimingMapV1;
  mapForwarded: boolean;
  expiresAtUnixMs?: number;
  startTask?: Promise<void>;
}

interface AudioCaptureOperation {
  capture: AudioCaptureState;
  task: Promise<void>;
}

interface OffscreenAudioCaptureStatus {
  captureID: string;
  trackID: string;
  tabID: number;
  generation: number;
  durationMs: number;
  status: AudioAnalysisStatus;
  ownerScope: AudioCaptureOwnerScope;
  latestMusicMap?: MusicMapV1;
  latestVocalMap?: VocalTimingMapV1;
}

type AudioAnalysisReplayState = Omit<AudioCaptureState, "status" | "startTask"> & {
  status: AudioAnalysisStatus | "idle";
};

let audioCapture: AudioCaptureState | undefined;
let pendingAudioCapture: AudioCaptureState | undefined;
let recoveringAudioCapture: AudioCaptureState | undefined;
let audioCaptureGeneration = 0;
let audioCaptureSequence = 0;
let audioCaptureRehydrated = false;
let audioCaptureRehydrationTask: Promise<void> | undefined;
const audioAnalysisReplayByTab = new Map<number, AudioAnalysisReplayState>();
let lastBroadcastAuthoritativeTabID: number | undefined;
const sponsorBlockCategories = [
  "sponsor",
  "selfpromo",
  "interaction",
  "intro",
  "outro",
  "preview",
  "filler",
  "music_offtopic",
];

interface StoredLyricsCacheEntry {
  fingerprint: string;
  expiresAtUnixMs: number;
  response: LyricsLookupResponseV0;
}

type StoredLyricsCache = Record<string, StoredLyricsCacheEntry>;

interface StoredLocalLyricsEntry {
  fingerprint: string;
  fileName: string;
  rawLyrics: string;
  updatedAtUnixMs: number;
}

type StoredLocalLyrics = Record<string, StoredLocalLyricsEntry>;

interface StoredDirectorCacheEntry {
  fingerprint: string;
  expiresAtUnixMs: number;
  plan: DirectorPlanV1;
}

type StoredDirectorCache = Record<string, StoredDirectorCacheEntry>;

const privateLyricsConfiguration = async (): Promise<LDDCLyricsConfigurationV0 | undefined> => {
  const value = (await chromeAPI.storage.local.get(privateLyricsConfigurationStorageKey))[privateLyricsConfigurationStorageKey] as
    Partial<LDDCLyricsConfigurationV0> | undefined;
  if (typeof value?.endpoint !== "string" || typeof value.token !== "string") return undefined;
  const endpoint = value.endpoint.trim();
  const token = value.token.trim();
  if (!endpoint || !token || endpoint.length > 500 || token.length > 500) return undefined;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }
  return { endpoint, token };
};

const savePrivateLyricsConfiguration = async (
  endpointValue: unknown,
  tokenValue: unknown,
): Promise<{ configured: boolean; endpoint: string }> => {
  const endpoint = typeof endpointValue === "string" ? endpointValue.trim() : "";
  const suppliedToken = typeof tokenValue === "string" ? tokenValue.trim() : "";
  if (!endpoint) {
    await chromeAPI.storage.local.set({ [privateLyricsConfigurationStorageKey]: null });
    await chromeAPI.storage.local.set({ [lyricsCacheStorageKey]: {} });
    return { configured: false, endpoint: "" };
  }
  const url = new URL(endpoint);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || endpoint.length > 500) {
    throw new Error("歌词后端地址无效");
  }
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
    });
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
  });
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

const readLyricsCache = async (): Promise<StoredLyricsCache> => {
  const stored = (await chromeAPI.storage.local.get(lyricsCacheStorageKey))[lyricsCacheStorageKey];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return stored as StoredLyricsCache;
};

const readLocalLyrics = async (): Promise<StoredLocalLyrics> => {
  const stored = (await chromeAPI.storage.local.get(localLyricsStorageKey))[localLyricsStorageKey];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return stored as StoredLocalLyrics;
};

const localLyricsCandidate = async (
  track: LyricsLookupTrackV0,
): Promise<LyricsCandidateV0 | undefined> => {
  const entry = (await readLocalLyrics())[track.trackID];
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
  localLyricsWrite = localLyricsWrite.catch(() => undefined).then(async () => {
    const entries = Object.entries(await readLocalLyrics())
      .filter(([trackID, entry]) =>
        trackID !== track.trackID &&
        typeof entry?.updatedAtUnixMs === "number" &&
        typeof entry?.rawLyrics === "string"
      );
    entries.push([track.trackID, {
      fingerprint: lyricsFingerprint(track),
      fileName: fileName.slice(0, 200),
      rawLyrics,
      updatedAtUnixMs: Date.now(),
    }]);
    const bounded = Object.fromEntries(
      entries
        .sort((left, right) => right[1].updatedAtUnixMs - left[1].updatedAtUnixMs)
        .slice(0, lyricsCacheLimit),
    );
    await chromeAPI.storage.local.set({ [localLyricsStorageKey]: bounded });
  });
  return localLyricsWrite;
};

const cachedLyrics = async (track: LyricsLookupTrackV0): Promise<LyricsLookupResponseV0 | undefined> => {
  const entry = (await readLyricsCache())[track.trackID];
  if (
    !entry ||
    entry.fingerprint !== lyricsFingerprint(track) ||
    entry.expiresAtUnixMs <= Date.now() ||
    !isLyricsLookupResponseV0(entry.response)
  ) return undefined;
  return { ...entry.response, source: "cache" };
};

const saveLyricsCache = (
  track: LyricsLookupTrackV0,
  response: LyricsLookupResponseV0,
  ttlMilliseconds: number,
): Promise<void> => {
  lyricsCacheWrite = lyricsCacheWrite.catch(() => undefined).then(async () => {
    const now = Date.now();
    const entries = Object.entries(await readLyricsCache())
      .filter(([trackID, entry]) =>
        trackID !== track.trackID &&
        entry?.expiresAtUnixMs > now &&
        isLyricsLookupResponseV0(entry.response));
    entries.push([track.trackID, {
      fingerprint: lyricsFingerprint(track),
      expiresAtUnixMs: now + ttlMilliseconds,
      response,
    }]);
    const bounded = Object.fromEntries(
      entries
        .sort((left, right) => right[1].expiresAtUnixMs - left[1].expiresAtUnixMs)
        .slice(0, lyricsCacheLimit),
    );
    await chromeAPI.storage.local.set({ [lyricsCacheStorageKey]: bounded });
  });
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
  } catch (error) {
    return lyricsErrorResponse(track.trackID, error);
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
      await saveLyricsCache(track, response, ttl);
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
      await saveLyricsCache(track, response, candidates.length > 0 ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
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
  const issued = await cachedLyrics(track);
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
  await saveLyricsCache(track, response, 30 * 24 * 60 * 60 * 1000);
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

const directorError = (reason: string): DirectorResolutionResponseV1 => ({
  type: "director-resolution-v1",
  status: "error",
  source: "network",
  reason: reason.slice(0, 180),
});

const resolveAutomaticDirector = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
): Promise<DirectorResolutionResponseV1> => {
  const configuration = await directorConfiguration();
  if (!configuration) {
    return {
      type: "director-resolution-v1",
      status: "unavailable",
      source: "local",
      reason: "director-not-configured",
    };
  }
  if (!musicMap) {
    const cached = await cachedDirectorPlan(track, lyrics, configuration);
    if (cached) {
      return { type: "director-resolution-v1", status: "ready", source: "cache", plan: cached };
    }
  }
  const fingerprint = musicMap
    ? stableHash32({ fingerprint: directorFingerprint(track, lyrics, configuration), musicMap })
    : directorFingerprint(track, lyrics, configuration);
  const existing = directorLookupTasks.get(fingerprint);
  if (existing) return existing;

  const task = (async (): Promise<DirectorResolutionResponseV1> => {
    let payload = await buildDirectorRequestPayloadV1(track, lyrics, musicMap);
    if (!payload) return directorError("歌曲过长，使用本地演出");
    try {
      let execution;
      try {
        execution = await executeDirectorBYOKV1(configuration, JSON.parse(payload.body) as unknown);
      } catch (firstError) {
        const lineTimingPayload = await buildDirectorRequestPayloadV1(
          track,
          lyrics,
          musicMap,
          { lineTimingOnly: true },
        );
        if (lineTimingPayload && lineTimingPayload.body !== payload.body) {
          payload = lineTimingPayload;
          execution = await executeDirectorBYOKV1(configuration, JSON.parse(payload.body) as unknown);
        } else {
          throw firstError;
        }
      }
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
      if (!plan) {
        const degradedReason = execution.response && typeof execution.response === "object" && !Array.isArray(execution.response)
          && typeof (execution.response as { degradedReason?: unknown }).degradedReason === "string"
          ? (execution.response as { degradedReason: string }).degradedReason.slice(0, 120)
          : "";
        return directorError(degradedReason
          ? `导演降级：${degradedReason}`
          : "导演响应未通过本地合同");
      }
      await saveDirectorPlanCache(track, lyrics, plan, configuration);
      return { type: "director-resolution-v1", status: "ready", source: "network", plan };
    } catch (error) {
      let reason = error instanceof Error ? error.message : "AI 导演请求失败";
      for (const provider of [configuration.primary, configuration.fallback]) {
        if (provider?.apiKey) reason = reason.replaceAll(provider.apiKey, "[redacted]");
      }
      return directorError(reason);
    } finally {
      directorLookupTasks.delete(fingerprint);
    }
  })();
  directorLookupTasks.set(fingerprint, task);
  return task;
};

const bridgeState = (): YouTubeMusicBridgeStateV0 => sourceRegistry.state();

const sourceTabIDForSender = (sender?: { tab?: ExtensionTab; url?: string }): number | undefined =>
  (
    sender?.tab?.url?.startsWith("https://music.youtube.com/")
    || sender?.url?.startsWith("https://music.youtube.com/")
  )
    ? sender.tab?.id
    : undefined;

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
  };
  const fromOffscreen = sender.url === chromeAPI.runtime.getURL("offscreen.html");
  if (request.type === "youtube-music-source-snapshot") {
    const tabID = sender.tab?.id;
    if (!sourceRegistry.accept(tabID, request.snapshot) || tabID === undefined) {
      sendResponse({ ok: false });
      return;
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
    }), () => sendResponse({ configured: false, endpoint: "" }));
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
    void directorConfiguration().then((configuration) => sendResponse(configuration
      ? publicDirectorBYOKConfigurationV1(configuration)
      : { version: "lyricstage-director-byok-v1", configured: false }),
    () => sendResponse({ version: "lyricstage-director-byok-v1", configured: false }));
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
