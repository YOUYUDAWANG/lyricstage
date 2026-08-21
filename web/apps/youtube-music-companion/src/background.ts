import {
  YouTubeMusicSourceRegistryV0,
  youtubeMusicRecordingID,
  type YouTubeMusicTransportActionV0,
  type YouTubeMusicBridgeStateV0,
  type YouTubeMusicBridgeUpdateV0,
} from "@lyricstage/companion";
import { parseLyricDocumentV0, stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import {
  buildAIMusicIdentityRequest,
  buildLyricsLookupIdentity,
  isLyricsCandidateV0,
  isAIMusicIdentityResultV1,
  isLyricsLookupResponseV0,
  isLyricsLookupTrackV0,
  lookupResponseContainsCandidate,
  effectiveMusicDurationMs,
  lookupLayeredLyrics,
  lyricsLookupVersion,
  manualLyricsLookupIdentity,
  mergeGroundedLyricsIdentity,
  sanitizeManualLyricsSearchQuery,
  type AIMusicIdentityResultV1,
  type LDDCLyricsConfigurationV0,
  type LyricsCandidateV0,
  type LyricsLookupResponseV0,
  type LyricsLookupTrackV0,
  type NonMusicSegmentMs,
} from "@lyricstage/lyrics";
import {
  adaptFullscreenDirectorResponseV1,
  adaptFullscreenDirectorResponseV2,
  buildDirectorRequestPayloadV1,
  isDirectorPlanV1ForLyrics,
  sanitizeMusicMapV1,
  sanitizeVocalTimingMapV1,
  type DirectorPlanV1,
  type DirectorResolutionResponseV1,
  type MusicMapV1,
} from "@lyricstage/performance";

interface ExtensionPort {
  name: string;
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
const stagePorts = new Set<ExtensionPort>();
const sourceRegistry = new YouTubeMusicSourceRegistryV0();
const lyricsCacheStorageKey = "lyricstage-youtube-music-lyrics-v8";
const localLyricsStorageKey = "lyricstage-local-lyrics-v0";
const privateLyricsConfigurationStorageKey = "lyricstage-private-lyrics-backend-v0";
const directorConfigurationStorageKey = "lyricstage-director-backend-v1";
const directorCacheStorageKey = "lyricstage-director-cache-v3";
const directorEndpoint = "https://director.hachi-mi.uk/v1/fullscreen/direct";
const musicIdentityEndpoint = "https://director.hachi-mi.uk/v1/music/identity";
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
let audioCapture: { trackID: string; tabID: number; durationMs: number; mapForwarded: boolean } | undefined;
let pendingAudioCapture: { trackID: string; durationMs: number; expiresAtUnixMs: number } | undefined;
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
  const token = suppliedToken || existing?.token || "";
  if (!token || token.length > 500) throw new Error("请输入歌词后端令牌");
  await chromeAPI.storage.local.set({
    [privateLyricsConfigurationStorageKey]: { endpoint, token },
    [lyricsCacheStorageKey]: {},
  });
  return { configured: true, endpoint };
};

const directorConfiguration = async (): Promise<{ token: string } | undefined> => {
  const value = (await chromeAPI.storage.local.get(directorConfigurationStorageKey))[directorConfigurationStorageKey] as
    { token?: unknown } | undefined;
  const token = typeof value?.token === "string" ? value.token.trim() : "";
  return token && token.length <= 500 ? { token } : undefined;
};

const resolveAIMusicIdentity = async (
  track: LyricsLookupTrackV0,
): Promise<AIMusicIdentityResultV1 | undefined> => {
  let configuration: { token: string } | undefined;
  try {
    configuration = await directorConfiguration();
  } catch {
    return undefined;
  }
  if (!configuration) return undefined;
  const localIdentity = buildLyricsLookupIdentity(track);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(musicIdentityEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${configuration.token}`,
      },
      body: JSON.stringify(buildAIMusicIdentityRequest(track, localIdentity)),
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const value = await response.json() as unknown;
    if (!isAIMusicIdentityResultV1(value) || value.trackID !== track.trackID) return undefined;
    return value;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

const saveDirectorConfiguration = async (tokenValue: unknown): Promise<{ configured: boolean }> => {
  const suppliedToken = typeof tokenValue === "string" ? tokenValue.trim() : "";
  if (!suppliedToken) {
    await chromeAPI.storage.local.set({
      [directorConfigurationStorageKey]: null,
      [directorCacheStorageKey]: {},
      [lyricsCacheStorageKey]: {},
    });
    return { configured: false };
  }
  if (suppliedToken.length > 500) throw new Error("导演令牌过长");
  await chromeAPI.storage.local.set({
    [directorConfigurationStorageKey]: { token: suppliedToken },
    [directorCacheStorageKey]: {},
    [lyricsCacheStorageKey]: {},
  });
  return { configured: true };
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
      const earlyAIIdentity = localIdentity.isCover && localIdentity.originalArtists.length === 0
        ? resolveAIMusicIdentity(lookupTrack)
        : undefined;
      let found = await lookupLayeredLyrics(lookupTrack, { lddc, identity: localIdentity });
      let aiIdentity: AIMusicIdentityResultV1 | undefined;
      if (found.matchKind !== "sameRecording") {
        aiIdentity = await (earlyAIIdentity ?? resolveAIMusicIdentity(lookupTrack));
        if (aiIdentity) {
          const groundedIdentity = mergeGroundedLyricsIdentity(lookupTrack, localIdentity, aiIdentity);
          if (groundedIdentity) {
            found = await lookupLayeredLyrics(lookupTrack, { lddc, identity: groundedIdentity });
          }
        }
      }
      const decorate = (candidate: LyricsCandidateV0): LyricsCandidateV0 =>
        nonMusicSegmentsMs.length > 0 ? { ...candidate, nonMusicSegmentsMs } : candidate;
      const identityResolution = aiIdentity?.status === "grounded"
        ? {
            method: "gemma4GoogleSearch" as const,
            canonicalTitle: aiIdentity.canonicalTitle,
            originalArtists: aiIdentity.originalArtists,
            confidence: aiIdentity.confidence,
            sources: aiIdentity.sources,
          }
        : undefined;
      const response: LyricsLookupResponseV0 = {
        ...found,
        trackID: track.trackID,
        ...(found.match ? { match: decorate(found.match) } : {}),
        ...(identityResolution ? { identityResolution } : {}),
        ...(identityResolution && found.matchKind === "originalFallback"
          ? { message: `Gemma 4 联网确认原唱：${identityResolution.originalArtists.join("、")}` }
          : {}),
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

const directorFingerprint = (track: LyricsLookupTrackV0, lyrics: LyricDocumentV0): string => stableHash32({
  version: "director-cache-fingerprint-v1",
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
): Promise<DirectorPlanV1 | undefined> => {
  const entry = (await readDirectorCache())[track.trackID];
  if (
    !entry
    || entry.fingerprint !== directorFingerprint(track, lyrics)
    || entry.expiresAtUnixMs <= Date.now()
    || !isDirectorPlanV1ForLyrics(entry.plan, lyrics)
  ) return undefined;
  return entry.plan;
};

const saveDirectorPlanCache = (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  plan: DirectorPlanV1,
): Promise<void> => {
  directorCacheWrite = directorCacheWrite.catch(() => undefined).then(async () => {
    const now = Date.now();
    const entries = Object.entries(await readDirectorCache()).filter(([trackID, entry]) =>
      trackID !== track.trackID
      && typeof entry?.expiresAtUnixMs === "number"
      && entry.expiresAtUnixMs > now
    );
    entries.push([track.trackID, {
      fingerprint: directorFingerprint(track, lyrics),
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
  if (!musicMap) {
    const cached = await cachedDirectorPlan(track, lyrics);
    if (cached) {
      return { type: "director-resolution-v1", status: "ready", source: "cache", plan: cached };
    }
  }
  const configuration = await directorConfiguration();
  if (!configuration) {
    return {
      type: "director-resolution-v1",
      status: "unavailable",
      source: "local",
      reason: "director-not-configured",
    };
  }
  const fingerprint = musicMap
    ? stableHash32({ fingerprint: directorFingerprint(track, lyrics), musicMap })
    : directorFingerprint(track, lyrics);
  const existing = directorLookupTasks.get(fingerprint);
  if (existing) return existing;

  const task = (async (): Promise<DirectorResolutionResponseV1> => {
    const payload = await buildDirectorRequestPayloadV1(track, lyrics, musicMap);
    if (!payload) return directorError("歌曲过长，使用本地演出");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110_000);
    try {
      const response = await fetch(directorEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${configuration.token}`,
        },
        body: payload.body,
        signal: controller.signal,
      });
      if (!response.ok) return directorError(`导演服务 HTTP ${response.status}`);
      const raw = await response.json() as unknown;
      const plan = adaptFullscreenDirectorResponseV2(
        lyrics,
        track.trackID,
        payload.lyricsHash,
        raw,
        "ai",
      ) ?? adaptFullscreenDirectorResponseV1(
        lyrics,
        track.trackID,
        payload.lyricsHash,
        raw,
        "ai",
      );
      if (!plan) return directorError("导演响应未通过本地合同");
      await saveDirectorPlanCache(track, lyrics, plan);
      return { type: "director-resolution-v1", status: "ready", source: "network", plan };
    } catch (error) {
      return directorError(error instanceof Error ? error.message : "导演服务不可用");
    } finally {
      clearTimeout(timeout);
      directorLookupTasks.delete(fingerprint);
    }
  })();
  directorLookupTasks.set(fingerprint, task);
  return task;
};

