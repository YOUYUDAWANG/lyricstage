import type { YouTubeMusicSnapshotV0, YouTubeMusicTransportActionV0 } from "@lyricstage/companion";

export interface YouTubeMusicControlResult {
  ok: boolean;
  reason?: string;
}

interface SourceRegistryView {
  expire(): boolean;
  readonly sourceTabID: number | undefined;
  snapshotForTab(tabID: number): YouTubeMusicSnapshotV0 | undefined;
}

interface ControlForwarderOptions {
  sourceRegistry: SourceRegistryView;
  sendMessage(tabID: number, message: unknown): Promise<unknown>;
}

interface ForwardOptions {
  expectedTrackID: string;
  preferredTabID?: number;
  message: Record<string, unknown>;
  failureReason: string;
}

export const createYouTubeMusicControlForwarder = ({
  sourceRegistry,
  sendMessage,
}: ControlForwarderOptions) => {
  const forward = async ({
    expectedTrackID,
    preferredTabID,
    message,
    failureReason,
  }: ForwardOptions): Promise<YouTubeMusicControlResult> => {
    sourceRegistry.expire();
    const tabID = preferredTabID ?? sourceRegistry.sourceTabID;
    const snapshot = tabID === undefined ? undefined : sourceRegistry.snapshotForTab(tabID);
    if (tabID === undefined || !snapshot) return { ok: false, reason: "source-not-ready" };
    if (snapshot.track.trackID !== expectedTrackID) return { ok: false, reason: "track-changed" };
    try {
      const response = await sendMessage(tabID, message);
      const result = response as YouTubeMusicControlResult | undefined;
      return result?.ok === true
        ? { ok: true }
        : { ok: false, reason: result?.reason || failureReason };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message.slice(0, 120) : "content-script-unavailable",
      };
    }
  };

  return {
    seek(timeMs: number, expectedTrackID: string, preferredTabID?: number) {
      if (!Number.isFinite(timeMs) || timeMs < 0 || !expectedTrackID) {
        return Promise.resolve({ ok: false, reason: "invalid-seek" });
      }
      return forward({
        expectedTrackID,
        preferredTabID,
        message: { type: "youtube-music-seek-to", timeMs, expectedTrackID },
        failureReason: "seek-failed",
      });
    },
    transport(action: YouTubeMusicTransportActionV0, expectedTrackID: string, preferredTabID?: number) {
      if (!expectedTrackID) return Promise.resolve({ ok: false, reason: "invalid-track" });
      return forward({
        expectedTrackID,
        preferredTabID,
        message: { type: "youtube-music-transport-command", action, expectedTrackID },
        failureReason: "transport-failed",
      });
    },
    like(liked: boolean, expectedTrackID: string, preferredTabID?: number) {
      if (!expectedTrackID) return Promise.resolve({ ok: false, reason: "invalid-track" });
      return forward({
        expectedTrackID,
        preferredTabID,
        message: { type: "youtube-music-like-command", liked, expectedTrackID },
        failureReason: "like-failed",
      });
    },
    selectQueue(queueTrackID: string, queueIndex: number, expectedTrackID: string, preferredTabID?: number) {
      if (!queueTrackID || !Number.isSafeInteger(queueIndex) || queueIndex < 0 || !expectedTrackID) {
        return Promise.resolve({ ok: false, reason: "invalid-queue-selection" });
      }
      return forward({
        expectedTrackID,
        preferredTabID,
        message: { type: "youtube-music-queue-select", queueTrackID, queueIndex, expectedTrackID },
        failureReason: "queue-selection-failed",
      });
    },
  };
};
