import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectorConfiguration,
  discoverDirectorModels,
  loadDirectorConfiguration,
  loadLyricsConfiguration,
  openSettingsPage,
  saveDirectorConfiguration,
  saveLyricsConfiguration,
  type SettingsChrome,
} from "./settingsClient";
import { emptyProviderDraft } from "./settingsModel";

const fakeChrome = (overrides: Partial<SettingsChrome> = {}): SettingsChrome => {
  const sendMessage = vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === "youtube-music-private-lyrics-config") {
      return { configured: true, endpoint: "http://127.0.0.1:8788/" };
    }
    if (message.type === "youtube-music-save-private-lyrics-config") {
      return { configured: Boolean(message.endpoint), endpoint: message.endpoint };
    }
    if (message.type === "youtube-music-director-config") {
      return { configured: false };
    }
    if (message.type === "youtube-music-list-director-models") {
      return { models: [{ id: "gpt-5", label: "GPT-5" }] };
    }
    if (message.type === "youtube-music-save-director-config") {
      return message.configuration
        ? { configured: true, primary: { protocol: "openai-responses", model: "gpt-5", hasApiKey: true } }
        : { configured: false };
    }
    return {};
  });
  return {
    runtime: {
      sendMessage,
      openOptionsPage: vi.fn(async () => undefined),
    },
    permissions: {
      request: vi.fn(async () => true),
    },
    ...overrides,
  };
};

describe("extension settings client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads lyrics configuration through the background message", async () => {
    const chromeAPI = fakeChrome();
    await expect(loadLyricsConfiguration(chromeAPI)).resolves.toEqual({
      configured: true,
      endpoint: "http://127.0.0.1:8788/",
    });
  });

  it("requests the exact lyrics origin before saving", async () => {
    const chromeAPI = fakeChrome();
    await saveLyricsConfiguration("http://192.168.1.8:8788/lyrics", "token", chromeAPI);
    expect(chromeAPI.permissions.request).toHaveBeenCalledWith({ origins: ["http://192.168.1.8:8788/*"] });
    expect(chromeAPI.runtime.sendMessage).toHaveBeenCalledWith({
      type: "youtube-music-save-private-lyrics-config",
      endpoint: "http://192.168.1.8:8788/lyrics",
      token: "token",
    });
  });

  it("clears lyrics configuration without requesting host permission", async () => {
    const chromeAPI = fakeChrome();
    await expect(saveLyricsConfiguration("", "", chromeAPI)).resolves.toEqual({
      configured: false,
      endpoint: "",
    });
    expect(chromeAPI.permissions.request).not.toHaveBeenCalled();
  });

  it("does not save lyrics configuration when host permission is denied", async () => {
    const chromeAPI = fakeChrome({
      permissions: { request: vi.fn(async () => false) },
    });
    await expect(saveLyricsConfiguration("https://lddc.example/", "token", chromeAPI)).resolves.toEqual({
      configured: false,
      endpoint: "https://lddc.example/",
      reason: "未授权访问该歌词后端",
    });
    expect(chromeAPI.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("saves a director configuration after requesting provider origins", async () => {
    const chromeAPI = fakeChrome();
    const result = await saveDirectorConfiguration({
      primary: {
        ...emptyProviderDraft(),
        endpoint: "https://api.openai.com/v1",
        model: "gpt-5",
        apiKey: "sk-live",
      },
      fallbackEnabled: false,
      fallback: emptyProviderDraft(true),
    }, chromeAPI);
    expect(chromeAPI.permissions.request).toHaveBeenCalledWith({ origins: ["https://api.openai.com/*"] });
    expect(result.configured).toBe(true);
    const message = vi.mocked(chromeAPI.runtime.sendMessage).mock.calls[0]?.[0] as {
      configuration: { primary: { apiKey: string } };
    };
    expect(message.configuration.primary.apiKey).toBe("sk-live");
  });

  it("discovers models after requesting the exact provider origin", async () => {
    const chromeAPI = fakeChrome();
    await expect(discoverDirectorModels({
      ...emptyProviderDraft(),
      endpoint: "https://api.openai.com/v1",
      apiKey: "sk-live",
    }, "primary", chromeAPI)).resolves.toEqual({
      models: [{ id: "gpt-5", label: "GPT-5" }],
    });
    expect(chromeAPI.permissions.request).toHaveBeenCalledWith({ origins: ["https://api.openai.com/*"] });
    expect(chromeAPI.runtime.sendMessage).toHaveBeenCalledWith({
      type: "youtube-music-list-director-models",
      slot: "primary",
      provider: {
        protocol: "openai-responses",
        endpoint: "https://api.openai.com/v1",
        apiKey: "sk-live",
      },
    });
  });

  it("clears director configuration without requesting permissions", async () => {
    const chromeAPI = fakeChrome();
    await expect(clearDirectorConfiguration(chromeAPI)).resolves.toEqual({ configured: false });
    expect(chromeAPI.permissions.request).not.toHaveBeenCalled();
  });

  it("opens the packaged options page", async () => {
    const chromeAPI = fakeChrome();
    await expect(openSettingsPage(chromeAPI)).resolves.toBe(true);
    expect(chromeAPI.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it("returns an unconfigured director view when the runtime is missing", async () => {
    await expect(loadDirectorConfiguration(undefined)).resolves.toEqual({ configured: false });
  });
});
