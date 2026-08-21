import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFullscreenPromptInput,
  finalizeFullscreenResponse,
  requestVersion,
  responseVersion,
  sanitizeFullscreenRequest,
} from "../src/contract.js";
import {
  buildMusicIdentityPromptInput,
  finalizeMusicIdentityResponse,
  musicIdentityRequestVersion,
  musicIdentityResponseSchema,
  sanitizeMusicIdentityRequest,
} from "../src/music-identity.js";
import {
  callGemmaMusicIdentity,
  callMusicIdentityWithFallback,
  callVertexDirector,
} from "../src/provider.js";
import { handleRequest } from "../src/server.js";

const requestFixture = () => ({
  version: requestVersion,
  trackID: "youtube:fixture",
  recordingID: "youtubeMusic:fixture",
  lyricsHash: "a".repeat(64),
  lyricsIdentity: "b".repeat(8),
  title: "Fixture Song",
  artist: "Fixture Artist",
  duration: 30,
  lines: [
    { index: 0, from: 0, to: 5, text: "静かな夜", words: [], voiceRole: "lead", layerID: "0", overlapGroup: null },
    { index: 1, from: 5, to: 10, text: "光へ", words: [], voiceRole: "lead", layerID: "1", overlapGroup: null },
    { index: 2, from: 10, to: 15, text: "光へ", words: [], voiceRole: "duetA", layerID: "2", overlapGroup: "hook" },
    { index: 3, from: 10, to: 15, text: "ここから", words: [], voiceRole: "duetB", layerID: "3", overlapGroup: "hook" },
  ],
});

const estimatedRequestFixture = () => ({
  ...requestFixture(),
  lines: requestFixture().lines.map((line, index) => index === 0 ? {
    ...line,
    timingPrecision: "estimated",
    words: [],
    estimatedWords: [
      { index: 0, from: 0, to: 2.1, text: "静かな" },
      { index: 1, from: 2.1, to: 4.6, text: "夜" },
    ],
  } : { ...line, timingPrecision: "line" }),
});

const aiFixture = () => ({
  concept: "ink rails break into a luminous final spread",
  motif: "paired margins converge into one monumental hook",
  intensityArc: "quiet ink, widening duet, bright release",
  world: {
    spatialMode: "splitStage",
    motionLaw: "converge",
    artworkRole: "counterpoint",
    texture: "ink",
    depth: 0.68,
    fluidity: 0.55,
    elasticity: 0.72,
    atmosphere: 0.76,
    rationale: "The paired voices begin apart and physically converge during the repeated hook.",
  },
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
    sectionIndex: 1,
    cardID: "duet-mirror",
    presentation: "duet",
    primary: { primitive: "geometry.mirror", intensity: 0.88 },
    support: [{ primitive: "field.drift", intensity: 0.42 }],
    evidence: {
      songMotif: "paired margins converge into one monumental hook",
      sectionTriggers: ["duet_overlap", "voice_handoff", "repeated_hook"],
      lineIndices: [2, 3],
      rationale: "The verified overlapping voices develop the paired-margin motif as a mirrored counterpoint.",
      confidence: 0.93,
    },
  }],
});

const musicIdentityRequestFixture = () => ({
  version: musicIdentityRequestVersion,
  trackID: "youtube:X9aN34E-f8Q",
  title: "【歌ってみた】泥中に咲く - ウォルピスカーター covered by 存流",
  artist: "存流 -ᴀʀᴜ-",
  durationMs: 287_000,
  localHints: {
    canonicalTitle: "泥中に咲く",
    titles: ["泥中に咲く"],
    originalArtists: ["ウォルピスカーター"],
    coverPerformers: ["存流 -ᴀʀᴜ-"],
    isCover: true,
  },
});

const musicIdentityAIFixture = () => ({
  verdict: "grounded",
  canonicalTitle: "泥中に咲く",
  titleAliases: ["Deichuu ni Saku"],
  performers: ["存流 -ᴀʀᴜ-"],
  originalArtists: ["ウォルピスカーター"],
  creators: [{ name: "針原翼", role: "composer" }],
  isCover: true,
  confidence: 0.94,
  evidenceSummary: "Official release and cover pages distinguish the original recording from this cover.",
});

const groundingFixture = () => ({
  webSearchQueries: ["泥中に咲く 存流 ウォルピスカーター"],
  groundingChunks: [
    { web: { title: "Official cover", uri: "https://www.youtube.com/watch?v=X9aN34E-f8Q" } },
    { web: { title: "Original release", uri: "https://music.apple.com/jp/song/example" } },
  ],
});

