import { describe, expect, it, vi } from "vitest";
import { listDirectorProviderModelsV1 } from "./directorModels";
import type { DirectorProviderConnectionV1 } from "./directorProviders";

const connection = (
  protocol: DirectorProviderConnectionV1["protocol"],
  endpoint: string,
  apiKey = "secret",
): DirectorProviderConnectionV1 => ({ protocol, endpoint, apiKey });

describe("director provider model discovery", () => {
  it("lists OpenAI-compatible models with bearer authentication", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: "gpt-5", owned_by: "openai" },
        { id: "text-embedding-3-large", owned_by: "openai" },
        { id: "gpt-4o-realtime-preview", owned_by: "openai" },
        { id: "gpt-image-1", owned_by: "openai" },
        { id: "omni-moderation-latest", owned_by: "openai" },
        { id: "local-model", owned_by: "self" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await listDirectorProviderModelsV1(
      connection("openai-responses", "https://api.openai.com/v1/responses"),
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({
      method: "GET",
      headers: { Authorization: "Bearer secret" },
    }));
    expect(result.models).toEqual([
      { id: "gpt-5", label: "gpt-5", detail: "openai" },
      { id: "local-model", label: "local-model", detail: "self" },
    ]);
  });

  it("filters Gemini models that do not support generateContent", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      models: [
        { name: "models/gemini-3.6-flash", displayName: "Gemini 3.6 Flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-embedding-001", displayName: "Gemini Embedding", supportedGenerationMethods: ["embedContent"] },
      ],
    }), { status: 200 }));
    const result = await listDirectorProviderModelsV1(
      connection("gemini", "https://generativelanguage.googleapis.com/v1beta"),
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
      expect.objectContaining({ headers: { "x-goog-api-key": "secret" } }),
    );
    expect(result.models).toEqual([{ id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" }]);
  });

  it("only returns the Vertex AI Express model that the connection probe verified", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), { status: 200 }));
    const result = await listDirectorProviderModelsV1(
      connection("gemini", "https://aiplatform.googleapis.com/v1beta1/publishers/google"),
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-3.7-flash:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: { "x-goog-api-key": "secret", "Content-Type": "application/json" },
      }),
    );
    expect(result.models).toEqual([
      {
        id: "gemini-3.7-flash",
        label: "Gemini 3.7 Flash（已验证）",
        detail: "Vertex AI Express · 本次连接已成功生成文本",
      },
    ]);
  });

  it("uses the Anthropic models endpoint and required headers", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: "claude-opus-4-6", display_name: "Claude Opus 4.6" }],
    }), { status: 200 }));
    await expect(listDirectorProviderModelsV1(
      connection("anthropic", "https://api.anthropic.com/v1/messages"),
      fetcher,
    )).resolves.toMatchObject({ models: [{ id: "claude-opus-4-6", label: "Claude Opus 4.6" }] });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models?limit=1000",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "secret",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );
  });

  it("supports keyless private OpenAI-compatible endpoints", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "llama-4" }] }), { status: 200 }));
    await listDirectorProviderModelsV1(
      connection("openai-compatible", "http://127.0.0.1:11434/v1", ""),
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:11434/v1/models", expect.objectContaining({ headers: {} }));
  });

  it("surfaces bounded provider errors", async () => {
    const fetcher = vi.fn(async () => new Response("invalid key", { status: 401 }));
    await expect(listDirectorProviderModelsV1(
      connection("openai-responses", "https://api.openai.com/v1"),
      fetcher,
    )).rejects.toThrow("API Key 无效或已过期（HTTP 401）：invalid key");
  });

  it("extracts a provider JSON error without exposing the raw envelope", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 403, message: "ListModels is blocked.", status: "PERMISSION_DENIED" },
    }), { status: 403 }));
    await expect(listDirectorProviderModelsV1(
      connection("gemini", "https://generativelanguage.googleapis.com/v1beta"),
      fetcher,
    )).rejects.toThrow("提供商拒绝读取模型列表（HTTP 403），请检查 Key、项目权限和来源限制：ListModels is blocked.");
  });
});
