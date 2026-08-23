import { afterEach, describe, expect, it, vi } from "vitest";
import {
  YouTubeMusicPlaybackClockV0,
  youtubeMusicCompanionVersion,
  type YouTubeMusicSnapshotV0,
} from "@lyricstage/companion";
import {
  startYouTubeMusicBridgePortSession,
  youtubeMusicBridgeReconnectDelaysMs,
  youtubeMusicBridgeStableConnectionMs,
  youtubeMusicBridgeModelForAudioMessage,
  youtubeMusicBridgeModelForSnapshot,
  youtubeMusicBridgeModelForSourceOwnershipReset,
  type ExtensionRuntime,
  type RuntimePort,
  type YouTubeMusicBridgeModel,
} from "./youtubeMusicBridge";

class ListenerSet<T> {
  readonly listeners: T[] = [];

  addListener(listener: T) {
    this.listeners.push(listener);
  }
}

class FakePort implements RuntimePort {
  readonly messages: unknown[] = [];
  readonly onMessage = new ListenerSet<(message: unknown) => void>();
  readonly onDisconnect = new ListenerSet<() => void>();
  disconnected = false;

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  disconnect() {
    this.disconnected = true;
    this.emitDisconnect();
  }

  emitMessage(message: unknown) {
    for (const listener of this.onMessage.listeners) listener(message);
  }

  emitDisconnect() {
    for (const listener of this.onDisconnect.listeners) listener();
  }
}

const snapshot = (
  trackID: string,
  sequence: number,
): YouTubeMusicSnapshotV0 => ({
  type: "youtube-music-snapshot",
  version: youtubeMusicCompanionVersion,
  sequence,
  sentAtUnixMs: 1000 + sequence,
  track: {
    provider: "youtubeMusic",
    trackID,
    title: "Fixture song",
    artist: "Fixture artist",
    pageURL: `https://music.youtube.com/watch?v=${trackID}`,
  },
  playback: {
    currentTimeMs: 1000,
    durationMs: 100_000,
    playbackRate: 1,
    state: "playing",
  },
});

const musicMap = (analyzedMs: number) => ({
  version: "music-map-v1" as const,
  source: "tab-capture" as const,
  durationMs: 100_000,
  analyzedMs,
  featureRateHz: 30,
  tempo: null,
  summary: { dynamicRange: 0.5, meanEnergy: 0.4, peakEnergy: 0.8, silenceRatio: 0.1 },
  segments: [],
  landmarks: [],
});

const vocalMap = (fromMs: number) => ({
  version: "vocal-timing-map-v1" as const,
  source: "tab-capture" as const,
  durationMs: 100_000,
  fromMs,
  toMs: fromMs,
  featureRateHz: 20,
  samples: [{ atMs: fromMs, presence: 0.7, attack: 0.5, confidence: 0.8 }],
});

afterEach(() => {
  vi.useRealTimers();
});

