import {
  buildFullscreenPromptInput,
  directorVersion,
  finalizeFullscreenResponse,
  sanitizeFullscreenRequest,
} from "./directorContract.generated";
import {
  compactDirectorPromptInputV1,
  directorIntentSchemaV1,
  directorIntentSystemPromptV1,
  expandDirectorIntentV1,
} from "./directorIntent";
import type { DirectorAttemptTimingV1 } from "./directorPlan";

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

export interface DirectorProviderDiagnosticsV1 {
  providerMs: number;
  contractMs: number;
  inputBytes: number;
  outputBytes: number;
  attempts: DirectorAttemptTimingV1[];
}

export interface DirectorProviderExecutionV1 {
  response: unknown;
  provider: PublicDirectorProviderConfigurationV1;
  diagnostics: DirectorProviderDiagnosticsV1;
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

const isPrivateIPv6 = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89ab]/u.test(normalized);
};

const isLocalHTTPHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || isPrivateIPv4(normalized)
    || isPrivateIPv6(normalized);
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
  version: "director-byok-cache-identity-v2",
  contract: `${directorVersion}-byok-intent-v1`,
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

class DirectorAttemptBudgetError extends Error {}

interface AttemptContext {
  deadlineUnixMs: number;
  attempts: DirectorAttemptTimingV1[];
  inputBytes: number;
  outputBytes: number;
}

export class DirectorBYOKExecutionErrorV1 extends Error {
  constructor(message: string, readonly diagnostics: DirectorProviderDiagnosticsV1) {
    super(message);
  }
}

export const directorBYOKDiagnosticsFromErrorV1 = (error: unknown): DirectorProviderDiagnosticsV1 | undefined =>
  error instanceof DirectorBYOKExecutionErrorV1 ? error.diagnostics : undefined;

const textBytes = (value: string): number => new TextEncoder().encode(value).byteLength;
const remainingBudgetMs = (context: AttemptContext): number => Math.max(0, context.deadlineUnixMs - Date.now());

const markLastAttempt = (
  context: AttemptContext,
  outcome: DirectorAttemptTimingV1["outcome"],
): void => {
  const last = context.attempts.at(-1);
  if (last) last.outcome = outcome;
};

const diagnostics = (context: AttemptContext, contractMs: number): DirectorProviderDiagnosticsV1 => ({
  providerMs: Math.round(context.attempts.reduce((sum, attempt) => sum + attempt.elapsedMs, 0)),
  contractMs: Math.round(contractMs),
  inputBytes: context.inputBytes,
  outputBytes: context.outputBytes,
  attempts: context.attempts.map((attempt) => ({ ...attempt })),
});

