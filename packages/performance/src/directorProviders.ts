import {
  buildFullscreenPromptInput,
  directorVersion,
  finalizeFullscreenResponse,
  fullscreenSystemPrompt,
  sanitizeFullscreenRequest,
} from "./directorContract.generated";
import { performanceDirectionSkill } from "./directorBrowserSkill";

export type DirectorProviderProtocolV1 =
  | "openai-compatible"
  | "openai-responses"
  | "gemini"
  | "anthropic";

export interface DirectorProviderConnectionV1 {
  protocol: DirectorProviderProtocolV1;
  endpoint: string;
  apiKey: string;
}

export interface DirectorProviderConfigurationV1 extends DirectorProviderConnectionV1 {
  model: string;
}

export interface DirectorBYOKConfigurationV1 {
  version: "lyricstage-director-byok-v1";
  primary: DirectorProviderConfigurationV1;
  fallback?: DirectorProviderConfigurationV1;
}

export interface PublicDirectorProviderConfigurationV1 {
  protocol: DirectorProviderProtocolV1;
  endpoint: string;
  model: string;
  hasApiKey: boolean;
}

export interface PublicDirectorBYOKConfigurationV1 {
  version: "lyricstage-director-byok-v1";
  configured: boolean;
  primary: PublicDirectorProviderConfigurationV1;
  fallback?: PublicDirectorProviderConfigurationV1;
}

export interface DirectorProviderExecutionV1 {
  response: unknown;
  provider: PublicDirectorProviderConfigurationV1;
}

const protocols = new Set<DirectorProviderProtocolV1>([
  "openai-compatible",
  "openai-responses",
  "gemini",
  "anthropic",
]);

export const defaultDirectorProviderEndpointV1 = (protocol: DirectorProviderProtocolV1): string => {
  if (protocol === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  if (protocol === "anthropic") return "https://api.anthropic.com/v1";
  return "https://api.openai.com/v1";
};

const isPrivateIPv4 = (hostname: string): boolean => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
};

const isLocalHTTPHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost"
    || normalized === "::1"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || isPrivateIPv4(normalized);
};

