export interface FullscreenCaptureOwnership {
  embedded: boolean;
  pinned: boolean;
  trackID?: string;
  captureID?: string;
}

interface FullscreenDocument {
  readonly fullscreenElement: unknown;
  addEventListener(type: "fullscreenchange", listener: () => void): void;
  removeEventListener(type: "fullscreenchange", listener: () => void): void;
}

interface FullscreenCaptureLifecycleOptions {
  document: FullscreenDocument;
  getOwnership(): FullscreenCaptureOwnership;
  onFullscreenState(active: boolean, embedded: boolean): void;
  stopAnalysis(trackID: string, captureID?: string): void;
  setTimer?: typeof globalThis.setTimeout;
  clearTimer?: typeof globalThis.clearTimeout;
}

export interface FullscreenCaptureLifecycle {
  mount(): () => void;
}

export const isFullscreenCapturePinnedForTrack = (
  pinnedTrackID: string | null | undefined,
  trackID: string | undefined,
): boolean => Boolean(trackID && pinnedTrackID === trackID);

export const pinnedTrackIDAfterCaptureStart = ({
  pinnedTrackID,
  requestedTrackID,
  currentTrackID,
  started,
}: {
  pinnedTrackID: string | null;
  requestedTrackID: string;
  currentTrackID: string | undefined;
  started: boolean;
}): string | null => {
  if (currentTrackID === requestedTrackID) return started ? requestedTrackID : null;
  return pinnedTrackID === requestedTrackID ? null : pinnedTrackID;
};

export const createFullscreenCaptureLifecycle = ({
  document,
  getOwnership,
  onFullscreenState,
  stopAnalysis,
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
}: FullscreenCaptureLifecycleOptions): FullscreenCaptureLifecycle => {
  let deferredUnmountStop: ReturnType<typeof globalThis.setTimeout> | undefined;

  const cancelDeferredUnmountStop = () => {
    if (deferredUnmountStop !== undefined) clearTimer(deferredUnmountStop);
    deferredUnmountStop = undefined;
  };

  return {
    mount: () => {
      // React StrictMode immediately cleans up and re-runs effects in
      // development. A remount in the same turn cancels that simulated
      // unmount instead of stopping the capture it just started.
      cancelDeferredUnmountStop();
      const onFullscreenChange = () => {
        const active = Boolean(document.fullscreenElement);
        const ownership = getOwnership();
        onFullscreenState(active, ownership.embedded);
        if (!active && ownership.embedded && !ownership.pinned && ownership.trackID) {
          // A genuine fullscreen exit may race the async start response, so
          // track identity intentionally remains the fallback owner key here.
          stopAnalysis(ownership.trackID);
        }
      };
      document.addEventListener("fullscreenchange", onFullscreenChange);

      return () => {
        document.removeEventListener("fullscreenchange", onFullscreenChange);
        const ownership = getOwnership();
        const trackID = ownership.trackID;
        if (!ownership.embedded || !trackID) return;
        deferredUnmountStop = setTimer(() => {
          deferredUnmountStop = undefined;
          // A real unmount has no remaining consumer, even when the user had
          // pinned analysis for Column use. StrictMode's simulated unmount is
          // canceled by mount() above before this timer can fire.
          stopAnalysis(trackID, ownership.captureID);
        }, 0);
      };
    },
  };
};
