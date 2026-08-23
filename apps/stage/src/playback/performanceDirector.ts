import { stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import {
  youtubeMusicBridgeFailureReasonV0,
  type YouTubeMusicBridgeFailureReasonV0,
} from "@lyricstage/companion";
import type { LyricsLookupTrackV0 } from "@lyricstage/lyrics";
import {
  isDirectorPlanV1ForLyrics,
  sanitizeDirectorBibleV1,
  type DirectorBibleV1,
  type DirectorPlanV1,
  type MusicMapV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
  type DirectorResolutionResponseV1,
} from "@lyricstage/performance";

export type DirectorLookupState =
  | { status: "idle" | "requesting"; reason?: string }
  | DirectorResolutionResponseV1;

const automaticDirectorTasks = new Map<string, Promise<DirectorResolutionResponseV1>>();

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
  const identity = stableHash32({ trackID: track.trackID, recordingID: lyrics.recordingID, lyrics });
  const existing = automaticDirectorTasks.get(identity);
  if (existing) return existing;
  const task = (async () => {
    const result = await requestDirectorBridgeWithOneRecovery({
      type: "youtube-music-resolve-performance",
      track,
      lyrics,
      ...(musicMap ? { musicMap } : {}),
    });
    if (!result.ok) {
      return {
        type: "director-resolution-v1" as const,
        status: result.reason === "extension-bridge-unavailable" ? "unavailable" as const : "error" as const,
        source: "local" as const,
        reason: result.reason,
      };
    }
    const response = result.response as DirectorResolutionResponseV1 | undefined;
    if (response?.type !== "director-resolution-v1") {
      return {
        type: "director-resolution-v1" as const,
        status: "error" as const,
        source: "network" as const,
        reason: "extension-bridge-response-invalid",
      };
    }
    if (response.status === "ready" && (!response.plan || !isDirectorPlanV1ForLyrics(response.plan, lyrics))) {
      return {
        type: "director-resolution-v1" as const,
        status: "error" as const,
        source: response.source,
        reason: "director-plan-invalid",
      };
    }
    return response;
  })().finally(() => automaticDirectorTasks.delete(identity));
  automaticDirectorTasks.set(identity, task);
  return task;
};

export interface DirectorBibleResolutionV1 {
  type: "director-bible-resolution-v1";
  status: "ready" | "unavailable" | "error" | "stale";
  source: "cache" | "network" | "local";
  bible?: DirectorBibleV1;
  reason?: string;
  timing?: unknown;
}

export interface DirectorCoverageResolutionV1 {
  type: "director-coverage-resolution-v1";
  status: "ready" | "unavailable" | "error" | "stale";
  source: "cache" | "network" | "local";
  cards: SceneCardV1[];
  coverage: {
    fromMs: number;
    toMs: number;
    aheadMs: number;
    activation: "immediate" | "next-boundary" | "local";
  };
  reason?: string;
  timing?: unknown;
}

const bibleBridgeFailure = (reason: string): DirectorBibleResolutionV1 => ({
  type: "director-bible-resolution-v1", status: "error", source: "local", reason,
});

const coverageBridgeFailure = (reason: string): DirectorCoverageResolutionV1 => ({
  type: "director-coverage-resolution-v1", status: "error", source: "local", cards: [],
  coverage: { fromMs: 0, toMs: 0, aheadMs: 0, activation: "local" }, reason,
});

export const requestDirectorBibleV1 = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
): Promise<DirectorBibleResolutionV1> => {
  const result = await requestDirectorBridgeWithOneRecovery({
    type: "youtube-music-resolve-director-bible-v1", track, lyrics, ...(musicMap ? { musicMap } : {}),
  });
  if (!result.ok) return bibleBridgeFailure(result.reason);
  const response = result.response as DirectorBibleResolutionV1 | undefined;
  if (response?.type !== "director-bible-resolution-v1"
    || !["ready", "unavailable", "error", "stale"].includes(response.status)
    || !["cache", "network", "local"].includes(response.source)) {
    return bibleBridgeFailure("extension-bridge-response-invalid");
  }
  if (response.status === "ready" && (!response.bible || !sanitizeDirectorBibleV1(lyrics, response.bible))) {
    return bibleBridgeFailure("director-bible-invalid");
  }
  return response;
};

