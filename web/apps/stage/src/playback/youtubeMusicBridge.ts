import { useCallback, useEffect, useRef, useState } from "react";
import {
  isYouTubeMusicSnapshotV0,
  youtubeMusicBridgeFailureReasonV0,
  YouTubeMusicPlaybackClockV0,
  type YouTubeMusicBridgeFailureReasonV0,
  type YouTubeMusicBridgeStateV0,
  type YouTubeMusicBridgeUpdateV0,
  type YouTubeMusicSnapshotV0,
  type YouTubeMusicTransportActionV0,
} from "@lyricstage/companion";
import {
  sanitizeMusicMapV1,
  sanitizeVocalTimingMapV1,
  type MusicMapV1,
  type VocalTimingMapV1,
} from "@lyricstage/performance";

export interface RuntimePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export interface ExtensionRuntime {
  id?: string;
  connect(options: { name: string }): RuntimePort;
  sendMessage(message: unknown): Promise<unknown>;
  lastError?: { message?: string };
}

const extensionRuntime = (): ExtensionRuntime | undefined => {
  try {
    const value = (globalThis as typeof globalThis & {
      chrome?: { runtime?: ExtensionRuntime };
    }).chrome?.runtime;
    return value?.id && typeof value.connect === "function" ? value : undefined;
  } catch {
    return undefined;
  }
};

export const youtubeMusicBridgeReconnectDelaysMs = [250, 750, 2000] as const;
export const youtubeMusicBridgeStableConnectionMs = 10_000;

interface YouTubeMusicBridgePortSessionOptions {
  resolveRuntime?: () => ExtensionRuntime | undefined;
  onMessage(message: unknown): void;
  onDisconnected(reason: YouTubeMusicBridgeFailureReasonV0): void;
  setTimer?: typeof globalThis.setTimeout;
  clearTimer?: typeof globalThis.clearTimeout;
}

export const startYouTubeMusicBridgePortSession = ({
  resolveRuntime = extensionRuntime,
  onMessage,
  onDisconnected,
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
}: YouTubeMusicBridgePortSessionOptions): (() => void) => {
  let disposed = false;
  let activePort: RuntimePort | undefined;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let stabilityTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const clearStabilityTimer = () => {
    if (stabilityTimer !== undefined) clearTimer(stabilityTimer);
    stabilityTimer = undefined;
  };

  const startStabilityWindow = (port: RuntimePort) => {
    if (stabilityTimer !== undefined) return;
    stabilityTimer = setTimer(() => {
      stabilityTimer = undefined;
      if (!disposed && activePort === port) reconnectAttempt = 0;
    }, youtubeMusicBridgeStableConnectionMs);
  };

  const scheduleReconnect = (reason: YouTubeMusicBridgeFailureReasonV0) => {
    if (disposed || reason === "extension-context-invalidated") return;
    const delay = youtubeMusicBridgeReconnectDelaysMs[reconnectAttempt];
    if (delay === undefined) return;
    reconnectAttempt += 1;
    reconnectTimer = setTimer(connect, delay);
  };

  const fail = (
    reason: YouTubeMusicBridgeFailureReasonV0,
    port?: RuntimePort,
  ) => {
    if (disposed || (port && port !== activePort)) return;
    clearStabilityTimer();
    if (port) activePort = undefined;
    onDisconnected(reason);
    scheduleReconnect(reason);
  };

  function connect() {
    reconnectTimer = undefined;
    if (disposed) return;
    let runtime: ExtensionRuntime | undefined;
    try {
      runtime = resolveRuntime();
    } catch (error) {
      fail(youtubeMusicBridgeFailureReasonV0(error, "extension-bridge-unavailable"));
      return;
    }
    if (!runtime) {
      fail("extension-bridge-unavailable");
      return;
    }

    let port: RuntimePort | undefined;
    try {
      port = runtime.connect({ name: "lyricstage-stage" });
      const connectedPort = port;
      activePort = connectedPort;
      connectedPort.onMessage.addListener((message) => {
        if (disposed || activePort !== connectedPort) return;
        startStabilityWindow(connectedPort);
        onMessage(message);
      });
      connectedPort.onDisconnect.addListener(() => {
        if (disposed || activePort !== connectedPort) return;
        const reason = youtubeMusicBridgeFailureReasonV0(
          runtime.lastError?.message,
          "extension-bridge-request-failed",
        );
        fail(reason, connectedPort);
      });
      connectedPort.postMessage({ type: "youtube-music-request-status" });
    } catch (error) {
      const reason = youtubeMusicBridgeFailureReasonV0(error);
      if (activePort === port) activePort = undefined;
      try {
        port?.disconnect();
      } catch {
        // A failed MV3 Port has no remaining resource to release.
      }
      onDisconnected(reason);
      scheduleReconnect(reason);
    }
  }

  connect();
  return () => {
    disposed = true;
    if (reconnectTimer !== undefined) clearTimer(reconnectTimer);
    reconnectTimer = undefined;
    clearStabilityTimer();
    const port = activePort;
    activePort = undefined;
    try {
      port?.disconnect();
    } catch {
      // The extension context may already be gone during React cleanup.
    }
  };
};

