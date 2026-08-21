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
  };
  controls?: {
    seek: boolean;
    playPause: boolean;
    previous: boolean;
    next: boolean;
  };
}

export type YouTubeMusicTransportActionV0 = "play" | "pause" | "previous" | "next";

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
    (controls === undefined || (
      typeof controls.seek === "boolean" &&
      typeof controls.playPause === "boolean" &&
      typeof controls.previous === "boolean" &&
      typeof controls.next === "boolean"
    ))
  );
};

export const youtubeMusicRecordingID = (trackID: string): string =>
  `youtubeMusic:${encodeURIComponent(trackID)}`;
