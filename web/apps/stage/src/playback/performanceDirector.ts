import type { LyricDocumentV0 } from "@lyricstage/contracts";
import type { LyricsLookupTrackV0 } from "@lyricstage/lyrics";
import {
  isDirectorPlanV1ForLyrics,
  type DirectorPlanV1,
  type MusicMapV1,
  type DirectorResolutionResponseV1,
} from "@lyricstage/performance";

export type DirectorLookupState =
  | { status: "idle" | "requesting"; reason?: string }
  | DirectorResolutionResponseV1;

export const directorPlanForStageEntry = (
  localPlan: DirectorPlanV1,
  remotePlan?: DirectorPlanV1,
): DirectorPlanV1 => remotePlan
  && remotePlan.recordingID === localPlan.recordingID
  && remotePlan.lyricsIdentity === localPlan.lyricsIdentity
  && (remotePlan.source === "ai" || remotePlan.source === "cache")
    ? remotePlan
    : localPlan;

interface ExtensionRuntime {
  id?: string;
  sendMessage(message: unknown): Promise<unknown>;
}

const extensionRuntime = (): ExtensionRuntime | undefined => {
  const runtime = (globalThis as typeof globalThis & {
    chrome?: { runtime?: ExtensionRuntime };
  }).chrome?.runtime;
  return runtime?.id && typeof runtime.sendMessage === "function" ? runtime : undefined;
};

export const requestAutomaticDirectorPlan = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
): Promise<DirectorResolutionResponseV1> => {
  const runtime = extensionRuntime();
  if (!runtime) {
    return {
      type: "director-resolution-v1",
      status: "unavailable",
      source: "local",
      reason: "extension-runtime-unavailable",
    };
  }
  const response = await runtime.sendMessage({
    type: "youtube-music-resolve-performance",
    track,
    lyrics,
    ...(musicMap ? { musicMap } : {}),
  }) as DirectorResolutionResponseV1 | undefined;
  if (response?.type !== "director-resolution-v1") {
    return {
      type: "director-resolution-v1",
      status: "error",
      source: "network",
      reason: "director-response-invalid",
    };
  }
  if (response.status === "ready" && (!response.plan || !isDirectorPlanV1ForLyrics(response.plan, lyrics))) {
    return {
      type: "director-resolution-v1",
      status: "error",
      source: response.source,
      reason: "director-plan-invalid",
    };
  }
  return response;
};

export const directorStatusLabel = (
  state: DirectorLookupState,
  activeSource: "local" | "ai" | "cache" = "local",
  hasQueuedPlan = false,
): string => {
  if (activeSource === "ai" || activeSource === "cache") return "AI 导演 · 已接管";
  if (hasQueuedPlan || state.status === "ready") return "AI 导演 · 下一段接管";
  if (state.status === "requesting") return "AI 导演 · 正在生成";
  if (state.status === "error") {
    if (state.reason?.includes("401")) return "本地演出 · AI 鉴权失败";
    if (state.reason?.toLowerCase().includes("abort")) return "本地演出 · AI 生成超时";
    return "本地演出 · AI 暂不可用";
  }
  if (state.status === "unavailable" && state.reason === "director-not-configured") {
    return "本地演出 · AI 未配置";
  }
  return "本地演出";
};
