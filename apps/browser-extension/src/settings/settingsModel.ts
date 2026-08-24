import type {
  DirectorModelOptionV1,
  DirectorProviderProtocolV1,
  DirectorTimingV1,
  PublicDirectorBYOKConfigurationV1,
  PublicDirectorProviderConfigurationV1,
} from "@lyricstage/performance";
import { sanitizeProviderEndpointV1 } from "../../../../packages/performance/src/providerEndpoint";

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
  lastTiming?: DirectorTimingV1;
}

export interface DirectorModelDiscoveryView {
  models: DirectorModelOptionV1[];
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
  { id: "director", label: "AI 歌词匹配" },
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

export const originPatternFromEndpoint = (endpoint: string): string => {
  const sanitized = sanitizeProviderEndpointV1(endpoint);
  if (!sanitized) throw new Error("unsafe-provider-endpoint");
  return `${new URL(sanitized).origin}/*`;
};

export const uniqueOriginPatterns = (endpoints: string[]): string[] =>
  [...new Set(endpoints.map((endpoint) => originPatternFromEndpoint(endpoint)))];

export const buildDirectorDiscoveryPayload = (
  provider: ProviderDraft,
): { provider: Omit<ProviderDraft, "model">; origin: string } | { error: string } => {
  const rawEndpoint = provider.endpoint.trim();
  if (!rawEndpoint) return { error: "请先填写 API 地址" };
  const endpoint = sanitizeProviderEndpointV1(rawEndpoint);
  if (!endpoint) return { error: "API 地址不安全；远程服务必须使用 HTTPS，HTTP 仅限本机或私有网络" };
  try {
    return {
      provider: {
        protocol: provider.protocol,
        endpoint,
        apiKey: provider.apiKey.trim(),
      },
      origin: originPatternFromEndpoint(endpoint),
    };
  } catch {
    return { error: "API 地址无效" };
  }
};

export const apiKeyPlaceholder = (hasApiKey: boolean, fallback = false): string => {
  if (hasApiKey) return "同一接口已保存；留空可继续使用";
  if (fallback) return "本地模型可为空";
  return "只保存在本机扩展存储";
};

export const canReuseSavedProviderKey = (
  saved: PublicDirectorProviderConfigurationV1 | undefined,
  draft: ProviderDraft,
): boolean => Boolean(
  saved?.hasApiKey
  && saved.protocol === draft.protocol
  && saved.endpoint.trim().replace(/\/+$/u, "") === draft.endpoint.trim().replace(/\/+$/u, ""),
);

export const lyricsStatusCopy = (config: LyricsConfigView | undefined): string => {
  if (config?.reason) return config.reason;
  return config?.configured
    ? "已启用 Apple Music 优先歌词；令牌仅保存在本机扩展存储"
    : "未配置时仍会搜索 LRCLIB 与酷狗";
};

export const directorStatusCopy = (config: DirectorConfigView | undefined): string => {
  if (config?.reason) return config.reason;
  return config?.configured
    ? `已启用 ${config.primary?.model ?? "AI"}；仅辅助清洗元数据与选择歌词候选`
    : "未配置；仍会使用本地清洗、LRCLIB 与酷狗自动匹配";
};

export const directorTimingCopy = (config: DirectorConfigView | undefined): string => {
  const timing = config?.lastTiming;
  if (!timing) return "尚无 AI 辅助记录";
  if (timing.cache === "hit") return `最近一次：缓存命中 · ${timing.totalMs}ms`;
  const provider = timing.attempts.at(-1);
  const providerLabel = provider ? `${provider.protocol} / ${provider.model}` : "未发起模型请求";
  const attempts = timing.attempts.map((attempt) => {
    const status = attempt.status === undefined ? "无 HTTP" : `HTTP ${attempt.status}`;
    return `#${attempt.sequence} ${attempt.format} ${status} ${attempt.outcome}`;
  }).join("；");
  return `最近一次：总计 ${timing.totalMs}ms · 模型 ${timing.providerMs}ms · 合同 ${timing.contractMs}ms · ${timing.attempts.length} 次 · ${providerLabel}${attempts ? ` · ${attempts}` : ""}`;
};

export const summarizeLyricsConfig = (config: LyricsConfigView | undefined): string =>
  config?.configured ? "Apple Music 优先" : "LRCLIB · 酷狗";

export const summarizeDirectorConfig = (config: DirectorConfigView | undefined): string =>
  config?.configured ? `已启用 ${config.primary?.model ?? "AI"}` : "本地确定性演出";

export const displayLyricsEndpoint = (config: LyricsConfigView | undefined): string =>
  (typeof config?.endpoint === "string" && config.endpoint) || defaultPrivateLyricsEndpoint;

export const directorDraftValidationMessage = (input: {
  primary: ProviderDraft;
  fallbackEnabled: boolean;
  fallback: ProviderDraft;
}): string | undefined => {
  if (!input.primary.endpoint.trim()) return "请先填写主要提供商的 API 地址";
  if (!input.primary.model.trim()) return "请先连接主要提供商并选择模型";
  if (!input.fallbackEnabled) return undefined;
  if (!input.fallback.endpoint.trim()) return "备用提供商已开启，请先填写 API 地址";
  if (!input.fallback.model.trim()) return "备用提供商已开启，请连接并选择备用模型";
  return undefined;
};

export const buildDirectorSavePayload = (input: {
  primary: ProviderDraft;
  fallbackEnabled: boolean;
  fallback: ProviderDraft;
}): { configuration: unknown; origins: string[] } | { error: string } => {
  const validationMessage = directorDraftValidationMessage(input);
  if (validationMessage) return { error: validationMessage };
  const primaryEndpoint = sanitizeProviderEndpointV1(input.primary.endpoint);
  const fallbackEndpoint = input.fallbackEnabled
    ? sanitizeProviderEndpointV1(input.fallback.endpoint)
    : undefined;
  if (!primaryEndpoint || (input.fallbackEnabled && !fallbackEndpoint)) {
    return { error: "API 地址不安全；远程服务必须使用 HTTPS，HTTP 仅限本机或私有网络" };
  }
  const primary = {
    protocol: input.primary.protocol,
    endpoint: primaryEndpoint,
    model: input.primary.model.trim(),
    apiKey: input.primary.apiKey.trim(),
  };
  const fallback = input.fallbackEnabled
    ? {
        protocol: input.fallback.protocol,
        endpoint: fallbackEndpoint!,
        model: input.fallback.model.trim(),
        apiKey: input.fallback.apiKey.trim(),
      }
    : undefined;
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
