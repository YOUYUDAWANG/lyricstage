import { describe, expect, it, vi } from "vitest";

import {
  directorBibleRequestProfileV1,
  directorBYOKDiagnosticsFromErrorV1,
  directorBYOKCacheIdentityV1,
  executeDirectorBYOKV1,
  executeDirectorBYOKProfileV1,
  legacyDirectorRequestProfileV1,
  scenePackRequestProfileV1,
  sanitizeDirectorBYOKConfigurationV1,
  type DirectorBYOKConfigurationV1,
  type DirectorProviderProtocolV1,
} from "./directorProviders";
import { windowIntentRequestProfileV2 } from "./directorV2Provider";
import { compactDirectorPromptInputV1, directorIntentSchemaV1, directorIntentSystemPromptV1 } from "./directorIntent";
import { lyricFixtures } from "@lyricstage/contracts";
import {
  checkpointRollingPerformanceStateV1,
  compileLocalDirectorBibleV1,
  compileLocalSceneCardsV1,
  initialRollingPerformanceStateV1,
} from "./rollingDirector";
import { lyricGraphemesV1 } from "./lyricChoreography";
import {
  directorBibleSchemaV1,
  directorBibleSystemPromptV1,
  scenePackSchemaV1,
  scenePackSystemPromptV1,
  windowIntentSchemaV2,
  windowIntentSystemPromptV2,
} from "./rollingDirectorPrompt";

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
  if (protocol === "gemini") return { output_text: text, candidates: [{ content: { parts: [{ text }] } }] };
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
  it("keeps the legacy request body byte-for-byte identical through the profile entry", async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify(providerPayload("openai-responses")), { status: 200 });
    });
    const config = configuration("openai-responses", "https://compat.test/v1");
    await executeDirectorBYOKV1(config, requestFixture(), fetchMock as typeof fetch);
    await executeDirectorBYOKProfileV1(config, requestFixture(), legacyDirectorRequestProfileV1, fetchMock as typeof fetch);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
  });

  it("uses independent Bible and Scene Pack profiles without changing the legacy entry", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const biblePayloads: Record<string, unknown>[] = [];
    const bibleFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      biblePayloads.push(payload);
      return new Response(JSON.stringify({ output_text: JSON.stringify(bible) }), { status: 200 });
    });
    const bibleResult = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      bibleFetch as typeof fetch,
    );
    expect(bibleResult.response.bibleIdentity).toBe(bible.bibleIdentity);
    expect((biblePayloads[0]?.text as any)?.format?.schema).toEqual(directorBibleSchemaV1);
    expect(biblePayloads[0]?.instructions).toBe(directorBibleSystemPromptV1);

    const state = initialRollingPerformanceStateV1(bible);
    const firstCard = compileLocalSceneCardsV1(lyrics, bible)[0]!;
    const scenePayloads: Record<string, unknown>[] = [];
    const sceneFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      scenePayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        version: "scene-pack-v1",
        bibleIdentity: bible.bibleIdentity,
        entryStateHash: state.stateHash,
        scenes: [firstCard],
      }) }), { status: 200 });
    });
    const sceneResult = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      {
        lyrics, bible, state,
        promptInput: { bible, state, fromLineIndex: firstCard.fromLineIndex, toLineIndex: firstCard.toLineIndex, lines: lyrics.lines },
      },
      scenePackRequestProfileV1,
      sceneFetch as typeof fetch,
    );
    expect(sceneResult.response.map((card) => card.sceneID)).toEqual([firstCard.sceneID]);
    expect((scenePayloads[0]?.text as any)?.format?.schema).toEqual(scenePackSchemaV1);
    expect(scenePayloads[0]?.instructions).toBe(scenePackSystemPromptV1);
  });

  it("authors only WindowIntentV2 and compiles visual execution locally", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const fromLineIndex = lyrics.lines[0]!.lineIndex;
    const toLineIndex = lyrics.lines.at(-1)!.lineIndex;
    const wire = {
      version: "window-intent-v2",
      // Transport identity is an untrusted model echo. The local adapter must
      // ignore even stale values instead of spending another provider attempt.
      bibleIdentity: "stale-model-echo",
      entryStateHash: "stale-model-echo",
      fromLineIndex: toLineIndex,
      toLineIndex: fromLineIndex,
      spatialIntent: "open",
      coverRole: "portal",
      arcIntent: "break",
      cues: [{ role: "rupture", fromLineIndex: 1, toLineIndex: 1, evidenceLineIndices: [1], confidence: 0.92 }],
    };
    const payloads: Record<string, any>[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ output_text: JSON.stringify(wire) }), { status: 200 });
    });
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      { lyrics, bible, state, promptInput: { bible, state, fromLineIndex, toLineIndex, lines: lyrics.lines } },
      windowIntentRequestProfileV2,
      fetchMock as typeof fetch,
    );
    expect((payloads[0]?.text as any)?.format?.schema).toEqual(windowIntentSchemaV2);
    expect(windowIntentSchemaV2.required).not.toEqual(expect.arrayContaining([
      "bibleIdentity", "entryStateHash", "fromLineIndex", "toLineIndex",
    ]));
    expect(windowIntentSchemaV2.properties).not.toHaveProperty("bibleIdentity");
    expect(windowIntentSchemaV2.properties).not.toHaveProperty("entryStateHash");
    expect(payloads[0]?.instructions).toBe(windowIntentSystemPromptV2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response).toHaveLength(1);
    expect(result.response[0]?.directives).toHaveLength(lyrics.lines.length);
    expect(result.response[0]?.effects.some((effect) => effect.id.startsWith("director-v2-effect:"))).toBe(true);
  });

  it("rejects provider-authored visual fields instead of silently accepting them", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const fromLineIndex = lyrics.lines[0]!.lineIndex;
    const toLineIndex = lyrics.lines.at(-1)!.lineIndex;
    const input = { lyrics, bible, state, promptInput: { bible, state, fromLineIndex, toLineIndex, lines: lyrics.lines } };
    const result = windowIntentRequestProfileV2.adapt(input, {
      version: "window-intent-v2",
      bibleIdentity: bible.bibleIdentity,
      entryStateHash: state.stateHash,
      fromLineIndex,
      toLineIndex,
      spatialIntent: "hold",
      coverRole: "anchor",
      arcIntent: "hold",
      cues: [],
      effects: [{ primitive: "geometry.cut" }],
    });
    expect(result).toEqual({ reason: "window-intent-concrete-visual-field" });
  });

  it("repairs only a harmless WindowIntentV2 wrapper", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const fromLineIndex = lyrics.lines[0]!.lineIndex;
    const toLineIndex = lyrics.lines.at(-1)!.lineIndex;
    const input = { lyrics, bible, state, promptInput: { bible, state, fromLineIndex, toLineIndex, lines: lyrics.lines } };
    const result = windowIntentRequestProfileV2.repair!(input, { windowIntent: {
      version: "window-intent-v2",
      bibleIdentity: bible.bibleIdentity,
      entryStateHash: state.stateHash,
      fromLineIndex,
      toLineIndex,
      spatialIntent: "hold",
      coverRole: "anchor",
      arcIntent: "hold",
      cues: [],
    } }, "wrapped");
    expect(result.response?.[0]?.directives).toHaveLength(lyrics.lines.length);
  });

  it("keeps safe AI art direction when malformed Bible structure needs local repair", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const malformed = {
      version: "director-bible-v1",
      premise: "A paper horizon turns a repeated word into a remembered place.",
      emotionalArc: "Restrained distance opens into a bright shared return.",
      world: {
        spatialMode: "panoramic", motionLaw: "flow", artworkRole: "memory", texture: "paper",
        depth: 0.72, fluidity: 0.66, elasticity: 0.38, atmosphere: 0.81,
        rationale: "The cover remains a remembered destination while the lyric field opens around it.",
      },
      acts: [{ id: "broken", role: "setup", fromLineIndex: 99, toLineIndex: 120 }],
      motifActor: {
        family: "petal", origin: "lyric", relationship: "A petal carries the repeated phrase back into view.", states: [],
      },
      signatureAnchors: [], quietWindows: [],
      layoutBudget: { baseLayout: "railTrailing", maximumTransitions: 2, proposedTransitions: [] },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(malformed),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response).toMatchObject({
      premise: malformed.premise,
      emotionalArc: malformed.emotionalArc,
      world: { spatialMode: "panoramic", motionLaw: "flow", artworkRole: "memory", texture: "paper" },
      motifActor: { family: "petal", origin: "lyric" },
      layoutBudget: { baseLayout: "railTrailing", proposedTransitions: [] },
    });
    expect(result.response.acts[0]?.fromLineIndex).toBe(lyrics.lines[0]?.lineIndex);
    expect(result.response.signatureAnchors.length).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  it("normalizes a wrapped legacy DirectorIntent into a safe repaired Bible", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const legacyIntent = {
      concept: "A glass memory opens whenever the repeated phrase returns.",
      intensityArc: "A narrow recollection expands into a shared release.",
      motif: "One remembered window gathers the returning voices.",
      world: {
        spatialMode: "cinematic", motionLaw: "suspend", artworkRole: "portal", texture: "glass",
        depth: 0.74, fluidity: 0.42, elasticity: 0.31, atmosphere: 0.86,
        rationale: "The artwork becomes a temporary opening rather than a passive thumbnail.",
      },
      blocking: { version: "song-blocking-v1", baseLayout: "editorialSplit", transitions: [] },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify({ directorBible: legacyIntent }),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response).toMatchObject({
      premise: legacyIntent.concept,
      emotionalArc: legacyIntent.intensityArc,
      world: { spatialMode: "cinematic", motionLaw: "suspend", artworkRole: "portal", texture: "glass" },
      motifActor: { relationship: legacyIntent.motif },
      layoutBudget: { baseLayout: "editorialSplit", proposedTransitions: [] },
    });
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  for (const [label, message] of [
    ["direct object content", { content: { directorBible: { concept: "A direct object premise.", intensityArc: "A direct object arc.", world: { spatialMode: "cinematic" }, motif: "A direct motif.", blocking: { baseLayout: "monument" } } } }],
    ["reasoning content", { content: null, reasoning_content: `<think>private reasoning</think>\nHere is the result:\n\`\`\`json\n${JSON.stringify({ concept: "A reasoned premise.", intensityArc: "A reasoned arc.", world: { motionLaw: "flow" }, motif: "A reasoned motif.", blocking: { baseLayout: "editorialSplit" } })}\n\`\`\`` }],
    ["prose wrapped content", { content: `Completed result:\n${JSON.stringify({ concept: "A prose premise.", intensityArc: "A prose arc.", world: { texture: "paper" }, motif: "A prose motif.", blocking: { baseLayout: "railLeading" } })}\nEnd.` }],
  ] as const) {
    it(`extracts JSON from OpenAI-compatible ${label}`, async () => {
      const lyrics = lyricFixtures.repeatedHook;
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 }));
      const result = await executeDirectorBYOKProfileV1(
        configuration("openai-compatible", "https://profile.test/v1"),
        { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
        directorBibleRequestProfileV1,
        fetchMock as typeof fetch,
      );
      expect(result.response.version).toBe("director-bible-v1");
      expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
    });
  }

  for (const [label, body] of [
    ["Responses envelope", { output_text: JSON.stringify({ concept: "A responses premise.", intensityArc: "A responses arc.", world: { texture: "glass" }, motif: "A responses motif.", blocking: { baseLayout: "monument" } }) }],
    ["Gemini envelope", { candidates: [{ content: { parts: [{ text: JSON.stringify({ concept: "A Gemini premise.", intensityArc: "A Gemini arc.", world: { motionLaw: "flow" }, motif: "A Gemini motif.", blocking: { baseLayout: "editorialSplit" } }) }] } }] }],
    ["raw object", { concept: "A raw premise.", intensityArc: "A raw arc.", world: { spatialMode: "panoramic" }, motif: "A raw motif.", blocking: { baseLayout: "railTrailing" } }],
  ] as const) {
    it(`extracts JSON from a cross-protocol ${label}`, async () => {
      const lyrics = lyricFixtures.repeatedHook;
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
      const result = await executeDirectorBYOKProfileV1(
        configuration("openai-compatible", "https://profile.test/v1"),
        { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
        directorBibleRequestProfileV1,
        fetchMock as typeof fetch,
      );
      expect(result.response.version).toBe("director-bible-v1");
      expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
    });
  }

  it("assembles JSON from an SSE chat-completion response", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const json = JSON.stringify({ concept: "An SSE premise.", intensityArc: "An SSE arc.", world: { texture: "paper" }, motif: "An SSE motif.", blocking: { baseLayout: "railLeading" } });
    const midpoint = Math.floor(json.length / 2);
    const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
    const fetchMock = vi.fn(async () => new Response(`${event(json.slice(0, midpoint))}${event(json.slice(midpoint))}data: [DONE]\n\n`, {
      status: 200, headers: { "Content-Type": "text/event-stream" },
    }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-compatible", "https://profile.test/v1"),
      { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(result.response.premise).toBe("An SSE premise.");
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  it("finds JSON inside an unknown nested provider envelope", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      response_bundle: {
        provider_metadata: { model: "fixture-model" },
        generated_result: {
          payload: JSON.stringify({
            concept: "A nested premise.", intensityArc: "A nested arc.", world: { texture: "glass" },
            motif: "A nested motif.", blocking: { baseLayout: "monument" },
          }),
        },
      },
    }), { status: 200 }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-compatible", "https://profile.test/v1"),
      { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(result.response.premise).toBe("A nested premise.");
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  it("assembles JSON from newline-delimited chat-completion chunks", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const json = JSON.stringify({ concept: "An NDJSON premise.", intensityArc: "An NDJSON arc.", world: { motionLaw: "flow" }, motif: "An NDJSON motif.", blocking: { baseLayout: "editorialSplit" } });
    const midpoint = Math.floor(json.length / 2);
    const line = (content: string) => JSON.stringify({ choices: [{ delta: { content } }] });
    const fetchMock = vi.fn(async () => new Response(`${line(json.slice(0, midpoint))}\n${line(json.slice(midpoint))}\n`, {
      status: 200, headers: { "Content-Type": "application/x-ndjson" },
    }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-compatible", "https://profile.test/v1"),
      { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(result.response.premise).toBe("An NDJSON premise.");
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  it("assembles JSON from a Vercel AI SDK data stream", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const json = JSON.stringify({ concept: "A data-stream premise.", intensityArc: "A data-stream arc.", world: { texture: "glass" }, motif: "A data-stream motif.", blocking: { baseLayout: "monument" } });
    const midpoint = Math.floor(json.length / 2);
    const fetchMock = vi.fn(async () => new Response(`0:${JSON.stringify(json.slice(0, midpoint))}\n0:${JSON.stringify(json.slice(midpoint))}\nd:${JSON.stringify({ finishReason: "stop" })}\n`, {
      status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" },
    }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-compatible", "https://profile.test/v1"),
      { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(result.response.premise).toBe("A data-stream premise.");
    expect(result.diagnostics.attempts).toMatchObject([{ outcome: "ready", responseShape: "data-stream" }]);
  });

  it("extracts JSON from a plain-text provider response", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const body = `Completed result:\n${JSON.stringify({
      concept: "A plain-text premise.", intensityArc: "A plain-text arc.", world: { spatialMode: "panoramic" },
      motif: "A plain-text motif.", blocking: { baseLayout: "railTrailing" },
    })}\nEnd.`;
    const fetchMock = vi.fn(async () => new Response(body, {
      status: 200, headers: { "Content-Type": "text/plain" },
    }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-compatible", "https://profile.test/v1"),
      { lyrics, promptInput: { track: { title: "Fixture" }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(result.response.premise).toBe("A plain-text premise.");
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  it("adapts a schema-shaped signature scene into runtime gestures, effect and full anchor moment", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const anchor = bible.signatureAnchors[0]!;
    const line = lyrics.lines.find((candidate) => candidate.lineIndex === anchor.anchorLineIndices[0])!;
    const state = checkpointRollingPerformanceStateV1(lyrics, bible, anchor.fromLineIndex)!;
    const graphemes = lyricGraphemesV1(line.text);
    const evidence = {
      sectionTriggers: anchor.evidence.sectionTriggers,
      lineIndices: anchor.anchorLineIndices,
      audioLandmarkIDs: [],
      rationale: anchor.evidence.rationale,
      confidence: anchor.evidence.confidence,
    };
    const wire = {
      version: "scene-pack-v1",
      bibleIdentity: bible.bibleIdentity,
      entryStateHash: state.stateHash,
      scenes: [{
        fromLineIndex: anchor.fromLineIndex,
        toLineIndex: anchor.toLineIndex,
        intention: "Turn the exact signature anchor into one bounded authored event.",
        entryMotifState: state.motifState,
        exitMotifState: anchor.motifState,
        coverRole: "origin",
        layout: state.layout,
        artDirection: "editorialKinetic",
        typography: "jpGothic",
        presentation: "section",
        gestures: [{
          id: "wire:phrase", lineIndex: line.lineIndex, scope: "phrase",
          target: { fromGrapheme: 0, toGrapheme: graphemes.length, expectedText: line.text },
          primitive: "phrase.breathe", driver: "structuralMoment", space: "lyricLocal",
          envelope: { attackMs: 320, holdMs: 240, releaseMs: 520 }, intensity: 0.58, direction: 1, paletteRole: "accent",
          evidence: { semanticRole: "identity", rationale: "The whole exact phrase carries the signature event.", confidence: 0.76 },
        }, {
          id: "wire:token", lineIndex: line.lineIndex, scope: "token",
          target: { fromGrapheme: 0, toGrapheme: 1, expectedText: graphemes[0] },
          primitive: "token.halo", driver: "lineEnter", space: "lyricLocal",
          envelope: { attackMs: 220, holdMs: 160, releaseMs: 360 }, intensity: 0.52, direction: 1, paletteRole: "primary",
          evidence: { semanticRole: "identity", rationale: "One exact token introduces the same event at a second scale.", confidence: 0.74 },
        }],
        effects: [{
          cardID: "custom", presentation: "section", primary: { primitive: "field.drift", intensity: 0.58 }, support: [], evidence,
        }],
        signatureMoment: { anchorID: anchor.id, stageAction: "thread.connect", coverRole: "origin", consequence: "trace" },
        consequence: { kind: "trace", rationale: "The authored action leaves one persistent trace." },
        promiseCreates: [`promise:${anchor.id}`], promiseConsumes: [], evidence,
      }],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(wire) }), { status: 200 }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      { lyrics, bible, state, promptInput: { bible, state, fromLineIndex: anchor.fromLineIndex, toLineIndex: anchor.toLineIndex, lines: lyrics.lines } },
      scenePackRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(result.response).toHaveLength(1);
    expect(new Set(result.response[0]!.gestures.map((gesture) => gesture.scope))).toEqual(new Set(["phrase", "token"]));
    expect(result.response[0]!.effects[0]).toMatchObject({ version: "effect-recipe-v1", sectionID: result.response[0]!.sceneID });
    expect(result.response[0]!.effects[0]!.evidence.songMotif).toBe(bible.motifActor.relationship);
    expect(result.response[0]!.signatureMoment).toMatchObject({ id: anchor.id, stageAction: "thread.connect" });
  });

  it("binds Scene Pack identities locally instead of trusting opaque model echoes", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const firstCard = compileLocalSceneCardsV1(lyrics, bible)[0]!;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify({
      scenePack: {
        version: "scene-pack-v0",
        bibleIdentity: "model-invented-bible",
        entryStateHash: "model-invented-state",
        sceneCards: [{ ...firstCard, bibleIdentity: "wrong", entryStateHash: "wrong", sceneID: "wrong" }],
      },
    }) }), { status: 200 }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      {
        lyrics, bible, state,
        promptInput: { bible, state, fromLineIndex: firstCard.fromLineIndex, toLineIndex: firstCard.toLineIndex, lines: lyrics.lines },
      },
      scenePackRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response).toHaveLength(1);
    expect(result.response[0]).toMatchObject({
      bibleIdentity: bible.bibleIdentity,
      entryStateHash: state.stateHash,
      fromLineIndex: firstCard.fromLineIndex,
      toLineIndex: firstCard.toLineIndex,
    });
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  it("repairs a partial Scene response to the exact requested rolling window", async () => {
    const lyrics = lyricFixtures.longSongStructure;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const partial = compileLocalSceneCardsV1(lyrics, bible)[0]!;
    const requestedTo = lyrics.lines.find((line) => line.lineIndex > partial.toLineIndex + 1)!.lineIndex;
    const state = checkpointRollingPerformanceStateV1(lyrics, bible, partial.fromLineIndex)!;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify({
      version: "scene-pack-v1",
      bibleIdentity: bible.bibleIdentity,
      entryStateHash: state.stateHash,
      scenes: [partial],
    }) }), { status: 200 }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      {
        lyrics, bible, state,
        promptInput: { bible, state, fromLineIndex: partial.fromLineIndex, toLineIndex: requestedTo, lines: lyrics.lines },
      },
      scenePackRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response).toHaveLength(1);
    expect(result.response[0]).toMatchObject({
      fromLineIndex: partial.fromLineIndex,
      toLineIndex: requestedTo,
      intention: partial.intention,
      artDirection: partial.artDirection,
    });
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  it("does not retry a rejected JSON Schema format before Scene contract correction", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const firstCard = compileLocalSceneCardsV1(lyrics, bible)[0]!;
    const formats: string[] = [];
    let jsonObjectCalls = 0;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { response_format?: { type?: string } };
      const format = String(request.response_format?.type ?? "");
      formats.push(format);
      if (format === "json_schema") {
        return new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT" } }), { status: 400 });
      }
      jsonObjectCalls += 1;
      const content = jsonObjectCalls === 1
        ? { version: "scene-pack-v1", scenes: [] }
        : { version: "scene-pack-v1", bibleIdentity: bible.bibleIdentity, entryStateHash: state.stateHash, scenes: [firstCard] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
    });
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-compatible", "https://profile.test/v1"),
      {
        lyrics, bible, state,
        promptInput: { bible, state, fromLineIndex: firstCard.fromLineIndex, toLineIndex: firstCard.toLineIndex, lines: lyrics.lines },
      },
      scenePackRequestProfileV1,
      fetchMock as typeof fetch,
      45_000,
      3,
    );
    expect(formats).toEqual(["json_schema", "json_object", "json_object"]);
    expect(result.response).toHaveLength(1);
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["http-error", "contract-degraded", "ready"]);
  });

  it("repairs a legacy section into a bounded Scene Card without trusting its cues", async () => {
    const lyrics = lyricFixtures.repeatedHook;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const localCard = compileLocalSceneCardsV1(lyrics, bible)[0]!;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify({
      sections: [{
        fromLineIndex: localCard.fromLineIndex,
        toLineIndex: localCard.toLineIndex,
        intention: "Hold the repeated phrase inside one high-contrast paper cut.",
        artDirection: "paperCut",
        typography: "jpMincho",
        presentation: "section",
        gestures: [{ primitive: "invented.unsafe" }],
        effects: [{ primary: { primitive: "invented.unsafe" } }],
      }],
    }) }), { status: 200 }));
    const result = await executeDirectorBYOKProfileV1(
      configuration("openai-responses", "https://profile.test/v1"),
      {
        lyrics, bible, state,
        promptInput: { bible, state, fromLineIndex: localCard.fromLineIndex, toLineIndex: localCard.toLineIndex, lines: lyrics.lines },
      },
      scenePackRequestProfileV1,
      fetchMock as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response[0]).toMatchObject({
      intention: "Hold the repeated phrase inside one high-contrast paper cut.",
      artDirection: "paperCut",
      typography: "jpMincho",
      presentation: "section",
    });
    expect(result.response[0]!.gestures.every((gesture) => String(gesture.primitive) !== "invented.unsafe")).toBe(true);
    expect(result.response[0]!.effects.every((effect) => String(effect.primary.primitive) !== "invented.unsafe")).toBe(true);
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

  it("rejects a Scene Card outside the requested bounded window", async () => {
    const lyrics = lyricFixtures.longSongStructure;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const card = compileLocalSceneCardsV1(lyrics, bible)[0]!;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        version: "scene-pack-v1", bibleIdentity: bible.bibleIdentity, entryStateHash: state.stateHash, scenes: [card],
      }),
    }), { status: 200 }));
    let failure: unknown;
    try {
      await executeDirectorBYOKProfileV1(
        configuration("openai-responses", "https://profile.test/v1"),
        {
          lyrics, bible, state,
          promptInput: { bible, state, fromLineIndex: card.toLineIndex + 1, toLineIndex: lyrics.lines.at(-1)!.lineIndex, lines: lyrics.lines },
        },
        scenePackRequestProfileV1,
        fetchMock as typeof fetch,
        45_000,
        1,
      );
    } catch (error) {
      failure = error;
    }
    expect(directorBYOKDiagnosticsFromErrorV1(failure)?.attempts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  for (const [protocol, endpoint, expectedPath] of [
    ["openai-compatible", "https://example.test/v1", "/v1/chat/completions"],
    ["openai-responses", "https://example.test/v1", "/v1/responses"],
    ["gemini", "https://example.test/v1beta", "/v1beta/interactions"],
    ["anthropic", "https://example.test/v1", "/v1/messages"],
  ] as const) {
    it(`compiles ${protocol} JSON through the local Director contract`, async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        expect(new URL(url).pathname).toBe(expectedPath);
        const body = String(init?.body);
        expect(body).not.toContain("https://www.youtube.com/watch?v=abcdefghijk");
        expect(body).not.toContain("secret-fixture-key");
        if (protocol === "gemini") {
          const payload = JSON.parse(body) as {
            model?: string;
            response_format?: { type?: string; mime_type?: string; schema?: unknown };
            system_instruction?: string;
            store?: boolean;
          };
          expect(payload.model).toBe("fixture-model");
          expect(payload.response_format?.type).toBe("text");
          expect(payload.response_format?.mime_type).toBe("application/json");
          expect(payload.response_format?.schema).toEqual(directorIntentSchemaV1);
          expect(payload.system_instruction).toBe(directorIntentSystemPromptV1);
          expect(payload.store).toBe(false);
        }
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

  it("falls back to generateContent when the Gemini Interactions endpoint is unavailable", async () => {
    const paths: string[] = [];
    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      paths.push(new URL(String(input)).pathname);
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return paths.length === 1
        ? new Response("interactions unavailable", { status: 404 })
        : new Response(JSON.stringify(providerPayload("gemini")), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const result = await executeDirectorBYOKV1(
      configuration("gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash"),
      requestFixture(),
      fetchMock as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(paths).toEqual([
      "/v1beta/interactions",
      "/v1beta/models/gemini-2.5-flash:generateContent",
    ]);
    expect(payloads[0]?.response_format).toBeTruthy();
    expect((payloads[1]?.generationConfig as Record<string, unknown>)?.responseFormat).toBeTruthy();
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["http-error", "ready"]);
  });

  it("uses Vertex AI Express generateContent directly without an unsupported schema", async () => {
    const paths: string[] = [];
    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      paths.push(new URL(String(input)).pathname);
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify(providerPayload("gemini")), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const result = await executeDirectorBYOKV1(
      configuration("gemini", "https://aiplatform.googleapis.com/v1beta1/publishers/google", "gemini-2.5-flash"),
      requestFixture(),
      fetchMock as typeof fetch,
    );
    expect(paths).toEqual(["/v1beta1/publishers/google/models/gemini-2.5-flash:generateContent"]);
    expect(payloads[0]?.generationConfig).toMatchObject({
      responseMimeType: "application/json", maxOutputTokens: 8_192, thinkingConfig: { thinkingBudget: 0 },
    });
    expect((payloads[0]?.generationConfig as Record<string, unknown>)?.responseJsonSchema).toBeUndefined();
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
  });

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

  it("keeps a bounded structured Gemini permission reason without the raw response wrapper", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 403,
        status: "PERMISSION_DENIED",
        message: "Requests to this API method are blocked for this project.",
        details: [{ reason: "API_KEY_SERVICE_BLOCKED" }],
      },
    }), { status: 403, headers: { "Content-Type": "application/json" } }));
    await expect(executeDirectorBYOKV1(
      configuration("gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-3.7-flash"),
      requestFixture(),
      fetchMock as typeof fetch,
    )).rejects.toThrow("PERMISSION_DENIED · Requests to this API method are blocked for this project. · API_KEY_SERVICE_BLOCKED");
  });

  it("repairs invalid scenic evidence locally instead of discarding the whole AI direction", async () => {
    const invalid = aiFixture() as any;
    invalid.blocking = { version: "song-blocking-v1", baseLayout: "invalid-layout", transitions: [] };
    invalid.effects = [];
    invalid.gestures = [];
    invalid.dramaticScore.signatureMoments = invalid.dramaticScore.signatureMoments.map((moment: any) => ({
      ...moment,
      evidence: { ...moment.evidence, sectionTriggers: ["invented_trigger"] },
    }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(invalid),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await executeDirectorBYOKV1(
      configuration("openai-responses", "https://primary.test/v1"),
      requestFixture(),
      fetchMock as typeof fetch,
    );
    const response = result.response as {
      degraded?: boolean;
      effects?: unknown[];
      gestures?: unknown[];
      dramaticScore?: { signatureMoments?: unknown[] };
    };
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.degraded).toBe(false);
    expect(response.effects?.length).toBeGreaterThan(0);
    expect(response.gestures?.length).toBeGreaterThan(0);
    expect(response.dramaticScore?.signatureMoments?.length).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.attempts.map((attempt) => attempt.outcome)).toEqual(["ready"]);
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
