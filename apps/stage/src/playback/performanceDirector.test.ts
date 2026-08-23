import { afterEach, describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import {
  compileLocalDirectorBibleV1,
  compileLocalDirectorPlanV1,
  compileLocalSceneCardsV1,
  type MusicMapV1,
} from "@lyricstage/performance";
import type { LyricsLookupTrackV0 } from "@lyricstage/lyrics";
import {
  directorPlanForStageEntry,
  directorStatusDetail,
  directorStatusLabel,
  requestAutomaticDirectorPlan,
  requestDirectorBibleV1,
  requestDirectorBridgeWithOneRecovery,
  requestDirectorCoverageV1,
} from "./performanceDirector";

const track: LyricsLookupTrackV0 = {
  provider: "youtubeMusic",
  trackID: "fixture-track",
  title: "Fixture Song",
  artist: "Fixture Artist",
  durationMs: lyricFixtures.wordTimedMixed.durationMs,
};

afterEach(() => {
  delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
});

describe("requestAutomaticDirectorPlan", () => {
  it("returns a strictly matching plan from the extension background", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const plan = compileLocalDirectorPlanV1(lyrics);
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "extension-test",
        sendMessage: async () => ({
          type: "director-resolution-v1",
          status: "ready",
          source: "cache",
          plan,
        }),
      },
    };
    await expect(requestAutomaticDirectorPlan(track, lyrics)).resolves.toEqual({
      type: "director-resolution-v1",
      status: "ready",
      source: "cache",
      plan,
    });
  });

  it("forwards a bounded MusicMap when it already exists at single-flight start", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const plan = compileLocalDirectorPlanV1(lyrics);
    let request: unknown;
    const musicMap: MusicMapV1 = {
      version: "music-map-v1",
      source: "tab-capture",
      durationMs: lyrics.durationMs,
      analyzedMs: 28_000,
      featureRateHz: 30,
      tempo: null,
      summary: { dynamicRange: 0.4, meanEnergy: 0.3, peakEnergy: 0.8, silenceRatio: 0.1 },
      segments: [],
      landmarks: [],
    };
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "extension-test",
        sendMessage: async (message: unknown) => {
          request = message;
          return { type: "director-resolution-v1", status: "ready", source: "network", plan };
        },
      },
    };
    await requestAutomaticDirectorPlan(track, lyrics, musicMap);
    expect(request).toMatchObject({ type: "youtube-music-resolve-performance", musicMap });
  });

  it("coalesces a late MusicMap request instead of starting a second generation", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const plan = compileLocalDirectorPlanV1(lyrics);
    let requestCount = 0;
    let release: ((value: unknown) => void) | undefined;
    const pending = new Promise<unknown>((resolve) => { release = resolve; });
    const musicMap: MusicMapV1 = {
      version: "music-map-v1", source: "tab-capture", durationMs: lyrics.durationMs,
      analyzedMs: 28_000, featureRateHz: 30, tempo: null,
      summary: { dynamicRange: 0.4, meanEnergy: 0.3, peakEnergy: 0.8, silenceRatio: 0.1 },
      segments: [], landmarks: [],
    };
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: { id: "extension-test", sendMessage: async () => { requestCount += 1; return pending; } },
    };
    const first = requestAutomaticDirectorPlan(track, lyrics);
    const second = requestAutomaticDirectorPlan(track, lyrics, musicMap);
    expect(requestCount).toBe(1);
    release?.({ type: "director-resolution-v1", status: "ready", source: "network", plan });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(requestCount).toBe(1);
  });

  it("rejects a plan for another lyric identity without throwing", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const wrong = compileLocalDirectorPlanV1(lyricFixtures.lineOnlyJA);
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "extension-test",
        sendMessage: async () => ({
          type: "director-resolution-v1",
          status: "ready",
          source: "network",
          plan: wrong,
        }),
      },
    };
    await expect(requestAutomaticDirectorPlan(track, lyrics)).resolves.toMatchObject({
      status: "error",
      reason: "director-plan-invalid",
    });
  });

  it("quietly preserves local fallback when the extension is unavailable", async () => {
    await expect(requestAutomaticDirectorPlan(track, lyricFixtures.wordTimedMixed)).resolves.toMatchObject({
      status: "unavailable",
      reason: "extension-bridge-unavailable",
    });
  });

  it("retries one transient MV3 bridge failure for the same request and then stops", async () => {
    let calls = 0;
    const result = await requestDirectorBridgeWithOneRecovery(
      { type: "fixture-request" },
      () => ({
        id: "extension-test",
        sendMessage: async () => {
          calls += 1;
          if (calls === 1) throw new Error("service worker restarted");
          return { ok: true };
        },
      }),
    );
    expect(result).toEqual({ ok: true, response: { ok: true }, attempts: 2 });
    expect(calls).toBe(2);
  });

  it("does not retry a fatal invalidated extension context", async () => {
    let calls = 0;
    const result = await requestDirectorBridgeWithOneRecovery(
      { type: "fixture-request" },
      () => ({
        id: "extension-test",
        sendMessage: async () => {
          calls += 1;
          throw new Error("Extension context invalidated.");
        },
      }),
    );
    expect(result).toEqual({
      ok: false,
      reason: "extension-context-invalidated",
      attempts: 1,
    });
    expect(calls).toBe(1);
  });

  it("classifies an exhausted sendMessage failure as an extension bridge error", async () => {
    let calls = 0;
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "extension-test",
        sendMessage: async () => {
          calls += 1;
          throw new Error("message channel closed");
        },
      },
    };
    await expect(requestAutomaticDirectorPlan(track, lyricFixtures.wordTimedMixed)).resolves.toMatchObject({
      status: "error",
      source: "local",
      reason: "extension-bridge-request-failed",
    });
    expect(calls).toBe(2);
  });

  it("explains generation, queued handoff, active AI and safe fallback states", () => {
    expect(directorStatusLabel({ status: "requesting" })).toBe("AI 导演 · 正在生成");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "ready",
      source: "network",
    })).toBe("AI 导演 · 下一段接管");
    expect(directorStatusLabel({ status: "requesting" }, "local", true)).toBe("AI 导演 · 下一段接管");
    expect(directorStatusLabel({ status: "idle" }, "ai")).toBe("AI 导演 · 已接管");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "error",
      source: "local",
      reason: "rolling-provider-http-error-http-403",
    })).toBe("本地演出 · AI 无访问权限");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "error",
      source: "local",
      reason: "scene-local-continuity-fallback:rolling-budget-exhausted",
    })).toBe("本地演出 · 本曲 AI 预算已用完");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "unavailable",
      source: "local",
      reason: "director-not-configured",
    })).toBe("本地演出 · AI 未配置");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "error",
      source: "local",
      reason: "extension-bridge-request-failed",
    })).toBe("本地演出 · 扩展桥接中断");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "error",
      source: "local",
      reason: "extension-context-invalidated",
    })).toBe("本地演出 · 扩展需刷新");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "error",
      source: "network",
      timing: {
        version: "director-timing-v1", cache: "miss", totalMs: 430, cacheMs: 1,
        requestBuildMs: 2, providerMs: 420, contractMs: 0, adaptationMs: 0,
        inputBytes: 12_000, outputBytes: 120,
        attempts: [{ sequence: 1, protocol: "gemini", model: "flash", format: "json-schema", status: 400, elapsedMs: 420, responseBytes: 120, outcome: "http-error" }],
        completedAt: "2026-08-23T00:00:00.000Z",
      },
    })).toBe("本地演出 · AI HTTP 400");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "error",
      source: "network",
      timing: {
        version: "director-timing-v1", cache: "miss", totalMs: 430, cacheMs: 1,
        requestBuildMs: 2, providerMs: 420, contractMs: 0, adaptationMs: 0,
        inputBytes: 12_000, outputBytes: 120,
        attempts: [{ sequence: 1, protocol: "gemini", model: "flash", format: "json-schema", status: 200, elapsedMs: 420, responseBytes: 120, outcome: "contract-degraded" }],
        completedAt: "2026-08-23T00:00:00.000Z",
      },
    })).toBe("本地演出 · AI 合同未通过");
    expect(directorStatusLabel({
      type: "director-resolution-v1",
      status: "unavailable",
      source: "local",
      reason: "extension-bridge-unavailable",
    })).toBe("本地演出 · 扩展桥接不可用");
    expect(directorStatusDetail({
      type: "director-resolution-v1",
      status: "ready",
      source: "network",
      timing: {
        version: "director-timing-v1", cache: "miss", totalMs: 12_400, cacheMs: 2,
        requestBuildMs: 3, providerMs: 12_360, contractMs: 5, adaptationMs: 1,
        inputBytes: 24_000, outputBytes: 8_000,
        attempts: [{ sequence: 1, protocol: "openai-responses", model: "fast", format: "json-schema", status: 200, elapsedMs: 12_360, responseBytes: 8_000, outcome: "ready" }],
        completedAt: "2026-08-23T00:00:00.000Z",
      },
    })).toContain("模型 12360ms");
    expect(directorStatusDetail({
      type: "director-resolution-v1",
      status: "error",
      source: "network",
      reason: "gemini:flash:HTTP 403 · permission denied",
      timing: {
        version: "director-timing-v1", cache: "miss", totalMs: 185, cacheMs: 1,
        requestBuildMs: 3, providerMs: 134, contractMs: 0, adaptationMs: 0,
        inputBytes: 12_000, outputBytes: 240,
        attempts: [{ sequence: 1, protocol: "gemini", model: "flash", format: "json-schema", status: 403, elapsedMs: 134, responseBytes: 240, outcome: "http-error" }],
        completedAt: "2026-08-23T00:00:00.000Z",
      },
    })).toContain("permission denied · 总计 185ms");
  });
});

