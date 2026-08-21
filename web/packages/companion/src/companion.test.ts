import { describe, expect, it } from "vitest";
import { YouTubeMusicPlaybackClockV0 } from "./clock";
import { YouTubeMusicSourceRegistryV0 } from "./sourceRegistry";
import {
  isYouTubeMusicSnapshotV0,
  youtubeMusicCompanionVersion,
  youtubeMusicRecordingID,
  type YouTubeMusicSnapshotV0,
} from "./protocol";

const snapshot = (overrides: Partial<YouTubeMusicSnapshotV0> = {}): YouTubeMusicSnapshotV0 => ({
  type: "youtube-music-snapshot",
  version: youtubeMusicCompanionVersion,
  sequence: 4,
  sentAtUnixMs: 1000,
  track: {
    provider: "youtubeMusic",
    trackID: "abc123",
    title: "A song",
    artist: "An artist",
    pageURL: "https://music.youtube.com/watch?v=abc123",
  },
  playback: {
    currentTimeMs: 12000,
    durationMs: 180000,
    playbackRate: 1,
    state: "playing",
  },
  controls: {
    seek: true,
    playPause: true,
    previous: true,
    next: true,
  },
  ...overrides,
});

describe("YouTube Music companion protocol", () => {
  it("accepts a bounded, provider-neutral playback snapshot", () => {
    expect(isYouTubeMusicSnapshotV0(snapshot())).toBe(true);
    expect(youtubeMusicRecordingID("abc 123")).toBe("youtubeMusic:abc%20123");
  });

  it("rejects malformed playback facts", () => {
    expect(isYouTubeMusicSnapshotV0({ ...snapshot(), sequence: -1 })).toBe(false);
    expect(isYouTubeMusicSnapshotV0({ ...snapshot(), playback: { ...snapshot().playback, currentTimeMs: -1 } })).toBe(false);
    expect(isYouTubeMusicSnapshotV0({ ...snapshot(), track: { ...snapshot().track, trackID: "" } })).toBe(false);
    expect(isYouTubeMusicSnapshotV0({ ...snapshot(), controls: { ...snapshot().controls!, next: "yes" } })).toBe(false);
  });

  it("extrapolates only from an authoritative playing snapshot", () => {
    const clock = new YouTubeMusicPlaybackClockV0();
    expect(clock.accept(snapshot(), 200)).toBe(true);
    expect(clock.sample(700).timeMs).toBe(12500);
    expect(clock.accept(snapshot({ sequence: 3, sentAtUnixMs: 900 }), 800)).toBe(false);

    expect(clock.accept(snapshot({ sequence: 0, sentAtUnixMs: 1100 }), 900)).toBe(true);

    expect(clock.accept(snapshot({
      sequence: 5,
      sentAtUnixMs: 1200,
      playback: { ...snapshot().playback, currentTimeMs: 42000, state: "paused" },
    }), 1000)).toBe(true);
    expect(clock.sample(6000).timeMs).toBe(42000);
  });

  it("clamps extrapolation to the media duration", () => {
    const clock = new YouTubeMusicPlaybackClockV0();
    clock.accept(snapshot({
      playback: { ...snapshot().playback, currentTimeMs: 179900 },
    }), 0);
    expect(clock.sample(1000).timeMs).toBe(180000);
  });

  it("keeps moving when YouTube Music has not reported duration yet", () => {
    const clock = new YouTubeMusicPlaybackClockV0();
    clock.accept(snapshot({
      playback: { ...snapshot().playback, currentTimeMs: 5000, durationMs: 0 },
    }), 100);
    expect(clock.sample(600).timeMs).toBe(5500);
  });

  it("keeps one authoritative YouTube Music tab and hands over safely", () => {
    const registry = new YouTubeMusicSourceRegistryV0();
    expect(registry.accept(10, snapshot({ sentAtUnixMs: 1000 }), 1000)).toBe(true);
    expect(registry.accept(11, snapshot({
      sequence: 1,
      sentAtUnixMs: 1100,
      track: { ...snapshot().track, trackID: "paused-tab" },
      playback: { ...snapshot().playback, state: "paused" },
    }), 1100)).toBe(false);
    expect(registry.sourceTabID).toBe(10);

    expect(registry.remove(10)).toBe(true);
    expect(registry.state().connected).toBe(false);
    expect(registry.accept(11, snapshot({
      sequence: 2,
      sentAtUnixMs: 1200,
      track: { ...snapshot().track, trackID: "new-track" },
    }), 1200)).toBe(true);
    expect(registry.snapshot?.track.trackID).toBe("new-track");
  });

  it("expires a source lease instead of reporting a dead heartbeat forever", () => {
    const registry = new YouTubeMusicSourceRegistryV0();
    expect(registry.accept(10, snapshot({ sentAtUnixMs: 1000 }), 1000)).toBe(true);
    expect(registry.state(4000).connected).toBe(true);
    expect(registry.state(4001)).toEqual({
      type: "youtube-music-bridge-state",
      connected: false,
    });
    expect(registry.sourceTabID).toBeUndefined();
  });
});
