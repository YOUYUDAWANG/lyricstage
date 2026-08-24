export const youtubeMusicCompanionVersion = "youtube-music-companion-v0" as const;

export type YouTubeMusicPlaybackStateV0 =
  | "playing"
  | "paused"
  | "buffering"
  | "ended";

export interface YouTubeMusicTrackV0 {
  provider: "youtubeMusic";
  trackID: string;
  title: string;
  artist: string;
  album?: string;
  artworkURL?: string;
  pageURL: string;
}

export type YouTubeMusicLikeStatusV0 = "neutral" | "liked" | "disliked";

export interface YouTubeMusicQueueItemV0 {
  trackID: string;
  title: string;
  artist: string;
  artworkURL?: string;
  selected: boolean;
}

export interface YouTubeMusicSnapshotV0 {
  type: "youtube-music-snapshot";
  version: typeof youtubeMusicCompanionVersion;
  sequence: number;
  sentAtUnixMs: number;
  track: YouTubeMusicTrackV0;
  playback: {
    currentTimeMs: number;
    durationMs: number;
    playbackRate: number;
    state: YouTubeMusicPlaybackStateV0;
    volume?: number;
    muted?: boolean;
    shuffle?: boolean;
    repeat?: "off" | "all" | "one";
  };
  controls?: {
    seek: boolean;
    playPause: boolean;
    previous: boolean;
    next: boolean;
    like?: boolean;
    queue?: boolean;
    volume?: boolean;
    shuffle?: boolean;
    repeat?: boolean;
  };
  engagement?: {
    likeStatus: YouTubeMusicLikeStatusV0;
  };
  queue?: {
    items: YouTubeMusicQueueItemV0[];
    currentIndex: number;
  };
}

export type YouTubeMusicTransportActionV0 = "play" | "pause" | "previous" | "next";

export const youtubeMusicBridgeFailureReasonsV0 = [
  "extension-bridge-unavailable",
  "extension-context-invalidated",
  "extension-bridge-request-failed",
  "extension-bridge-response-invalid",
] as const;

export type YouTubeMusicBridgeFailureReasonV0 =
  typeof youtubeMusicBridgeFailureReasonsV0[number];

export const youtubeMusicBridgeFailureReasonV0 = (
  error: unknown,
  fallback: YouTubeMusicBridgeFailureReasonV0 = "extension-bridge-request-failed",
): YouTubeMusicBridgeFailureReasonV0 => {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
  return /extension context invalidated/i.test(message)
    ? "extension-context-invalidated"
    : fallback;
};

export interface YouTubeMusicBridgeUpdateV0 {
  type: "youtube-music-bridge-update";
  snapshot: YouTubeMusicSnapshotV0;
}

export interface YouTubeMusicBridgeStateV0 {
  type: "youtube-music-bridge-state";
  connected: boolean;
  snapshot?: YouTubeMusicSnapshotV0;
}

export type YouTubeMusicExtensionRequestV0 =
  | { type: "youtube-music-source-snapshot"; snapshot: YouTubeMusicSnapshotV0 }
  | { type: "youtube-music-request-status" }
  | { type: "youtube-music-open-stage" }
  | { type: "youtube-music-open-source" };

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const isYouTubeMusicSnapshotV0 = (
  value: unknown,
): value is YouTubeMusicSnapshotV0 => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<YouTubeMusicSnapshotV0>;
  const track = snapshot.track as Partial<YouTubeMusicTrackV0> | undefined;
  const playback = snapshot.playback as YouTubeMusicSnapshotV0["playback"] | undefined;
  const controls = snapshot.controls as YouTubeMusicSnapshotV0["controls"] | undefined;
  const engagement = snapshot.engagement as YouTubeMusicSnapshotV0["engagement"] | undefined;
  const queue = snapshot.queue as YouTubeMusicSnapshotV0["queue"] | undefined;
  const validQueue = queue === undefined || (
    Array.isArray(queue.items) &&
    queue.items.length <= 100 &&
    Number.isInteger(queue.currentIndex) &&
    queue.currentIndex >= -1 &&
    queue.currentIndex < queue.items.length &&
    queue.items.every((item) => (
      item &&
      typeof item.trackID === "string" && item.trackID.length > 0 &&
      typeof item.title === "string" && item.title.length > 0 &&
      typeof item.artist === "string" &&
      (item.artworkURL === undefined || typeof item.artworkURL === "string") &&
      typeof item.selected === "boolean"
    ))
  );
  return (
    snapshot.type === "youtube-music-snapshot" &&
    snapshot.version === youtubeMusicCompanionVersion &&
    Number.isSafeInteger(snapshot.sequence) &&
    (snapshot.sequence ?? -1) >= 0 &&
    finiteNonNegative(snapshot.sentAtUnixMs) &&
    track?.provider === "youtubeMusic" &&
    typeof track.trackID === "string" &&
    track.trackID.length > 0 &&
    typeof track.title === "string" &&
    track.title.length > 0 &&
    typeof track.artist === "string" &&
    typeof track.pageURL === "string" &&
    playback !== undefined &&
    finiteNonNegative(playback.currentTimeMs) &&
    finiteNonNegative(playback.durationMs) &&
    finiteNonNegative(playback.playbackRate) &&
    ["playing", "paused", "buffering", "ended"].includes(playback.state) &&
    (playback.volume === undefined || (finiteNonNegative(playback.volume) && playback.volume <= 1)) &&
    (playback.muted === undefined || typeof playback.muted === "boolean") &&
    (playback.shuffle === undefined || typeof playback.shuffle === "boolean") &&
    (playback.repeat === undefined || ["off", "all", "one"].includes(playback.repeat)) &&
    (controls === undefined || (
      typeof controls.seek === "boolean" &&
      typeof controls.playPause === "boolean" &&
      typeof controls.previous === "boolean" &&
      typeof controls.next === "boolean" &&
      (controls.like === undefined || typeof controls.like === "boolean") &&
      (controls.queue === undefined || typeof controls.queue === "boolean")
      && (controls.volume === undefined || typeof controls.volume === "boolean")
      && (controls.shuffle === undefined || typeof controls.shuffle === "boolean")
      && (controls.repeat === undefined || typeof controls.repeat === "boolean")
    )) &&
    (engagement === undefined || ["neutral", "liked", "disliked"].includes(engagement.likeStatus)) &&
    validQueue
  );
};

export const youtubeMusicRecordingID = (trackID: string): string =>
  `youtubeMusic:${encodeURIComponent(trackID)}`;