export const requestDirectorCoverageV1 = async (
  track: LyricsLookupTrackV0,
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  playheadMs: number,
  desiredHorizonMs: number,
  options: {
    musicMap?: MusicMapV1;
    paused?: boolean;
    seekTargetMs?: number;
    state?: RollingPerformanceStateV1;
  } = {},
): Promise<DirectorCoverageResolutionV1> => {
  const result = await requestDirectorBridgeWithOneRecovery({
    type: "youtube-music-resolve-director-coverage-v1",
    track, lyrics, bible, playheadMs, desiredHorizonMs,
    ...(options.musicMap ? { musicMap: options.musicMap } : {}),
    ...(options.paused ? { paused: true } : {}),
    ...(options.seekTargetMs !== undefined ? { seekTargetMs: options.seekTargetMs } : {}),
    ...(options.state ? { state: options.state } : {}),
  });
  if (!result.ok) return coverageBridgeFailure(result.reason);
  const response = result.response as DirectorCoverageResolutionV1 | undefined;
  if (response?.type !== "director-coverage-resolution-v1" || !Array.isArray(response.cards)
    || !["ready", "unavailable", "error", "stale"].includes(response.status)
    || !["cache", "network", "local"].includes(response.source)
    || !response.coverage || !Number.isFinite(response.coverage.fromMs) || !Number.isFinite(response.coverage.toMs)
    || !Number.isFinite(response.coverage.aheadMs) || response.coverage.fromMs < 0
    || response.coverage.toMs < response.coverage.fromMs || response.coverage.toMs > lyrics.durationMs
    || !["immediate", "next-boundary", "local"].includes(response.coverage.activation)) {
    return coverageBridgeFailure("extension-bridge-response-invalid");
  }
  return response;
};

export const directorStatusLabel = (
  state: DirectorLookupState,
  activeSource: "local" | "ai" | "cache" | "continuity" = "local",
  hasQueuedPlan = false,
): string => {
  if (activeSource === "ai" || activeSource === "cache") return "AI 导演 · 已接管";
  if (activeSource === "continuity") return "AI 结构 · 本地续演";
  if (hasQueuedPlan || state.status === "ready") return "AI 导演 · 下一段接管";
  if (state.status === "requesting") return "AI 导演 · 正在生成";
  if (state.status === "error") {
    if (state.reason === "extension-context-invalidated") return "本地演出 · 扩展需刷新";
    if (state.reason?.startsWith("extension-bridge-")) return "本地演出 · 扩展桥接中断";
    if (state.reason?.includes("401")) return "本地演出 · AI 鉴权失败";
    if (state.reason?.includes("403")) return "本地演出 · AI 无访问权限";
    if (state.reason?.includes("budget")) return "本地演出 · 本曲 AI 预算已用完";
    if (state.reason?.toLowerCase().includes("abort")) return "本地演出 · AI 生成超时";
    const attempt = state.timing?.attempts.at(-1);
    if (attempt?.outcome === "http-error") {
      return attempt.status === 401 || attempt.status === 403
        ? "本地演出 · AI 鉴权失败"
        : `本地演出 · AI HTTP ${attempt.status ?? "错误"}`;
    }
    if (attempt?.outcome === "contract-degraded") return "本地演出 · AI 合同未通过";
    if (attempt?.outcome === "parse-error") return "本地演出 · AI 响应解析失败";
    if (attempt?.outcome === "timeout") return "本地演出 · AI 生成超时";
    if (attempt?.outcome === "network-error") return "本地演出 · AI 网络失败";
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

export const directorStatusDetail = (state: DirectorLookupState): string | undefined => {
  if (state.status === "requesting") return "同曲只生成一次；音乐分析稍后在本地融合";
  if (!("timing" in state) || !state.timing) return state.reason;
  const timing = state.timing;
  const timingDetail = `总计 ${timing.totalMs}ms · 模型 ${timing.providerMs}ms · 合同 ${timing.contractMs}ms · ${timing.attempts.length} 次 · 输入 ${Math.round(timing.inputBytes / 1024)}KB`;
  return state.reason ? `${state.reason} · ${timingDetail}` : timingDetail;
};
