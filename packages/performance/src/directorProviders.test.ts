import { describe, expect, it, vi } from "vitest";

import {
  directorBYOKDiagnosticsFromErrorV1,
  directorBYOKCacheIdentityV1,
  executeDirectorBYOKV1,
  sanitizeDirectorBYOKConfigurationV1,
  type DirectorBYOKConfigurationV1,
  type DirectorProviderProtocolV1,
} from "./directorProviders";
import { compactDirectorPromptInputV1, directorIntentSchemaV1, directorIntentSystemPromptV1 } from "./directorIntent";

const requestFixture = () => ({
  version: "lyricstage-fullscreen-director-request-v1",
  trackID: "abcdefghijk",
  recordingID: "youtubeMusic:fixture",
  lyricsHash: "a".repeat(64),
  lyricsIdentity: "b".repeat(8),
  title: "Fixture Song",
  artist: "Fixture Artist",
  duration: 30,
  mediaContext: {
    kind: "public-youtube-video", videoID: "abcdefghijk",
    youtubeURL: "https://www.youtube.com/watch?v=abcdefghijk", analysis: "whole-song",
  },
  lines: [
    { index: 0, from: 0, to: 5, text: "静かな夜", words: [], voiceRole: "lead", layerID: "0", overlapGroup: null },
    { index: 1, from: 5, to: 10, text: "光へ", words: [], voiceRole: "lead", layerID: "1", overlapGroup: null },
    { index: 2, from: 10, to: 15, text: "光へ", words: [], voiceRole: "duetA", layerID: "2", overlapGroup: "hook" },
    { index: 3, from: 10, to: 15, text: "ここから", words: [], voiceRole: "duetB", layerID: "3", overlapGroup: "hook" },
  ],
});

const aiFixture = () => ({
  concept: "ink rails break into a luminous final spread",
  motif: "paired margins converge into one monumental hook",
  intensityArc: "quiet ink, widening duet, bright release",
  world: {
    spatialMode: "splitStage", motionLaw: "converge", artworkRole: "counterpoint", texture: "ink",
    depth: 0.68, fluidity: 0.55, elasticity: 0.72, atmosphere: 0.76,
    rationale: "The paired voices begin apart and physically converge during the repeated hook.",
  },
  blocking: { version: "song-blocking-v1", baseLayout: "editorialSplit", transitions: [] },
  sections: [
    { fromLineIndex: 0, toLineIndex: 1, artDirection: "paperCut", layout: "editorialSplit", typography: "jpMincho", paletteIndex: 2, intensity: 0.45 },
    { fromLineIndex: 2, toLineIndex: 3, artDirection: "neonRail", layout: "duetDivide", typography: "jpGothic", paletteIndex: 8, intensity: 0.95 },
  ],
  directives: [
    { lineIndex: 0, behavior: "settle", alignment: "leading", direction: -1, intensity: 0.45, fontScale: 1, glyphStagger: 0, paletteRole: "primary" },
    { lineIndex: 1, behavior: "focus", alignment: "center", direction: 1, intensity: 0.6, fontScale: 1, glyphStagger: 0, paletteRole: "warm" },
    { lineIndex: 2, behavior: "echo", alignment: "leading", direction: 1, intensity: 1, fontScale: 1.08, glyphStagger: 0.04, paletteRole: "accent" },
    { lineIndex: 3, behavior: "converge", alignment: "trailing", direction: -1, intensity: 1, fontScale: 1.08, glyphStagger: 0.04, paletteRole: "secondary" },
  ],
  effects: [{
    sectionIndex: 1, cardID: "duet-mirror", presentation: "duet",
    primary: { primitive: "geometry.mirror", intensity: 0.88 },
    support: [{ primitive: "field.drift", intensity: 0.42 }],
    evidence: {
      songMotif: "paired margins converge into one monumental hook",
      sectionTriggers: ["duet_overlap", "voice_handoff", "repeated_hook"], lineIndices: [2, 3],
      rationale: "The verified overlapping voices develop the paired-margin motif as a mirrored counterpoint.", confidence: 0.93,
    },
  }],
  gestures: [{
    id: "fixture:phrase:2", lineIndex: 2, scope: "phrase",
    target: { fromGrapheme: 0, toGrapheme: 2, expectedText: "光へ" },
    primitive: "phrase.handoff", driver: "lineEnter", space: "lyricLocal",
    envelope: { attackMs: 320, holdMs: 260, releaseMs: 520 }, intensity: 0.66, direction: 1, paletteRole: "accent",
    evidence: { semanticRole: "repetition", rationale: "The repeated hook hands its contour to the paired voice.", confidence: 0.84 },
  }],
  dramaticScore: {
    version: "dramatic-score-v1",
    premise: "Two separated voices discover that the repeated light can connect them.",
    emotionalArc: "A quiet solitary image becomes a shared tension and returns as one remembered line.",
    acts: [
      { id: "act:setup", role: "setup", fromLineIndex: 0, toLineIndex: 1, tension: 0.32, visualDensity: 0.28, motifState: "seed", intention: "Establish a thin thread without disturbing reading." },
      { id: "act:coda", role: "coda", fromLineIndex: 2, toLineIndex: 3, tension: 0.78, visualDensity: 0.54, motifState: "return", intention: "Return the thread as a shared memory." },
    ],
    motifActor: {
      family: "thread", origin: "voice", relationship: "A thread crosses the voice boundary and returns as a shared trace.",
      states: [
        { state: "seed", meaning: "A single voice releases a narrow promise." },
        { state: "transform", meaning: "The duet places tension on the same line." },
        { state: "return", meaning: "The line remains after the voices meet." },
      ],
    },
    signatureMoments: [
      {
        id: "moment:seed", fromLineIndex: 0, toLineIndex: 0, anchorLineIndices: [0], purpose: "reveal", motifState: "seed",
        actorFamily: "thread", stageAction: "thread.connect", coverRole: "origin", consequence: "trace", recallOf: "", intensity: 0.58,
        evidence: { sectionTriggers: ["section_boundary"], rationale: "The opening releases the first restrained thread.", confidence: 0.78 },
      },
      {
        id: "moment:return", fromLineIndex: 2, toLineIndex: 3, anchorLineIndices: [2, 3], purpose: "connection", motifState: "return",
        actorFamily: "thread", stageAction: "motif.recall", coverRole: "memory", consequence: "return", recallOf: "moment:seed", intensity: 0.82,
        evidence: { sectionTriggers: ["duet_overlap", "repeated_hook"], rationale: "The overlapping hook recalls the opening line.", confidence: 0.91 },
      },
    ],
    quietWindows: [{ fromLineIndex: 1, toLineIndex: 1, reason: "Stable reading preserves contrast before the duet return." }],
  },
});

