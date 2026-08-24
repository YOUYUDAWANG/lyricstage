import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { layeredLyricsLookupTimeoutMilliseconds } from "@lyricstage/lyrics";
import {
  advanceRollingPerformanceStateV1,
  checkpointRollingPerformanceStateV1,
  compileLocalDirectorBibleV1,
  compileLocalSceneCardsV1,
  initialRollingPerformanceStateV1,
  rollingPerformanceStateIdentityV1,
} from "@lyricstage/performance";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const flush = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

const snapshot = (
  trackID: string,
  state: "playing" | "paused" | "buffering" | "ended",
  sequence = 1,
) => ({
  type: "youtube-music-snapshot",
  version: "youtube-music-companion-v0",
  sequence,
  sentAtUnixMs: 1_000 + sequence,
  track: {
    provider: "youtubeMusic",
    trackID,
    title: `Title ${trackID}`,
    artist: `Artist ${trackID}`,
    pageURL: `https://music.youtube.com/watch?v=${trackID}`,
  },
  playback: {
    currentTimeMs: sequence * 1_000,
    durationMs: 180_000,
    playbackRate: 1,
    state,
  },
  controls: { seek: true, playPause: true, previous: true, next: true },
});

const musicMap = (analyzedMs = 30_000) => ({
  version: "music-map-v1",
  source: "tab-capture",
  durationMs: 180_000,
  analyzedMs,
  featureRateHz: 30,
  tempo: null,
  summary: { dynamicRange: 0.5, meanEnergy: 0.4, peakEnergy: 0.8, silenceRatio: 0.1 },
  segments: [],
  landmarks: [],
});

const vocalMap = () => ({
  version: "vocal-timing-map-v1",
  source: "tab-capture",
  durationMs: 180_000,
  fromMs: 1_000,
  toMs: 1_000,
  featureRateHz: 20,
  samples: [{ atMs: 1_000, presence: 0.7, attack: 0.5, confidence: 0.8 }],
});

const rollingTrack = () => ({
  provider: "youtubeMusic" as const,
  trackID: "rolling-track",
  title: "Rolling fixture",
  artist: "Fixture artist",
  durationMs: lyricFixtures.longSongStructure.durationMs,
});

const rollingLyrics = () => ({
  ...lyricFixtures.longSongStructure,
  recordingID: "youtubeMusic:rolling-track",
});

interface RuntimeSender {
  tab?: { id?: number; url?: string };
  url?: string;
}

interface FakePort {
  name: string;
  sender?: RuntimeSender;
  postMessage: ReturnType<typeof vi.fn>;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  emitMessage(message: unknown): void;
  disconnect(): void;
}

