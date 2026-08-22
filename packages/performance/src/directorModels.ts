import type { DirectorProviderConnectionV1 } from "./directorProviders";

export interface DirectorModelOptionV1 {
  id: string;
  label: string;
  detail?: string;
}

export interface DirectorModelListV1 {
  provider: DirectorProviderConnectionV1["protocol"];
  models: DirectorModelOptionV1[];
}

class ModelDiscoveryHTTPError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const modelsURL = (provider: DirectorProviderConnectionV1): string => {
  const url = new URL(provider.endpoint);
  let path = url.pathname.replace(/\/+$/u, "");
  if (provider.protocol === "gemini") {
    path = path.replace(/\/models\/[^/]+:generateContent$/u, "");
  } else if (provider.protocol === "anthropic") {
    path = path.replace(/\/messages$/u, "");
  } else {
    path = path.replace(/\/(?:responses|chat\/completions)$/u, "");
  }
  if (!/\/models$/u.test(path)) path = `${path}/models`;
  url.pathname = path;
  if (provider.protocol === "gemini") url.searchParams.set("pageSize", "1000");
  if (provider.protocol === "anthropic") url.searchParams.set("limit", "1000");
  return url.href;
};

const requestHeaders = (provider: DirectorProviderConnectionV1): HeadersInit => {
  if (provider.protocol === "gemini") {
    return provider.apiKey ? { "x-goog-api-key": provider.apiKey } : {};
  }
  if (provider.protocol === "anthropic") {
    return {
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      ...(provider.apiKey ? { "x-api-key": provider.apiKey } : {}),
    };
  }
  return provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {};
};

const cleanText = (value: unknown, limit: number): string =>
  (typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "").slice(0, limit);

const providerErrorDetail = (value: string): string => {
  try {
    const parsed = JSON.parse(value) as { error?: { message?: unknown }; message?: unknown };
    return cleanText(parsed.error?.message ?? parsed.message, 180);
  } catch {
    return cleanText(value, 180);
  }
};

const providerErrorMessage = (status: number, body: string): string => {
  const detail = providerErrorDetail(body);
  if (status === 401) return `API Key 无效或已过期（HTTP 401）${detail ? `：${detail}` : ""}`;
  if (status === 403) return `提供商拒绝读取模型列表（HTTP 403），请检查 Key、项目权限和来源限制${detail ? `：${detail}` : ""}`;
  if (status === 404) return `没有找到 Models API（HTTP 404），请检查 API 地址${detail ? `：${detail}` : ""}`;
  if (status === 429) return `模型列表请求过于频繁（HTTP 429），请稍后重试${detail ? `：${detail}` : ""}`;
  return `模型列表请求失败（HTTP ${status}）${detail ? `：${detail}` : ""}`;
};

const option = (idValue: unknown, labelValue?: unknown, detailValue?: unknown): DirectorModelOptionV1 | undefined => {
  const id = cleanText(idValue, 180).replace(/^models\//u, "");
  if (!id) return undefined;
  const label = cleanText(labelValue, 180) || id;
  const detail = cleanText(detailValue, 260);
  return { id, label, ...(detail ? { detail } : {}) };
};

const parseModels = (
  provider: DirectorProviderConnectionV1,
  value: unknown,
): DirectorModelOptionV1[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const payload = value as Record<string, unknown>;
  const raw = Array.isArray(provider.protocol === "gemini" ? payload.models : payload.data)
    ? provider.protocol === "gemini" ? payload.models as unknown[] : payload.data as unknown[]
    : [];
  const seen = new Set<string>();
  const models: DirectorModelOptionV1[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const candidate = item as Record<string, unknown>;
    if (provider.protocol === "gemini") {
      const actions = Array.isArray(candidate.supportedGenerationMethods)
        ? candidate.supportedGenerationMethods
        : Array.isArray(candidate.supportedActions) ? candidate.supportedActions : [];
      if (actions.length > 0 && !actions.includes("generateContent")) continue;
    }
    const next = option(
      candidate.id ?? candidate.name,
      candidate.display_name ?? candidate.displayName,
      candidate.description ?? candidate.owned_by,
    );
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    models.push(next);
  }
  return models.slice(0, 1000);
};

export const listDirectorProviderModelsV1 = async (
  provider: DirectorProviderConnectionV1,
  fetchImplementation: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<DirectorModelListV1> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, 30_000)));
  try {
    const response = await fetchImplementation(modelsURL(provider), {
      method: "GET",
      headers: requestHeaders(provider),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 4_000);
      throw new ModelDiscoveryHTTPError(response.status, providerErrorMessage(response.status, body));
    }
    const models = parseModels(provider, await response.json());
    if (models.length === 0) throw new Error("提供商没有返回可用于文本生成的模型");
    return { provider: provider.protocol, models };
  } finally {
    clearTimeout(timeout);
  }
};