const configuration = (
  protocol: DirectorProviderProtocolV1,
  endpoint: string,
  model = "fixture-model",
): DirectorBYOKConfigurationV1 => ({
  version: "lyricstage-director-byok-v1",
  primary: { protocol, endpoint, model, apiKey: "secret-fixture-key" },
});

const providerPayload = (protocol: DirectorProviderProtocolV1) => {
  const text = JSON.stringify(aiFixture());
  if (protocol === "gemini") return { candidates: [{ content: { parts: [{ text }] } }] };
  if (protocol === "anthropic") return { content: [{ type: "text", text }] };
  if (protocol === "openai-responses") return { output_text: text };
  return { choices: [{ message: { content: text } }] };
};

describe("Director BYOK configuration", () => {
  it("accepts HTTPS providers and keyless private local endpoints", () => {
    expect(sanitizeDirectorBYOKConfigurationV1(configuration("openai-responses", "https://api.openai.com/v1"))).toBeTruthy();
    expect(sanitizeDirectorBYOKConfigurationV1({
      version: "lyricstage-director-byok-v1",
      primary: { protocol: "openai-compatible", endpoint: "http://127.0.0.1:11434/v1", model: "qwen", apiKey: "" },
    })).toBeTruthy();
  });

  it("rejects plaintext public endpoints and excludes secrets from cache identity", () => {
    expect(sanitizeDirectorBYOKConfigurationV1(configuration("openai-compatible", "http://example.com/v1"))).toBeUndefined();
    const identity = JSON.stringify(directorBYOKCacheIdentityV1(configuration("openai-responses", "https://api.openai.com/v1")));
    expect(identity).not.toContain("secret-fixture-key");
    expect(identity).toContain("fixture-model");
  });

  it("keeps a representative 50-line intent request below 25KB", () => {
    const compact = compactDirectorPromptInputV1({
      track: { title: "Fixture", artist: "Artist", durationSeconds: 204 },
      sectionHints: Array.from({ length: 10 }, (_, index) => ({ fromLineIndex: index * 5, toLineIndex: index * 5 + 4 })),
      lines: Array.from({ length: 50 }, (_, lineIndex) => ({
        lineIndex,
        fromSeconds: lineIndex * 4,
        toSeconds: lineIndex * 4 + 3.5,
        exactText: lineIndex % 2 === 0 ? "まだ見えない光を探して歩いてゆく" : "I keep moving through the quiet night",
        voiceRole: "lead",
        overlapGroup: null,
        timingPrecision: "estimated",
        repetitionCount: 1,
      })),
    });
    const bytes = new TextEncoder().encode(
      directorIntentSystemPromptV1 + JSON.stringify(directorIntentSchemaV1) + JSON.stringify(compact),
    ).byteLength;
    expect(bytes).toBeLessThan(25_000);
  });
});

