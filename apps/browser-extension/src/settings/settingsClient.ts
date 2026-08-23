import type {
  DirectorConfigView,
  DirectorModelDiscoveryView,
  LyricsConfigView,
  ProviderDraft,
} from "./settingsModel";
import { buildDirectorDiscoveryPayload, buildDirectorSavePayload } from "./settingsModel";
import { sanitizeProviderEndpointV1 } from "../../../../packages/performance/src/providerEndpoint";

export interface SettingsChrome {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage?: () => Promise<void> | void;
  };
  permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
    remove?(permissions: { origins: string[] }): Promise<boolean>;
  };
}

const originPattern = (endpoint: string | undefined): string | undefined => {
  if (!endpoint) return undefined;
  try {
    return `${new URL(endpoint).origin}/*`;
  } catch {
    return undefined;
  }
};

const revokeUnusedOrigins = async (
  chromeAPI: SettingsChrome,
  candidates: Array<string | undefined>,
  retained: Array<string | undefined>,
): Promise<void> => {
  if (typeof chromeAPI.permissions.remove !== "function") return;
  const retainedOrigins = new Set(retained.flatMap((endpoint) => {
    const pattern = originPattern(endpoint);
    return pattern ? [pattern] : [];
  }));
  const origins = [...new Set(candidates.flatMap((endpoint) => {
    const pattern = originPattern(endpoint);
    return pattern && !retainedOrigins.has(pattern) ? [pattern] : [];
  }))];
  if (origins.length === 0) return;
  try {
    await chromeAPI.permissions.remove({ origins });
  } catch {
    // Revocation is best-effort; deleting the secret/configuration remains authoritative.
  }
};

const directorEndpoints = (view: DirectorConfigView): Array<string | undefined> => [
  view.primary?.endpoint,
  view.fallback?.endpoint,
];

const transientDirectorEndpoints = new Set<string>();

export const releaseTransientDirectorPermissions = async (
  retained: Array<string | undefined>,
  chromeAPI = settingsChrome(),
): Promise<void> => {
  if (!chromeAPI || transientDirectorEndpoints.size === 0) return;
  const candidates = [...transientDirectorEndpoints];
  const retainedOrigins = new Set(retained.flatMap((endpoint) => {
    const pattern = originPattern(endpoint);
    return pattern ? [pattern] : [];
  }));
  const unused = candidates.filter((endpoint) => {
    const pattern = originPattern(endpoint);
    if (pattern && retainedOrigins.has(pattern)) {
      transientDirectorEndpoints.delete(endpoint);
      return false;
    }
    return true;
  });
  const origins = [...new Set(unused.flatMap((endpoint) => {
    const pattern = originPattern(endpoint);
    return pattern ? [pattern] : [];
  }))];
  if (origins.length === 0 || typeof chromeAPI.permissions.remove !== "function") return;
  try {
    if (await chromeAPI.permissions.remove({ origins })) {
      unused.forEach((endpoint) => transientDirectorEndpoints.delete(endpoint));
    }
  } catch {
    // Keep transient entries so a later reset/pagehide can retry revocation.
  }
};

export const settingsChrome = (): SettingsChrome | undefined => {
  const chromeAPI = (globalThis as typeof globalThis & { chrome?: SettingsChrome }).chrome;
  return chromeAPI?.runtime?.sendMessage ? chromeAPI : undefined;
};

export const loadLyricsConfiguration = async (chromeAPI = settingsChrome()): Promise<LyricsConfigView> => {
  if (!chromeAPI) return { configured: false };
  try {
    return await chromeAPI.runtime.sendMessage({ type: "youtube-music-private-lyrics-config" }) as LyricsConfigView;
  } catch {
    return { configured: false, reason: "读取歌词配置失败，请重试" };
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
    const [previous, director] = await Promise.all([
      loadLyricsConfiguration(chromeAPI),
      loadDirectorConfiguration(chromeAPI),
    ]);
    try {
      const result = await chromeAPI.runtime.sendMessage({
        type: "youtube-music-save-private-lyrics-config",
        endpoint: "",
        token: "",
      }) as LyricsConfigView;
      if (!result.reason && !director.reason) {
        await revokeUnusedOrigins(
          chromeAPI,
          [previous.endpoint],
          [director.primary?.endpoint, director.fallback?.endpoint],
        );
      }
      return result;
    } catch {
      return { configured: false, reason: "停用失败" };
    }
  }
  const safeEndpoint = sanitizeProviderEndpointV1(trimmedEndpoint);
  if (!safeEndpoint) {
    return { configured: false, endpoint: trimmedEndpoint, reason: "歌词后端地址无效" };
  }
  const origin = `${new URL(safeEndpoint).origin}/*`;
  let previous: LyricsConfigView | undefined;
  let director: DirectorConfigView | undefined;
  try {
    const granted = await chromeAPI.permissions.request({ origins: [origin] });
    if (!granted) return { configured: false, endpoint: trimmedEndpoint, reason: "未授权访问该歌词后端" };
    [previous, director] = await Promise.all([
      loadLyricsConfiguration(chromeAPI),
      loadDirectorConfiguration(chromeAPI),
    ]);
    const result = await chromeAPI.runtime.sendMessage({
      type: "youtube-music-save-private-lyrics-config",
      endpoint: safeEndpoint,
      token: token.trim(),
    }) as LyricsConfigView;
    if (!previous.reason && !director.reason) {
      await revokeUnusedOrigins(
        chromeAPI,
        result.reason ? [safeEndpoint] : [previous.endpoint],
        result.reason
          ? [previous.endpoint, ...directorEndpoints(director)]
          : [safeEndpoint, ...directorEndpoints(director)],
      );
    }
    return result;
  } catch (error) {
    if (previous && director && !previous.reason && !director.reason) {
      await revokeUnusedOrigins(chromeAPI, [safeEndpoint], [previous.endpoint, ...directorEndpoints(director)]);
    }
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
    return { configured: false, reason: "读取 AI 导演配置失败，请重试" };
  }
};