const searchEntryPointFixture = () => ({
  webSearchQueries: ["泥中に咲く 存流 ウォルピスカーター"],
  searchEntryPoint: {
    renderedContent: '<div><a class="chip" href="https://vertexaisearch.cloud.google.com/grounding-api-redirect/example">&quot;泥中に咲く&quot; &quot;ウォルピスカーター&quot;</a></div>',
  },
});

test("fullscreen contract preserves identity and compiles a complete bounded plan", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const prompt = buildFullscreenPromptInput(input);
  assert.equal(prompt.canvas.aspectRatio, "16:9");
  assert.equal(prompt.canvas.coverVisible, true);
  assert.equal(prompt.lines[2].repetitionCount, 2);
  const response = finalizeFullscreenResponse(input, aiFixture(), "director-test-v1");
  assert.equal(response.version, responseVersion);
  assert.equal(response.degraded, false);
  assert.equal(response.sections[1].layout, "duetDivide");
  assert.equal(response.effects.length, 1);
  assert.equal(response.world.spatialMode, "splitStage");
  assert.equal(response.effects[0].primary.primitive, "geometry.mirror");
  assert.deepEqual(response.effects[0].evidence.lineIndices, [2, 3]);
  assert.deepEqual(response.directives.map((item) => item.lineIndex), [0, 1, 2, 3]);
  assert.equal(response.lyricsHash, requestFixture().lyricsHash);
  assert.equal(JSON.stringify(response).includes("静かな夜"), false);
});

test("estimated word cues reach the prompt but remain distinct from real timing", () => {
  const input = sanitizeFullscreenRequest(estimatedRequestFixture());
  const prompt = buildFullscreenPromptInput(input);
  assert.equal(input.lines[0].timingPrecision, "estimated");
  assert.equal(prompt.lines[0].realWordTiming, false);
  assert.equal(prompt.lines[0].estimatedWordTiming, true);
  assert.equal(prompt.lines[0].wordTiming.precision, "estimated");
  assert.deepEqual(prompt.lines[0].wordTiming.cues, [[0, 2.1, "静かな"], [2.1, 4.6, "夜"]]);
  assert.equal(prompt.lines[1].wordTiming, null);
  assert.throws(
    () => sanitizeFullscreenRequest({
      ...requestFixture(),
      lines: requestFixture().lines.map((line, index) => index === 0
        ? { ...line, timingPrecision: "estimated" }
        : line),
    }),
    /invalid_timing_precision/u,
  );
});

test("MusicMap stays normalized, bounded, and contains no raw audio payload", () => {
  const musicMap = {
    version: "music-map-v1",
    source: "tab-capture",
    durationMs: 30_000,
    analyzedMs: 12_000,
    featureRateHz: 30,
    tempo: { bpm: 126.4, confidence: 0.84 },
    summary: { dynamicRange: 0.72, meanEnergy: 0.48, peakEnergy: 0.91, silenceRatio: 0.04 },
    segments: [{
      fromMs: 0, toMs: 4_000, energy: 0.46, bass: 0.58, mid: 0.42, treble: 0.37,
      brightness: 0.44, flux: 0.63, onsetDensity: 0.52, stereoWidth: 0.68,
    }],
    landmarks: [{ atMs: 2_000, type: "energy_lift", strength: 0.78 }],
    rawAudio: "must-not-pass",
  };
  const input = sanitizeFullscreenRequest({ ...requestFixture(), musicMap });
  const prompt = buildFullscreenPromptInput(input);
  assert.equal(prompt.musicMap.source, "local tab audio DSP; no raw audio");
  assert.equal(prompt.musicMap.segments.length, 1);
  assert.equal(Object.hasOwn(prompt.musicMap, "rawAudio"), false);
  assert.throws(
    () => sanitizeFullscreenRequest({ ...requestFixture(), musicMap: { ...musicMap, featureRateHz: 120 } }),
    /invalid_music_map/u,
  );
});

test("effect grammar drops unknown, conflicting, or ungrounded recipes without degrading valid direction", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const base = aiFixture();
  const response = finalizeFullscreenResponse(input, {
    ...base,
    effects: [
      { ...base.effects[0], primary: { primitive: "shader.glitch", intensity: 1 } },
      {
        ...base.effects[0],
        primary: { primitive: "geometry.converge", intensity: 0.9 },
        support: [{ primitive: "geometry.expand", intensity: 0.9 }],
      },
      {
        ...base.effects[0],
        evidence: { ...base.effects[0].evidence, sectionTriggers: ["semantic_distance"], lineIndices: [0] },
      },
      base.effects[0],
    ],
  });
  assert.equal(response.degraded, false);
  assert.equal(response.effects.length, 1);
  assert.equal(response.effects[0].primary.primitive, "geometry.mirror");
});