describe("YouTube Music MV3 Port recovery", () => {
  it("requests status after every connection and bounds reconnects to 250/750/2000ms", () => {
    vi.useFakeTimers();
    const ports: FakePort[] = [];
    const runtime: ExtensionRuntime = {
      id: "extension-test",
      connect: () => {
        const port = new FakePort();
        ports.push(port);
        return port;
      },
      sendMessage: async () => undefined,
    };
    const disconnected = vi.fn();
    const cleanup = startYouTubeMusicBridgePortSession({
      resolveRuntime: () => runtime,
      onMessage: vi.fn(),
      onDisconnected: disconnected,
    });

    expect(ports).toHaveLength(1);
    expect(ports[0]!.messages).toEqual([{ type: "youtube-music-request-status" }]);
    ports[0]!.emitDisconnect();
    vi.advanceTimersByTime(249);
    expect(ports).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ports).toHaveLength(2);
    expect(ports[1]!.messages).toEqual([{ type: "youtube-music-request-status" }]);

    ports[1]!.emitDisconnect();
    vi.advanceTimersByTime(750);
    expect(ports).toHaveLength(3);
    ports[2]!.emitDisconnect();
    vi.advanceTimersByTime(2000);
    expect(ports).toHaveLength(4);
    ports[3]!.emitDisconnect();
    vi.advanceTimersByTime(10_000);
    expect(ports).toHaveLength(4);
    expect(disconnected).toHaveBeenCalledTimes(4);
    cleanup();
  });

  it("allows one user-triggered bounded recovery cycle after automatic retries stop", () => {
    vi.useFakeTimers();
    const ports: FakePort[] = [];
    const runtime: ExtensionRuntime = {
      id: "extension-test",
      connect: () => {
        const port = new FakePort();
        ports.push(port);
        return port;
      },
      sendMessage: async () => undefined,
    };
    const session = startYouTubeMusicBridgePortSession({
      resolveRuntime: () => runtime,
      onMessage: vi.fn(),
      onDisconnected: vi.fn(),
    });

    for (const delay of youtubeMusicBridgeReconnectDelaysMs) {
      ports.at(-1)!.emitDisconnect();
      vi.advanceTimersByTime(delay);
    }
    ports.at(-1)!.emitDisconnect();
    vi.advanceTimersByTime(10_000);
    expect(ports).toHaveLength(4);

    expect(session.retry()).toBe(true);
    expect(ports).toHaveLength(5);
    ports.at(-1)!.emitDisconnect();
    vi.advanceTimersByTime(250);
    expect(ports).toHaveLength(6);
    session();
  });

  it("stops immediately when Chrome reports a fatal invalidated context", () => {
    vi.useFakeTimers();
    const ports: FakePort[] = [];
    const runtime: ExtensionRuntime = {
      id: "extension-test",
      lastError: { message: "Extension context invalidated." },
      connect: () => {
        const port = new FakePort();
        ports.push(port);
        return port;
      },
      sendMessage: async () => undefined,
    };
    const disconnected = vi.fn();
    const cleanup = startYouTubeMusicBridgePortSession({
      resolveRuntime: () => runtime,
      onMessage: vi.fn(),
      onDisconnected: disconnected,
    });

    ports[0]!.emitDisconnect();
    vi.advanceTimersByTime(10_000);
    expect(ports).toHaveLength(1);
    expect(disconnected).toHaveBeenCalledWith("extension-context-invalidated");
    cleanup();
  });

  it("does not reset the retry budget for a state message followed by an immediate disconnect", () => {
    vi.useFakeTimers();
    const ports: FakePort[] = [];
    const runtime: ExtensionRuntime = {
      id: "extension-test",
      connect: () => {
        const port = new FakePort();
        ports.push(port);
        return port;
      },
      sendMessage: async () => undefined,
    };
    const cleanup = startYouTubeMusicBridgePortSession({
      resolveRuntime: () => runtime,
      onMessage: vi.fn(),
      onDisconnected: vi.fn(),
    });

    for (const delay of youtubeMusicBridgeReconnectDelaysMs) {
      ports.at(-1)!.emitMessage({ type: "youtube-music-bridge-state", connected: false });
      ports.at(-1)!.emitDisconnect();
      vi.advanceTimersByTime(delay);
    }
    ports.at(-1)!.emitMessage({ type: "youtube-music-bridge-state", connected: false });
    ports.at(-1)!.emitDisconnect();
    vi.advanceTimersByTime(30_000);
    expect(ports).toHaveLength(4);
    cleanup();
  });

  it("restores the retry budget only after one Port remains stable for ten seconds", () => {
    vi.useFakeTimers();
    const ports: FakePort[] = [];
    const runtime: ExtensionRuntime = {
      id: "extension-test",
      connect: () => {
        const port = new FakePort();
        ports.push(port);
        return port;
      },
      sendMessage: async () => undefined,
    };
    const cleanup = startYouTubeMusicBridgePortSession({
      resolveRuntime: () => runtime,
      onMessage: vi.fn(),
      onDisconnected: vi.fn(),
    });

    ports[0]!.emitDisconnect();
    vi.advanceTimersByTime(250);
    ports[1]!.emitMessage({ type: "youtube-music-bridge-state", connected: false });
    vi.advanceTimersByTime(youtubeMusicBridgeStableConnectionMs - 1);
    ports[1]!.emitDisconnect();
    vi.advanceTimersByTime(749);
    expect(ports).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(ports).toHaveLength(3);

    ports[2]!.emitMessage({ type: "youtube-music-bridge-state", connected: false });
    vi.advanceTimersByTime(youtubeMusicBridgeStableConnectionMs);
    ports[2]!.emitDisconnect();
    vi.advanceTimersByTime(250);
    expect(ports).toHaveLength(4);
    cleanup();
  });

  it("cancels a pending reconnect and disconnects the live Port during cleanup", () => {
    vi.useFakeTimers();
    const ports: FakePort[] = [];
    const runtime: ExtensionRuntime = {
      id: "extension-test",
      connect: () => {
        const port = new FakePort();
        ports.push(port);
        return port;
      },
      sendMessage: async () => undefined,
    };
    const cleanup = startYouTubeMusicBridgePortSession({
      resolveRuntime: () => runtime,
      onMessage: vi.fn(),
      onDisconnected: vi.fn(),
    });
    ports[0]!.emitDisconnect();
    cleanup();
    vi.advanceTimersByTime(10_000);
    expect(ports).toHaveLength(1);
  });
});

