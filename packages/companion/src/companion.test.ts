import { describe, expect, it } from "vitest";
import { YouTubeMusicPlaybackClockV0 } from "./clock";
import { YouTubeMusicSourceRegistryV0 } from "./sourceRegistry";
import {
  isYouTubeMusicSnapshotV0,
  youtubeMusicBridgeFailureReasonV0,
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

  it("classifies an invalidated extension context as a fatal bridge failure", () => {
    expect(youtubeMusicBridgeFailureReasonV0(new Error("Extension context invalidated.")))
      .toBe("extension-context-invalidated");
    expect(youtubeMusicBridgeFailureReasonV0({ message: "Extension context invalidated." }))
      .toBe("extension-context-invalidated");
    expect(youtubeMusicBridgeFailureReasonV0(new Error("message channel closed")))
      .toBe("extension-bridge-request-failed");
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
    }), 1100)).toBe(true);
    expect(registry.sourceTabID).toBe(10);
    expect(registry.snapshotForTab(11, 1100)?.track.trackID).toBe("paused-tab");

    expect(registry.remove(10)).toBe(true);
    expect(registry.state(1100)).toMatchObject({
      connected: true,
      snapshot: { track: { trackID: "paused-tab" } },
    });
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

  it("keeps each embedded Stage bound to its own tab while standalone uses the authoritative source", () => {
    const registry = new YouTubeMusicSourceRegistryV0();
    const first = snapshot({
      sentAtUnixMs: 1000,
      track: { ...snapshot().track, trackID: "first-playing" },
    });
    const second = snapshot({
      sequence: 1,
      sentAtUnixMs: 1100,
      track: { ...snapshot().track, trackID: "second-paused" },
      playback: { ...snapshot().playback, state: "paused" },
    });

    expect(registry.accept(10, first, 1000)).toBe(true);
    expect(registry.accept(11, second, 1100)).toBe(true);
    expect(registry.state(1100).snapshot?.track.trackID).toBe("first-playing");
    expect(registry.stateForTab(10, 1100).snapshot?.track.trackID).toBe("first-playing");
    expect(registry.stateForTab(11, 1100).snapshot?.track.trackID).toBe("second-paused");
    expect(registry.stateForTab(12, 1100)).toEqual({
      type: "youtube-music-bridge-state",
      connected: false,
    });
  });

  it("leases by local receipt time so a sender clock in the future cannot lock the source", () => {
    const registry = new YouTubeMusicSourceRegistryV0();
    expect(registry.accept(10, snapshot({ sentAtUnixMs: 9_999_999_999 }), 1000)).toBe(true);
    expect(registry.state(4000).connected).toBe(true);
    expect(registry.state(4001).connected).toBe(false);

    expect(registry.accept(10, snapshot({
      sequence: 0,
      sentAtUnixMs: 2000,
      track: { ...snapshot().track, trackID: "recovered-after-future-clock" },
    }), 4001)).toBe(true);
    expect(registry.snapshotForTab(10, 4001)?.track.trackID).toBe("recovered-after-future-clock");
  });

  it("expires tabs independently and promotes the newest live playing source", () => {
    const registry = new YouTubeMusicSourceRegistryV0();
    registry.accept(10, snapshot({ sentAtUnixMs: 1000 }), 1000);
    registry.accept(11, snapshot({
      sentAtUnixMs: 1001,
      track: { ...snapshot().track, trackID: "secondary-playing" },
    }), 2000);

    expect(registry.stateForTab(10, 4001).connected).toBe(false);
    expect(registry.sourceTabID).toBe(11);
    expect(registry.snapshot?.track.trackID).toBe("secondary-playing");
  });

  it("hands standalone authority to an already-known playing tab when the current tab pauses", () => {
    const registry = new YouTubeMusicSourceRegistryV0();
    registry.accept(10, snapshot({
      sentAtUnixMs: 1000,
      track: { ...snapshot().track, trackID: "first" },
    }), 1000);
    registry.accept(11, snapshot({
      sentAtUnixMs: 1100,
      track: { ...snapshot().track, trackID: "second" },
    }), 1100);
    expect(registry.sourceTabID).toBe(10);

    registry.accept(10, snapshot({
      sequence: 5,
      sentAtUnixMs: 1200,
      track: { ...snapshot().track, trackID: "first" },
      playback: { ...snapshot().playback, state: "paused" },
    }), 1200);
    expect(registry.sourceTabID).toBe(11);
  });
});
