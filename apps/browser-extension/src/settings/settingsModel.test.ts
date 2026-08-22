import { defaultDirectorProviderEndpointV1 } from "@lyricstage/performance";
import { describe, expect, it } from "vitest";
import {
  apiKeyPlaceholder,
  buildDirectorSavePayload,
  defaultDirectorEndpoint,
  displayLyricsEndpoint,
  draftFromPublicProvider,
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
});
