import { useCallback, useEffect, useRef, useState } from "react";
import {
  isYouTubeMusicSnapshotV0,
  YouTubeMusicPlaybackClockV0,
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

interface RuntimePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

interface ExtensionRuntime {
  id?: string;
  connect(options: { name: string }): RuntimePort;
  sendMessage(message: unknown): Promise<unknown>;
}

const extensionRuntime = (): ExtensionRuntime | undefined => {
  const value = (globalThis as typeof globalThis & {
    chrome?: { runtime?: ExtensionRuntime };
  }).chrome?.runtime;
  return value?.id && typeof value.connect === "function" ? value : undefined;
};

export const isYouTubeMusicExtensionContext = (): boolean =>
  extensionRuntime() !== undefined;

export const seekYouTubeMusic = async (timeMs: number): Promise<boolean> => {
  const runtime = extensionRuntime();
  if (!runtime || !Number.isFinite(timeMs) || timeMs < 0) return false;
  try {
    const response = await runtime.sendMessage({ type: "youtube-music-seek", timeMs });
    return (response as { ok?: unknown } | undefined)?.ok === true;
  } catch {
    return false;
  }
};

export const controlYouTubeMusic = async (
  action: YouTubeMusicTransportActionV0,
): Promise<boolean> => {
  const runtime = extensionRuntime();
  if (!runtime) return false;
  try {
    const response = await runtime.sendMessage({ type: "youtube-music-transport", action });
    return (response as { ok?: unknown } | undefined)?.ok === true;
  } catch {
    return false;
  }
};

export const startYouTubeMusicAudioAnalysis = async (
  trackID: string,
  durationMs: number,
): Promise<{ ok: boolean; reason?: string }> => {
  const runtime = extensionRuntime();
  if (!runtime || !trackID || !Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, reason: "invalid-audio-analysis-request" };
  }
  try {
    const response = await runtime.sendMessage({ type: "youtube-music-start-audio-analysis", trackID, durationMs });
    const result = response as { ok?: unknown; reason?: unknown } | undefined;
    return {
      ok: result?.ok === true,
      ...(typeof result?.reason === "string" ? { reason: result.reason.slice(0, 160) } : {}),
    };
  } catch {
    return { ok: false, reason: "extension-runtime-unavailable" };
  }
};

export const stopYouTubeMusicAudioAnalysis = async (trackID?: string): Promise<boolean> => {
  const runtime = extensionRuntime();
  if (!runtime) return false;
  try {
    const response = await runtime.sendMessage({ type: "youtube-music-stop-audio-analysis", trackID });
    return (response as { ok?: unknown } | undefined)?.ok === true;
  } catch {
    return false;
  }
};

interface YouTubeMusicBridgeModel {
  available: boolean;
  connected: boolean;
  snapshot?: YouTubeMusicSnapshotV0;
  musicMap?: MusicMapV1;
  vocalTimingMap?: VocalTimingMapV1;
  musicMapStatus: "idle" | "analyzing" | "ready" | "error";
  musicMapError?: string;
}

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
    const port = runtime.connect({ name: "lyricstage-stage" });
    const accept = (snapshot: YouTubeMusicSnapshotV0) => {
      if (!clockRef.current.accept(snapshot, performance.now())) return;
      setModel((current) => ({
        available: true,
        connected: true,
        snapshot,
        musicMap: current.snapshot?.track.trackID === snapshot.track.trackID ? current.musicMap : undefined,
        vocalTimingMap: current.snapshot?.track.trackID === snapshot.track.trackID ? current.vocalTimingMap : undefined,
        musicMapStatus: current.snapshot?.track.trackID === snapshot.track.trackID ? current.musicMapStatus : "idle",
      }));
    };
    port.onMessage.addListener((message) => {
      const audio = message as {
        type?: unknown;
        trackID?: unknown;
        status?: unknown;
        reason?: unknown;
        musicMap?: unknown;
        vocalTimingMap?: unknown;
      };
      if (audio.type === "youtube-music-music-map-update" && typeof audio.trackID === "string") {
        const musicMap = sanitizeMusicMapV1(audio.musicMap);
        if (musicMap) setModel((current) => current.snapshot?.track.trackID === audio.trackID
          ? { ...current, musicMap, musicMapStatus: "ready" }
          : current);
        return;
      }
      if (audio.type === "youtube-music-vocal-timing-update" && typeof audio.trackID === "string") {
        const vocalTimingMap = sanitizeVocalTimingMapV1(audio.vocalTimingMap);
        if (vocalTimingMap) setModel((current) => current.snapshot?.track.trackID === audio.trackID
          ? { ...current, vocalTimingMap }
          : current);
        return;
      }
      if (
        audio.type === "youtube-music-audio-analysis-status"
        && (audio.status === "idle" || audio.status === "analyzing" || audio.status === "ready" || audio.status === "error")
      ) {
        setModel((current) => !audio.trackID || current.snapshot?.track.trackID === audio.trackID
          ? {
              ...current,
              musicMapStatus: audio.status as YouTubeMusicBridgeModel["musicMapStatus"],
              musicMapError: audio.status === "error" && typeof audio.reason === "string"
                ? audio.reason.slice(0, 160)
                : undefined,
              ...(audio.status === "idle" || audio.status === "error" ? { vocalTimingMap: undefined } : {}),
            }
          : current);
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
    });
    port.onDisconnect.addListener(() => {
      clockRef.current.clear();
      setModel({ available: true, connected: false, musicMapStatus: "idle" });
    });
    port.postMessage({ type: "youtube-music-request-status" });
    return () => port.disconnect();
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
