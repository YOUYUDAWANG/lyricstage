import { defaultDirectorProviderEndpointV1 } from "@lyricstage/performance";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apiKeyPlaceholder,
  buildDirectorDiscoveryPayload,
  buildDirectorSavePayload,
  canReuseSavedProviderKey,
  defaultDirectorEndpoint,
  displayLyricsEndpoint,
  draftFromPublicProvider,
  directorTimingCopy,
  directorDraftValidationMessage,
  emptyProviderDraft,
  endpointForChangedProtocol,
  settingsSectionFromHash,
  summarizeDirectorConfig,
  summarizeLyricsConfig,
  uniqueOriginPatterns,
} from "./settingsModel";
import { directorReviewAggregateV1, directorReviewStateFromResponseV1 } from "./directorReviewModel";

describe("extension settings model", () => {
  it("defaults hash-less settings navigation to lyrics", () => {
    expect(settingsSectionFromHash("")).toBe("lyrics");
    expect(settingsSectionFromHash("#director")).toBe("director");
    expect(settingsSectionFromHash("#unknown")).toBe("lyrics");
  });

  it("models Director review loading, empty, ready, and error states", () => {
    expect(directorReviewAggregateV1({ status: "loading", summaries: [] })).toContain("正在读取");
    expect(directorReviewStateFromResponseV1({ type: "director-cache-summaries-v1", summaries: [] })).toEqual({ status: "empty", summaries: [] });
    expect(directorReviewStateFromResponseV1({ type: "wrong", summaries: [] })).toMatchObject({ status: "error" });
    expect(directorReviewStateFromResponseV1({
      type: "director-cache-summaries-v1", summaries: [{
        version: "director-cache-summary-v1", trackTitle: "Song", trackArtist: "Artist", trackIDDisplay: "abcdef01",
        durationMs: 180_000, lineCount: 30, cacheVersion: "rolling-v1", cacheEpoch: "rolling-director-generation-v1.1", source: "cache",
        createdAtUnixMs: 1, expiresAtUnixMs: 2, bibleIdentityPrefix: "abcdef01", biblePresent: true,
        sceneCardCount: 0, coveragePercent: 0, missingRanges: [{ fromMs: 0, toMs: 180_000 }],
        baseLayout: "monument", layoutTransitionCount: 0, continuityJustificationAccepted: false,
        motifFamily: "thread", actCount: 3, signatureMomentCount: 3,
        gestureCounts: { glyph: 0, token: 0, phrase: 0, total: 0 }, effectCount: 0, effectPrimitiveCounts: {},
        artDirections: [], world: { spatialMode: "anchored", artworkRole: "anchor", motionLaw: "drift" },
        quietSharePercent: 0, localRepairFlags: [], reachedFinalWindow: false, warnings: [],
      }],
    })).toMatchObject({ status: "ready" });
  });

  it("keeps Director review rows static and provides no cache deletion control", () => {
    const source = readFileSync(new URL("./SettingsApp.tsx", import.meta.url), "utf8");
    const reviewStart = source.indexOf("Director 审片");
    const review = source.slice(reviewStart, source.indexOf("section === \"performance\"", reviewStart));
    expect(review).toContain("director-review-row");
    expect(review).not.toMatch(/delete|删除|regenerate|重新生成/ui);
    const css = readFileSync(new URL("./settings.css", import.meta.url), "utf8");
    const reviewCSS = css.slice(css.indexOf("/* director-review-start */"), css.indexOf("/* director-review-end */"));
    expect(reviewCSS).not.toMatch(/animation\s*:|transition\s*:/u);
  });

  it("keeps popup-facing settings modules free of the review runtime dependency", () => {
    const model = readFileSync(new URL("./settingsModel.ts", import.meta.url), "utf8");
    const client = readFileSync(new URL("./settingsClient.ts", import.meta.url), "utf8");
    expect(model).not.toContain("sanitizeDirectorCacheSummaryV1");
    expect(model).not.toContain("directorReviewModel");
    expect(client).not.toContain("directorReviewModel");
    expect(client).not.toContain("directorReviewClient");
    const app = readFileSync(new URL("./SettingsApp.tsx", import.meta.url), "utf8");
    expect(app).toContain('window.addEventListener("pagehide", release)');
  });

  it("keeps packaged director defaults aligned with the runtime contract", () => {
    expect(defaultDirectorEndpoint("openai-responses")).toBe(defaultDirectorProviderEndpointV1("openai-responses"));
    expect(defaultDirectorEndpoint("openai-compatible")).toBe(defaultDirectorProviderEndpointV1("openai-compatible"));
    expect(defaultDirectorEndpoint("gemini")).toBe(defaultDirectorProviderEndpointV1("gemini"));
    expect(defaultDirectorEndpoint("anthropic")).toBe(defaultDirectorProviderEndpointV1("anthropic"));
  });

  it("fills a standard director endpoint when the protocol changes", () => {
    expect(endpointForChangedProtocol("gemini", "https://api.openai.com/v1")).toBe(
      defaultDirectorEndpoint("gemini"),
    );
    expect(endpointForChangedProtocol("anthropic", "http://127.0.0.1:11434/v1")).toBe(
      "http://127.0.0.1:11434/v1",
    );
  });

  it("never copies a stored API key into the editable draft", () => {
    const draft = draftFromPublicProvider({
      protocol: "openai-responses",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-5",
      hasApiKey: true,
    });
    expect(draft.apiKey).toBe("");
    expect(draft.model).toBe("gpt-5");
    expect(apiKeyPlaceholder(true)).toBe("同一接口已保存；留空可继续使用");
  });

  it("only promises saved-key reuse for the same protocol and endpoint", () => {
    const saved = {
      protocol: "gemini" as const,
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-flash",
      hasApiKey: true,
    };
    expect(canReuseSavedProviderKey(saved, {
      protocol: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/",
      model: "gemini-flash",
      apiKey: "",
    })).toBe(true);
    expect(canReuseSavedProviderKey(saved, {
      protocol: "openai-responses",
      endpoint: "https://api.openai.com/v1",
      model: "",
      apiKey: "",
    })).toBe(false);
  });

  it("builds a BYOK save payload without inventing a fallback", () => {
    const payload = buildDirectorSavePayload({
      primary: {
        ...emptyProviderDraft(),
        endpoint: "https://api.openai.com/v1",
        model: "gpt-5",
        apiKey: "sk-test",
      },
      fallbackEnabled: false,
      fallback: emptyProviderDraft(true),
    });
    expect(payload).toEqual({
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary: {
          protocol: "openai-responses",
          endpoint: "https://api.openai.com/v1",
          model: "gpt-5",
          apiKey: "sk-test",
        },
      },
      origins: ["https://api.openai.com/*"],
    });
  });

  it("builds model discovery without requiring a model ID", () => {
    expect(buildDirectorDiscoveryPayload({
      protocol: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      model: "",
      apiKey: "secret",
    })).toEqual({
      provider: {
        protocol: "gemini",
        endpoint: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "secret",
      },
      origin: "https://generativelanguage.googleapis.com/*",
    });
  });

  it("rejects unsafe provider endpoints before requesting host permission", () => {
    expect(buildDirectorDiscoveryPayload({
      protocol: "openai-compatible",
      endpoint: "http://public-host.example/v1",
      model: "",
      apiKey: "key",
    })).toEqual({ error: "API 地址不安全；远程服务必须使用 HTTPS，HTTP 仅限本机或私有网络" });
    expect(buildDirectorSavePayload({
      primary: {
        ...emptyProviderDraft(),
        endpoint: "https://user:pass@provider.example/v1?debug=1",
        model: "gpt-5",
        apiKey: "key",
      },
      fallbackEnabled: false,
      fallback: emptyProviderDraft(true),
    })).toEqual({ error: "API 地址不安全；远程服务必须使用 HTTPS，HTTP 仅限本机或私有网络" });
  });

  it("requires a complete fallback provider and deduplicates origins", () => {
    expect(buildDirectorSavePayload({
      primary: { ...emptyProviderDraft(), endpoint: "https://api.openai.com/v1", model: "gpt-5" },
      fallbackEnabled: true,
      fallback: emptyProviderDraft(true),
    })).toEqual({ error: "备用提供商已开启，请连接并选择备用模型" });

    const payload = buildDirectorSavePayload({
      primary: { ...emptyProviderDraft(), endpoint: "https://api.openai.com/v1/", model: "gpt-5" },
      fallbackEnabled: true,
      fallback: {
        protocol: "openai-compatible",
        endpoint: "https://api.openai.com/v1",
        model: "local-model",
        apiKey: "",
      },
    });
    expect("origins" in payload && payload.origins).toEqual(["https://api.openai.com/*"]);
  });

  it("explains incomplete primary and fallback model selection before save", () => {
    expect(directorDraftValidationMessage({
      primary: emptyProviderDraft(),
      fallbackEnabled: false,
      fallback: emptyProviderDraft(true),
    })).toBe("请先连接主要提供商并选择模型");
    expect(directorDraftValidationMessage({
      primary: { ...emptyProviderDraft(), model: "gpt-5" },
      fallbackEnabled: true,
      fallback: emptyProviderDraft(true),
    })).toBe("备用提供商已开启，请连接并选择备用模型");
    expect(directorDraftValidationMessage({
      primary: { ...emptyProviderDraft(), model: "gpt-5" },
      fallbackEnabled: true,
      fallback: { ...emptyProviderDraft(true), model: "local-model" },
    })).toBeUndefined();
  });

  it("summarizes public configuration without exposing secrets", () => {
    expect(summarizeLyricsConfig({ configured: false })).toBe("LRCLIB · 酷狗");
    expect(summarizeDirectorConfig({ configured: true, primary: {
      protocol: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-pro",
      hasApiKey: true,
    } })).toBe("已启用 gemini-2.5-pro");
    expect(displayLyricsEndpoint({ configured: false, endpoint: "" })).toBe("http://100.108.23.60:8788/");
    expect(uniqueOriginPatterns(["http://127.0.0.1:11434/v1", "http://127.0.0.1:11434/v1/chat"])).toEqual([
      "http://127.0.0.1:11434/*",
    ]);
  });

  it("summarizes the last Director timing without endpoint or key data", () => {
    expect(directorTimingCopy({ configured: true, lastTiming: {
      version: "director-timing-v1", cache: "miss", totalMs: 8_400, cacheMs: 2,
      requestBuildMs: 3, providerMs: 8_350, contractMs: 6, adaptationMs: 1,
      inputBytes: 12_000, outputBytes: 4_000,
      attempts: [{ sequence: 1, protocol: "gemini", model: "flash", format: "json-schema", status: 200, elapsedMs: 8_350, responseBytes: 4_000, outcome: "ready" }],
      completedAt: "2026-08-23T00:00:00.000Z",
    } })).toBe("最近一次：总计 8400ms · 模型 8350ms · 合同 6ms · 1 次 · gemini / flash · #1 json-schema HTTP 200 ready");
  });
});