const bridgeState = (): YouTubeMusicBridgeStateV0 => sourceRegistry.state();

const broadcast = (message: unknown) => {
  stagePorts.forEach((port) => {
    try {
      port.postMessage(message);
    } catch {
      stagePorts.delete(port);
    }
  });
};

const clearSource = () => {
  broadcast(bridgeState());
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

const captureClock = () => {
  const snapshot = sourceRegistry.snapshot;
  if (!snapshot) return undefined;
  return {
    currentTimeMs: snapshot.playback.currentTimeMs,
    playbackRate: snapshot.playback.playbackRate,
    state: snapshot.playback.state,
  };
};

const stopAudioAnalysis = async (trackID?: string): Promise<void> => {
  if (trackID && audioCapture?.trackID !== trackID) return;
  audioCapture = undefined;
  await chromeAPI.runtime.sendMessage({ type: "lyricstage-audio-capture-stop" }).catch(() => undefined);
  broadcast({ type: "youtube-music-audio-analysis-status", status: "idle" });
};

const startAudioAnalysis = async (trackID: string, durationMs: number): Promise<void> => {
  const snapshot = sourceRegistry.snapshot;
  const tabID = sourceRegistry.sourceTabID;
  if (!snapshot || tabID === undefined || snapshot.track.trackID !== trackID) throw new Error("source-not-ready");
  const boundedDuration = Math.round(Math.min(7_200_000, Math.max(1, durationMs)));
  await ensureOffscreenDocument();
  const streamID = await chromeAPI.tabCapture.getMediaStreamId({ targetTabId: tabID });
  const clock = captureClock();
  if (!clock) throw new Error("clock-not-ready");
  audioCapture = { trackID, tabID, durationMs: boundedDuration, mapForwarded: false };
  await chromeAPI.runtime.sendMessage({
    type: "lyricstage-audio-capture-start",
    streamID,
    trackID,
    durationMs: boundedDuration,
    clock,
  });
  broadcast({ type: "youtube-music-audio-analysis-status", status: "analyzing", trackID });
};

const startSourceLeaseMonitor = () => {
  if (sourceLeaseTimer !== undefined) return;
  sourceLeaseTimer = setInterval(() => {
    if (sourceRegistry.expire()) clearSource();
  }, 1000);
};

const stopSourceLeaseMonitorIfIdle = () => {
  if (stagePorts.size > 0 || sourceLeaseTimer === undefined) return;
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

const seekInYouTubeMusic = async (timeMs: number): Promise<StageActivationResponse> => {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    return { ok: false, reason: "invalid-seek" };
  }
  if (sourceRegistry.expire()) clearSource();
  const tabID = sourceRegistry.sourceTabID;
  if (tabID === undefined) return { ok: false, reason: "source-not-ready" };
  try {
    const response = await chromeAPI.tabs.sendMessage(tabID, {
      type: "youtube-music-seek-to",
      timeMs,
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
): Promise<StageActivationResponse> => {
  if (sourceRegistry.expire()) clearSource();
  const tabID = sourceRegistry.sourceTabID;
  if (tabID === undefined) return { ok: false, reason: "source-not-ready" };
  try {
    const response = await chromeAPI.tabs.sendMessage(tabID, {
      type: "youtube-music-transport-command",
      action,
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
  stagePorts.add(port);
  startSourceLeaseMonitor();
  port.postMessage(bridgeState());
  port.onMessage.addListener((message) => {
    if ((message as { type?: string })?.type === "youtube-music-request-status") {
      port.postMessage(bridgeState());
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
    query?: unknown;
    musicMap?: unknown;
    vocalTimingMap?: unknown;
    trackID?: unknown;
    durationMs?: unknown;
    reason?: unknown;
  };
  const fromOffscreen = sender.url === chromeAPI.runtime.getURL("offscreen.html");
  if (request.type === "youtube-music-source-snapshot") {
    if (!sourceRegistry.accept(sender.tab?.id, request.snapshot)) {
      sendResponse({ ok: false });
      return;
    }
    broadcast({ type: "youtube-music-bridge-update", snapshot: sourceRegistry.snapshot! });
    const activeCapture = audioCapture;
    if (activeCapture && activeCapture.trackID === sourceRegistry.snapshot?.track.trackID) {
      const clock = captureClock();
      if (clock) void chromeAPI.runtime.sendMessage({
        type: "lyricstage-audio-clock",
        trackID: activeCapture.trackID,
        clock,
      }).catch(() => undefined);
    } else if (audioCapture) {
      void stopAudioAnalysis();
    }
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "youtube-music-source-disconnect") {
    const tabID = sender.tab?.id;
    sendResponse({ ok: tabID !== undefined && sourceRegistry.remove(tabID) });
    if (tabID !== undefined) clearSource();
    return;
  }

  if (request.type === "youtube-music-request-status") {
    sendResponse(bridgeState());
    return;
  }

  if (request.type === "youtube-music-start-audio-analysis") {
    if (typeof request.trackID !== "string" || typeof request.durationMs !== "number" || !Number.isFinite(request.durationMs)) {
      sendResponse({ ok: false, reason: "invalid-audio-analysis-request" });
      return;
    }
    void startAudioAnalysis(request.trackID, request.durationMs).then(
      () => sendResponse({ ok: true }),
      (error) => {
        const rawReason = error instanceof Error ? error.message.slice(0, 160) : "capture-failed";
        const needsInvocation = rawReason.includes("has not been invoked") || rawReason.includes("activeTab");
        const reason = needsInvocation
          ? "请在 15 秒内点击浏览器工具栏的 LyricStage 图标完成一次音频授权"
          : rawReason;
        if (needsInvocation && typeof request.trackID === "string" && typeof request.durationMs === "number") {
          pendingAudioCapture = {
            trackID: request.trackID,
            durationMs: request.durationMs,
            expiresAtUnixMs: Date.now() + 15_000,
          };
        }
        broadcast({ type: "youtube-music-audio-analysis-status", status: "error", trackID: request.trackID, reason });
        sendResponse({ ok: false, reason });
      },
    );
    return true;
  }

  if (request.type === "youtube-music-resume-pending-audio-analysis") {
    const pending = pendingAudioCapture;
    pendingAudioCapture = undefined;
    if (!pending || pending.expiresAtUnixMs < Date.now()) {
      sendResponse({ ok: false, pending: false });
      return;
    }
    void startAudioAnalysis(pending.trackID, pending.durationMs).then(
      () => sendResponse({ ok: true, pending: true }),
      (error) => {
        const reason = error instanceof Error ? error.message.slice(0, 160) : "capture-failed";
        broadcast({ type: "youtube-music-audio-analysis-status", status: "error", trackID: pending.trackID, reason });
        sendResponse({ ok: false, pending: true, reason });
      },
    );
    return true;
  }

  if (request.type === "youtube-music-stop-audio-analysis") {
    void stopAudioAnalysis(typeof request.trackID === "string" ? request.trackID : undefined).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }

  if (request.type === "lyricstage-audio-capture-ready") {
    if (!fromOffscreen || typeof request.trackID !== "string" || request.trackID !== audioCapture?.trackID) return;
    broadcast({ type: "youtube-music-audio-analysis-status", status: "analyzing", trackID: request.trackID });
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "lyricstage-audio-capture-error") {
    if (!fromOffscreen || typeof request.trackID !== "string" || request.trackID !== audioCapture?.trackID) return;
    audioCapture = undefined;
    broadcast({
      type: "youtube-music-audio-analysis-status",
      status: "error",
      trackID: request.trackID,
      reason: typeof request.reason === "string" ? request.reason.slice(0, 160) : "capture-failed",
    });
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "lyricstage-audio-map-update") {
    const musicMap = sanitizeMusicMapV1(request.musicMap);
    if (!fromOffscreen || !musicMap || typeof request.trackID !== "string" || request.trackID !== audioCapture?.trackID) return;
    const coverageReady = musicMap.analyzedMs >= Math.min(28_000, Math.max(8_000, musicMap.durationMs * 0.08));
    if (coverageReady && audioCapture && !audioCapture.mapForwarded) {
      audioCapture.mapForwarded = true;
      broadcast({ type: "youtube-music-music-map-update", trackID: request.trackID, musicMap });
      broadcast({ type: "youtube-music-audio-analysis-status", status: "ready", trackID: request.trackID });
    }
    sendResponse({ ok: true });
    return;
  }

  if (request.type === "lyricstage-vocal-timing-update") {
    const vocalTimingMap = sanitizeVocalTimingMapV1(request.vocalTimingMap);
    if (
      !fromOffscreen
      || !vocalTimingMap
      || typeof request.trackID !== "string"
      || request.trackID !== audioCapture?.trackID
    ) return;
    broadcast({ type: "youtube-music-vocal-timing-update", trackID: request.trackID, vocalTimingMap });
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
    void directorConfiguration().then((configuration) => sendResponse({
      configured: configuration !== undefined,
      endpoint: directorEndpoint,
    }), () => sendResponse({ configured: false, endpoint: directorEndpoint }));
    return true;
  }

  if (request.type === "youtube-music-save-director-config") {
    void saveDirectorConfiguration(request.token).then(
      (result) => sendResponse({ ...result, endpoint: directorEndpoint }),
      (error) => sendResponse({
        configured: false,
        endpoint: directorEndpoint,
        reason: error instanceof Error ? error.message.slice(0, 120) : "导演配置失败",
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
    if (typeof request.timeMs !== "number") {
      sendResponse({ ok: false, reason: "invalid-seek" });
      return;
    }
    void seekInYouTubeMusic(request.timeMs).then(sendResponse, () => sendResponse({
      ok: false,
      reason: "seek-failed",
    }));
    return true;
  }

  if (request.type === "youtube-music-transport") {
    if (!["play", "pause", "previous", "next"].includes(String(request.action))) {
      sendResponse({ ok: false, reason: "invalid-transport" });
      return;
    }
    void transportInYouTubeMusic(request.action as YouTubeMusicTransportActionV0).then(
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
  if (sourceRegistry.remove(tabID)) clearSource();
});

chromeAPI.tabs.onUpdated.addListener((tabID, change) => {
  if (
    tabID === sourceRegistry.sourceTabID &&
    change.url !== undefined &&
    !change.url.startsWith("https://music.youtube.com/")
  ) {
    sourceRegistry.remove(tabID);
    clearSource();
  }
});