describe("Director BYOK provider adapters", () => {
  for (const [protocol, endpoint, expectedPath] of [
    ["openai-compatible", "https://example.test/v1", "/v1/chat/completions"],
    ["openai-responses", "https://example.test/v1", "/v1/responses"],
    ["gemini", "https://example.test/v1beta", "/v1beta/models/fixture-model:generateContent"],
    ["anthropic", "https://example.test/v1", "/v1/messages"],
  ] as const) {
    it(`compiles ${protocol} JSON through the local Director contract`, async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        expect(new URL(url).pathname).toBe(expectedPath);
        const body = String(init?.body);
        expect(body).not.toContain("https://www.youtube.com/watch?v=abcdefghijk");
        expect(body).not.toContain("secret-fixture-key");
        return new Response(JSON.stringify(providerPayload(protocol)), { status: 200, headers: { "Content-Type": "application/json" } });
      });
      const result = await executeDirectorBYOKV1(configuration(protocol, endpoint), requestFixture(), fetchMock as typeof fetch);
      expect((result.response as { degraded?: boolean }).degraded).toBe(false);
      expect(result.provider.protocol).toBe(protocol);
      expect(result.provider.hasApiKey).toBe(true);
      expect(JSON.stringify(result)).not.toContain("secret-fixture-key");
      expect(result.diagnostics.attempts).toHaveLength(1);
      expect(result.diagnostics.inputBytes).toBeGreaterThan(0);
      expect(result.diagnostics.outputBytes).toBeGreaterThan(0);
    });
  }

  it("uses the fallback provider after an authentication failure", async () => {
    const config = configuration("openai-responses", "https://primary.test/v1");
    config.fallback = { protocol: "anthropic", endpoint: "https://fallback.test/v1", model: "backup", apiKey: "backup-key" };
    const fetchMock = vi.fn(async (input: string | URL | Request) => String(input).includes("primary.test")
      ? new Response("unauthorized", { status: 401 })
      : new Response(JSON.stringify(providerPayload("anthropic")), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await executeDirectorBYOKV1(config, requestFixture(), fetchMock as typeof fetch);
    expect(result.provider.protocol).toBe("anthropic");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries one transient provider failure before falling back", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? new Response("temporary", { status: 503 })
        : new Response(JSON.stringify(providerPayload("openai-responses")), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const result = await executeDirectorBYOKV1(
      configuration("openai-responses", "https://primary.test/v1"),
      requestFixture(),
      fetchMock as typeof fetch,
    );
    expect(result.provider.protocol).toBe("openai-responses");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one bounded deadline across retry and fallback attempts", async () => {
    const config = configuration("openai-responses", "https://primary.test/v1");
    config.fallback = {
      protocol: "anthropic",
      endpoint: "https://fallback.test/v1",
      model: "backup",
      apiKey: "backup-key",
    };
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
    }));

    const startedAt = Date.now();
    await expect(executeDirectorBYOKV1(config, requestFixture(), fetchMock as typeof fetch, 25))
      .rejects.toThrow(/Abort|deadline|超时/iu);
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expands sparse AI directives locally before applying the strict V4 contract", async () => {
    const sparse = aiFixture();
    sparse.directives = sparse.directives.slice(0, 1);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(sparse),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await executeDirectorBYOKV1(
      configuration("openai-responses", "https://primary.test/v1"),
      requestFixture(),
      fetchMock as typeof fetch,
    );
    expect((result.response as { degraded?: boolean; directives?: unknown[] }).degraded).toBe(false);
    expect((result.response as { directives: unknown[] }).directives).toHaveLength(4);
  });

  it("never exceeds three HTTP attempts across primary repair and fallback", async () => {
    const config = configuration("openai-responses", "https://primary.test/v1");
    config.fallback = { protocol: "anthropic", endpoint: "https://fallback.test/v1", model: "backup", apiKey: "backup-key" };
    const fetchMock = vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fallback.test")
        ? { content: [{ type: "text", text: "{}" }] }
        : { output_text: "{}" },
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    let failure: unknown;
    try {
      await executeDirectorBYOKV1(config, requestFixture(), fetchMock as typeof fetch);
    } catch (error) {
      failure = error;
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(directorBYOKDiagnosticsFromErrorV1(failure)?.attempts).toHaveLength(3);
    expect(JSON.stringify(directorBYOKDiagnosticsFromErrorV1(failure))).not.toContain("secret-fixture-key");
  });
});