export const isYouTubeMusicExtensionContext = (): boolean =>
  extensionRuntime() !== undefined;

export const seekYouTubeMusic = async (
  timeMs: number,
  expectedTrackID: string,
): Promise<boolean> => {
  const runtime = extensionRuntime();
  if (!runtime || !Number.isFinite(timeMs) || timeMs < 0 || !expectedTrackID) return false;
  try {
    const response = await runtime.sendMessage({ type: "youtube-music-seek", timeMs, expectedTrackID });
    return (response as { ok?: unknown } | undefined)?.ok === true;
  } catch {
    return false;
  }
};

export const controlYouTubeMusic = async (
  action: YouTubeMusicTransportActionV0,
  expectedTrackID: string,
): Promise<boolean> => {
  const runtime = extensionRuntime();
  if (!runtime || !expectedTrackID) return false;
  try {
    const response = await runtime.sendMessage({ type: "youtube-music-transport", action, expectedTrackID });
    return (response as { ok?: unknown } | undefined)?.ok === true;
  } catch {
    return false;
  }
};

export const startYouTubeMusicAudioAnalysis = async (
  trackID: string,
  durationMs: number,
): Promise<{ ok: boolean; reason?: string; captureID?: string }> => {
  const runtime = extensionRuntime();
  if (!trackID || !Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, reason: "invalid-audio-analysis-request" };
  }
  if (!runtime) return { ok: false, reason: "extension-bridge-unavailable" };
  try {
    const response = await runtime.sendMessage({ type: "youtube-music-start-audio-analysis", trackID, durationMs });
    const result = response as { ok?: unknown; reason?: unknown; captureID?: unknown } | undefined;
    return {
      ok: result?.ok === true,
      ...(typeof result?.reason === "string" ? { reason: result.reason.slice(0, 160) } : {}),
      ...(typeof result?.captureID === "string" ? { captureID: result.captureID.slice(0, 160) } : {}),
    };
  } catch (error) {
    return { ok: false, reason: youtubeMusicBridgeFailureReasonV0(error) };
  }
};

export const stopYouTubeMusicAudioAnalysis = async (
  trackID?: string,
  captureID?: string,
): Promise<boolean> => {
  const runtime = extensionRuntime();
  if (!runtime) return false;
  try {
    const response = await runtime.sendMessage({
      type: "youtube-music-stop-audio-analysis",
      trackID,
      captureID,
    });
    return (response as { ok?: unknown } | undefined)?.ok === true;
  } catch {
    return false;
  }
};

export interface YouTubeMusicBridgeModel {
  available: boolean;
  connected: boolean;
  snapshot?: YouTubeMusicSnapshotV0;
  musicMap?: MusicMapV1;
  vocalTimingMap?: VocalTimingMapV1;
  musicMapStatus: "idle" | "analyzing" | "ready" | "error";
  musicMapError?: string;
  musicCaptureID?: string;
  bridgeFailureReason?: YouTubeMusicBridgeFailureReasonV0;
}

export const youtubeMusicBridgeModelForSnapshot = (
  current: YouTubeMusicBridgeModel,
  snapshot: YouTubeMusicSnapshotV0,
): YouTubeMusicBridgeModel => {
  const sameTrack = current.snapshot?.track.trackID === snapshot.track.trackID;
  return {
    available: true,
    connected: true,
    snapshot,
    musicMap: sameTrack ? current.musicMap : undefined,
    vocalTimingMap: sameTrack ? current.vocalTimingMap : undefined,
    musicMapStatus: sameTrack ? current.musicMapStatus : "idle",
    musicMapError: sameTrack ? current.musicMapError : undefined,
    musicCaptureID: sameTrack ? current.musicCaptureID : undefined,
  };
};