export const discoverDirectorModels = async (
  provider: ProviderDraft,
  slot: "primary" | "fallback",
  chromeAPI = settingsChrome(),
): Promise<DirectorModelDiscoveryView> => {
  if (!chromeAPI) return { models: [], reason: "扩展运行时不可用" };
  const payload = buildDirectorDiscoveryPayload(provider);
  if ("error" in payload) return { models: [], reason: payload.error };
  let lyrics: LyricsConfigView | undefined;
  let director: DirectorConfigView | undefined;
  try {
    const granted = await chromeAPI.permissions.request({ origins: [payload.origin] });
    if (!granted) return { models: [], reason: "未授权扩展访问所选模型 API" };
    transientDirectorEndpoints.add(payload.provider.endpoint);
    [lyrics, director] = await Promise.all([
      loadLyricsConfiguration(chromeAPI),
      loadDirectorConfiguration(chromeAPI),
    ]);
    const result = await chromeAPI.runtime.sendMessage({
      type: "youtube-music-list-director-models",
      slot,
      provider: payload.provider,
    }) as DirectorModelDiscoveryView;
    if (result.reason) {
      await releaseTransientDirectorPermissions([lyrics.endpoint, ...directorEndpoints(director)], chromeAPI);
    }
    return result;
  } catch (error) {
    if (lyrics && director && !lyrics.reason && !director.reason) {
      await releaseTransientDirectorPermissions([lyrics.endpoint, ...directorEndpoints(director)], chromeAPI);
    }
    return {
      models: [],
      reason: error instanceof Error ? error.message : "连接模型提供商失败",
    };
  }
};

export const saveDirectorConfiguration = async (
  input: { primary: ProviderDraft; fallbackEnabled: boolean; fallback: ProviderDraft },
  chromeAPI = settingsChrome(),
): Promise<DirectorConfigView> => {
  if (!chromeAPI) return { configured: false, reason: "扩展运行时不可用" };
  const payload = buildDirectorSavePayload(input);
  if ("error" in payload) return { configured: false, reason: payload.error };
  let previous: DirectorConfigView | undefined;
  let lyrics: LyricsConfigView | undefined;
  const nextEndpoints = [
    input.primary.endpoint,
    input.fallbackEnabled ? input.fallback.endpoint : undefined,
  ];
  try {
    const granted = await chromeAPI.permissions.request({ origins: payload.origins });
    if (!granted) return { configured: false, reason: "未授权扩展访问所选模型 API" };
    [previous, lyrics] = await Promise.all([
      loadDirectorConfiguration(chromeAPI),
      loadLyricsConfiguration(chromeAPI),
    ]);
    const result = await chromeAPI.runtime.sendMessage({
      type: "youtube-music-save-director-config",
      configuration: payload.configuration,
    }) as DirectorConfigView;
    if (!previous.reason && !lyrics.reason) {
      await revokeUnusedOrigins(
        chromeAPI,
        result.reason ? nextEndpoints : directorEndpoints(previous),
        result.reason
          ? [...directorEndpoints(previous), lyrics.endpoint]
          : [...nextEndpoints, lyrics.endpoint],
      );
      await releaseTransientDirectorPermissions(
        result.reason
          ? [...directorEndpoints(previous), lyrics.endpoint]
          : [...nextEndpoints, lyrics.endpoint],
        chromeAPI,
      );
    }
    return result;
  } catch (error) {
    if (previous && lyrics && !previous.reason && !lyrics.reason) {
      await revokeUnusedOrigins(chromeAPI, nextEndpoints, [...directorEndpoints(previous), lyrics.endpoint]);
      await releaseTransientDirectorPermissions([...directorEndpoints(previous), lyrics.endpoint], chromeAPI);
    }
    return {
      configured: false,
      reason: error instanceof Error ? error.message : "导演配置失败",
    };
  }
};

export const clearDirectorConfiguration = async (chromeAPI = settingsChrome()): Promise<DirectorConfigView> => {
  if (!chromeAPI) return { configured: false, reason: "扩展运行时不可用" };
  const [previous, lyrics] = await Promise.all([
    loadDirectorConfiguration(chromeAPI),
    loadLyricsConfiguration(chromeAPI),
  ]);
  try {
    const result = await chromeAPI.runtime.sendMessage({
      type: "youtube-music-save-director-config",
      configuration: null,
    }) as DirectorConfigView;
    if (!result.reason && !lyrics.reason) {
      await revokeUnusedOrigins(
        chromeAPI,
        [previous.primary?.endpoint, previous.fallback?.endpoint],
        [lyrics.endpoint],
      );
      await releaseTransientDirectorPermissions([lyrics.endpoint], chromeAPI);
    } else if (!lyrics.reason) {
      await releaseTransientDirectorPermissions([...directorEndpoints(previous), lyrics.endpoint], chromeAPI);
    }
    return result;
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
