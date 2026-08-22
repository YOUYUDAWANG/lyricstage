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

describe("offscreen audio capture lifecycle", () => {
  let onMessage: ((
    message: Record<string, unknown>,
    sender?: unknown,
    sendResponse?: (response: unknown) => void,
  ) => void) | undefined;
  let sendMessage: ReturnType<typeof vi.fn>;
  let requests: Deferred<MediaStream>[];
  let streams: Array<{ name: string; stopCount: number; stream: MediaStream; end(): void }>;
  let contexts: Array<{ closed: boolean; closeCount: number }>;
  let resumeMode: "resolve" | "reject";

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    requests = [];
    streams = [];
    contexts = [];
    resumeMode = "resolve";
    sendMessage = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          sendMessage,
          onMessage: {
            addListener(listener: typeof onMessage) {
              onMessage = listener;
            },
          },
        },
      },
    });

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: vi.fn(() => {
            const request = deferred<MediaStream>();
            requests.push(request);
            return request.promise;
          }),
        },
      },
    });

    class FakeAudioContext {
      destination = {};
      sampleRate = 48_000;
      closed = false;
      closeCount = 0;

      constructor() {
        contexts.push(this);
      }

      createMediaStreamSource() { return { connect: vi.fn() }; }
      createAnalyser() {
        return {
          fftSize: 2048,
          frequencyBinCount: 1024,
          smoothingTimeConstant: 0,
          connect: vi.fn(),
          getFloatFrequencyData: vi.fn(),
          getFloatTimeDomainData: vi.fn(),
        };
      }
      createChannelSplitter() { return { connect: vi.fn() }; }
      createGain() { return { gain: { value: 0 }, connect: vi.fn() }; }
      async resume() {
        if (resumeMode === "reject") throw new Error("resume-failed");
      }
      async close() {
        this.closed = true;
        this.closeCount += 1;
      }
    }

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: FakeAudioContext,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, "chrome");
    Reflect.deleteProperty(globalThis, "AudioContext");
    onMessage = undefined;
  });

  const makeStream = (name: string): MediaStream => {
    let ended: (() => void) | undefined;
    const state = {
      name,
      stopCount: 0,
      stream: undefined as unknown as MediaStream,
      end: () => ended?.(),
    };
    state.stream = {
      getTracks: () => [{
        stop: () => { state.stopCount += 1; },
        addEventListener: (type: string, listener: () => void) => {
          if (type === "ended") ended = listener;
        },
      }],
    } as unknown as MediaStream;
    streams.push(state);
    return state.stream;
  };

  const startMessage = (
    streamID: string,
    trackID: string,
    captureID: string,
    ownerScope: "boundTab" | "followAuthority" = "boundTab",
  ) => ({
    type: "lyricstage-audio-capture-start",
    streamID,
    captureID,
    trackID,
    tabID: 10,
    generation: 1,
    ownerScope,
    durationMs: 180_000,
    clock: { currentTimeMs: 0, playbackRate: 1, state: "playing" },
  });

  const sent = (type: string) => sendMessage.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter((message) => message.type === type);

  const dispatch = (message: Record<string, unknown>): unknown => {
    let response: unknown;
    onMessage?.(message, {}, (value) => { response = value; });
    return response;
  };

  it("keeps only the newest capture when getUserMedia resolves out of order and ignores an old targeted stop", async () => {
    await import("./offscreen-audio");
    expect(onMessage).toBeTypeOf("function");

    onMessage?.(startMessage("stream-a", "track-a", "capture-a"));
    await flush();
    onMessage?.(startMessage("stream-b", "track-b", "capture-b"));
    await flush();
    expect(requests).toHaveLength(2);

    requests[1].resolve(makeStream("b"));
    await flush();
    requests[0].resolve(makeStream("a"));
    await flush();

    expect(sent("lyricstage-audio-capture-ready")).toEqual([{
      type: "lyricstage-audio-capture-ready",
      captureID: "capture-b",
      trackID: "track-b",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    }]);
    expect(streams.find((stream) => stream.name === "a")?.stopCount).toBe(1);
    expect(streams.find((stream) => stream.name === "b")?.stopCount).toBe(0);
    expect(contexts).toHaveLength(1);

    onMessage?.({
      type: "lyricstage-audio-capture-stop",
      captureID: "capture-a",
      trackID: "track-a",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    });
    await flush();
    expect(streams.find((stream) => stream.name === "b")?.stopCount).toBe(0);
    expect(contexts[0]?.closed).toBe(false);

    await vi.advanceTimersByTimeAsync(4_100);
    expect(sent("lyricstage-audio-map-update").at(-1)).toMatchObject({
      captureID: "capture-b",
      trackID: "track-b",
    });
    expect(sent("lyricstage-vocal-timing-update").at(-1)).toMatchObject({
      captureID: "capture-b",
      trackID: "track-b",
    });

    onMessage?.({
      type: "lyricstage-audio-capture-stop",
      captureID: "capture-b",
      trackID: "track-b",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    });
    await flush();
    expect(streams.find((stream) => stream.name === "b")?.stopCount).toBe(1);
    expect(contexts[0]?.closed).toBe(true);
  });

  it("cancels a pending getUserMedia start without creating a context or publishing status", async () => {
    await import("./offscreen-audio");
    onMessage?.(startMessage("stream-a", "track-a", "capture-a"));
    await flush();
    expect(requests).toHaveLength(1);

    onMessage?.({
      type: "lyricstage-audio-capture-stop",
      captureID: "capture-a",
      trackID: "track-a",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    });
    requests[0].resolve(makeStream("a"));
    await flush();

    expect(streams[0]?.stopCount).toBe(1);
    expect(contexts).toHaveLength(0);
    expect(sent("lyricstage-audio-capture-ready")).toHaveLength(0);
    expect(sent("lyricstage-audio-capture-error")).toHaveLength(0);
  });

  it("suppresses a stale same-track getUserMedia error by captureID", async () => {
    await import("./offscreen-audio");
    onMessage?.(startMessage("stream-old", "same-track", "capture-old"));
    await flush();
    onMessage?.(startMessage("stream-new", "same-track", "capture-new"));
    await flush();
    expect(requests).toHaveLength(2);

    requests[1].resolve(makeStream("new"));
    await flush();
    requests[0].reject(new Error("old-permission-error"));
    await flush();

    expect(sent("lyricstage-audio-capture-ready")).toEqual([{
      type: "lyricstage-audio-capture-ready",
      captureID: "capture-new",
      trackID: "same-track",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    }]);
    expect(sent("lyricstage-audio-capture-error")).toHaveLength(0);
  });

  it("releases provisional stream and context when setup fails", async () => {
    resumeMode = "reject";
    await import("./offscreen-audio");
    onMessage?.(startMessage("stream-c", "track-c", "capture-c"));
    await flush();
    requests[0].resolve(makeStream("c"));
    await flush();

    expect(streams[0]?.stopCount).toBe(1);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ closed: true, closeCount: 1 });
    expect(sent("lyricstage-audio-capture-error")).toEqual([{
      type: "lyricstage-audio-capture-error",
      captureID: "capture-c",
      trackID: "track-c",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
      reason: "resume-failed",
    }]);
  });

  it("absorbs a worker rejection from fire-and-forget status messages", async () => {
    sendMessage.mockRejectedValue(new Error("worker unavailable"));
    await import("./offscreen-audio");
    onMessage?.(startMessage("stream-c", "track-c", "capture-c"));
    await flush();
    requests[0].resolve(makeStream("c"));
    await flush();
    expect(contexts).toHaveLength(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "lyricstage-audio-capture-ready",
      captureID: "capture-c",
      trackID: "track-c",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    });
  });

  it("reports a restart-safe session and clears every resource on track end or stop-all", async () => {
    await import("./offscreen-audio");
    onMessage?.(startMessage("stream-a", "track-a", "capture-a"));
    await flush();
    requests[0].resolve(makeStream("a"));
    await flush();

    expect(dispatch({ type: "lyricstage-audio-capture-status-request" })).toMatchObject({
      type: "lyricstage-audio-capture-status",
      active: true,
      captureID: "capture-a",
      trackID: "track-a",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
      durationMs: 180_000,
      status: "analyzing",
    });

    streams[0].end();
    await flush();
    expect(sent("lyricstage-audio-capture-ended")).toEqual([{
      type: "lyricstage-audio-capture-ended",
      captureID: "capture-a",
      trackID: "track-a",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    }]);
    expect(streams[0].stopCount).toBe(1);
    expect(contexts[0]).toMatchObject({ closed: true, closeCount: 1 });
    expect(dispatch({ type: "lyricstage-audio-capture-status-request" })).toEqual({
      type: "lyricstage-audio-capture-status",
      active: false,
    });

    onMessage?.(startMessage("stream-b", "track-b", "capture-b"));
    await flush();
    requests[1].resolve(makeStream("b"));
    await flush();
    let stopAllResponse: unknown;
    onMessage?.(
      { type: "lyricstage-audio-capture-stop-all" },
      {},
      (response) => { stopAllResponse = response; },
    );
    await flush();
    expect(stopAllResponse).toEqual({ ok: true });
    expect(streams[1].stopCount).toBe(1);
    expect(contexts[1]).toMatchObject({ closed: true, closeCount: 1 });
    const publishCount = sent("lyricstage-audio-map-update").length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sent("lyricstage-audio-map-update")).toHaveLength(publishCount);
  });

  it("reports clock-ended before releasing the active session", async () => {
    await import("./offscreen-audio");
    onMessage?.(startMessage("stream-ended", "track-ended", "capture-ended"));
    await flush();
    requests[0].resolve(makeStream("ended"));
    await flush();

    dispatch({
      type: "lyricstage-audio-clock",
      captureID: "capture-ended",
      trackID: "track-ended",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
      clock: { currentTimeMs: 180_000, playbackRate: 1, state: "ended" },
    });
    await flush();

    expect(sent("lyricstage-audio-capture-ended")).toEqual([{
      type: "lyricstage-audio-capture-ended",
      captureID: "capture-ended",
      trackID: "track-ended",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    }]);
    expect(streams[0].stopCount).toBe(1);
    expect(contexts[0]).toMatchObject({ closed: true, closeCount: 1 });
  });

  it("persists owner scope and rejects a targeted stop from another scope", async () => {
    await import("./offscreen-audio");
    onMessage?.(startMessage("stream-owner", "track-owner", "capture-owner", "followAuthority"));
    await flush();
    requests[0].resolve(makeStream("owner"));
    await flush();
    expect(dispatch({ type: "lyricstage-audio-capture-status-request" })).toMatchObject({
      active: true,
      ownerScope: "followAuthority",
    });

    dispatch({
      type: "lyricstage-audio-capture-stop",
      captureID: "capture-owner",
      trackID: "track-owner",
      tabID: 10,
      generation: 1,
      ownerScope: "boundTab",
    });
    await flush();
    expect(streams[0].stopCount).toBe(0);
    dispatch({
      type: "lyricstage-audio-capture-stop",
      captureID: "capture-owner",
      trackID: "track-owner",
      tabID: 10,
      generation: 1,
      ownerScope: "followAuthority",
    });
    await flush();
    expect(streams[0].stopCount).toBe(1);
  });

});
