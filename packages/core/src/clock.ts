export type PlaybackClockStateV0 =
  | "playing"
  | "paused"
  | "buffering"
  | "ended"
  | "unavailable";

export interface PlaybackClockSampleV0 {
  timeMs: number;
  durationMs: number;
  playbackRate: number;
  state: PlaybackClockStateV0;
  authoritativeAtMs: number;
}

export interface PlaybackClockV0 {
  readonly source: "localMedia" | "youtubeMusic" | "preview";
  sample(nowMs?: number): PlaybackClockSampleV0;
}