describe("YouTube Music bridge snapshot heartbeat", () => {
  it("preserves a same-track musicMap error and clears it only when the track changes", () => {
    const currentSnapshot = snapshot("same-track", 1);
    const current: YouTubeMusicBridgeModel = {
      available: true,
      connected: true,
      snapshot: currentSnapshot,
      musicMapStatus: "error",
      musicMapError: "capture-failed",
      musicCaptureID: "capture-a",
    };

    const heartbeat = youtubeMusicBridgeModelForSnapshot(current, snapshot("same-track", 2));
    expect(heartbeat.musicMapStatus).toBe("error");
    expect(heartbeat.musicMapError).toBe("capture-failed");
    expect(heartbeat.musicCaptureID).toBe("capture-a");

    const changed = youtubeMusicBridgeModelForSnapshot(heartbeat, snapshot("next-track", 3));
    expect(changed.musicMapStatus).toBe("idle");
    expect(changed.musicMapError).toBeUndefined();
    expect(changed.musicCaptureID).toBeUndefined();
  });

  it("resets same-track capture ownership before accepting another tab's ready replay", () => {
    const initialSnapshot = snapshot("same-track", 1);
    const mapA = musicMap(10_000);
    const vocalA = vocalMap(1_000);
    let current: YouTubeMusicBridgeModel = {
      available: true,
      connected: true,
      snapshot: initialSnapshot,
      musicMap: mapA,
      vocalTimingMap: vocalA,
      musicMapStatus: "ready",
      musicCaptureID: "capture-a",
    };

    current = youtubeMusicBridgeModelForSnapshot(current, snapshot("same-track", 2));
    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-audio-analysis-status",
      status: "idle",
      trackID: "same-track",
    });
    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-music-map-update",
      trackID: "same-track",
      captureID: "capture-b",
      musicMap: musicMap(20_000),
    });
    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-vocal-timing-update",
      trackID: "same-track",
      captureID: "capture-b",
      vocalTimingMap: vocalMap(2_000),
    });
    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-audio-analysis-status",
      status: "ready",
      trackID: "same-track",
      captureID: "capture-b",
    });

    expect(current.musicCaptureID).toBe("capture-b");
    expect(current.musicMapStatus).toBe("ready");
    expect(current.musicMap?.analyzedMs).toBe(20_000);
    expect(current.vocalTimingMap?.fromMs).toBe(2_000);

    const beforeStaleMessages = current;
    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-audio-analysis-status",
      status: "idle",
      trackID: "same-track",
      captureID: "capture-a",
    });
    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-audio-analysis-status",
      status: "error",
      reason: "stale-error",
      trackID: "same-track",
      captureID: "capture-a",
    });
    expect(current).toBe(beforeStaleMessages);
  });

  it("accepts only the active capture's reactive bus and clears it with capture ownership", () => {
    let current: YouTubeMusicBridgeModel = {
      available: true,
      connected: true,
      snapshot: snapshot("same-track", 1),
      musicMapStatus: "analyzing",
      musicCaptureID: "capture-a",
    };
    const bus = {
      version: "reactive-bus-v1",
      source: "tab-capture",
      atMs: 12_000,
      beatPhase: null,
      energy: 0.8,
      bass: 0.9,
      brightness: 0.7,
      onset: 0.6,
      stereoWidth: 0.5,
      silence: 0,
    };
    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-reactive-bus-update",
      trackID: "same-track",
      captureID: "capture-a",
      reactiveBus: bus,
    });
    expect(current.reactiveBus?.energy).toBe(0.8);

    const accepted = current;
    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-reactive-bus-update",
      trackID: "same-track",
      captureID: "capture-stale",
      reactiveBus: { ...bus, energy: 1 },
    });
    expect(current).toBe(accepted);

    current = youtubeMusicBridgeModelForAudioMessage(current, {
      type: "youtube-music-audio-analysis-status",
      status: "idle",
      trackID: "same-track",
    });
    expect(current.reactiveBus).toBeUndefined();
  });

  it("clears the clock epoch before accepting an older same-track snapshot from a promoted tab", () => {
    const clock = new YouTubeMusicPlaybackClockV0();
    const snapshotA: YouTubeMusicSnapshotV0 = {
      ...snapshot("same-track", 100),
      sentAtUnixMs: 2_000,
      playback: {
        ...snapshot("same-track", 100).playback,
        currentTimeMs: 90_000,
        state: "paused",
      },
    };
    const snapshotB: YouTubeMusicSnapshotV0 = {
      ...snapshot("same-track", 5),
      sentAtUnixMs: 1_900,
      playback: {
        ...snapshot("same-track", 5).playback,
        currentTimeMs: 10_000,
        state: "paused",
      },
    };
    expect(clock.accept(snapshotA, 100)).toBe(true);

    const reset = youtubeMusicBridgeModelForSourceOwnershipReset(clock);
    expect(reset).toMatchObject({ connected: false, musicMapStatus: "idle" });
    expect(clock.accept(snapshotB, 200)).toBe(true);
    expect(clock.sample(200).timeMs).toBe(10_000);
  });
});