test("incomplete Gemini output degrades instead of becoming a false AI success", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const response = finalizeFullscreenResponse(input, { ...aiFixture(), directives: aiFixture().directives.slice(0, 1) });
  assert.equal(response.degraded, true);
  assert.equal(response.degradedReason, "directives:1/2");
  assert.equal(response.directives.length, input.lines.length);
});

test("an empty visual score cannot claim AI takeover", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const response = finalizeFullscreenResponse(input, { ...aiFixture(), effects: [] });
  assert.equal(response.degraded, true);
  assert.equal(response.degradedReason, "effects");
});

test("HTTP core keeps health public and the director route authenticated", async () => {
  const environment = {
    API_KEY: "client-test",
    GCP_API_KEY: "upstream-test",
    UPSTREAM_BASE_URL: "https://aiplatform.googleapis.com",
    MODEL: "gemini-3.5-flash",
    IDENTITY_MODEL: "gemma-4-26b-a4b-it",
    DIRECTOR_VERSION: "director-test-v1",
    CACHE_DIR: "/unused",
  };
  const health = await handleRequest(new Request("https://director.test/health"), environment);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).model, "gemini-3.5-flash");
  const denied = await handleRequest(new Request("https://director.test/v1/fullscreen/direct", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestFixture()),
  }), environment);
  assert.equal(denied.status, 401);

  const cache = { get: async () => null, put: async () => undefined };
  const accepted = await handleRequest(new Request("https://director.test/v1/fullscreen/direct", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer client-test" },
    body: JSON.stringify(requestFixture()),
  }), environment, {
    cache,
    provider: async () => ({ value: aiFixture(), model: "gemini-3.5-flash" }),
  });
  assert.equal(accepted.status, 200);
  const body = await accepted.json();
  assert.equal(body.degraded, false);
  assert.equal(body.cache, "miss");
});

test("music identity contract accepts only grounded role-separated results", () => {
  const input = sanitizeMusicIdentityRequest(musicIdentityRequestFixture());
  assert.equal(buildMusicIdentityPromptInput(input).acceptance.requireWebSearch, true);
  const grounded = finalizeMusicIdentityResponse(input, musicIdentityAIFixture(), groundingFixture());
  assert.equal(grounded.status, "grounded");
  assert.deepEqual(grounded.originalArtists, ["ウォルピスカーター"]);
  assert.equal(grounded.sources.length, 2);

  const noSources = finalizeMusicIdentityResponse(input, musicIdentityAIFixture(), {});
  assert.equal(noSources.status, "ambiguous");
  assert.equal(noSources.reason, "no_web_grounding");

  const searchEntryPoint = finalizeMusicIdentityResponse(input, musicIdentityAIFixture(), searchEntryPointFixture());
  assert.equal(searchEntryPoint.status, "grounded");
  assert.equal(searchEntryPoint.sources[0].domain, "vertexaisearch.cloud.google.com");

  const roleConfusion = finalizeMusicIdentityResponse(input, {
    ...musicIdentityAIFixture(),
    originalArtists: ["存流 -ᴀʀᴜ-"],
  }, groundingFixture());
  assert.equal(roleConfusion.status, "ambiguous");
});

