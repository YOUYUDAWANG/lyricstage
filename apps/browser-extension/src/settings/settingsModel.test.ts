import { defaultDirectorProviderEndpointV1 } from "@lyricstage/performance";
import { describe, expect, it } from "vitest";
import {
  apiKeyPlaceholder,
  buildDirectorSavePayload,
  defaultDirectorEndpoint,
  displayLyricsEndpoint,
  draftFromPublicProvider,
  directorTimingCopy,
  emptyProviderDraft,
  endpointForChangedProtocol,
  settingsSectionFromHash,
  summarizeDirectorConfig,
  summarizeLyricsConfig,
  uniqueOriginPatterns,
} from "./settingsModel";

describe("extension settings model", () => {
  it("defaults hash-less settings navigation to lyrics", () => {
    expect(settingsSectionFromHash("")).toBe("lyrics");
    expect(settingsSectionFromHash("#director")).toBe("director");
    expect(settingsSectionFromHash("#unknown")).toBe("lyrics");
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

  it("requires a complete fallback provider and deduplicates origins", () => {
    expect(buildDirectorSavePayload({
      primary: { ...emptyProviderDraft(), endpoint: "https://api.openai.com/v1", model: "gpt-5" },
      fallbackEnabled: true,
      fallback: emptyProviderDraft(true),
    })).toEqual({ error: "请完整填写备用供应商" });

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
    } })).toBe("最近一次：总计 8400ms · 模型 8350ms · 合同 6ms · 1 次 · gemini / flash");
  });
});
