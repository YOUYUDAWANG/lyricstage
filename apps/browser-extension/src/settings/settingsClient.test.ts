import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectorConfiguration,
  discoverDirectorModels,
  loadDirectorConfiguration,
  loadLyricsConfiguration,
  openSettingsPage,
  releaseTransientDirectorPermissions,
  saveDirectorConfiguration,
  saveLyricsConfiguration,
  type SettingsChrome,
} from "./settingsClient";
import { loadDirectorCacheSummariesV1 } from "./directorReviewClient";
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
    if (message.type === "youtube-music-director-cache-summaries-v1") {
      return { type: "director-cache-summaries-v1", summaries: [] };
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
      remove: vi.fn(async () => true),
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

  it("models empty and error cache review independently from provider configuration", async () => {
    const chromeAPI = fakeChrome();
    await expect(loadDirectorCacheSummariesV1(chromeAPI)).resolves.toEqual({ status: "empty", summaries: [] });
    const broken = fakeChrome({ runtime: { sendMessage: vi.fn(async () => { throw new Error("offline"); }) } });
    await expect(loadDirectorCacheSummariesV1(broken)).resolves.toEqual({
      status: "error", summaries: [], reason: "读取审片摘要失败",
    });
    await expect(loadDirectorConfiguration(chromeAPI)).resolves.toEqual({ configured: false });
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

  it("requests optional permission before any async runtime read", async () => {
    const order: string[] = [];
    const chromeAPI = fakeChrome({
      runtime: { sendMessage: vi.fn(async () => { order.push("runtime"); return { configured: false }; }) },
      permissions: {
        request: vi.fn(async () => { order.push("permission"); return true; }),
        remove: vi.fn(async () => true),
      },
    });
    await saveLyricsConfiguration("https://lyrics.example/api", "token", chromeAPI);
    expect(order[0]).toBe("permission");
  });

  it("revokes a replaced lyrics origin after the new endpoint is saved", async () => {
    const chromeAPI = fakeChrome({ runtime: { sendMessage: vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "youtube-music-private-lyrics-config") return { configured: true, endpoint: "https://old-lyrics.example/api" };
      if (message.type === "youtube-music-director-config") return { configured: false };
      if (message.type === "youtube-music-save-private-lyrics-config") return { configured: true, endpoint: message.endpoint };
      return {};
    }) } });

    await saveLyricsConfiguration("https://new-lyrics.example/api", "token", chromeAPI);
    expect(chromeAPI.permissions.remove).toHaveBeenCalledWith({ origins: ["https://old-lyrics.example/*"] });
  });

  it("clears lyrics configuration without requesting host permission", async () => {
    const chromeAPI = fakeChrome();
    await expect(saveLyricsConfiguration("", "", chromeAPI)).resolves.toEqual({
      configured: false,
      endpoint: "",
    });
    expect(chromeAPI.permissions.request).not.toHaveBeenCalled();
  });

  it("revokes a deleted lyrics origin unless the director still uses it", async () => {
    const sendMessage = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "youtube-music-private-lyrics-config") return { configured: true, endpoint: "https://private.example/lyrics" };
      if (message.type === "youtube-music-director-config") return { configured: false };
      if (message.type === "youtube-music-save-private-lyrics-config") return { configured: false, endpoint: "" };
      return {};
    });
    const chromeAPI = fakeChrome({ runtime: { sendMessage } });
    await saveLyricsConfiguration("", "", chromeAPI);
    expect(chromeAPI.permissions.remove).toHaveBeenCalledWith({ origins: ["https://private.example/*"] });

    const sharedOrigin = fakeChrome({ runtime: { sendMessage: vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "youtube-music-private-lyrics-config") return { configured: true, endpoint: "https://shared.example/lyrics" };
      if (message.type === "youtube-music-director-config") return { configured: true, primary: { endpoint: "https://shared.example/v1" } };
      return { configured: false, endpoint: "" };
    }) } });
    await saveLyricsConfiguration("", "", sharedOrigin);
    expect(sharedOrigin.permissions.remove).not.toHaveBeenCalled();

    const unknownDirector = fakeChrome({ runtime: { sendMessage: vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "youtube-music-private-lyrics-config") return { configured: true, endpoint: "https://unknown.example/lyrics" };
      if (message.type === "youtube-music-director-config") throw new Error("worker unavailable");
      return { configured: false, endpoint: "" };
    }) } });
    await saveLyricsConfiguration("", "", unknownDirector);
    expect(unknownDirector.permissions.remove).not.toHaveBeenCalled();
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
    expect(vi.mocked(chromeAPI.runtime.sendMessage).mock.calls.some(([message]) =>
      (message as { type?: string }).type === "youtube-music-save-private-lyrics-config"
    )).toBe(false);
  });

  it("rejects an unsafe lyrics endpoint before requesting permission", async () => {
    const chromeAPI = fakeChrome();
    await expect(saveLyricsConfiguration("http://public-host.example/lyrics", "token", chromeAPI)).resolves.toEqual({
      configured: false,
      endpoint: "http://public-host.example/lyrics",
      reason: "歌词后端地址无效",
    });
    expect(chromeAPI.permissions.request).not.toHaveBeenCalled();
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
    expect(vi.mocked(chromeAPI.permissions.request).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(chromeAPI.runtime.sendMessage).mock.invocationCallOrder[0]!,
    );
    expect(result.configured).toBe(true);
    const message = vi.mocked(chromeAPI.runtime.sendMessage).mock.calls
      .map(([value]) => value as { type?: string; configuration?: { primary: { apiKey: string } } })
      .find((value) => value.type === "youtube-music-save-director-config") as {
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
    expect(chromeAPI.permissions.remove).not.toHaveBeenCalled();
    await releaseTransientDirectorPermissions([], chromeAPI);
    expect(chromeAPI.permissions.remove).toHaveBeenCalledWith({ origins: ["https://api.openai.com/*"] });
  });

  it("keeps a transient provider permission queued when revocation fails so pagehide can retry", async () => {
    const remove = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const chromeAPI = fakeChrome({ permissions: { request: vi.fn(async () => true), remove } });
    await discoverDirectorModels({
      ...emptyProviderDraft(),
      endpoint: "https://retry-permission.example/v1",
      apiKey: "key",
    }, "primary", chromeAPI);

    await releaseTransientDirectorPermissions([], chromeAPI);
    await releaseTransientDirectorPermissions([], chromeAPI);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenLastCalledWith({ origins: ["https://retry-permission.example/*"] });
  });

  it("revokes replaced director origins while retaining current lyrics and providers", async () => {
    const chromeAPI = fakeChrome({ runtime: { sendMessage: vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "youtube-music-director-config") return {
        configured: true,
        primary: { endpoint: "https://old-primary.example/v1" },
        fallback: { endpoint: "https://old-fallback.example/v1" },
      };
      if (message.type === "youtube-music-private-lyrics-config") return { configured: true, endpoint: "https://lyrics.example/api" };
      if (message.type === "youtube-music-save-director-config") return { configured: true };
      return {};
    }) } });

    await saveDirectorConfiguration({
      primary: { ...emptyProviderDraft(), endpoint: "https://new-primary.example/v1", model: "gpt-5", apiKey: "key" },
      fallbackEnabled: false,
      fallback: emptyProviderDraft(true),
    }, chromeAPI);
    expect(chromeAPI.permissions.remove).toHaveBeenCalledWith({
      origins: ["https://old-primary.example/*", "https://old-fallback.example/*"],
    });
  });

  it("clears director configuration without requesting permissions", async () => {
    const chromeAPI = fakeChrome();
    await expect(clearDirectorConfiguration(chromeAPI)).resolves.toEqual({ configured: false });
    expect(chromeAPI.permissions.request).not.toHaveBeenCalled();
  });

  it("revokes deleted director origins while retaining an origin used by lyrics", async () => {
    const chromeAPI = fakeChrome({ runtime: { sendMessage: vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "youtube-music-director-config") return {
        configured: true,
        primary: { endpoint: "https://primary.example/v1" },
        fallback: { endpoint: "https://shared.example/v1" },
      };
      if (message.type === "youtube-music-private-lyrics-config") return { configured: true, endpoint: "https://shared.example/lyrics" };
      if (message.type === "youtube-music-save-director-config") return { configured: false };
      return {};
    }) } });
    await clearDirectorConfiguration(chromeAPI);
    expect(chromeAPI.permissions.remove).toHaveBeenCalledWith({ origins: ["https://primary.example/*"] });
  });

  it("surfaces configuration load failures for a visible retry state", async () => {
    const broken = fakeChrome({ runtime: { sendMessage: vi.fn(async () => { throw new Error("offline"); }) } });
    await expect(loadLyricsConfiguration(broken)).resolves.toEqual({
      configured: false,
      reason: "读取歌词配置失败，请重试",
    });
    await expect(loadDirectorConfiguration(broken)).resolves.toEqual({
      configured: false,
      reason: "读取 AI 导演配置失败，请重试",
    });
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