describe("YouTube Music background routing", () => {
  let onRuntimeMessage: ((message: unknown, sender: RuntimeSender, respond: (value: unknown) => void) => boolean | void) | undefined;
  let onConnect: ((port: FakePort) => void) | undefined;
  let onTabRemoved: ((tabID: number) => void) | undefined;
  let onTabUpdated: ((tabID: number, change: { url?: string }) => void) | undefined;
  let tabsSendMessage: ReturnType<typeof vi.fn>;
  let tabCapture: ReturnType<typeof vi.fn>;
  let runtimeSendMessage: ReturnType<typeof vi.fn>;
  let offscreenCloseDocument: ReturnType<typeof vi.fn>;
  let storage: Map<string, unknown>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    tabsSendMessage = vi.fn().mockResolvedValue({ ok: true });
    tabCapture = vi.fn().mockResolvedValue("stream-id");
    offscreenCloseDocument = vi.fn().mockResolvedValue(undefined);
    runtimeSendMessage = vi.fn().mockImplementation(async (message: Record<string, unknown>) =>
      message.type === "lyricstage-audio-capture-status-request"
        ? { type: "lyricstage-audio-capture-status", active: false }
        : { ok: true });
    storage = new Map<string, unknown>();
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          getURL: (path: string) => `chrome-extension://fixture/${path}`,
          sendMessage: runtimeSendMessage,
          getContexts: vi.fn().mockResolvedValue([{ type: "OFFSCREEN_DOCUMENT" }]),
          onConnect: { addListener: (listener: (port: FakePort) => void) => { onConnect = listener; } },
          onMessage: {
            addListener: (listener: typeof onRuntimeMessage) => { onRuntimeMessage = listener; },
          },
        },
        offscreen: {
          createDocument: vi.fn().mockResolvedValue(undefined),
          closeDocument: offscreenCloseDocument,
        },
        tabCapture: { getMediaStreamId: tabCapture },
        tabs: {
          create: vi.fn().mockResolvedValue({ id: 99 }),
          query: vi.fn().mockResolvedValue([]),
          sendMessage: tabsSendMessage,
          update: vi.fn().mockResolvedValue({}),
          onRemoved: { addListener: (listener: (tabID: number) => void) => { onTabRemoved = listener; } },
          onUpdated: {
            addListener: (listener: (tabID: number, change: { url?: string }) => void) => {
              onTabUpdated = listener;
            },
          },
        },
        storage: {
          local: {
            get: vi.fn(async (key: string) => ({ [key]: storage.get(key) })),
            set: vi.fn(async (values: Record<string, unknown>) => {
              Object.entries(values).forEach(([key, value]) => storage.set(key, value));
            }),
          },
        },
      },
    });
    await import("./background");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "chrome");
    onRuntimeMessage = undefined;
    onConnect = undefined;
    onTabRemoved = undefined;
    onTabUpdated = undefined;
  });

  const sender = (tabID: number, runtimeURL = `https://music.youtube.com/watch?v=tab-${tabID}`): RuntimeSender => ({
    tab: { id: tabID, url: `https://music.youtube.com/watch?v=tab-${tabID}` },
    url: runtimeURL,
  });

  const offscreenSender = (): RuntimeSender => ({ url: "chrome-extension://fixture/offscreen.html" });

  const send = async (message: unknown, from: RuntimeSender) => {
    let response: unknown;
    const request = message as Record<string, unknown>;
    const start = from.url === "chrome-extension://fixture/offscreen.html" && typeof request.captureID === "string"
      ? backgroundMessagesOfType("lyricstage-audio-capture-start")
        .find((candidate) => candidate.captureID === request.captureID)
      : undefined;
    const delivered = start
      ? {
          ...request,
          tabID: request.tabID ?? start.tabID,
          generation: request.generation ?? start.generation,
          ownerScope: request.ownerScope ?? start.ownerScope,
        }
      : message;
    const keepAlive = onRuntimeMessage?.(delivered, from, (value) => { response = value; });
    await flush();
    return { response, keepAlive };
  };

  const sendResolved = (message: unknown, from: RuntimeSender): Promise<any> => new Promise((resolve) => {
    onRuntimeMessage?.(message, from, resolve);
  });

  const makePort = (from?: RuntimeSender): FakePort => {
    let messageListener: ((message: unknown) => void) | undefined;
    let disconnectListener: (() => void) | undefined;
    return {
      name: "lyricstage-stage",
      sender: from,
      postMessage: vi.fn(),
      onMessage: { addListener: (listener) => { messageListener = listener; } },
      onDisconnect: { addListener: (listener) => { disconnectListener = listener; } },
      emitMessage: (message) => messageListener?.(message),
      disconnect: () => disconnectListener?.(),
    };
  };

  const messagesOfType = (port: FakePort, type: string) => port.postMessage.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter((message) => message.type === type);

  const backgroundMessagesOfType = (type: string) => runtimeSendMessage.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter((message) => message.type === type);

  it("does not reuse a private lyrics token for a different endpoint", async () => {
    const first = await send({
      type: "youtube-music-save-private-lyrics-config",
      endpoint: "https://lyrics-one.example/api",
      token: "secret-one",
    }, sender(10));
    expect(first.response).toEqual({ configured: true, endpoint: "https://lyrics-one.example/api" });

    const changed = await send({
      type: "youtube-music-save-private-lyrics-config",
      endpoint: "https://lyrics-two.example/api",
      token: "",
    }, sender(10));
    expect(changed.response).toMatchObject({
      configured: false,
      endpoint: "https://lyrics-two.example/api",
      reason: "请输入歌词后端令牌",
    });
    expect(storage.get("lyricstage-private-lyrics-backend-v0")).toEqual({
      endpoint: "https://lyrics-one.example/api",
      token: "secret-one",
    });
  });

  it("rejects an unsafe private lyrics endpoint in the background", async () => {
    const result = await send({
      type: "youtube-music-save-private-lyrics-config",
      endpoint: "http://public-host.example/api",
      token: "secret",
    }, sender(10));
    expect(result.response).toMatchObject({ configured: false, reason: "歌词后端地址无效" });
    expect(storage.get("lyricstage-private-lyrics-backend-v0")).toBeUndefined();
  });

  it("surfaces configuration storage failures instead of pretending configuration is empty", async () => {
    const get = (globalThis as any).chrome.storage.local.get as ReturnType<typeof vi.fn>;
    get.mockRejectedValue(new Error("storage unavailable"));

    await expect(sendResolved({ type: "youtube-music-private-lyrics-config" }, sender(10))).resolves.toEqual({
      configured: false,
      endpoint: "",
      reason: "读取歌词配置失败，请重试",
    });
    await expect(sendResolved({ type: "youtube-music-director-config" }, sender(10))).resolves.toMatchObject({
      configured: false,
      reason: "读取 AI 导演配置失败，请重试",
    });
  });

  it("returns a network match when cache reads and writes reject", async () => {
    const track = {
      provider: "youtubeMusic" as const,
      trackID: "lyrics-storage-failure",
      title: "始まりの合図",
      artist: "佐藤史果",
      durationMs: 240_000,
    };
    const get = (globalThis as any).chrome.storage.local.get as ReturnType<typeof vi.fn>;
    const set = (globalThis as any).chrome.storage.local.set as ReturnType<typeof vi.fn>;
    get.mockImplementation(async (key: string) => {
      if (key === "lyricstage-local-lyrics-v0" || key === "lyricstage-youtube-music-lyrics-v10") {
        throw new Error("storage get unavailable");
      }
      return { [key]: storage.get(key) };
    });
    set.mockRejectedValue(new Error("storage set unavailable"));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "sponsor.ajay.app") return new Response("", { status: 404 });
      if (url.hostname === "lrclib.net" && url.pathname === "/api/get") {
        return new Response(JSON.stringify({
          id: 1,
          trackName: track.title,
          artistName: track.artist,
          duration: 240,
          syncedLyrics: "[00:01.00]test",
        }), { status: 200 });
      }
      throw new Error(`unexpected request: ${url.href}`);
    }));

    const response = await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10));
    expect(response).toMatchObject({
      status: "match",
      source: "network",
      match: { provider: "lrclib", id: "1" },
    });
  });

  it("releases a stalled automatic single-flight after the total lyrics deadline", async () => {
    const track = {
      provider: "youtubeMusic" as const,
      trackID: "lyrics-stalled-single-flight",
      title: "始まりの合図",
      artist: "佐藤史果",
      durationMs: 240_000,
    };
    let phase: "stalled" | "ready" = "stalled";
    vi.stubGlobal("crypto", {
      ...globalThis.crypto,
      subtle: { digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)) },
    });
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      if (url.hostname === "sponsor.ajay.app") return Promise.resolve(new Response("", { status: 404 }));
      if (phase === "ready" && url.hostname === "lrclib.net" && url.pathname === "/api/get") {
        return Promise.resolve(new Response(JSON.stringify({
          id: 11,
          trackName: track.title,
          artistName: track.artist,
          duration: 240,
          syncedLyrics: "[00:01.00]recovered",
        }), { status: 200 }));
      }
      return new Promise((_resolve, reject) => init?.signal?.addEventListener(
        "abort", () => reject(init.signal?.reason), { once: true },
      ));
    });
    vi.stubGlobal("fetch", fetcher);

    const stalled = sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10));
    await flush();
    await vi.advanceTimersByTimeAsync(layeredLyricsLookupTimeoutMilliseconds);
    expect(await stalled).toMatchObject({ status: "error", message: "歌词搜索超时" });

    phase = "ready";
    expect(await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10)))
      .toMatchObject({ status: "match", source: "network", match: { id: "11" } });
  });

  it("uses BYOK metadata assistance before asking the user to search lyrics manually", async () => {
    const track = {
      provider: "youtubeMusic" as const,
      trackID: "lyrics-ai-assisted",
      title: "【歌ってみた】泥中に咲く / covered by 星乃めあ",
      artist: "星乃めあ",
      durationMs: 290_000,
    };
    storage.set("lyricstage-director-byok-v1", {
      version: "lyricstage-director-byok-v1",
      primary: {
        protocol: "openai-compatible",
        endpoint: "https://provider.test/v1",
        model: "fixture-model",
        apiKey: "fixture-key",
      },
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "sponsor.ajay.app") return new Response("", { status: 404 });
      if (url.hostname === "lrclib.net" && url.pathname === "/api/get") {
        return new Response("", { status: 404 });
      }
      if (url.hostname === "lrclib.net" && url.pathname === "/api/search") {
        return new Response(JSON.stringify([{
          id: 41,
          trackName: "泥中に咲く",
          artistName: "ウォルピスカーター",
          duration: 290,
          syncedLyrics: "[00:01.00]assisted",
        }]), { status: 200 });
      }
      if (url.hostname === "lyrics.kugou.com") {
        return new Response(JSON.stringify({ status: 200, candidates: [] }), { status: 200 });
      }
      if (url.hostname === "provider.test" && url.pathname === "/v1/chat/completions") {
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          version: "lyricstage-lyrics-lookup-assist-v1",
          trackID: track.trackID,
          canonicalTitle: "泥中に咲く",
          titleAliases: [],
          recordingArtists: ["星乃めあ"],
          originalArtists: ["ウォルピスカーター"],
          isCover: true,
          preferredCandidate: { provider: "lrclib", id: "41" },
          confidence: 0.94,
        }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`unexpected request: ${url.href}`);
    }));

    const response = await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10));
    expect(response).toMatchObject({
      status: "match",
      assistance: "ai",
      matchKind: "originalFallback",
      match: { provider: "lrclib", id: "41" },
    });
  });

  it("progressively evicts older lyrics entries after a quota rejection", async () => {
    const track = {
      provider: "youtubeMusic" as const,
      trackID: "lyrics-quota-new",
      title: "始まりの合図",
      artist: "佐藤史果",
      durationMs: 240_000,
    };
    const now = Date.now();
    storage.set("lyricstage-youtube-music-lyrics-v10", Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [`old-${index}`, {
        fingerprint: `old-${index}`,
        expiresAtUnixMs: now + 60_000,
        updatedAtUnixMs: now - index - 1,
        response: {
          type: "lyrics-lookup-result",
          version: "lyrics-lookup-v0",
          trackID: `old-${index}`,
          status: "miss",
          source: "network",
          candidates: [],
        },
      }]),
    ));
    const set = (globalThis as any).chrome.storage.local.set as ReturnType<typeof vi.fn>;
    let rejected = false;
    set.mockImplementation(async (values: Record<string, unknown>) => {
      if (!rejected && values["lyricstage-youtube-music-lyrics-v10"]) {
        rejected = true;
        throw Object.assign(new Error("QUOTA_BYTES quota exceeded"), { name: "QuotaExceededError" });
      }
      Object.entries(values).forEach(([key, value]) => storage.set(key, value));
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "sponsor.ajay.app") return new Response("", { status: 404 });
      if (url.hostname === "lrclib.net" && url.pathname === "/api/get") {
        return new Response(JSON.stringify({
          id: 2,
          trackName: track.title,
          artistName: track.artist,
          duration: 240,
          syncedLyrics: "[00:01.00]quota",
        }), { status: 200 });
      }
      throw new Error(`unexpected request: ${url.href}`);
    }));

    const response = await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10));
    expect(response).toMatchObject({ status: "match", source: "network" });
    expect(set).toHaveBeenCalledTimes(2);
    const firstRecord = set.mock.calls[0]?.[0]["lyricstage-youtube-music-lyrics-v10"] as Record<string, unknown>;
    const secondRecord = set.mock.calls[1]?.[0]["lyricstage-youtube-music-lyrics-v10"] as Record<string, unknown>;
    expect(Object.keys(secondRecord).length).toBeLessThan(Object.keys(firstRecord).length);
    expect(secondRecord[track.trackID]).toBeDefined();
  });

  it("preserves an automatic match across a manual miss and worker reload", async () => {
    const track = {
      provider: "youtubeMusic" as const,
      trackID: "lyrics-manual-miss",
      title: "始まりの合図",
      artist: "佐藤史果",
      durationMs: 240_000,
    };
    let phase: "match" | "miss" | "offline" = "match";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (phase === "offline") throw new Error(`unexpected network after reload: ${url.href}`);
      if (url.hostname === "sponsor.ajay.app") return new Response("", { status: 404 });
      if (url.hostname === "lrclib.net") {
        if (url.pathname === "/api/get") {
          return phase === "match"
            ? new Response(JSON.stringify({
                id: 3,
                trackName: track.title,
                artistName: track.artist,
                duration: 240,
                syncedLyrics: "[00:01.00]automatic",
              }), { status: 200 })
            : new Response("", { status: 404 });
        }
        return new Response("[]", { status: 200 });
      }
      if (url.hostname === "mobilecdn.kugou.com") {
        return new Response(JSON.stringify({ data: { info: [] } }), { status: 200 });
      }
      throw new Error(`unexpected request: ${url.href}`);
    });
    vi.stubGlobal("fetch", fetcher);

    expect(await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10)))
      .toMatchObject({ status: "match", match: { id: "3" } });
    const formalBefore = structuredClone(
      (storage.get("lyricstage-youtube-music-lyrics-v10") as Record<string, unknown>)[track.trackID],
    );
    phase = "miss";
    expect(await sendResolved({
      type: "youtube-music-search-lyrics",
      track,
      query: { title: "不存在的歌曲", artist: "无人" },
    }, sender(10))).toMatchObject({ status: "miss", candidates: [] });
    expect((storage.get("lyricstage-youtube-music-lyrics-v10") as Record<string, unknown>)[track.trackID])
      .toEqual(formalBefore);

    phase = "offline";
    vi.resetModules();
    await import("./background");
    expect(await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10)))
      .toMatchObject({ status: "match", source: "cache", match: { id: "3" } });
  });

  it("keeps manual candidates separate until the user selects one", async () => {
    const track = {
      provider: "youtubeMusic" as const,
      trackID: "lyrics-manual-select",
      title: "Original",
      artist: "Original Artist",
      durationMs: 240_000,
    };
    let phase: "automatic" | "manual" | "offline" = "automatic";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (phase === "offline") throw new Error(`unexpected network after reload: ${url.href}`);
      if (url.hostname === "sponsor.ajay.app") return new Response("", { status: 404 });
      if (url.hostname === "lrclib.net" && url.pathname === "/api/get") {
        const manual = phase === "manual";
        return new Response(JSON.stringify({
          id: manual ? 5 : 4,
          trackName: manual ? "Replacement" : track.title,
          artistName: manual ? "Replacement Artist" : track.artist,
          duration: 240,
          syncedLyrics: manual ? "[00:01.00]replacement" : "[00:01.00]original",
        }), { status: 200 });
      }
      throw new Error(`unexpected request: ${url.href}`);
    }));

    expect(await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10)))
      .toMatchObject({ status: "match", match: { id: "4" } });
    phase = "manual";
    const manual = await sendResolved({
      type: "youtube-music-search-lyrics",
      track,
      query: { title: "Replacement", artist: "Replacement Artist" },
    }, sender(10));
    expect(manual).toMatchObject({ status: "candidates", candidates: [{ id: "5" }] });

    phase = "offline";
    vi.resetModules();
    await import("./background");
    expect(await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10)))
      .toMatchObject({ status: "match", source: "cache", match: { id: "4" } });
    expect(await sendResolved({
      type: "youtube-music-accept-lyrics",
      track,
      candidate: manual.candidates[0],
    }, sender(10))).toEqual({ ok: true });

    vi.resetModules();
    await import("./background");
    expect(await sendResolved({ type: "youtube-music-resolve-lyrics", track }, sender(10)))
      .toMatchObject({ status: "match", source: "cache", match: { id: "5" } });
  });

  it("keeps a provider key when only the model changes on the same API", async () => {
    const first = await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: {
          protocol: "openai-responses",
          endpoint: "https://api.openai.com/v1",
          model: "gpt-5",
          apiKey: "sk-secret",
        },
      },
    }, sender(10));
    expect(first.response).toMatchObject({ configured: true, primary: { model: "gpt-5", hasApiKey: true } });

    const changed = await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: {
          protocol: "openai-responses",
          endpoint: "https://api.openai.com/v1",
          model: "gpt-5.1",
          apiKey: "",
        },
      },
    }, sender(10));
    expect(changed.response).toMatchObject({ configured: true, primary: { model: "gpt-5.1", hasApiKey: true } });
    expect(storage.get("lyricstage-director-byok-v1")).toMatchObject({
      primary: { model: "gpt-5.1", apiKey: "sk-secret" },
    });
  });

  it("caches rolling Bible and two independent Scene Pack fills with zero-attempt hits", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const localCards = compileLocalSceneCardsV1(lyrics, bible);
    const ordinary = localCards.filter((card) => !card.signatureMoment);
    expect(ordinary.length).toBeGreaterThanOrEqual(2);
    const sceneResponses = [ordinary[0]!, ordinary.find((card) => card.fromLineIndex >= 4)!];
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as any;
      const prompt = payload.input?.[0]?.content?.[0]?.text
        ? JSON.parse(payload.input[0].content[0].text) as any
        : undefined;
      const output = payload.instructions?.includes("whole-song constitution")
        ? bible
        : {
            version: "window-intent-v2",
            bibleIdentity: prompt?.bible?.bibleIdentity,
            entryStateHash: prompt?.state?.stateHash,
            fromLineIndex: prompt?.window?.fromLineIndex,
            toLineIndex: prompt?.window?.toLineIndex,
            spatialIntent: "hold",
            coverRole: "anchor",
            arcIntent: "hold",
            cues: [],
          };
      return new Response(JSON.stringify({ output_text: JSON.stringify(output) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);

    const bibleMiss = await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    const bibleHit = await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    expect(bibleMiss).toMatchObject({ status: "ready", source: "network", bible: { bibleIdentity: bible.bibleIdentity } });
    expect(bibleHit).toMatchObject({ status: "ready", source: "cache", timing: { attempts: 0 } });

    const first = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: sceneResponses[0]!.fromMs + 1, desiredHorizonMs: 60_000,
    }, sender(10));
    const firstHit = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: sceneResponses[0]!.fromMs + 1, desiredHorizonMs: 60_000,
    }, sender(10));
    const stateAfterA = first.cards.reduce(
      (state: any, card: any) => advanceRollingPerformanceStateV1(state, card),
      initialRollingPerformanceStateV1(bible),
    );
    const second = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: sceneResponses[1]!.fromMs + 1, desiredHorizonMs: 60_000, seekTargetMs: sceneResponses[1]!.fromMs + 1,
      state: stateAfterA,
    }, sender(10));
    expect(first).toMatchObject({ status: "ready", source: "network", coverage: { activation: "next-boundary" } });
    expect(firstHit).toMatchObject({ status: "ready", source: "cache", timing: { attempts: 0 } });
    expect(second).toMatchObject({ status: "ready", source: "network" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(storage.has("lyricstage-director-bible-cache-v1")).toBe(true);
    expect(storage.has("lyricstage-director-scene-cache-v1")).toBe(true);
    const positiveSceneCache = storage.get("lyricstage-director-scene-cache-v1") as Record<string, any>;
    expect(Object.values(positiveSceneCache)).not.toHaveLength(0);
    expect(Object.values(positiveSceneCache).every((entry) =>
      entry.provenance === "ai-positive" && entry.schemaVersion === "perceptual-stage-v2")).toBe(true);
    const stored = JSON.stringify({
      bible: storage.get("lyricstage-director-bible-cache-v1"),
      scenes: storage.get("lyricstage-director-scene-cache-v1"),
    });
    expect(stored).not.toContain("rolling-secret");
    expect(stored).not.toContain("api.openai.com");

    const identities = second.cards.map((card: any) => card.sceneID);
    const callsBeforeRestart = fetcher.mock.calls.length;
    vi.resetModules();
    await import("./background");
    const afterRestart = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: sceneResponses[1]!.fromMs + 1, desiredHorizonMs: 60_000, seekTargetMs: sceneResponses[1]!.fromMs + 1,
      state: stateAfterA,
    }, sender(10));
    expect(afterRestart).toMatchObject({ status: "ready", source: "cache", timing: { attempts: 0 } });
    expect(afterRestart.cards.map((card: any) => card.sceneID)).toEqual(identities);
    expect(fetcher).toHaveBeenCalledTimes(callsBeforeRestart);

    const review = await sendResolved({ type: "youtube-music-director-cache-summaries-v1" }, sender(10));
    expect(review).toMatchObject({
      type: "director-cache-summaries-v1",
      summaries: [{ version: "director-cache-summary-v1", trackTitle: track.title, trackArtist: track.artist }],
    });
    expect(review.summaries).toHaveLength(1);
    expect(review.summaries[0]).toMatchObject({ compilerVersion: "scene-pack-v2" });
    expect(review.summaries[0].semanticDirectiveCount).toBeGreaterThan(0);
    expect(JSON.stringify(review)).not.toMatch(/rolling-secret|api\.openai\.com|fixture line|rationale|prompt|response|cookie/ui);
    expect(review.summaries[0]).not.toHaveProperty("bible");
    expect(review.summaries[0]).not.toHaveProperty("cards");

    const finalWindowSnapshot = snapshot(track.trackID, "playing", 3);
    finalWindowSnapshot.playback.currentTimeMs = lyrics.durationMs - 1_000;
    finalWindowSnapshot.playback.durationMs = lyrics.durationMs;
    const callsBeforeFinalWindowSnapshot = fetcher.mock.calls.length;
    await send({ type: "youtube-music-source-snapshot", snapshot: finalWindowSnapshot }, sender(10));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(callsBeforeFinalWindowSnapshot);
    const finalWindowReview = await sendResolved({ type: "youtube-music-director-cache-summaries-v1" }, sender(10));
    expect(finalWindowReview.summaries[0]).toMatchObject({ reachedFinalWindow: true });
    expect(finalWindowReview.summaries[0].warnings).toContain("coverage-gap");

    const summaryTemplate = finalWindowReview.summaries[0];
    const originalBibleCache = storage.get("lyricstage-director-bible-cache-v1");
    const originalSceneCache = storage.get("lyricstage-director-scene-cache-v1");
    storage.set("lyricstage-director-scene-cache-v1", {});
    storage.set("lyricstage-director-bible-cache-v1", Object.fromEntries([
      ...Array.from({ length: 105 }, (_, index) => [`review-${index}`, {
        createdAtUnixMs: index + 1,
        expiresAtUnixMs: Date.now() + 10_000,
        summary: {
          ...summaryTemplate,
          trackTitle: `Review ${index}`,
          trackIDDisplay: index.toString(16).padStart(8, "0"),
          createdAtUnixMs: index + 1,
        },
      }]),
      ["invalid", { summary: { version: "director-cache-summary-v1", apiKey: "must-not-pass" } }],
    ]));
    const boundedReview = await sendResolved({ type: "youtube-music-director-cache-summaries-v1" }, sender(10));
    expect(boundedReview.summaries).toHaveLength(100);
    expect(boundedReview.summaries[0].trackTitle).toBe("Review 104");
    expect(JSON.stringify(boundedReview)).not.toContain("must-not-pass");
    storage.set("lyricstage-director-bible-cache-v1", originalBibleCache);
    storage.set("lyricstage-director-scene-cache-v1", originalSceneCache);

    const corruptedSceneCache = structuredClone(storage.get("lyricstage-director-scene-cache-v1")) as Record<string, any>;
    Object.values(corruptedSceneCache).forEach((entry) => {
      if (entry.fromLineIndex === sceneResponses[0]!.fromLineIndex) {
        entry.cards = entry.cards.map((card: any) => ({ ...card, sceneID: `tampered:${card.sceneID}` }));
      }
    });
    storage.set("lyricstage-director-scene-cache-v1", corruptedSceneCache);
    const regenerated = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: sceneResponses[0]!.fromMs + 1, desiredHorizonMs: 60_000,
    }, sender(10));
    expect(regenerated).toMatchObject({ status: "ready", source: "network" });
    expect(fetcher).toHaveBeenCalledTimes(callsBeforeRestart + 1);

    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1_000);
    vi.resetModules();
    await import("./background");
    const expiredBible = await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    expect(expiredBible).toMatchObject({ status: "ready", source: "network" });
    expect(fetcher).toHaveBeenCalledTimes(callsBeforeRestart + 2);
  });

  it("covers three rolling windows without spending retries on untrusted transport echoes", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as any;
      if (payload.instructions?.includes("whole-song constitution")) {
        return new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 });
      }
      const prompt = JSON.parse(payload.input[0].content[0].text) as any;
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        version: "window-intent-v2",
        bibleIdentity: "untrusted-stale-echo",
        entryStateHash: "untrusted-stale-echo",
        fromLineIndex: prompt.window.toLineIndex,
        toLineIndex: prompt.window.fromLineIndex,
        spatialIntent: "hold",
        coverRole: "anchor",
        arcIntent: "hold",
        cues: [],
      }) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10)))
      .toMatchObject({ status: "ready", source: "network" });
    let targetMs = 1;
    for (let windowIndex = 0; windowIndex < 3; windowIndex += 1) {
      const response = await sendResolved({
        type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
        playheadMs: targetMs, desiredHorizonMs: 60_000,
      }, sender(10));
      expect(response).toMatchObject({ status: "ready", source: "network" });
      expect(response.reason ?? "").not.toContain("budget-exhausted");
      targetMs = response.coverage.toMs;
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("falls back after bounded HTTP retries without promoting the local repair to AI-positive cache", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    let bibleReady = false;
    const fetcher = vi.fn(async () => {
      if (!bibleReady) {
        bibleReady = true;
        return new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 });
      }
      return new Response("temporary", { status: 503 });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10)))
      .toMatchObject({ status: "ready" });
    const request = {
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: 80_000, desiredHorizonMs: 60_000,
    };
    const responses = [];
    for (let index = 0; index < 4; index += 1) responses.push(await sendResolved(request, sender(10)));
    expect(responses[0]).toMatchObject({
      status: "ready", source: "local", reason: expect.stringContaining("scene-local-continuity-fallback"),
    });
    expect(responses.slice(1).every((response) => response.status === "ready"
      && response.source === "local" && response.reason.includes("scene-negative-cache"))).toBe(true);
    const localSceneCache = storage.get("lyricstage-director-scene-cache-v1") as Record<string, any> | undefined;
    expect(Object.values(localSceneCache ?? {}).length).toBeGreaterThan(0);
    expect(Object.values(localSceneCache ?? {}).every((entry) => entry.provenance === "local-repair")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("deduplicates one in-flight Bible request and does not restart it for a later MusicMap", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const response = deferred<Response>();
    const fetcher = vi.fn(() => response.promise);
    vi.stubGlobal("fetch", fetcher);
    const firstTask = sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    await flush();
    const secondTask = sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics, musicMap: musicMap() }, sender(10));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    response.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 }));
    const [first, second] = await Promise.all([firstTask, secondTask]);
    expect(first).toMatchObject({ status: "ready", source: "network" });
    expect(second).toMatchObject({ status: "ready", source: "cache", timing: { attempts: 0 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("suppresses a late Bible after configuration changes", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture-a", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const pending = sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    await flush();
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture-b", apiKey: "rolling-secret" },
      },
    }, sender(10));
    response.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 }));
    expect(await pending).toMatchObject({ status: "stale", reason: "stale-generation" });
    expect(storage.get("lyricstage-director-bible-cache-v1")).toBeUndefined();
  });

  it("suppresses a late result after the active track fingerprint changes", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const trackA = rollingTrack();
    const lyricsA = rollingLyrics();
    const bibleA = compileLocalDirectorBibleV1(lyricsA);
    const trackB = { ...trackA, trackID: "rolling-track-b", title: "Rolling fixture B" };
    const lyricsB = { ...lyricsA, recordingID: "youtubeMusic:rolling-track-b" };
    const bibleB = compileLocalDirectorBibleV1(lyricsB);
    const delayedA = deferred<Response>();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? delayedA.promise
        : new Response(JSON.stringify({ output_text: JSON.stringify(bibleB) }), { status: 200 });
    }));
    const pendingA = sendResolved({ type: "youtube-music-resolve-director-bible-v1", track: trackA, lyrics: lyricsA }, sender(10));
    await flush();
    expect(await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track: trackB, lyrics: lyricsB }, sender(10)))
      .toMatchObject({ status: "ready", source: "network" });
    delayedA.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(bibleA) }), { status: 200 }));
    expect(await pendingA).toMatchObject({ status: "stale", reason: "stale-generation" });
    const cache = storage.get("lyricstage-director-bible-cache-v1") as Record<string, unknown>;
    expect(cache[trackB.trackID]).toBeDefined();
    expect(cache[trackA.trackID]).toBeUndefined();
  });

  it("keeps two tabs' rolling generations independent", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const trackA = rollingTrack();
    const lyricsA = rollingLyrics();
    const bibleA = compileLocalDirectorBibleV1(lyricsA);
    const trackB = { ...trackA, trackID: "rolling-other-tab", title: "Other tab fixture" };
    const lyricsB = { ...lyricsA, recordingID: "youtubeMusic:rolling-other-tab" };
    const bibleB = compileLocalDirectorBibleV1(lyricsB);
    const delayedA = deferred<Response>();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      calls += 1;
      return calls === 1
        ? delayedA.promise
        : Promise.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(bibleB) }), { status: 200 }));
    }));

    const pendingA = sendResolved(
      { type: "youtube-music-resolve-director-bible-v1", track: trackA, lyrics: lyricsA },
      sender(10),
    );
    await flush();
    const resultB = await sendResolved(
      { type: "youtube-music-resolve-director-bible-v1", track: trackB, lyrics: lyricsB },
      sender(20),
    );
    delayedA.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(bibleA) }), { status: 200 }));

    expect(resultB).toMatchObject({ status: "ready", source: "network" });
    expect(await pendingA).toMatchObject({ status: "ready", source: "network" });
    expect(calls).toBe(2);
    const cache = storage.get("lyricstage-director-bible-cache-v1") as Record<string, unknown>;
    expect(cache[trackA.trackID]).toBeDefined();
    expect(cache[trackB.trackID]).toBeDefined();
  });

  it("aborts the old provider request when one tab switches tracks", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const trackA = rollingTrack();
    const lyricsA = rollingLyrics();
    const trackB = { ...trackA, trackID: "rolling-next-track", title: "Next track fixture" };
    const lyricsB = { ...lyricsA, recordingID: "youtubeMusic:rolling-next-track" };
    const bibleB = compileLocalDirectorBibleV1(lyricsB);
    let firstSignal: AbortSignal | undefined;
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls > 1) {
        return Promise.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(bibleB) }), { status: 200 }));
      }
      firstSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        firstSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }));

    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot(trackA.trackID, "playing", 1) }, sender(10));

    const pendingA = sendResolved(
      { type: "youtube-music-resolve-director-bible-v1", track: trackA, lyrics: lyricsA },
      sender(10),
    );
    await flush();
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot(trackB.trackID, "playing", 2) }, sender(10));
    const pendingB = sendResolved(
      { type: "youtube-music-resolve-director-bible-v1", track: trackB, lyrics: lyricsB },
      sender(10),
    );

    expect(await pendingB).toMatchObject({ status: "ready", source: "network" });
    expect(await pendingA).toMatchObject({ status: "stale", reason: "stale-generation" });
    expect(firstSignal?.aborted).toBe(true);
    expect(calls).toBe(2);
    const cache = storage.get("lyricstage-director-bible-cache-v1") as Record<string, unknown>;
    expect(cache[trackA.trackID]).toBeUndefined();
    expect(cache[trackB.trackID]).toBeDefined();
  });

  it("aborts an old Scene Pack request without affecting the next track", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const trackA = rollingTrack();
    const lyricsA = rollingLyrics();
    const bibleA = compileLocalDirectorBibleV1(lyricsA);
    const trackB = { ...trackA, trackID: "rolling-scene-next", title: "Scene next fixture" };
    const lyricsB = { ...lyricsA, recordingID: "youtubeMusic:rolling-scene-next" };
    const bibleB = compileLocalDirectorBibleV1(lyricsB);
    let delayedSceneSignal: AbortSignal | undefined;
    let delayNextScene = false;
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as any;
      if (payload.instructions?.includes("whole-song constitution")) {
        const bible = String(init?.body).includes(trackB.trackID) ? bibleB : bibleA;
        return Promise.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 }));
      }
      const prompt = JSON.parse(payload.input[0].content[0].text) as any;
      if (delayNextScene) {
        delayNextScene = false;
        delayedSceneSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          delayedSceneSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ output_text: JSON.stringify({
        version: "window-intent-v2",
        spatialIntent: "hold",
        coverRole: "anchor",
        arcIntent: "hold",
        cues: [],
      }) }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetcher);
    await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track: trackA, lyrics: lyricsA }, sender(10));
    await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track: trackB, lyrics: lyricsB }, sender(20));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot(trackA.trackID, "playing", 1) }, sender(10));
    delayNextScene = true;
    const pendingA = sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track: trackA, lyrics: lyricsA, bible: bibleA,
      playheadMs: 1, desiredHorizonMs: 60_000,
    }, sender(10));
    await flush();
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot(trackB.trackID, "playing", 2) }, sender(10));
    const resultB = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track: trackB, lyrics: lyricsB, bible: bibleB,
      playheadMs: 1, desiredHorizonMs: 60_000,
    }, sender(10));

    expect(delayedSceneSignal?.aborted).toBe(true);
    expect(await pendingA).toMatchObject({ status: "stale", reason: "stale-scene-request" });
    expect(resultB).toMatchObject({ status: "ready", source: "network" });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("supersedes an unsettled Scene Pack immediately when the same track seeks", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const oldScene = deferred<Response>();
    let bibleSignal: AbortSignal | undefined;
    let oldSceneSignal: AbortSignal | undefined;
    const requestedWindows: Array<{ fromLineIndex: number; toLineIndex: number }> = [];
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as any;
      if (payload.instructions?.includes("whole-song constitution")) {
        bibleSignal = init?.signal ?? undefined;
        return Promise.resolve(new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 }));
      }
      const prompt = JSON.parse(payload.input[0].content[0].text) as any;
      requestedWindows.push(prompt.window);
      if (requestedWindows.length === 1) {
        oldSceneSignal = init?.signal ?? undefined;
        return oldScene.promise;
      }
      return Promise.resolve(new Response(JSON.stringify({ output_text: JSON.stringify({
        version: "window-intent-v2",
        spatialIntent: "hold",
        coverRole: "anchor",
        arcIntent: "hold",
        cues: [],
      }) }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetcher);
    await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    const pendingOld = sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: 1, desiredHorizonMs: 60_000,
    }, sender(10));
    await flush();
    const pendingSeek = sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: 1, seekTargetMs: 100_000, desiredHorizonMs: 60_000,
    }, sender(10));
    await flush();

    expect(oldSceneSignal?.aborted).toBe(true);
    expect(bibleSignal?.aborted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(requestedWindows).toHaveLength(2);
    expect(requestedWindows[1]?.fromLineIndex).not.toBe(requestedWindows[0]?.fromLineIndex);
    oldScene.reject(new DOMException("Aborted", "AbortError"));
    expect(await pendingOld).toMatchObject({ status: "stale", reason: "stale-scene-request" });
    expect(await pendingSeek).toMatchObject({ status: "ready", source: "network" });
    const sceneCache = storage.get("lyricstage-director-scene-cache-v1") as Record<string, any>;
    expect(Object.values(sceneCache)).toHaveLength(1);
    expect(Object.values(sceneCache)[0]?.fromLineIndex).toBe(requestedWindows[1]?.fromLineIndex);
  });

  it("does not expand rolling coverage while paused or inside the final 20 seconds", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    fetcher.mockClear();
    const paused = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: 60_000, desiredHorizonMs: 60_000, paused: true,
    }, sender(10));
    const final = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: lyrics.durationMs - 10_000, desiredHorizonMs: 60_000,
    }, sender(10));
    expect(paused).toMatchObject({ status: "unavailable", reason: "paused-no-horizon-expansion" });
    expect(final).toMatchObject({ status: "unavailable", reason: "final-window" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ignores a self-hashed state without provenance and uses a trusted checkpoint", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const requestedStateHashes: string[] = [];
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as any;
      if (payload.instructions?.includes("whole-song constitution")) {
        return new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 });
      }
      const prompt = JSON.parse(payload.input[0].content[0].text) as any;
      requestedStateHashes.push(prompt.state.stateHash);
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        version: "window-intent-v2",
        bibleIdentity: prompt.bible.bibleIdentity,
        entryStateHash: prompt.state.stateHash,
        fromLineIndex: prompt.window.fromLineIndex,
        toLineIndex: prompt.window.toLineIndex,
        spatialIntent: "hold",
        coverRole: "anchor",
        arcIntent: "hold",
        cues: [],
      }) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    const target = 126_001;
    const checkpoint = checkpointRollingPerformanceStateV1(lyrics, bible, 4)!;
    const forgedWithoutHash = { ...checkpoint, unresolvedPromiseIDs: ["forged-promise"], stateHash: "" };
    const forged = { ...forgedWithoutHash, stateHash: rollingPerformanceStateIdentityV1(forgedWithoutHash) };
    fetcher.mockClear();
    const response = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: target, desiredHorizonMs: 60_000, state: forged,
    }, sender(10));
    expect(response).toMatchObject({ status: "ready", source: "network" });
    expect(requestedStateHashes).toHaveLength(1);
    expect(requestedStateHashes[0]).not.toBe(forged.stateHash);
  });

  it("persists local continuity separately from AI-positive cache and retries the next window after the negative TTL", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 })));
    await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    const invalidFetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as any;
      const prompt = JSON.parse(payload.input[0].content[0].text) as any;
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        version: "scene-pack-v1",
        bibleIdentity: prompt.bible.bibleIdentity,
        entryStateHash: prompt.state.stateHash,
        scenes: [{
          fromLineIndex: prompt.window.fromLineIndex,
          toLineIndex: prompt.window.toLineIndex,
          intention: "invalid negative-cache fixture",
        }],
      }) }), { status: 200 });
    });
    vi.stubGlobal("fetch", invalidFetcher);
    const request = {
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: 60_000, desiredHorizonMs: 60_000,
    };
    const fallback = await sendResolved(request, sender(10));
    expect(fallback).toMatchObject({
      status: "ready", source: "local", reason: expect.stringContaining("scene-local-continuity-fallback"),
    });
    const callsAfterFallback = invalidFetcher.mock.calls.length;
    const storedAfterFallback = storage.get("lyricstage-director-scene-cache-v1") as Record<string, any> | undefined;
    expect(Object.values(storedAfterFallback ?? {}).length).toBeGreaterThan(0);
    expect(Object.values(storedAfterFallback ?? {}).every((entry) => entry.provenance === "local-repair")).toBe(true);

    expect(await sendResolved(request, sender(10))).toMatchObject({
      status: "ready", source: "cache",
    });
    expect(invalidFetcher).toHaveBeenCalledTimes(callsAfterFallback);

    vi.setSystemTime(Date.now() + 61_000);
    const nextRequest = {
      ...request,
      playheadMs: Math.max(...fallback.cards.map((card: any) => card.toMs)),
    };
    expect(await sendResolved(nextRequest, sender(10))).toMatchObject({ status: "ready", source: "local" });
    expect(invalidFetcher.mock.calls.length).toBeGreaterThan(callsAfterFallback);
  });

  it("keeps rolling continuity with a valid local card when the provider Scene Pack is invalid", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const track = rollingTrack();
    const lyrics = rollingLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 })));
    await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10));
    const invalidFetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as any;
      const prompt = JSON.parse(payload.input[0].content[0].text) as any;
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        version: "scene-pack-v1",
        bibleIdentity: prompt.bible.bibleIdentity,
        entryStateHash: prompt.state.stateHash,
        scenes: [{ fromLineIndex: prompt.window.fromLineIndex, toLineIndex: prompt.window.toLineIndex, intention: "incomplete" }],
      }) }), { status: 200 });
    });
    vi.stubGlobal("fetch", invalidFetcher);
    const response = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: 60_000, desiredHorizonMs: 60_000,
    }, sender(10));
    expect(response).toMatchObject({
      status: "ready", source: "local", reason: expect.stringContaining("scene-local-continuity-fallback"),
    });
    expect(response.cards.length).toBeGreaterThan(1);
    expect(Object.values((storage.get("lyricstage-director-scene-cache-v1") as Record<string, any> | undefined) ?? {})
      .every((entry) => entry.provenance === "local-repair")).toBe(true);
  });

  it("keeps dense local Scene packs through three provider failures and recovers AI on a later window", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: { protocol: "openai-responses", endpoint: "https://api.openai.com/v1", model: "fixture", apiKey: "rolling-secret" },
      },
    }, sender(10));
    const lyrics = {
      ...rollingLyrics(),
      durationMs: 480_000,
      lines: Array.from({ length: 120 }, (_, lineIndex) => ({
        lineIndex,
        fromMs: lineIndex * 4_000,
        toMs: (lineIndex + 1) * 4_000,
        text: `连续滚动密度验收第 ${lineIndex + 1} 句`,
        voiceRole: lineIndex % 16 >= 12 ? "choir" as const : "lead" as const,
      })),
    };
    const track = { ...rollingTrack(), durationMs: lyrics.durationMs };
    const bible = compileLocalDirectorBibleV1(lyrics);
    let sceneRequest = 0;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as any;
      if (payload.instructions?.includes("whole-song constitution")) {
        return new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 });
      }
      const prompt = JSON.parse(payload.input[0].content[0].text) as any;
      sceneRequest += 1;
      const output = sceneRequest <= 2 || sceneRequest >= 9 ? {
        version: "window-intent-v2",
        spatialIntent: "open",
        coverRole: "portal",
        arcIntent: "lift",
        cues: [],
      } : {
        version: "scene-pack-v1",
        bibleIdentity: prompt.bible.bibleIdentity,
        entryStateHash: prompt.state.stateHash,
        scenes: [{ fromLineIndex: prompt.window.fromLineIndex, toLineIndex: prompt.window.toLineIndex, intention: "invalid later window" }],
      };
      return new Response(JSON.stringify({ output_text: JSON.stringify(output) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await sendResolved({ type: "youtube-music-resolve-director-bible-v1", track, lyrics }, sender(10)))
      .toMatchObject({ status: "ready" });

    let targetMs = 1;
    let priorCards: any[] = [];
    const seenSceneIDs = new Set<string>();
    for (let index = 0; index < 2; index += 1) {
      const response = await sendResolved({
        type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
        playheadMs: targetMs, desiredHorizonMs: 60_000,
      }, sender(10));
      expect(response).toMatchObject({ status: "ready", source: "network" });
      const addedCards = response.cards.filter((card: any) => !seenSceneIDs.has(card.sceneID));
      expect(addedCards.length).toBeGreaterThanOrEqual(4);
      expect(addedCards.length).toBeLessThanOrEqual(6);
      response.cards.forEach((card: any) => seenSceneIDs.add(card.sceneID));
      priorCards = response.cards;
      targetMs = response.coverage.toMs;
    }

    const fallback = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: targetMs, desiredHorizonMs: 60_000,
    }, sender(10));
    expect(fallback).toMatchObject({
      status: "ready",
      source: "local",
      reason: expect.stringContaining("scene-local-continuity-fallback"),
      coverage: { aheadMs: expect.any(Number) },
    });
    expect(fallback.cards.length).toBeGreaterThan(priorCards.length);
    const fallbackAddedCards = fallback.cards.filter((card: any) => !seenSceneIDs.has(card.sceneID));
    expect(fallbackAddedCards.length).toBeGreaterThanOrEqual(4);
    expect(fallbackAddedCards.length).toBeLessThanOrEqual(6);
    expect(fallback.cards.some((card: any) => card.toMs > targetMs)).toBe(true);

    const nextTargetMs = Math.max(...fallback.cards.map((card: any) => card.toMs));
    const nextFallback = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: nextTargetMs, desiredHorizonMs: 60_000,
    }, sender(10));
    expect(nextFallback).toMatchObject({ status: "ready", source: "local" });
    expect(nextFallback.cards.length).toBeGreaterThan(fallback.cards.length);
    const nextAddedCards = nextFallback.cards.filter((card: any) => !fallback.cards.some((prior: any) => prior.sceneID === card.sceneID));
    expect(nextAddedCards.length).toBeGreaterThanOrEqual(4);
    expect(nextAddedCards.length).toBeLessThanOrEqual(6);
    expect(nextFallback.cards.some((card: any) => card.toMs > nextTargetMs)).toBe(true);

    const thirdTargetMs = Math.max(...nextFallback.cards.map((card: any) => card.toMs));
    const thirdFallback = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: thirdTargetMs, desiredHorizonMs: 60_000,
    }, sender(10));
    expect(thirdFallback).toMatchObject({ status: "ready", source: "local" });
    const thirdAddedCards = thirdFallback.cards.filter((card: any) => !nextFallback.cards.some((prior: any) => prior.sceneID === card.sceneID));
    expect(thirdAddedCards.length).toBeGreaterThanOrEqual(4);
    expect(thirdAddedCards.length).toBeLessThanOrEqual(6);

    const recoveryTargetMs = Math.max(...thirdFallback.cards.map((card: any) => card.toMs));
    const recovered = await sendResolved({
      type: "youtube-music-resolve-director-coverage-v1", track, lyrics, bible,
      playheadMs: recoveryTargetMs, desiredHorizonMs: 60_000,
    }, sender(10));
    expect(recovered).toMatchObject({ status: "ready", source: "network" });
    expect(recovered.reason ?? "").not.toContain("budget-exhausted");
    const recoveredCards = recovered.cards.filter((card: any) => !thirdFallback.cards.some((prior: any) => prior.sceneID === card.sceneID));
    expect(recoveredCards.length).toBeGreaterThanOrEqual(4);
    expect(recoveredCards.length).toBeLessThanOrEqual(6);
  });

  it("discovers models with a matching stored provider key without exposing it", async () => {
    await send({
      type: "youtube-music-save-director-config",
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: {
          protocol: "openai-responses",
          endpoint: "https://api.openai.com/v1",
          model: "gpt-5",
          apiKey: "sk-secret",
        },
      },
    }, sender(10));
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-secret");
      return new Response(JSON.stringify({ data: [{ id: "gpt-5", owned_by: "openai" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);

    const response = await send({
      type: "youtube-music-list-director-models",
      slot: "primary",
      provider: {
        protocol: "openai-responses",
        endpoint: "https://api.openai.com/v1",
        apiKey: "",
      },
    }, sender(10));
    expect(response.response).toEqual({
      models: [{ id: "gpt-5", label: "gpt-5", detail: "openai" }],
    });
    expect(JSON.stringify(response.response)).not.toContain("sk-secret");
  });

  it("keeps embedded ports bound to their own YTM tab while standalone follows the authoritative source", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-b", "paused") }, sender(11));

    const portA = makePort(sender(10, "chrome-extension://fixture/stage.html"));
    const portB = makePort(sender(11));
    const standalone = makePort({ url: "chrome-extension://fixture/stage.html" });
    onConnect?.(portA);
    onConnect?.(portB);
    onConnect?.(standalone);

    expect(portA.postMessage.mock.calls.at(-1)?.[0].snapshot.track.trackID).toBe("track-a");
    expect(portB.postMessage.mock.calls.at(-1)?.[0].snapshot.track.trackID).toBe("track-b");
    expect(standalone.postMessage.mock.calls.at(-1)?.[0].snapshot.track.trackID).toBe("track-a");

    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-b", "paused", 2) }, sender(11));
    expect(portA.postMessage.mock.calls.at(-1)?.[0].snapshot.track.trackID).toBe("track-a");
    expect(portB.postMessage.mock.calls.at(-1)?.[0].snapshot.track.trackID).toBe("track-b");
    expect(standalone.postMessage.mock.calls.at(-1)?.[0].snapshot.track.trackID).toBe("track-a");

    portA.disconnect();
    portB.disconnect();
    standalone.disconnect();
  });

  it("forwards gesture-time track identity and rejects stale seek or transport without routing", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-b", "paused") }, sender(11));

    const seek = await send({
      type: "youtube-music-seek",
      timeMs: 42_000,
      expectedTrackID: "track-b",
    }, sender(11));
    expect(seek.keepAlive).toBe(true);
    expect(tabsSendMessage).toHaveBeenCalledWith(11, {
      type: "youtube-music-seek-to",
      timeMs: 42_000,
      expectedTrackID: "track-b",
    });

    await send({
      type: "youtube-music-transport",
      action: "pause",
      expectedTrackID: "track-b",
    }, sender(11));
    expect(tabsSendMessage).toHaveBeenCalledWith(11, {
      type: "youtube-music-transport-command",
      action: "pause",
      expectedTrackID: "track-b",
    });

    await send({
      type: "youtube-music-like",
      liked: true,
      expectedTrackID: "track-b",
    }, sender(11));
    expect(tabsSendMessage).toHaveBeenCalledWith(11, {
      type: "youtube-music-like-command",
      liked: true,
      expectedTrackID: "track-b",
    });

    await send({
      type: "youtube-music-queue-select",
      queueTrackID: "track-c",
      queueIndex: 2,
      expectedTrackID: "track-b",
    }, sender(11));
    expect(tabsSendMessage).toHaveBeenCalledWith(11, {
      type: "youtube-music-queue-select",
      queueTrackID: "track-c",
      queueIndex: 2,
      expectedTrackID: "track-b",
    });

    tabsSendMessage.mockClear();
    tabsSendMessage.mockResolvedValueOnce({ ok: false, reason: "track-changed" });
    const hostChanged = await send({
      type: "youtube-music-transport",
      action: "next",
      expectedTrackID: "track-b",
    }, sender(11));
    expect(hostChanged.response).toEqual({ ok: false, reason: "track-changed" });
    expect(tabsSendMessage).toHaveBeenCalledTimes(1);
    expect(tabsSendMessage).toHaveBeenCalledWith(11, {
      type: "youtube-music-transport-command",
      action: "next",
      expectedTrackID: "track-b",
    });

    tabsSendMessage.mockClear();
    const staleSeek = await send({
      type: "youtube-music-seek",
      timeMs: 48_000,
      expectedTrackID: "track-a",
    }, sender(11));
    const staleTransport = await send({
      type: "youtube-music-transport",
      action: "next",
      expectedTrackID: "track-a",
    }, sender(11));
    const staleLike = await send({
      type: "youtube-music-like",
      liked: false,
      expectedTrackID: "track-a",
    }, sender(11));
    const staleQueue = await send({
      type: "youtube-music-queue-select",
      queueTrackID: "track-c",
      queueIndex: 2,
      expectedTrackID: "track-a",
    }, sender(11));
    expect(staleSeek.response).toEqual({ ok: false, reason: "track-changed" });
    expect(staleTransport.response).toEqual({ ok: false, reason: "track-changed" });
    expect(staleLike.response).toEqual({ ok: false, reason: "track-changed" });
    expect(staleQueue.response).toEqual({ ok: false, reason: "track-changed" });
    expect(tabsSendMessage).not.toHaveBeenCalled();
  });

  it("cancels a pending start before its stream id resolves", async () => {
    const streamID = deferred<string>();
    tabCapture.mockReturnValueOnce(streamID.promise);
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    const port = makePort(sender(10));
    onConnect?.(port);
    port.postMessage.mockClear();

    const start = await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    expect(start.keepAlive).toBe(true);
    const analyzing = messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)!;
    expect(analyzing).toMatchObject({ status: "analyzing", trackID: "track-a" });
    expect(typeof analyzing.captureID).toBe("string");

    await send({
      type: "youtube-music-stop-audio-analysis",
      trackID: "track-a",
      captureID: analyzing.captureID,
    }, sender(10));
    streamID.resolve("late-stream");
    await flush();

    expect(backgroundMessagesOfType("lyricstage-audio-capture-start")).toHaveLength(0);
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toContainEqual({
      type: "lyricstage-audio-capture-stop",
      trackID: "track-a",
      captureID: analyzing.captureID,
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    });
    expect(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "idle",
      trackID: "track-a",
      captureID: analyzing.captureID,
    });
  });

  it("does not resurrect authorization-pending state when a stopped stream request rejects late", async () => {
    const streamID = deferred<string>();
    tabCapture.mockReturnValueOnce(streamID.promise);
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    const port = makePort(sender(10));
    onConnect?.(port);
    port.postMessage.mockClear();

    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    const analyzing = messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)!;
    await send({
      type: "youtube-music-stop-audio-analysis",
      trackID: "track-a",
      captureID: analyzing.captureID,
    }, sender(10));
    port.postMessage.mockClear();
    streamID.reject(new Error("Extension has not been invoked for the current page"));
    await flush();

    expect(messagesOfType(port, "youtube-music-audio-analysis-status")).toHaveLength(0);
    const resume = await send(
      { type: "youtube-music-resume-pending-audio-analysis" },
      { url: "chrome-extension://fixture/popup.html" },
    );
    expect(resume.response).toEqual({ ok: false, pending: false });
  });

  it("does not start a pending capture after the same tab changes track", async () => {
    const streamID = deferred<string>();
    tabCapture.mockReturnValueOnce(streamID.promise);
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    const port = makePort(sender(10));
    onConnect?.(port);
    port.postMessage.mockClear();

    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    const captureID = String(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)!.captureID);
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-b", "playing", 2),
    }, sender(10));
    streamID.resolve("late-track-a-stream");
    await flush();

    expect(backgroundMessagesOfType("lyricstage-audio-capture-start")).toHaveLength(0);
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toContainEqual({
      type: "lyricstage-audio-capture-stop",
      captureID,
      trackID: "track-a",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    });
    expect(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "idle",
      captureID,
      trackID: "track-a",
    });
  });

  it("keeps the lease monitor alive without ports until it targets an expired capture", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    const port = makePort(sender(10));
    onConnect?.(port);
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    const captureID = String(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!.captureID);
    port.disconnect();

    await vi.advanceTimersByTimeAsync(4_001);
    await flush();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toContainEqual({
      type: "lyricstage-audio-capture-stop",
      captureID,
      trackID: "track-a",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    });
    const stopCount = backgroundMessagesOfType("lyricstage-audio-capture-stop").length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toHaveLength(stopCount);
  });

  it("does not replay a music map before its coverage gate is ready", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    const firstPort = makePort(sender(10));
    onConnect?.(firstPort);
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    const captureID = String(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!.captureID);
    await send({
      type: "lyricstage-audio-map-update",
      captureID,
      trackID: "track-a",
      musicMap: musicMap(4_000),
    }, offscreenSender());

    firstPort.disconnect();
    const reconnected = makePort(sender(10));
    onConnect?.(reconnected);
    expect(messagesOfType(reconnected, "youtube-music-music-map-update")).toHaveLength(0);
    expect(messagesOfType(reconnected, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      captureID,
      trackID: "track-a",
      status: "analyzing",
    });
  });

  it("replays the latest map, vocal map and status on reconnect, request-status and same-owner start", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    const firstPort = makePort(sender(10));
    onConnect?.(firstPort);
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    const startMessage = backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!;
    const captureID = String(startMessage.captureID);

    await send({ type: "lyricstage-audio-capture-ready", captureID, trackID: "track-a" }, offscreenSender());
    await send({
      type: "lyricstage-audio-map-update",
      captureID,
      trackID: "track-a",
      musicMap: musicMap(),
    }, offscreenSender());
    await send({
      type: "lyricstage-vocal-timing-update",
      captureID,
      trackID: "track-a",
      vocalTimingMap: vocalMap(),
    }, offscreenSender());
    await send({
      type: "lyricstage-audio-map-update",
      captureID,
      trackID: "track-a",
      musicMap: musicMap(44_000),
    }, offscreenSender());

    firstPort.disconnect();
    const reconnected = makePort(sender(10));
    onConnect?.(reconnected);
    const replayTypes = reconnected.postMessage.mock.calls.map(([message]) => (message as { type?: string }).type);
    expect(replayTypes).toEqual([
      "youtube-music-bridge-state",
      "youtube-music-music-map-update",
      "youtube-music-vocal-timing-update",
      "youtube-music-audio-analysis-status",
    ]);
    expect(messagesOfType(reconnected, "youtube-music-music-map-update")[0]).toMatchObject({
      captureID,
      trackID: "track-a",
      musicMap: { analyzedMs: 44_000 },
    });
    expect(messagesOfType(reconnected, "youtube-music-audio-analysis-status")[0]).toMatchObject({
      captureID,
      trackID: "track-a",
      status: "ready",
    });

    reconnected.postMessage.mockClear();
    reconnected.emitMessage({ type: "youtube-music-request-status" });
    expect(reconnected.postMessage.mock.calls.map(([message]) => (message as { type?: string }).type)).toEqual(replayTypes);

    const captureCalls = tabCapture.mock.calls.length;
    reconnected.postMessage.mockClear();
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    expect(tabCapture).toHaveBeenCalledTimes(captureCalls);
    expect(reconnected.postMessage.mock.calls.map(([message]) => (message as { type?: string }).type)).toEqual([
      "youtube-music-music-map-update",
      "youtube-music-vocal-timing-update",
      "youtube-music-audio-analysis-status",
    ]);
  });

  it("resets and replays B analysis when same-track standalone ownership moves from A to B", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("same-track", "playing") }, sender(10));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("same-track", "paused") }, sender(11));
    const standalone = makePort({ url: "chrome-extension://fixture/stage.html" });
    onConnect?.(standalone);

    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "same-track",
      durationMs: 180_000,
    }, sender(11));
    const captureID = String(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!.captureID);
    await send({
      type: "lyricstage-audio-map-update",
      captureID,
      trackID: "same-track",
      musicMap: musicMap(),
    }, offscreenSender());
    await send({
      type: "lyricstage-vocal-timing-update",
      captureID,
      trackID: "same-track",
      vocalTimingMap: vocalMap(),
    }, offscreenSender());
    expect(messagesOfType(standalone, "youtube-music-music-map-update")).toHaveLength(0);

    standalone.postMessage.mockClear();
    await send({ type: "youtube-music-source-disconnect" }, sender(10));
    expect(standalone.postMessage.mock.calls.map(([message]) => (message as { type?: string }).type)).toEqual([
      "youtube-music-source-ownership-reset",
      "youtube-music-bridge-state",
      "youtube-music-audio-analysis-status",
      "youtube-music-music-map-update",
      "youtube-music-vocal-timing-update",
      "youtube-music-audio-analysis-status",
    ]);
    expect(standalone.postMessage.mock.calls[1]?.[0]).toMatchObject({
      connected: true,
      snapshot: { track: { trackID: "same-track" } },
    });
    expect(messagesOfType(standalone, "youtube-music-audio-analysis-status")[0]).toMatchObject({
      status: "idle",
      trackID: "same-track",
    });
    expect(messagesOfType(standalone, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "ready",
      captureID,
      trackID: "same-track",
    });
  });

  it("clears standalone analysis when same-track authority moves to a tab without a capture", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("same-track", "playing") }, sender(10));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("same-track", "paused") }, sender(11));
    const standalone = makePort({ url: "chrome-extension://fixture/stage.html" });
    onConnect?.(standalone);

    standalone.postMessage.mockClear();
    await send({ type: "youtube-music-source-disconnect" }, sender(10));
    expect(standalone.postMessage.mock.calls.map(([message]) => (message as { type?: string }).type)).toEqual([
      "youtube-music-source-ownership-reset",
      "youtube-music-bridge-state",
      "youtube-music-audio-analysis-status",
    ]);
    expect(messagesOfType(standalone, "youtube-music-audio-analysis-status")[0]).toEqual({
      type: "youtube-music-audio-analysis-status",
      status: "idle",
      trackID: "same-track",
    });
  });

  it("isolates non-owner tab removal and URL leave, then clears replay before tab ID reuse", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-b", "paused") }, sender(11));
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-b",
      durationMs: 180_000,
    }, sender(11));
    const captureID = String(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!.captureID);
    await send({
      type: "lyricstage-audio-map-update",
      captureID,
      trackID: "track-b",
      musicMap: musicMap(),
    }, offscreenSender());

    const stopCount = backgroundMessagesOfType("lyricstage-audio-capture-stop").length;
    onTabUpdated?.(10, { url: "https://example.com/left-youtube-music" });
    onTabRemoved?.(10);
    await flush();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toHaveLength(stopCount);

    onTabRemoved?.(11);
    await flush();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop").at(-1)).toEqual({
      type: "lyricstage-audio-capture-stop",
      captureID,
      trackID: "track-b",
      tabID: 11,
      generation: 1,
      ownerScope: "boundTab",
    });

    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-new", "playing"),
    }, sender(11));
    const reusedTabPort = makePort(sender(11));
    onConnect?.(reusedTabPort);
    expect(reusedTabPort.postMessage.mock.calls.map(([message]) => (message as { type?: string }).type)).toEqual([
      "youtube-music-bridge-state",
    ]);
  });

  it("targets the owner capture when its tab leaves YouTube Music", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-b", "playing") }, sender(11));
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-b",
      durationMs: 180_000,
    }, sender(11));
    const captureID = String(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!.captureID);

    onTabUpdated?.(11, { url: "https://example.com/left-youtube-music" });
    await flush();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop").at(-1)).toEqual({
      type: "lyricstage-audio-capture-stop",
      captureID,
      trackID: "track-b",
      tabID: 11,
      generation: 1,
      ownerScope: "boundTab",
    });
  });

  it("hands same-track capture ownership from A to B and ignores A's late stop, updates and clock", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "paused") }, sender(11));
    const portA = makePort(sender(10));
    const portB = makePort(sender(11));
    onConnect?.(portA);
    onConnect?.(portB);

    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    const captureA = String(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!.captureID);
    portA.postMessage.mockClear();
    portB.postMessage.mockClear();

    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(11));
    const captureB = String(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!.captureID);
    expect(captureB).not.toBe(captureA);
    expect(messagesOfType(portA, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "idle",
      trackID: "track-a",
      captureID: captureA,
    });
    expect(messagesOfType(portB, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "analyzing",
      trackID: "track-a",
      captureID: captureB,
    });

    const stopCount = backgroundMessagesOfType("lyricstage-audio-capture-stop").length;
    await send({
      type: "youtube-music-stop-audio-analysis",
      trackID: "track-a",
      captureID: captureA,
    }, sender(10));
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toHaveLength(stopCount);

    portB.postMessage.mockClear();
    const clockCount = backgroundMessagesOfType("lyricstage-audio-clock").length;
    await send({
      type: "lyricstage-audio-capture-ready",
      captureID: captureA,
      trackID: "track-a",
    }, offscreenSender());
    await send({
      type: "lyricstage-audio-capture-error",
      captureID: captureA,
      trackID: "track-a",
      reason: "stale-error",
    }, offscreenSender());
    await send({
      type: "lyricstage-audio-map-update",
      captureID: captureA,
      trackID: "track-a",
      musicMap: musicMap(),
    }, offscreenSender());
    await send({
      type: "lyricstage-vocal-timing-update",
      captureID: captureA,
      trackID: "track-a",
      vocalTimingMap: vocalMap(),
    }, offscreenSender());
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-a", "playing", 2),
    }, sender(10));
    expect(messagesOfType(portB, "youtube-music-audio-analysis-status")).toHaveLength(0);
    expect(messagesOfType(portB, "youtube-music-music-map-update")).toHaveLength(0);
    expect(messagesOfType(portB, "youtube-music-vocal-timing-update")).toHaveLength(0);
    expect(backgroundMessagesOfType("lyricstage-audio-clock")).toHaveLength(clockCount);

    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-a", "paused", 2),
    }, sender(11));
    expect(backgroundMessagesOfType("lyricstage-audio-clock").at(-1)).toMatchObject({
      captureID: captureB,
      trackID: "track-a",
    });

    await send({
      type: "lyricstage-audio-map-update",
      captureID: captureB,
      trackID: "track-a",
      musicMap: musicMap(),
    }, offscreenSender());
    expect(messagesOfType(portB, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "ready",
      captureID: captureB,
      trackID: "track-a",
    });
  });

  it("cancels a pending follow-authority capture while preserving an embedded bound-tab capture", async () => {
    const pendingStreamID = deferred<string>();
    tabCapture.mockReturnValueOnce(pendingStreamID.promise);
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-b", "paused") }, sender(11));
    const standalone = makePort({ url: "chrome-extension://fixture/stage.html" });
    onConnect?.(standalone);

    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, { url: "chrome-extension://fixture/stage.html" });
    const followCaptureID = String(messagesOfType(standalone, "youtube-music-audio-analysis-status").at(-1)?.captureID);
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-a", "paused", 2),
    }, sender(10));
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-b", "playing", 2),
    }, sender(11));
    pendingStreamID.resolve("late-follow-stream");
    await flush();

    expect(backgroundMessagesOfType("lyricstage-audio-capture-start")).toHaveLength(0);
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toContainEqual({
      type: "lyricstage-audio-capture-stop",
      captureID: followCaptureID,
      trackID: "track-a",
      tabID: 10,
      generation: 1,
      ownerScope: "followAuthority",
    });

    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    expect(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)).toMatchObject({
      trackID: "track-a",
      tabID: 10,
      ownerScope: "boundTab",
    });
  });

  it("stops an active follow-authority capture when another tab becomes authoritative", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-b", "paused") }, sender(11));
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, { url: "chrome-extension://fixture/stage.html" });
    const start = backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!;
    expect(start).toMatchObject({ tabID: 10, ownerScope: "followAuthority" });

    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-a", "paused", 2),
    }, sender(10));
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-b", "playing", 2),
    }, sender(11));
    await flush();

    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop").at(-1)).toMatchObject({
      captureID: start.captureID,
      trackID: "track-a",
      tabID: 10,
      generation: start.generation,
      ownerScope: "followAuthority",
    });
  });

  it("restarts a follow capture with immutable bound ownership for an embedded consumer", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-b", "paused") }, sender(11));
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, { url: "chrome-extension://fixture/stage.html" });
    const firstStart = backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!;
    const captureCalls = tabCapture.mock.calls.length;

    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));
    expect(tabCapture).toHaveBeenCalledTimes(captureCalls + 1);
    const boundStart = backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!;
    expect(boundStart).toMatchObject({
      tabID: 10,
      ownerScope: "boundTab",
    });
    expect(boundStart.captureID).not.toBe(firstStart.captureID);

    const stopCount = backgroundMessagesOfType("lyricstage-audio-capture-stop").length;
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-a", "paused", 2),
    }, sender(10));
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-b", "playing", 2),
    }, sender(11));
    await flush();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toHaveLength(stopCount);
  });

  it("lets an embedded bound request supersede a follow capture waiting for authorization", async () => {
    tabCapture.mockRejectedValueOnce(new Error("Extension has not been invoked for the current page"));
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-a", "playing") }, sender(10));

    const standalone = await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, { url: "chrome-extension://fixture/stage.html" });
    expect(standalone.response).toMatchObject({
      ok: false,
      reason: expect.stringContaining("15 秒"),
    });
    const pendingCaptureID = String((standalone.response as { captureID?: string }).captureID);
    expect(pendingCaptureID).not.toBe("undefined");

    tabCapture.mockResolvedValueOnce("bound-stream");
    const embedded = await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-a",
      durationMs: 180_000,
    }, sender(10));

    expect(embedded.response).toMatchObject({ ok: true });
    expect(tabCapture).toHaveBeenCalledTimes(2);
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop")).toContainEqual({
      type: "lyricstage-audio-capture-stop",
      captureID: pendingCaptureID,
      trackID: "track-a",
      tabID: 10,
      generation: 1,
      ownerScope: "followAuthority",
    });
    const boundStart = backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!;
    expect(boundStart).toMatchObject({
      streamID: "bound-stream",
      trackID: "track-a",
      tabID: 10,
      generation: 2,
      ownerScope: "boundTab",
    });
    expect(boundStart.captureID).not.toBe(pendingCaptureID);
    expect(embedded.response).toMatchObject({ captureID: boundStart.captureID });
  });

  it("rehydrates an offscreen capture after a worker restart and keeps tab lifecycle ownership", async () => {
    vi.clearAllTimers();
    vi.resetModules();
    const recoveredStatus = {
      type: "lyricstage-audio-capture-status",
      active: true,
      captureID: "capture-restored",
      trackID: "track-restored",
      tabID: 42,
      generation: 7,
      ownerScope: "boundTab",
      durationMs: 180_000,
      status: "ready",
      latestMusicMap: musicMap(44_000),
      latestVocalMap: vocalMap(),
    };
    runtimeSendMessage.mockImplementation(async (message: Record<string, unknown>) =>
      message.type === "lyricstage-audio-capture-status-request" ? recoveredStatus : { ok: true });
    runtimeSendMessage.mockClear();
    await import("./background");
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-restored", "playing"),
    }, sender(42));
    await flush();

    const port = makePort(sender(42));
    onConnect?.(port);
    expect(messagesOfType(port, "youtube-music-music-map-update").at(-1)).toMatchObject({
      captureID: "capture-restored",
      musicMap: { analyzedMs: 44_000 },
    });
    expect(messagesOfType(port, "youtube-music-vocal-timing-update").at(-1)).toMatchObject({
      captureID: "capture-restored",
    });
    expect(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      captureID: "capture-restored",
      status: "ready",
    });

    const start = await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-restored",
      durationMs: 180_000,
    }, sender(42));
    expect(start.response).toEqual({ ok: true, captureID: "capture-restored" });
    expect(tabCapture).not.toHaveBeenCalled();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-status-request")).toHaveLength(2);

    port.postMessage.mockClear();
    await send({
      type: "lyricstage-audio-map-update",
      captureID: "capture-restored",
      trackID: "track-restored",
      tabID: 42,
      generation: 6,
      ownerScope: "boundTab",
      musicMap: musicMap(55_000),
    }, offscreenSender());
    expect(messagesOfType(port, "youtube-music-music-map-update")).toHaveLength(0);

    onTabRemoved?.(42);
    await flush();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop").at(-1)).toEqual({
      type: "lyricstage-audio-capture-stop",
      captureID: "capture-restored",
      trackID: "track-restored",
      tabID: 42,
      generation: 7,
      ownerScope: "boundTab",
    });
  });

  it("re-resolves standalone authority after a delayed rehydration handshake", async () => {
    vi.clearAllTimers();
    vi.resetModules();
    const status = deferred<unknown>();
    runtimeSendMessage.mockImplementation(async (message: Record<string, unknown>) =>
      message.type === "lyricstage-audio-capture-status-request"
        ? status.promise
        : { ok: true });
    runtimeSendMessage.mockClear();
    await import("./background");
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-old", "playing") }, sender(10));

    let startResponse: unknown;
    const keepAlive = onRuntimeMessage?.({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-old",
      durationMs: 180_000,
    }, { url: "chrome-extension://fixture/stage.html" }, (value) => { startResponse = value; });
    expect(keepAlive).toBe(true);

    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-old", "paused", 2),
    }, sender(10));
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-new", "playing", 2),
    }, sender(11));
    status.resolve({ type: "lyricstage-audio-capture-status", active: false });
    await flush();

    expect(startResponse).toEqual({ ok: false, reason: "source-not-ready" });
    expect(tabCapture).not.toHaveBeenCalled();
  });

  it("targets an orphaned offscreen capture when no matching source arrives within three seconds", async () => {
    vi.clearAllTimers();
    vi.resetModules();
    runtimeSendMessage.mockImplementation(async (message: Record<string, unknown>) =>
      message.type === "lyricstage-audio-capture-status-request"
        ? {
            type: "lyricstage-audio-capture-status",
            active: true,
            captureID: "capture-orphan",
            trackID: "track-orphan",
            tabID: 77,
            generation: 9,
            ownerScope: "followAuthority",
            durationMs: 180_000,
            status: "analyzing",
          }
        : { ok: true });
    runtimeSendMessage.mockClear();
    await import("./background");
    await vi.advanceTimersByTimeAsync(3_001);
    await flush();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop").at(-1)).toEqual({
      type: "lyricstage-audio-capture-stop",
      captureID: "capture-orphan",
      trackID: "track-orphan",
      tabID: 77,
      generation: 9,
      ownerScope: "followAuthority",
    });
  });

  it("clears the recovered owner when its captured media track ends and rejects late updates", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-ended", "playing") }, sender(55));
    const port = makePort(sender(55));
    onConnect?.(port);
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-ended",
      durationMs: 180_000,
    }, sender(55));
    const captureID = String(backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)?.captureID);
    port.postMessage.mockClear();
    await send({
      type: "lyricstage-audio-capture-ended",
      captureID,
      trackID: "track-ended",
    }, offscreenSender());
    expect(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "idle",
      captureID,
      trackID: "track-ended",
    });

    port.postMessage.mockClear();
    await send({
      type: "lyricstage-audio-map-update",
      captureID,
      trackID: "track-ended",
      musicMap: musicMap(60_000),
    }, offscreenSender());
    expect(messagesOfType(port, "youtube-music-music-map-update")).toHaveLength(0);
  });

  it.each([
    ["lyricstage-audio-capture-ended", "idle"],
    ["lyricstage-audio-capture-error", "error"],
  ] as const)("does not revive a recovering owner after %s wins the second-status race", async (type, status) => {
    vi.clearAllTimers();
    vi.resetModules();
    const secondStatus = deferred<unknown>();
    let statusRequests = 0;
    const recoveredStatus = {
      type: "lyricstage-audio-capture-status",
      active: true,
      captureID: "capture-race",
      trackID: "track-race",
      tabID: 42,
      generation: 7,
      ownerScope: "boundTab",
      durationMs: 180_000,
      status: "analyzing",
    };
    runtimeSendMessage.mockImplementation(async (message: Record<string, unknown>) => {
      if (message.type !== "lyricstage-audio-capture-status-request") return { ok: true };
      statusRequests += 1;
      return statusRequests === 1 ? recoveredStatus : secondStatus.promise;
    });
    runtimeSendMessage.mockClear();
    await import("./background");
    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-race", "playing"),
    }, sender(42));
    await flush();
    expect(statusRequests).toBe(2);

    secondStatus.resolve(recoveredStatus);
    onRuntimeMessage?.({
      type,
      captureID: "capture-race",
      trackID: "track-race",
      tabID: 42,
      generation: 7,
      ownerScope: "boundTab",
      ...(type === "lyricstage-audio-capture-error" ? { reason: "capture-ended-race" } : {}),
    }, offscreenSender(), () => undefined);
    await flush();

    const port = makePort(sender(42));
    onConnect?.(port);
    expect(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status,
      captureID: "capture-race",
    });
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-race",
      durationMs: 180_000,
    }, sender(42));
    const newStart = backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!;
    expect(newStart.captureID).not.toBe("capture-race");
    expect(Number(newStart.generation)).toBeGreaterThan(7);
    expect(tabCapture).toHaveBeenCalledOnce();
  });

  it("stops an ended playback owner and allows a fresh same-track capture", async () => {
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-ended", "playing") }, sender(55));
    const port = makePort(sender(55));
    onConnect?.(port);
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-ended",
      durationMs: 180_000,
    }, sender(55));
    const firstStart = backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!;
    port.postMessage.mockClear();

    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-ended", "ended", 2),
    }, sender(55));
    await flush();
    expect(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "idle",
      captureID: firstStart.captureID,
      trackID: "track-ended",
    });

    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-ended", "paused", 3),
    }, sender(55));
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-ended",
      durationMs: 180_000,
    }, sender(55));
    const secondStart = backgroundMessagesOfType("lyricstage-audio-capture-start").at(-1)!;
    expect(secondStart.captureID).not.toBe(firstStart.captureID);
    expect(Number(secondStart.generation)).toBeGreaterThan(Number(firstStart.generation));
    expect(tabCapture).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending stream request as soon as the source playback ends", async () => {
    const streamID = deferred<string>();
    tabCapture.mockReturnValueOnce(streamID.promise);
    await send({ type: "youtube-music-source-snapshot", snapshot: snapshot("track-pending", "playing") }, sender(56));
    const port = makePort(sender(56));
    onConnect?.(port);
    await send({
      type: "youtube-music-start-audio-analysis",
      trackID: "track-pending",
      durationMs: 180_000,
    }, sender(56));
    const captureID = String(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)?.captureID);
    port.postMessage.mockClear();

    await send({
      type: "youtube-music-source-snapshot",
      snapshot: snapshot("track-pending", "ended", 2),
    }, sender(56));
    streamID.resolve("late-ended-stream");
    await flush();

    expect(backgroundMessagesOfType("lyricstage-audio-capture-start")).toHaveLength(0);
    expect(messagesOfType(port, "youtube-music-audio-analysis-status").at(-1)).toMatchObject({
      status: "idle",
      captureID,
      trackID: "track-pending",
    });
  });

  it("bounds an unreadable offscreen status handshake and issues stop-all", async () => {
    vi.clearAllTimers();
    vi.resetModules();
    runtimeSendMessage.mockResolvedValue(undefined);
    runtimeSendMessage.mockClear();
    await import("./background");
    await vi.advanceTimersByTimeAsync(401);
    await flush();
    expect(backgroundMessagesOfType("lyricstage-audio-capture-status-request")).toHaveLength(3);
    expect(backgroundMessagesOfType("lyricstage-audio-capture-stop-all")).toEqual([{
      type: "lyricstage-audio-capture-stop-all",
    }]);
    expect(offscreenCloseDocument).toHaveBeenCalledOnce();
  });
});
