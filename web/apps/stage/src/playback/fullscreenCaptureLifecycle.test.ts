import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFullscreenCaptureLifecycle,
  isFullscreenCapturePinnedForTrack,
  pinnedTrackIDAfterCaptureStart,
  type FullscreenCaptureOwnership,
} from "./fullscreenCaptureLifecycle";

class FakeFullscreenDocument {
  fullscreenElement: unknown = {};
  listener?: () => void;

  addEventListener(_type: "fullscreenchange", listener: () => void) {
    this.listener = listener;
  }

  removeEventListener(_type: "fullscreenchange", listener: () => void) {
    if (this.listener === listener) this.listener = undefined;
  }

  emit() {
    this.listener?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("embedded fullscreen capture lifecycle", () => {
  it("binds a pinned capture to one track identity", () => {
    expect(isFullscreenCapturePinnedForTrack("track-a", "track-a")).toBe(true);
    expect(isFullscreenCapturePinnedForTrack("track-a", "track-b")).toBe(false);
    expect(isFullscreenCapturePinnedForTrack("track-a", undefined)).toBe(false);
  });

  it("does not resurrect a stale pin when capture start resolves after a track change", () => {
    expect(pinnedTrackIDAfterCaptureStart({
      pinnedTrackID: null,
      requestedTrackID: "track-a",
      currentTrackID: "track-b",
      started: true,
    })).toBeNull();
    expect(pinnedTrackIDAfterCaptureStart({
      pinnedTrackID: "track-b",
      requestedTrackID: "track-a",
      currentTrackID: "track-b",
      started: true,
    })).toBe("track-b");
  });

  it("does not stop a capture merely because its captureID arrives", () => {
    vi.useFakeTimers();
    const document = new FakeFullscreenDocument();
    const stopAnalysis = vi.fn();
    let ownership: FullscreenCaptureOwnership = {
      embedded: true,
      pinned: false,
      trackID: "track-a",
    };
    const lifecycle = createFullscreenCaptureLifecycle({
      document,
      getOwnership: () => ownership,
      onFullscreenState: vi.fn(),
      stopAnalysis,
    });
    const cleanup = lifecycle.mount();

    ownership = { ...ownership, captureID: "capture-a" };
    vi.runAllTimers();
    expect(stopAnalysis).not.toHaveBeenCalled();

    cleanup();
    vi.runAllTimers();
    expect(stopAnalysis).toHaveBeenCalledOnce();
    expect(stopAnalysis).toHaveBeenCalledWith("track-a", "capture-a");
  });

  it("cancels React StrictMode's simulated unmount when the effect remounts", () => {
    vi.useFakeTimers();
    const document = new FakeFullscreenDocument();
    const stopAnalysis = vi.fn();
    const ownership: FullscreenCaptureOwnership = {
      embedded: true,
      pinned: false,
      trackID: "track-a",
      captureID: "capture-a",
    };
    const lifecycle = createFullscreenCaptureLifecycle({
      document,
      getOwnership: () => ownership,
      onFullscreenState: vi.fn(),
      stopAnalysis,
    });

    const simulatedCleanup = lifecycle.mount();
    simulatedCleanup();
    const realCleanup = lifecycle.mount();
    vi.runAllTimers();
    expect(stopAnalysis).not.toHaveBeenCalled();

    realCleanup();
    vi.runAllTimers();
    expect(stopAnalysis).toHaveBeenCalledOnce();
  });

  it("uses track ownership to cancel a pending capture on a real fullscreen exit", () => {
    const document = new FakeFullscreenDocument();
    const stopAnalysis = vi.fn();
    const onFullscreenState = vi.fn();
    const lifecycle = createFullscreenCaptureLifecycle({
      document,
      getOwnership: () => ({
        embedded: true,
        pinned: false,
        trackID: "track-a",
      }),
      onFullscreenState,
      stopAnalysis,
    });
    lifecycle.mount();

    document.fullscreenElement = null;
    document.emit();
    expect(onFullscreenState).toHaveBeenCalledWith(false, true);
    expect(stopAnalysis).toHaveBeenCalledWith("track-a");
  });

  it("keeps a pinned capture on fullscreen exit but stops it on a real unmount", () => {
    vi.useFakeTimers();
    const document = new FakeFullscreenDocument();
    const stopAnalysis = vi.fn();
    const lifecycle = createFullscreenCaptureLifecycle({
      document,
      getOwnership: () => ({
        embedded: true,
        pinned: true,
        trackID: "track-b",
        captureID: "capture-b",
      }),
      onFullscreenState: vi.fn(),
      stopAnalysis,
    });
    const cleanup = lifecycle.mount();

    document.fullscreenElement = null;
    document.emit();
    expect(stopAnalysis).not.toHaveBeenCalled();

    cleanup();
    vi.runAllTimers();
    expect(stopAnalysis).toHaveBeenCalledOnce();
    expect(stopAnalysis).toHaveBeenCalledWith("track-b", "capture-b");
  });
});
