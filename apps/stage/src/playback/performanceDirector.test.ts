import { afterEach, describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1, type MusicMapV1 } from "@lyricstage/performance";
import type { LyricsLookupTrackV0 } from "@lyricstage/lyrics";
import {
  directorPlanForStageEntry,
  directorStatusLabel,
  requestAutomaticDirectorPlan,
  requestDirectorBridgeWithOneRecovery,
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

  it("forwards the bounded music map for the second director pass", async () => {
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
    expect(directorStatusLabel({ status: "idle" }, "ai")).toBe("AI 导演 · 已接管");
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
      status: "unavailable",
      source: "local",
      reason: "extension-bridge-unavailable",
    })).toBe("本地演出 · 扩展桥接不可用");
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
