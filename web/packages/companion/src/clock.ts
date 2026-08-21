import type { PlaybackClockSampleV0, PlaybackClockV0 } from "@lyricstage/core";
import {
  isYouTubeMusicSnapshotV0,
  type YouTubeMusicSnapshotV0,
} from "./protocol";

export class YouTubeMusicPlaybackClockV0 implements PlaybackClockV0 {
  readonly source = "youtubeMusic" as const;

  private accepted?: {
    snapshot: YouTubeMusicSnapshotV0;
    receivedAtMonotonicMs: number;
  };

  accept(snapshot: unknown, receivedAtMonotonicMs: number): boolean {
    if (!isYouTubeMusicSnapshotV0(snapshot)) return false;
    if (
      this.accepted &&
      snapshot.track.trackID === this.accepted.snapshot.track.trackID &&
      (
        snapshot.sentAtUnixMs < this.accepted.snapshot.sentAtUnixMs ||
        (
          snapshot.sentAtUnixMs === this.accepted.snapshot.sentAtUnixMs &&
          snapshot.sequence <= this.accepted.snapshot.sequence
        )
      )
    ) {
      return false;
    }
    this.accepted = { snapshot, receivedAtMonotonicMs };
    return true;
  }

  clear(): void {
    this.accepted = undefined;
  }

  sample(nowMs = performance.now()): PlaybackClockSampleV0 {
    const accepted = this.accepted;
    if (!accepted) {
      return {
        timeMs: 0,
        durationMs: 0,
        playbackRate: 1,
        state: "unavailable",
        authoritativeAtMs: nowMs,
      };
    }

    const { snapshot, receivedAtMonotonicMs } = accepted;
    const elapsed = Math.max(0, nowMs - receivedAtMonotonicMs);
    const extrapolated = snapshot.playback.state === "playing"
      ? snapshot.playback.currentTimeMs + elapsed * snapshot.playback.playbackRate
      : snapshot.playback.currentTimeMs;
    const boundedTime = snapshot.playback.durationMs > 0
      ? Math.min(snapshot.playback.durationMs, Math.max(0, extrapolated))
      : Math.max(0, extrapolated);
    return {
      timeMs: boundedTime,
      durationMs: snapshot.playback.durationMs,
      playbackRate: snapshot.playback.playbackRate,
      state: snapshot.playback.state,
      authoritativeAtMs: receivedAtMonotonicMs,
    };
  }
}