export const youtubeMusicBridgeModelForAudioMessage = (
  current: YouTubeMusicBridgeModel,
  message: unknown,
): YouTubeMusicBridgeModel => {
  const audio = message as {
    type?: unknown;
    trackID?: unknown;
    status?: unknown;
    reason?: unknown;
    captureID?: unknown;
    musicMap?: unknown;
    vocalTimingMap?: unknown;
  };
  if (audio.type === "youtube-music-music-map-update" && typeof audio.trackID === "string") {
    const musicMap = sanitizeMusicMapV1(audio.musicMap);
    if (
      !musicMap
      || current.snapshot?.track.trackID !== audio.trackID
      || (
        current.musicCaptureID
        && typeof audio.captureID === "string"
        && current.musicCaptureID !== audio.captureID
      )
    ) return current;
    return {
      ...current,
      musicMap,
      musicMapStatus: "ready",
      ...(typeof audio.captureID === "string" ? { musicCaptureID: audio.captureID } : {}),
    };
  }
  if (audio.type === "youtube-music-vocal-timing-update" && typeof audio.trackID === "string") {
    const vocalTimingMap = sanitizeVocalTimingMapV1(audio.vocalTimingMap);
    if (
      !vocalTimingMap
      || current.snapshot?.track.trackID !== audio.trackID
      || (
        current.musicCaptureID
        && typeof audio.captureID === "string"
        && current.musicCaptureID !== audio.captureID
      )
    ) return current;
    return {
      ...current,
      vocalTimingMap,
      ...(typeof audio.captureID === "string" ? { musicCaptureID: audio.captureID } : {}),
    };
  }
  if (
    audio.type !== "youtube-music-audio-analysis-status"
    || (
      audio.status !== "idle"
      && audio.status !== "analyzing"
      && audio.status !== "ready"
      && audio.status !== "error"
    )
  ) return current;
  if (audio.trackID && current.snapshot?.track.trackID !== audio.trackID) return current;
  const captureID = typeof audio.captureID === "string" ? audio.captureID : undefined;
  if (
    audio.status !== "analyzing"
    && captureID
    && current.musicCaptureID
    && captureID !== current.musicCaptureID
  ) return current;
  const replacingCapture = audio.status === "analyzing"
    && captureID !== undefined
    && captureID !== current.musicCaptureID;
  return {
    ...current,
    musicMapStatus: audio.status,
    musicMapError: audio.status === "error" && typeof audio.reason === "string"
      ? audio.reason.slice(0, 160)
      : undefined,
    ...(captureID ? { musicCaptureID: captureID } : {}),
    ...(replacingCapture || audio.status === "idle" || audio.status === "error"
      ? { musicMap: undefined, vocalTimingMap: undefined }
      : {}),
    ...(audio.status === "idle" ? { musicCaptureID: undefined } : {}),
  };
};

export const youtubeMusicBridgeModelForSourceOwnershipReset = (
  clock: YouTubeMusicPlaybackClockV0,
): YouTubeMusicBridgeModel => {
  clock.clear();
  return {
    available: true,
    connected: false,
    musicMapStatus: "idle",
  };
};

export const useYouTubeMusicBridge = () => {
  const clockRef = useRef(new YouTubeMusicPlaybackClockV0());
  const [model, setModel] = useState<YouTubeMusicBridgeModel>(() => ({
    available: isYouTubeMusicExtensionContext(),
    connected: false,
    musicMapStatus: "idle",
  }));

  useEffect(() => {
    const runtime = extensionRuntime();
    if (!runtime) return undefined;
    const accept = (snapshot: YouTubeMusicSnapshotV0) => {
      if (!clockRef.current.accept(snapshot, performance.now())) return;
      setModel((current) => youtubeMusicBridgeModelForSnapshot(current, snapshot));
    };
    const handleMessage = (message: unknown) => {
      setModel((current) => current.bridgeFailureReason
        ? { ...current, bridgeFailureReason: undefined }
        : current);
      const audio = message as { type?: unknown };
      if (
        audio.type === "youtube-music-music-map-update"
        || audio.type === "youtube-music-vocal-timing-update"
        || audio.type === "youtube-music-audio-analysis-status"
      ) {
        setModel((current) => youtubeMusicBridgeModelForAudioMessage(current, message));
        return;
      }
      if (audio.type === "youtube-music-source-ownership-reset") {
        setModel(youtubeMusicBridgeModelForSourceOwnershipReset(clockRef.current));
        return;
      }
      const update = message as Partial<YouTubeMusicBridgeUpdateV0> | Partial<YouTubeMusicBridgeStateV0>;
      if (update.type === "youtube-music-bridge-update" && isYouTubeMusicSnapshotV0(update.snapshot)) {
        accept(update.snapshot);
        return;
      }
      if (update.type === "youtube-music-bridge-state") {
        if (update.connected && isYouTubeMusicSnapshotV0(update.snapshot)) {
          accept(update.snapshot);
        } else {
          clockRef.current.clear();
          setModel({ available: true, connected: false, musicMapStatus: "idle" });
        }
      }
    };
    return startYouTubeMusicBridgePortSession({
      resolveRuntime: () => extensionRuntime() ?? runtime,
      onMessage: handleMessage,
      onDisconnected: (reason) => {
        clockRef.current.clear();
        setModel({
          available: reason !== "extension-context-invalidated"
            && reason !== "extension-bridge-unavailable",
          connected: false,
          musicMapStatus: "idle",
          bridgeFailureReason: reason,
        });
      },
    });
  }, []);

  const openYouTubeMusic = useCallback(async () => {
    const runtime = extensionRuntime();
    if (!runtime) return false;
    try {
      await runtime.sendMessage({ type: "youtube-music-open-source" });
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    ...model,
    clock: clockRef.current,
    openYouTubeMusic,
  };
};