describe("rolling director bridge", () => {
  it("uses the two versioned messages without changing the legacy request", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const cards = compileLocalSceneCardsV1(lyrics, bible);
    const messages: unknown[] = [];
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: {
        id: "extension-test",
        sendMessage: async (message: any) => {
          messages.push(message);
          return message.type === "youtube-music-resolve-director-bible-v1"
            ? { type: "director-bible-resolution-v1", status: "ready", source: "cache", bible }
            : {
                type: "director-coverage-resolution-v1", status: "ready", source: "cache", cards,
                coverage: { fromMs: 0, toMs: lyrics.durationMs, aheadMs: lyrics.durationMs, activation: "immediate" },
              };
        },
      },
    };
    await expect(requestDirectorBibleV1(track, lyrics)).resolves.toMatchObject({ status: "ready", bible });
    await expect(requestDirectorCoverageV1(track, lyrics, bible, 0, 60_000, {
      paused: true,
      seekTargetMs: Math.max(0, lyrics.durationMs - 1_000),
    })).resolves.toMatchObject({ status: "ready", cards });
    expect(messages.map((message: any) => message.type)).toEqual([
      "youtube-music-resolve-director-bible-v1",
      "youtube-music-resolve-director-coverage-v1",
    ]);
    expect(messages[1]).toMatchObject({ paused: true, seekTargetMs: Math.max(0, lyrics.durationMs - 1_000) });
  });

  it("rejects an invalid Bible response at the Stage bridge", async () => {
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      runtime: { id: "extension-test", sendMessage: async () => ({
        type: "director-bible-resolution-v1", status: "ready", source: "network", bible: { version: "director-bible-v1" },
      }) },
    };
    await expect(requestDirectorBibleV1(track, lyricFixtures.wordTimedMixed)).resolves.toMatchObject({
      status: "error", reason: "director-bible-invalid",
    });
  });
});

describe("directorPlanForStageEntry", () => {
  it("starts a newly opened stage with an already prepared AI plan", () => {
    const local = compileLocalDirectorPlanV1(lyricFixtures.lineOnlyJA);
    const ai = { ...local, source: "ai" as const, planIdentity: `${local.planIdentity}:ai` };
    expect(directorPlanForStageEntry(local, ai)).toBe(ai);
  });

  it("refuses a stale remote plan from another lyric identity", () => {
    const local = compileLocalDirectorPlanV1(lyricFixtures.lineOnlyJA);
    const stale = {
      ...local,
      source: "cache" as const,
      lyricsIdentity: `${local.lyricsIdentity}:stale`,
      planIdentity: `${local.planIdentity}:stale`,
    };
    expect(directorPlanForStageEntry(local, stale)).toBe(local);
  });
});