export const sanitizeDirectorProviderConnectionV1 = (value: unknown): DirectorProviderConnectionV1 | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const protocol = typeof candidate.protocol === "string" && protocols.has(candidate.protocol as DirectorProviderProtocolV1)
    ? candidate.protocol as DirectorProviderProtocolV1
    : undefined;
  if (!protocol) return undefined;
  const endpointValue = typeof candidate.endpoint === "string" ? candidate.endpoint.trim() : "";
  const apiKey = typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "";
  if (!endpointValue || endpointValue.length > 500 || apiKey.length > 4096) return undefined;
  let url: URL;
  try {
    url = new URL(endpointValue);
  } catch {
    return undefined;
  }
  if (url.username || url.password || url.search || url.hash) return undefined;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHTTPHost(url.hostname))) return undefined;
  const endpoint = `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
  if (!apiKey && url.protocol === "https:" && !isLocalHTTPHost(url.hostname)) return undefined;
  return { protocol, endpoint, apiKey };
};

const normalizeProvider = (value: unknown): DirectorProviderConfigurationV1 | undefined => {
  const connection = sanitizeDirectorProviderConnectionV1(value);
  if (!connection || !value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
  if (!model || model.length > 180) return undefined;
  return { ...connection, model };
};

export const sanitizeDirectorBYOKConfigurationV1 = (value: unknown): DirectorBYOKConfigurationV1 | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== "lyricstage-director-byok-v1") return undefined;
  const primary = normalizeProvider(candidate.primary);
  if (!primary) return undefined;
  const fallback = candidate.fallback === undefined || candidate.fallback === null
    ? undefined
    : normalizeProvider(candidate.fallback);
  if (candidate.fallback && !fallback) return undefined;
  return { version: "lyricstage-director-byok-v1", primary, ...(fallback ? { fallback } : {}) };
};

const publicProvider = (provider: DirectorProviderConfigurationV1): PublicDirectorProviderConfigurationV1 => ({
  protocol: provider.protocol,
  endpoint: provider.endpoint,
  model: provider.model,
  hasApiKey: Boolean(provider.apiKey),
});

export const publicDirectorBYOKConfigurationV1 = (
  configuration: DirectorBYOKConfigurationV1,
): PublicDirectorBYOKConfigurationV1 => ({
  version: configuration.version,
  configured: true,
  primary: publicProvider(configuration.primary),
  ...(configuration.fallback ? { fallback: publicProvider(configuration.fallback) } : {}),
});

export const directorBYOKCacheIdentityV1 = (configuration: DirectorBYOKConfigurationV1): unknown => ({
  version: "director-byok-cache-identity-v1",
  contract: `${directorVersion}-byok-v1`,
  providers: [configuration.primary, configuration.fallback].filter(Boolean).map((provider) => {
    const item = provider as DirectorProviderConfigurationV1;
    return { protocol: item.protocol, endpoint: item.endpoint, model: item.model };
  }),
});

class ProviderHTTPError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const requestJSON = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const detail = (await response.text()).trim().replace(/\s+/gu, " ").slice(0, 240);
      throw new ProviderHTTPError(response.status, `HTTP ${response.status}${detail ? ` · ${detail}` : ""}`);
    }
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
};

const providerRequestTimeout = (deadlineAt: number): number => {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new DOMException("Director BYOK deadline exceeded", "AbortError");
  return Math.max(1, Math.min(90_000, remaining));
};

const parseJSONObject = (text: string): unknown => {
  const trimmed = text.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")
    : trimmed;
  const direct = JSON.parse(withoutFence) as unknown;
  if (!direct || typeof direct !== "object" || Array.isArray(direct)) throw new Error("模型没有返回 JSON 对象");
  return direct;
};

const joinURL = (endpoint: string, suffix: string, fullSuffix: RegExp): string =>
  fullSuffix.test(endpoint) ? endpoint : `${endpoint}${suffix}`;

const openAIChat = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  fetchImplementation: typeof fetch,
  deadlineAt: number,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/chat/completions", /\/chat\/completions$/u);
  const formats: Array<unknown> = [
    { type: "json_schema", json_schema: { name: "lyricstage_director", strict: false, schema: performanceDirectionSkill.responseSchema } },
    { type: "json_object" },
    undefined,
  ];
  let lastError: unknown;
  for (const responseFormat of formats) {
    try {
      const raw = await requestJSON(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: fullscreenSystemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 32_000,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
      }, providerRequestTimeout(deadlineAt), fetchImplementation) as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = raw.choices?.[0]?.message?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("")
          : "";
      if (!text) throw new Error("模型响应缺少文本");
      return parseJSONObject(text);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ProviderHTTPError) || ![400, 404, 422].includes(error.status)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI-compatible 请求失败");
};

const openAIResponses = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  fetchImplementation: typeof fetch,
  deadlineAt: number,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/responses", /\/responses$/u);
  const formats: Array<unknown> = [
    { type: "json_schema", name: "lyricstage_director", strict: false, schema: performanceDirectionSkill.responseSchema },
    { type: "json_object" },
    undefined,
  ];
  let lastError: unknown;
  for (const format of formats) {
    try {
      const raw = await requestJSON(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: provider.model,
          instructions: fullscreenSystemPrompt,
          input: [{ role: "user", content: [{ type: "input_text", text: userPrompt }] }],
          max_output_tokens: 32_000,
          store: false,
          ...(format ? { text: { format } } : {}),
        }),
      }, providerRequestTimeout(deadlineAt), fetchImplementation) as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
      };
      const text = typeof raw.output_text === "string"
        ? raw.output_text
        : raw.output?.flatMap((item) => item.content ?? []).flatMap((part) =>
          (part.type === "output_text" || part.type === "text") && typeof part.text === "string" ? [part.text] : []).join("") ?? "";
      if (!text) throw new Error("模型响应缺少 output_text");
      return parseJSONObject(text);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ProviderHTTPError) || ![400, 404, 422].includes(error.status)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI Responses 请求失败");
};

const gemini = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  fetchImplementation: typeof fetch,
  deadlineAt: number,
): Promise<unknown> => {
  const url = /:generateContent$/u.test(provider.endpoint)
    ? provider.endpoint
    : `${provider.endpoint}/models/${encodeURIComponent(provider.model)}:generateContent`;
  const generationConfigs: Array<Record<string, unknown>> = [
    { temperature: 0.45, maxOutputTokens: 32_000, responseMimeType: "application/json", responseJsonSchema: performanceDirectionSkill.responseSchema },
    { temperature: 0.45, maxOutputTokens: 32_000, responseMimeType: "application/json" },
  ];
  let lastError: unknown;
  for (const generationConfig of generationConfigs) {
    try {
      const raw = await requestJSON(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { "x-goog-api-key": provider.apiKey } : {}),
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: fullscreenSystemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig,
        }),
      }, providerRequestTimeout(deadlineAt), fetchImplementation) as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
      const text = raw.candidates?.[0]?.content?.parts?.flatMap((part) => typeof part.text === "string" ? [part.text] : []).join("") ?? "";
      if (!text) throw new Error("Gemini 响应缺少文本");
      return parseJSONObject(text);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ProviderHTTPError) || ![400, 404, 422].includes(error.status)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini 请求失败");
};

const anthropic = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  fetchImplementation: typeof fetch,
  deadlineAt: number,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/messages", /\/messages$/u);
  const raw = await requestJSON(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      ...(provider.apiKey ? { "x-api-key": provider.apiKey } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      system: fullscreenSystemPrompt,
      messages: [{ role: "user", content: `${userPrompt}\n\nReturn exactly one JSON object and no markdown fence.` }],
      max_tokens: 32_000,
      temperature: 0.45,
    }),
  }, providerRequestTimeout(deadlineAt), fetchImplementation) as { content?: Array<{ type?: string; text?: unknown }> };
  const text = raw.content?.flatMap((part) => part.type === "text" && typeof part.text === "string" ? [part.text] : []).join("") ?? "";
  if (!text) throw new Error("Anthropic 响应缺少文本");
  return parseJSONObject(text);
};

const generate = (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  fetchImplementation: typeof fetch,
  deadlineAt: number,
): Promise<unknown> => {
  if (provider.protocol === "gemini") return gemini(provider, userPrompt, fetchImplementation, deadlineAt);
  if (provider.protocol === "anthropic") return anthropic(provider, userPrompt, fetchImplementation, deadlineAt);
  if (provider.protocol === "openai-responses") return openAIResponses(provider, userPrompt, fetchImplementation, deadlineAt);
  return openAIChat(provider, userPrompt, fetchImplementation, deadlineAt);
};

export const executeDirectorBYOKV1 = async (
  configuration: DirectorBYOKConfigurationV1,
  requestValue: unknown,
  fetchImplementation: typeof fetch = fetch,
  budgetMs = 105_000,
): Promise<DirectorProviderExecutionV1> => {
  const input = sanitizeFullscreenRequest(requestValue);
  const promptInput = buildFullscreenPromptInput(input) as Record<string, unknown>;
  // Generic BYOK providers receive the local MusicMap and lyric timing, but no media attachment.
  // Removing wholeSong prevents a text-only model from claiming it listened to the YouTube URL.
  const providerPromptInput = { ...promptInput, wholeSong: null };
  const providers = [configuration.primary, configuration.fallback].filter(Boolean) as DirectorProviderConfigurationV1[];
  const failures: string[] = [];
  const deadlineAt = Date.now() + Math.max(1, Math.min(105_000, budgetMs));
  for (const provider of providers) {
    let retryContext = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const userPrompt = JSON.stringify({
          ...providerPromptInput,
          ...(retryContext ? { retryContext } : {}),
        });
        const aiValue = await generate(provider, userPrompt, fetchImplementation, deadlineAt);
        const response = finalizeFullscreenResponse(input, aiValue, `${directorVersion}-byok-v1`) as {
          degraded?: unknown;
          degradedReason?: unknown;
        };
        if (response.degraded !== true) return { response, provider: publicProvider(provider) };
        retryContext = `The previous draft failed the local contract: ${String(response.degradedReason ?? "unknown").slice(0, 300)}. Regenerate the complete object; do not omit required collections.`;
        if (attempt === 1) failures.push(`${provider.protocol}:${provider.model}:contract:${String(response.degradedReason ?? "invalid").slice(0, 120)}`);
      } catch (error) {
        failures.push(`${provider.protocol}:${provider.model}:${error instanceof Error ? error.message : "request failed"}`);
        const retryable = !(error instanceof ProviderHTTPError)
          || error.status === 408
          || error.status === 429
          || error.status >= 500;
        if (attempt === 0 && retryable) {
          retryContext = "The previous provider response could not be parsed or was temporarily unavailable. Return one complete JSON object only.";
          continue;
        }
        break;
      }
    }
  }
  throw new Error(failures.join(" | ").slice(0, 500) || "所有导演供应商均失败");
};
