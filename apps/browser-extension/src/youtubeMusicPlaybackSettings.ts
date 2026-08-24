interface PlaybackSettingsRequest {
  type?: string;
  expectedTrackID?: unknown;
  volume?: unknown;
  muted?: unknown;
  mode?: unknown;
  enabled?: unknown;
  repeat?: unknown;
}

interface PlaybackSettingsDependencies {
  preferredTabID?: number;
  setVolume(volume: number | undefined, muted: boolean | undefined, trackID: string, tabID?: number): Promise<unknown>;
  setMode(mode: "shuffle" | "repeat", value: boolean | "off" | "all" | "one", trackID: string, tabID?: number): Promise<unknown>;
}

export const routeYouTubeMusicPlaybackSettings = (
  request: PlaybackSettingsRequest,
  sendResponse: (value: unknown) => void,
  dependencies: PlaybackSettingsDependencies,
): boolean | undefined => {
  if (request.type === "youtube-music-volume") {
    if (typeof request.expectedTrackID !== "string"
      || (typeof request.volume !== "number" && typeof request.muted !== "boolean")) {
      sendResponse({ ok: false, reason: "invalid-volume" });
      return false;
    }
    void dependencies.setVolume(
      typeof request.volume === "number" ? request.volume : undefined,
      typeof request.muted === "boolean" ? request.muted : undefined,
      request.expectedTrackID,
      dependencies.preferredTabID,
    ).then(sendResponse, () => sendResponse({ ok: false, reason: "volume-failed" }));
    return true;
  }
  if (request.type !== "youtube-music-playback-mode") return undefined;
  const mode = request.mode;
  const value = mode === "shuffle" ? request.enabled : request.repeat;
  if ((mode !== "shuffle" && mode !== "repeat") || typeof request.expectedTrackID !== "string") {
    sendResponse({ ok: false, reason: "invalid-playback-mode" });
    return false;
  }
  void dependencies.setMode(
    mode,
    value as boolean | "off" | "all" | "one",
    request.expectedTrackID,
    dependencies.preferredTabID,
  ).then(sendResponse, () => sendResponse({ ok: false, reason: "playback-mode-failed" }));
  return true;
};

