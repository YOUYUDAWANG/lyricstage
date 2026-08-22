import type { LyricDocumentV0 } from "@lyricstage/contracts";
import {
  youtubeMusicBridgeFailureReasonV0,
  type YouTubeMusicBridgeFailureReasonV0,
} from "@lyricstage/companion";
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

export type DirectorBridgeRequestResultV0 =
  | { ok: true; response: unknown; attempts: 1 | 2 }
  | {
      ok: false;
      reason: YouTubeMusicBridgeFailureReasonV0;
      attempts: 0 | 1 | 2;
    };

export const requestDirectorBridgeWithOneRecovery = async (
  message: unknown,
  resolveRuntime: () => ExtensionRuntime | undefined = extensionRuntime,
): Promise<DirectorBridgeRequestResultV0> => {
  for (const attempts of [1, 2] as const) {
    let runtime: ExtensionRuntime | undefined;
    try {
      runtime = resolveRuntime();
    } catch (error) {
      return {
        ok: false,
        reason: youtubeMusicBridgeFailureReasonV0(error, "extension-bridge-unavailable"),
        attempts: attempts === 1 ? 0 : 1,
      };
    }
    if (!runtime) {
      return {
        ok: false,
        reason: "extension-bridge-unavailable",
        attempts: attempts === 1 ? 0 : 1,
      };
    }
    try {
      return { ok: true, response: await runtime.sendMessage(message), attempts };
    } catch (error) {
      const reason = youtubeMusicBridgeFailureReasonV0(error);
      if (reason === "extension-context-invalidated" || attempts === 2) {
        return { ok: false, reason, attempts };
      }
      // Re-read chrome.runtime once: MV3 may have restarted the worker between calls.
      await Promise.resolve();
    }
  }
  return { ok: false, reason: "extension-bridge-request-failed", attempts: 2 };
};

export const requestAutomaticDirectorPlan = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
): Promise<DirectorResolutionResponseV1> => {
  const result = await requestDirectorBridgeWithOneRecovery({
    type: "youtube-music-resolve-performance",
    track,
    lyrics,
    ...(musicMap ? { musicMap } : {}),
  });
  if (!result.ok) {
    return {
      type: "director-resolution-v1",
      status: result.reason === "extension-bridge-unavailable" ? "unavailable" : "error",
      source: "local",
      reason: result.reason,
    };
  }
  const response = result.response as DirectorResolutionResponseV1 | undefined;
  if (response?.type !== "director-resolution-v1") {
    return {
      type: "director-resolution-v1",
      status: "error",
      source: "network",
      reason: "extension-bridge-response-invalid",
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
    if (state.reason === "extension-context-invalidated") return "本地演出 · 扩展需刷新";
    if (state.reason?.startsWith("extension-bridge-")) return "本地演出 · 扩展桥接中断";
    if (state.reason?.includes("401")) return "本地演出 · AI 鉴权失败";
    if (state.reason?.toLowerCase().includes("abort")) return "本地演出 · AI 生成超时";
    return "本地演出 · AI 暂不可用";
  }
  if (state.status === "unavailable" && state.reason === "director-not-configured") {
    return "本地演出 · AI 未配置";
  }
  if (state.status === "unavailable" && state.reason === "extension-bridge-unavailable") {
    return "本地演出 · 扩展桥接不可用";
  }
  return "本地演出";
};
