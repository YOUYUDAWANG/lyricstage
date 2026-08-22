import type {
  DirectorProviderProtocolV1,
  PublicDirectorBYOKConfigurationV1,
  PublicDirectorProviderConfigurationV1,
} from "@lyricstage/performance";

export type DirectorProtocol = DirectorProviderProtocolV1;

export interface ProviderDraft {
  protocol: DirectorProtocol;
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface LyricsConfigView {
  configured?: boolean;
  endpoint?: string;
  reason?: string;
}

export interface DirectorConfigView extends Partial<PublicDirectorBYOKConfigurationV1> {
  reason?: string;
}

export const defaultPrivateLyricsEndpoint = "http://100.108.23.60:8788/";

export const defaultDirectorEndpoint = (protocol: DirectorProtocol): string => {
  if (protocol === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  if (protocol === "anthropic") return "https://api.anthropic.com/v1";
  return "https://api.openai.com/v1";
};

export const directorProtocolOptions: ReadonlyArray<{ value: DirectorProtocol; label: string }> = [
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "openai-compatible", label: "OpenAI-compatible / 本地模型" },
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic Messages" },
];

export const fallbackProtocolOptions: ReadonlyArray<{ value: DirectorProtocol; label: string }> = [
  { value: "openai-compatible", label: "OpenAI-compatible / 本地模型" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic Messages" },
];

export const settingsSections = [
  { id: "lyrics", label: "歌词源" },
  { id: "director", label: "AI 导演" },
  { id: "performance", label: "演出" },
  { id: "privacy", label: "隐私" },
] as const;

export type SettingsSection = (typeof settingsSections)[number]["id"];

const settingsSectionIDs = new Set<string>(settingsSections.map((section) => section.id));

const standardDirectorEndpoints = new Set(
  directorProtocolOptions.map((option) => defaultDirectorEndpoint(option.value)),
);

export const isSettingsSection = (value: string): value is SettingsSection => settingsSectionIDs.has(value);

export const settingsSectionFromHash = (hash: string): SettingsSection => {
  const id = hash.replace(/^#/u, "").trim();
  return isSettingsSection(id) ? id : "lyrics";
};

export const emptyProviderDraft = (fallback = false): ProviderDraft => {
  const protocol: DirectorProtocol = fallback ? "openai-compatible" : "openai-responses";
  return {
    protocol,
    endpoint: defaultDirectorEndpoint(protocol),
    model: "",
    apiKey: "",
  };
};

export const draftFromPublicProvider = (
  provider: PublicDirectorProviderConfigurationV1 | undefined,
  fallback = false,
): ProviderDraft => {
  const protocol = provider?.protocol ?? (fallback ? "openai-compatible" : "openai-responses");
  return {
    protocol,
    endpoint: provider?.endpoint ?? defaultDirectorEndpoint(protocol),
    model: provider?.model ?? "",
    apiKey: "",
  };
};

export const endpointForChangedProtocol = (protocol: DirectorProtocol, current: string): string => {
  const trimmed = current.trim().replace(/\/+$/u, "");
  if (!trimmed || standardDirectorEndpoints.has(trimmed)) {
    return defaultDirectorEndpoint(protocol);
  }
  return current;
};

export const originPatternFromEndpoint = (endpoint: string): string => `${new URL(endpoint).origin}/*`;

export const uniqueOriginPatterns = (endpoints: string[]): string[] =>
  [...new Set(endpoints.map((endpoint) => originPatternFromEndpoint(endpoint)))];

export const apiKeyPlaceholder = (hasApiKey: boolean, fallback = false): string => {
  if (hasApiKey) return "同一接口已保存；留空可继续使用";
  if (fallback) return "本地模型可为空";
  return "只保存在本机扩展存储";
};

export const lyricsStatusCopy = (config: LyricsConfigView | undefined): string => {
  if (config?.reason) return config.reason;
  return config?.configured
    ? "已启用 LDDC；令牌仅保存在本机扩展存储"
    : "未配置时仍会搜索 LRCLIB 与酷狗";
};

export const directorStatusCopy = (config: DirectorConfigView | undefined): string => {
  if (config?.reason) return config.reason;
  return config?.configured
    ? `已启用 ${config.primary?.model ?? "AI"}；模型输出会先通过本地导演合同`
    : "未配置；旧服务令牌不会迁移为供应商 API Key，本地演出仍可使用";
};

export const summarizeLyricsConfig = (config: LyricsConfigView | undefined): string =>
  config?.configured ? "已启用 LDDC" : "LRCLIB · 酷狗";

export const summarizeDirectorConfig = (config: DirectorConfigView | undefined): string =>
  config?.configured ? `已启用 ${config.primary?.model ?? "AI"}` : "本地确定性演出";

export const displayLyricsEndpoint = (config: LyricsConfigView | undefined): string =>
  (typeof config?.endpoint === "string" && config.endpoint) || defaultPrivateLyricsEndpoint;

export const buildDirectorSavePayload = (input: {
  primary: ProviderDraft;
  fallbackEnabled: boolean;
  fallback: ProviderDraft;
}): { configuration: unknown; origins: string[] } | { error: string } => {
  const primary = {
    protocol: input.primary.protocol,
    endpoint: input.primary.endpoint.trim(),
    model: input.primary.model.trim(),
    apiKey: input.primary.apiKey.trim(),
  };
  if (!primary.endpoint || !primary.model) {
    return { error: "请输入主供应商的 API 地址与模型 ID" };
  }
  const fallback = input.fallbackEnabled
    ? {
        protocol: input.fallback.protocol,
        endpoint: input.fallback.endpoint.trim(),
        model: input.fallback.model.trim(),
        apiKey: input.fallback.apiKey.trim(),
      }
    : undefined;
  if (fallback && (!fallback.endpoint || !fallback.model)) {
    return { error: "请完整填写备用供应商" };
  }
  try {
    return {
      configuration: {
        version: "lyricstage-director-byok-v1",
        primary,
        ...(fallback ? { fallback } : {}),
      },
      origins: uniqueOriginPatterns([primary.endpoint, fallback?.endpoint].filter((value): value is string => Boolean(value))),
    };
  } catch {
    return { error: "请检查协议、地址、模型与 API Key；HTTP 仅允许本机或私有网络模型" };
  }
};