const requestJSON = async (
  provider: DirectorProviderConfigurationV1,
  format: string,
  url: string,
  init: RequestInit & { body: string },
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  if (context.attempts.length >= 3) throw new DirectorAttemptBudgetError("导演网络尝试已达到 3 次上限");
  const remaining = remainingBudgetMs(context);
  if (remaining <= 0) throw new DirectorAttemptBudgetError("导演生成超过 45 秒总预算");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(35_000, remaining));
  const startedAt = Date.now();
  const attempt: DirectorAttemptTimingV1 = {
    sequence: context.attempts.length + 1,
    protocol: provider.protocol,
    model: provider.model,
    format,
    elapsedMs: 0,
    responseBytes: 0,
    outcome: "parse-error",
  };
  context.inputBytes += textBytes(init.body);
  context.attempts.push(attempt);
  try {
    const response = await fetchImplementation(url, { ...init, signal: controller.signal });
    attempt.firstByteMs = Date.now() - startedAt;
    attempt.status = response.status;
    const text = await response.text();
    attempt.responseBytes = textBytes(text);
    context.outputBytes += attempt.responseBytes;
    attempt.elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      attempt.outcome = "http-error";
      const detail = text.trim().replace(/\s+/gu, " ").slice(0, 240);
      throw new ProviderHTTPError(response.status, `HTTP ${response.status}${detail ? ` · ${detail}` : ""}`);
    }
    try {
      const value = JSON.parse(text) as unknown;
      attempt.outcome = "ready";
      return value;
    } catch {
      attempt.outcome = "parse-error";
      throw new Error("供应商没有返回有效 JSON");
    }
  } catch (error) {
    attempt.elapsedMs = Date.now() - startedAt;
    if (error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))) {
      attempt.outcome = "timeout";
      throw new Error("导演供应商请求超时");
    }
    if (attempt.status === undefined && !(error instanceof ProviderHTTPError) && attempt.outcome === "parse-error") {
      attempt.outcome = "network-error";
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

const parseProviderObject = (text: string, context: AttemptContext, missingMessage: string): unknown => {
  if (!text) {
    markLastAttempt(context, "parse-error");
    throw new Error(missingMessage);
  }
  try {
    return parseJSONObject(text);
  } catch (error) {
    markLastAttempt(context, "parse-error");
    throw error;
  }
};

const joinURL = (endpoint: string, suffix: string, fullSuffix: RegExp): string =>
  fullSuffix.test(endpoint) ? endpoint : `${endpoint}${suffix}`;

const openAIChat = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/chat/completions", /\/chat\/completions$/u);
  const formats: Array<{ name: string; value: unknown }> = [
    { name: "json-schema", value: { type: "json_schema", json_schema: { name: "lyricstage_director_intent", strict: false, schema: directorIntentSchemaV1 } } },
    { name: "json-object", value: { type: "json_object" } },
  ];
  let lastError: unknown;
  for (const format of formats) {
    if (context.attempts.length >= 3) break;
    try {
      const body = JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: directorIntentSystemPromptV1 },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 8_192,
        response_format: format.value,
      });
      const raw = await requestJSON(provider, format.name, url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body,
      }, context, fetchImplementation) as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = raw.choices?.[0]?.message?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("")
          : "";
      return parseProviderObject(text, context, "模型响应缺少文本");
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
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/responses", /\/responses$/u);
  const formats: Array<{ name: string; value: unknown }> = [
    { name: "json-schema", value: { type: "json_schema", name: "lyricstage_director_intent", strict: false, schema: directorIntentSchemaV1 } },
    { name: "json-object", value: { type: "json_object" } },
  ];
  let lastError: unknown;
  for (const format of formats) {
    if (context.attempts.length >= 3) break;
    try {
      const body = JSON.stringify({
        model: provider.model,
        instructions: directorIntentSystemPromptV1,
        input: [{ role: "user", content: [{ type: "input_text", text: userPrompt }] }],
        max_output_tokens: 8_192,
        store: false,
        text: { format: format.value },
      });
      const raw = await requestJSON(provider, format.name, url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body,
      }, context, fetchImplementation) as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
      };
      const text = typeof raw.output_text === "string"
        ? raw.output_text
        : raw.output?.flatMap((item) => item.content ?? []).flatMap((part) =>
          (part.type === "output_text" || part.type === "text") && typeof part.text === "string" ? [part.text] : []).join("") ?? "";
      return parseProviderObject(text, context, "模型响应缺少 output_text");
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
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const model = provider.model.replace(/^models\//u, "");
  const url = /:generateContent$/u.test(provider.endpoint)
    ? provider.endpoint
    : `${provider.endpoint}/models/${encodeURIComponent(model)}:generateContent`;
  const generationConfigs: Array<{ name: string; value: Record<string, unknown> }> = [
    { name: "json-schema", value: { temperature: 0.45, maxOutputTokens: 8_192, responseMimeType: "application/json", responseJsonSchema: directorIntentSchemaV1 } },
    { name: "json-object", value: { temperature: 0.45, maxOutputTokens: 8_192, responseMimeType: "application/json" } },
  ];
  let lastError: unknown;
  for (const generationConfig of generationConfigs) {
    if (context.attempts.length >= 3) break;
    try {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: directorIntentSystemPromptV1 }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: generationConfig.value,
      });
      const raw = await requestJSON(provider, generationConfig.name, url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { "x-goog-api-key": provider.apiKey } : {}),
        },
        body,
      }, context, fetchImplementation) as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
      const text = raw.candidates?.[0]?.content?.parts?.flatMap((part) => typeof part.text === "string" ? [part.text] : []).join("") ?? "";
      return parseProviderObject(text, context, "Gemini 响应缺少文本");
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
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/messages", /\/messages$/u);
  const body = JSON.stringify({
    model: provider.model,
    system: directorIntentSystemPromptV1,
    messages: [{ role: "user", content: `${userPrompt}\n\nReturn exactly one JSON object and no markdown fence.` }],
    max_tokens: 8_192,
    temperature: 0.45,
  });
  const raw = await requestJSON(provider, "json-prompt", url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      ...(provider.apiKey ? { "x-api-key": provider.apiKey } : {}),
    },
    body,
  }, context, fetchImplementation) as { content?: Array<{ type?: string; text?: unknown }> };
  const text = raw.content?.flatMap((part) => part.type === "text" && typeof part.text === "string" ? [part.text] : []).join("") ?? "";
  return parseProviderObject(text, context, "Anthropic 响应缺少文本");
};

