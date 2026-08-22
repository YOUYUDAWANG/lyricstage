import { performanceDirectionSkill } from "./skill.js";

const parseJSON = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") throw new Error("invalid_upstream_response");
  const parsed = JSON.parse(value.replace(/^```json\s*|\s*```$/gu, ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_upstream_json");
  return parsed;
};

const responseJsonSchema = performanceDirectionSkill.responseSchema;

const upstreamErrorDetail = async (response) => {
  const body = await response.text().catch(() => "");
  const payload = (() => {
    try { return JSON.parse(body); } catch { return null; }
  })();
  const message = typeof payload?.error?.message === "string" ? payload.error.message : body;
  return message
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/[^\p{L}\p{N} .,:;_\-/()[\]]/gu, "")
    .slice(0, 320);
};

const boundedSignal = (maximumMilliseconds, options = {}) => {
  const now = typeof options.now === "function" ? options.now() : Date.now();
  const remaining = Number.isFinite(options.deadlineUnixMs)
    ? Math.max(1, options.deadlineUnixMs - now)
    : maximumMilliseconds;
  const timeoutFactory = typeof options.timeoutFactory === "function"
    ? options.timeoutFactory
    : AbortSignal.timeout;
  const timeout = timeoutFactory(Math.max(1, Math.min(maximumMilliseconds, remaining)));
  return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
};

export async function callVertexDirector(
  environment,
  systemPrompt,
  promptInput,
  fetchOrOptions = fetch,
  maybeOptions = {},
) {
  const fetchImpl = typeof fetchOrOptions === "function" ? fetchOrOptions : fetch;
  const options = typeof fetchOrOptions === "function" ? maybeOptions : fetchOrOptions;
  const baseURL = String(environment.UPSTREAM_BASE_URL || "https://aiplatform.googleapis.com").replace(/\/+$/u, "");
  const apiKey = String(environment.GCP_API_KEY || "");
  const model = String(environment.MODEL || "gemini-3.7-flash");
  if (baseURL !== "https://aiplatform.googleapis.com" || !apiKey) throw new Error("upstream_not_configured");
  const youtubeURL = typeof promptInput?.wholeSong?.youtubeURL === "string"
    && /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/u.test(promptInput.wholeSong.youtubeURL)
    ? promptInput.wholeSong.youtubeURL
    : "";
  const endpoint = `${baseURL}/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const request = (includeWholeSong, includeSchema = true) => fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "LyricStage/OCI-Fullscreen-Director-V4",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${systemPrompt}\nReturn one valid JSON object and no markdown.` }] },
        contents: [{
          role: "user",
          parts: [
            ...(includeWholeSong ? [{ fileData: { fileUri: youtubeURL, mimeType: "video/mp4" } }] : []),
            { text: JSON.stringify(promptInput) },
          ],
        }],
        generationConfig: {
          temperature: 0.68,
          maxOutputTokens: 16_000,
          responseMimeType: "application/json",
          ...(includeSchema ? { responseJsonSchema } : {}),
        },
      }),
      signal: boundedSignal(includeWholeSong ? 96_000 : 90_000, options),
    });
  let response = await request(Boolean(youtubeURL));
  let wholeSongFallback = false;
  let schemaFallback = false;
  if (!response.ok && youtubeURL && [400, 404, 415, 422].includes(response.status)) {
    wholeSongFallback = true;
    response = await request(false);
  }
  if (!response.ok && response.status === 400) {
    schemaFallback = true;
    response = await request(false, false);
  }
  if (!response.ok) {
    const detail = await upstreamErrorDetail(response);
    throw new Error(`upstream_http_${response.status}${detail ? `:${detail}` : ""}`);
  }
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => typeof part?.text === "string" ? part.text : "")
    .join("");
  return { value: parseJSON(text), model: payload?.modelVersion || model, wholeSongFallback, schemaFallback };
}

export async function callGemmaMusicIdentity(
  environment,
  systemPrompt,
  promptInput,
  responseSchema,
  fetchImpl = fetch,
  options = {},
) {
  const baseURL = String(environment.IDENTITY_UPSTREAM_BASE_URL || "https://generativelanguage.googleapis.com")
    .replace(/\/+$/u, "");
  const apiKey = String(environment.IDENTITY_API_KEY || "");
  const model = String(environment.IDENTITY_MODEL || "gemma-4-26b-a4b-it");
  if (baseURL !== "https://generativelanguage.googleapis.com" || !apiKey) {
    throw new Error("identity_upstream_not_configured");
  }
  const response = await fetchImpl(`${baseURL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "LyricStage/Music-Identity-V1",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${systemPrompt}\nReturn one valid JSON object and no markdown.` }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(promptInput) }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2_048,
        thinkingConfig: { thinkingLevel: "minimal" },
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
      },
    }),
    signal: boundedSignal(28_000, options),
  });
  if (!response.ok) throw new Error(`identity_upstream_http_${response.status}`);
  const payload = await response.json();
  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => typeof part?.text === "string" ? part.text : "")
    .join("");
  return {
    value: parseJSON(text),
    model: payload?.modelVersion || model,
    groundingMetadata: candidate?.groundingMetadata,
  };
}

export async function callVertexMusicIdentity(
  environment,
  systemPrompt,
  promptInput,
  responseSchema,
  fetchImpl = fetch,
  options = {},
) {
  const baseURL = String(environment.UPSTREAM_BASE_URL || "https://aiplatform.googleapis.com").replace(/\/+$/u, "");
  const apiKey = String(environment.GCP_API_KEY || "");
  const model = String(environment.IDENTITY_FALLBACK_MODEL || environment.MODEL || "gemini-3.5-flash");
  if (baseURL !== "https://aiplatform.googleapis.com" || !apiKey) {
    throw new Error("identity_fallback_not_configured");
  }
  const response = await fetchImpl(`${baseURL}/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "LyricStage/Music-Identity-Fallback-V1",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${systemPrompt}\nReturn one valid JSON object and no markdown.` }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(promptInput) }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2_048,
        thinkingConfig: { thinkingLevel: "minimal" },
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
      },
    }),
    signal: boundedSignal(28_000, options),
  });
  if (!response.ok) throw new Error(`identity_fallback_http_${response.status}`);
  const payload = await response.json();
  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => typeof part?.text === "string" ? part.text : "")
    .join("");
  return {
    value: parseJSON(text),
    model: payload?.modelVersion || model,
    groundingMetadata: candidate?.groundingMetadata,
  };
}

export async function callMusicIdentityWithFallback(
  environment,
  systemPrompt,
  promptInput,
  responseSchema,
  fetchImpl = fetch,
  options = {},
) {
  try {
    return await callGemmaMusicIdentity(environment, systemPrompt, promptInput, responseSchema, fetchImpl, options);
  } catch (primaryError) {
    if (!environment.GCP_API_KEY) throw primaryError;
    try {
      const fallback = await callVertexMusicIdentity(
        environment,
        systemPrompt,
        promptInput,
        responseSchema,
        fetchImpl,
        options,
      );
      return { ...fallback, fallbackReason: String(primaryError?.message || "identity_primary_failed") };
    } catch (fallbackError) {
      throw new Error(
        `${String(primaryError?.message || "identity_primary_failed")}:${String(fallbackError?.message || "identity_fallback_failed")}`,
      );
    }
  }
}