test("music identity route is authenticated and returns grounded Gemma evidence", async () => {
  const environment = {
    API_KEY: "client-test",
    GCP_API_KEY: "upstream-test",
    IDENTITY_API_KEY: "identity-test",
    IDENTITY_UPSTREAM_BASE_URL: "https://generativelanguage.googleapis.com",
    IDENTITY_MODEL: "gemma-4-26b-a4b-it",
    IDENTITY_RESOLVER_VERSION: "gemma4-test-v1",
    DIRECTOR_VERSION: "director-test-v1",
    CACHE_DIR: "/unused",
  };
  const cache = { get: async () => null, put: async () => undefined };
  const response = await handleRequest(new Request("https://director.test/v1/music/identity", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer client-test" },
    body: JSON.stringify(musicIdentityRequestFixture()),
  }), environment, {
    cache,
    identityProvider: async () => ({
      value: musicIdentityAIFixture(),
      model: "gemma-4-26b-a4b-it",
      groundingMetadata: groundingFixture(),
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "grounded");
  assert.equal(body.model, "gemma-4-26b-a4b-it");
  assert.equal(body.sources.length, 2);
});

test("Gemini provider uses the official Vertex AI Express generateContent protocol", async () => {
  let request;
  const result = await callVertexDirector({
    GCP_API_KEY: "upstream-test",
    UPSTREAM_BASE_URL: "https://aiplatform.googleapis.com",
    MODEL: "gemini-3.5-flash",
  }, "system", { song: "fixture" }, async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      modelVersion: "gemini-3.5-flash",
      candidates: [{ content: { parts: [{ text: JSON.stringify(aiFixture()) }] } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(request.url, "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.5-flash:generateContent");
  assert.equal(request.init.headers["x-goog-api-key"], "upstream-test");
  assert.equal(request.body.contents[0].parts[0].text, JSON.stringify({ song: "fixture" }));
  assert.equal(request.body.generationConfig.responseMimeType, "application/json");
  assert.equal(request.body.generationConfig.responseJsonSchema.type, "object");
  assert.equal(result.value.concept, aiFixture().concept);
});

test("Gemini provider attaches exact public YouTube context and falls back safely when unsupported", async () => {
  const requests = [];
  const result = await callVertexDirector({
    GCP_API_KEY: "upstream-test",
    UPSTREAM_BASE_URL: "https://aiplatform.googleapis.com",
    MODEL: "gemini-3.7-flash",
  }, "system", {
    wholeSong: { youtubeURL: "https://www.youtube.com/watch?v=X9aN34E-f8Q" },
    song: "fixture",
  }, async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    if (requests.length === 1) return new Response("unsupported media", { status: 415 });
    return new Response(JSON.stringify({
      modelVersion: "gemini-3.7-flash",
      candidates: [{ content: { parts: [{ text: JSON.stringify(aiFixture()) }] } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(requests[0].body.contents[0].parts[0].fileData.fileUri, "https://www.youtube.com/watch?v=X9aN34E-f8Q");
  assert.equal(requests[1].body.contents[0].parts.some((part) => part.fileData), false);
  assert.equal(result.wholeSongFallback, true);
});

test("Gemma identity provider enables Google Search with minimal thinking and JSON schema", async () => {
  let request;
  const result = await callGemmaMusicIdentity({
    IDENTITY_API_KEY: "identity-test",
    IDENTITY_UPSTREAM_BASE_URL: "https://generativelanguage.googleapis.com",
    IDENTITY_MODEL: "gemma-4-26b-a4b-it",
  }, "system", { track: "fixture" }, musicIdentityResponseSchema, async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      modelVersion: "gemma-4-26b-a4b-it",
      candidates: [{
        content: { parts: [{ text: JSON.stringify(musicIdentityAIFixture()) }] },
        groundingMetadata: groundingFixture(),
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent");
  assert.deepEqual(request.body.tools, [{ googleSearch: {} }]);
  assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
  assert.equal(request.body.generationConfig.responseMimeType, "application/json");
  assert.equal(request.body.generationConfig.responseJsonSchema.type, "object");
  assert.equal(result.groundingMetadata.groundingChunks.length, 2);
});

test("music identity provider falls back to grounded Vertex search when Gemma quota is unavailable", async () => {
  const requests = [];
  const result = await callMusicIdentityWithFallback({
    IDENTITY_API_KEY: "identity-test",
    IDENTITY_UPSTREAM_BASE_URL: "https://generativelanguage.googleapis.com",
    IDENTITY_MODEL: "gemma-4-26b-a4b-it",
    GCP_API_KEY: "vertex-test",
    UPSTREAM_BASE_URL: "https://aiplatform.googleapis.com",
    IDENTITY_FALLBACK_MODEL: "gemini-3.5-flash",
  }, "system", { track: "fixture" }, musicIdentityResponseSchema, async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    if (requests.length === 1) return new Response("quota", { status: 429 });
    return new Response(JSON.stringify({
      modelVersion: "gemini-3.5-flash",
      candidates: [{
        content: { parts: [{ text: JSON.stringify(musicIdentityAIFixture()) }] },
        groundingMetadata: searchEntryPointFixture(),
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.5-flash:generateContent");
  assert.deepEqual(requests[1].body.tools, [{ googleSearch: {} }]);
  assert.equal(requests[1].body.generationConfig.responseJsonSchema.type, "object");
  assert.equal(result.model, "gemini-3.5-flash");
  assert.equal(result.fallbackReason, "identity_upstream_http_429");
  assert.equal(result.groundingMetadata.webSearchQueries.length, 1);
});
