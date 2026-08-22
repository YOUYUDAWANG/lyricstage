import type { DirectorConfigView, LyricsConfigView, ProviderDraft } from "./settingsModel";
import { buildDirectorSavePayload } from "./settingsModel";

export interface SettingsChrome {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage?: () => Promise<void> | void;
  };
  permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
  };
}

export const settingsChrome = (): SettingsChrome | undefined => {
  const chromeAPI = (globalThis as typeof globalThis & { chrome?: SettingsChrome }).chrome;
  return chromeAPI?.runtime?.sendMessage ? chromeAPI : undefined;
};

export const loadLyricsConfiguration = async (chromeAPI = settingsChrome()): Promise<LyricsConfigView> => {
  if (!chromeAPI) return { configured: false };
  try {
    return await chromeAPI.runtime.sendMessage({ type: "youtube-music-private-lyrics-config" }) as LyricsConfigView;
  } catch {
    return { configured: false };
  }
};

export const saveLyricsConfiguration = async (
  endpoint: string,
  token: string,
  chromeAPI = settingsChrome(),
): Promise<LyricsConfigView> => {
  const trimmedEndpoint = endpoint.trim();
  if (!chromeAPI) return { configured: false, endpoint: trimmedEndpoint, reason: "扩展运行时不可用" };
  if (!trimmedEndpoint) {
    try {
      return await chromeAPI.runtime.sendMessage({
        type: "youtube-music-save-private-lyrics-config",
        endpoint: "",
        token: "",
      }) as LyricsConfigView;
    } catch {
      return { configured: false, reason: "停用失败" };
    }
  }
  let origin: string;
  try {
    origin = `${new URL(trimmedEndpoint).origin}/*`;
  } catch {
    return { configured: false, endpoint: trimmedEndpoint, reason: "歌词后端地址无效" };
  }
  try {
    const granted = await chromeAPI.permissions.request({ origins: [origin] });
    if (!granted) return { configured: false, endpoint: trimmedEndpoint, reason: "未授权访问该歌词后端" };
    return await chromeAPI.runtime.sendMessage({
      type: "youtube-music-save-private-lyrics-config",
      endpoint: trimmedEndpoint,
      token: token.trim(),
    }) as LyricsConfigView;
  } catch (error) {
    return {
      configured: false,
      endpoint: trimmedEndpoint,
      reason: error instanceof Error ? error.message : "歌词后端配置失败",
    };
  }
};

export const loadDirectorConfiguration = async (chromeAPI = settingsChrome()): Promise<DirectorConfigView> => {
  if (!chromeAPI) return { configured: false };
  try {
    return await chromeAPI.runtime.sendMessage({ type: "youtube-music-director-config" }) as DirectorConfigView;
  } catch {
    return { configured: false };
  }
};

export const saveDirectorConfiguration = async (
  input: { primary: ProviderDraft; fallbackEnabled: boolean; fallback: ProviderDraft },
  chromeAPI = settingsChrome(),
): Promise<DirectorConfigView> => {
  if (!chromeAPI) return { configured: false, reason: "扩展运行时不可用" };
  const payload = buildDirectorSavePayload(input);
  if ("error" in payload) return { configured: false, reason: payload.error };
  try {
    const granted = await chromeAPI.permissions.request({ origins: payload.origins });
    if (!granted) return { configured: false, reason: "未授权扩展访问所选模型 API" };
    return await chromeAPI.runtime.sendMessage({
      type: "youtube-music-save-director-config",
      configuration: payload.configuration,
    }) as DirectorConfigView;
  } catch (error) {
    return {
      configured: false,
      reason: error instanceof Error ? error.message : "导演配置失败",
    };
  }
};

export const clearDirectorConfiguration = async (chromeAPI = settingsChrome()): Promise<DirectorConfigView> => {
  if (!chromeAPI) return { configured: false, reason: "扩展运行时不可用" };
  try {
    return await chromeAPI.runtime.sendMessage({
      type: "youtube-music-save-director-config",
      configuration: null,
    }) as DirectorConfigView;
  } catch {
    return { configured: false, reason: "停用失败" };
  }
};

export const openSettingsPage = async (chromeAPI = settingsChrome()): Promise<boolean> => {
  if (typeof chromeAPI?.runtime.openOptionsPage !== "function") return false;
  try {
    await chromeAPI.runtime.openOptionsPage();
    return true;
  } catch {
    return false;
  }
};
