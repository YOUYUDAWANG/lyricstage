import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const storage = new Map<string, unknown>();
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
    expect(staleSeek.response).toEqual({ ok: false, reason: "track-changed" });
    expect(staleTransport.response).toEqual({ ok: false, reason: "track-changed" });
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