const generate = (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  if (provider.protocol === "gemini") return gemini(provider, userPrompt, context, fetchImplementation);
  if (provider.protocol === "anthropic") return anthropic(provider, userPrompt, context, fetchImplementation);
  if (provider.protocol === "openai-responses") return openAIResponses(provider, userPrompt, context, fetchImplementation);
  return openAIChat(provider, userPrompt, context, fetchImplementation);
};

export const executeDirectorBYOKV1 = async (
  configuration: DirectorBYOKConfigurationV1,
  requestValue: unknown,
  fetchImplementation: typeof fetch = fetch,
  budgetMs = 45_000,
): Promise<DirectorProviderExecutionV1> => {
  const input = sanitizeFullscreenRequest(requestValue);
  const promptInput = buildFullscreenPromptInput(input) as Record<string, unknown>;
  const providerPromptInput = compactDirectorPromptInputV1(promptInput) as Record<string, unknown>;
  const context: AttemptContext = {
    deadlineUnixMs: Date.now() + Math.max(1, Math.min(45_000, budgetMs)),
    attempts: [],
    inputBytes: 0,
    outputBytes: 0,
  };
  const providers = [configuration.primary, configuration.fallback].filter(Boolean) as DirectorProviderConfigurationV1[];
  const failures: string[] = [];
  let contractMs = 0;
  for (const [providerIndex, provider] of providers.entries()) {
    let retryContext = "";
    for (let generationAttempt = 0; generationAttempt < 2; generationAttempt += 1) {
      const reservedForFallback = providers.length - providerIndex - 1;
      if (
        context.attempts.length >= 3
        || 3 - context.attempts.length <= reservedForFallback
        || remainingBudgetMs(context) <= reservedForFallback * 10_000
      ) break;
      try {
        const userPrompt = JSON.stringify({
          ...providerPromptInput,
          ...(retryContext ? { retryContext } : {}),
        });
        const aiValue = await generate(provider, userPrompt, context, fetchImplementation);
        const contractStartedAt = performance.now();
        const expanded = expandDirectorIntentV1(input, aiValue);
        const response = finalizeFullscreenResponse(input, expanded, `${directorVersion}-byok-intent-v1`) as {
          degraded?: unknown;
          degradedReason?: unknown;
        };
        contractMs += performance.now() - contractStartedAt;
        if (response.degraded !== true) {
          return { response, provider: publicProvider(provider), diagnostics: diagnostics(context, contractMs) };
        }
        markLastAttempt(context, "contract-degraded");
        retryContext = `The previous intent failed the local contract: ${String(response.degradedReason ?? "unknown").slice(0, 260)}. Return a complete corrected intent. Keep directives sparse; the local compiler fills ordinary lines.`;
        failures.push(`${provider.protocol}:${provider.model}:contract:${String(response.degradedReason ?? "invalid").slice(0, 120)}`);
      } catch (error) {
        failures.push(`${provider.protocol}:${provider.model}:${error instanceof Error ? error.message : "request failed"}`);
        const retryable = !(error instanceof ProviderHTTPError)
          || error.status === 408
          || error.status === 429
          || error.status >= 500;
        if (!retryable || error instanceof DirectorAttemptBudgetError) break;
        retryContext = "The previous provider response could not be parsed or was temporarily unavailable. Return one complete JSON object only.";
      }
    }
  }
  throw new DirectorBYOKExecutionErrorV1(
    failures.join(" | ").slice(0, 500) || "所有导演供应商均失败",
    diagnostics(context, contractMs),
  );
};
