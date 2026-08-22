import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFullscreenPromptInput,
  finalizeFullscreenResponse,
  fullscreenSystemPrompt,
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
  blocking: {
    version: "song-blocking-v1",
    baseLayout: "editorialSplit",
    transitions: [],
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
  gestures: [{
    id: "fixture:phrase:2",
    lineIndex: 2,
    scope: "phrase",
    target: { fromGrapheme: 0, toGrapheme: 2, expectedText: "光へ" },
    primitive: "phrase.handoff",
    driver: "lineEnter",
    space: "lyricLocal",
    envelope: { attackMs: 320, holdMs: 260, releaseMs: 520 },
    intensity: 0.66,
    direction: 1,
    paletteRole: "accent",
    evidence: { semanticRole: "repetition", rationale: "The repeated hook hands its contour to the paired voice.", confidence: 0.84 },
  }],
  dramaticScore: {
    version: "dramatic-score-v1",
    premise: "Two separated voices discover that the repeated light can connect them.",
    emotionalArc: "A quiet solitary image becomes a shared tension and returns as one remembered line.",
    acts: [
      { id: "act:setup", role: "setup", fromLineIndex: 0, toLineIndex: 1, tension: 0.32, visualDensity: 0.28, motifState: "seed", intention: "Establish a thin thread without disturbing reading." },
      { id: "act:coda", role: "coda", fromLineIndex: 2, toLineIndex: 3, tension: 0.78, visualDensity: 0.54, motifState: "return", intention: "Let the paired voices return the thread as a shared memory." },
    ],
    motifActor: {
      family: "thread",
      origin: "voice",
      relationship: "A thread leaves the quiet lyric, crosses the voice boundary and returns as a shared trace.",
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
        evidence: { sectionTriggers: ["section_boundary"], rationale: "The opening releases the first restrained thread before the duet exists.", confidence: 0.78 },
      },
      {
        id: "moment:return", fromLineIndex: 2, toLineIndex: 3, anchorLineIndices: [2, 3], purpose: "connection", motifState: "return",
        actorFamily: "thread", stageAction: "motif.recall", coverRole: "memory", consequence: "return", recallOf: "moment:seed", intensity: 0.82,
        evidence: { sectionTriggers: ["duet_overlap", "repeated_hook"], rationale: "The verified overlapping hook recalls the opening line with a second voice attached.", confidence: 0.91 },
      },
    ],
    quietWindows: [{ fromLineIndex: 1, toLineIndex: 1, reason: "Stable reading preserves contrast before the duet return." }],
  },
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
  assert.equal(response.sections[1].layout, "editorialSplit");
  assert.equal(response.blocking.transitions.length, 0);
  assert.equal(response.gestures.length, 1);
  assert.equal(response.effects.length, 1);
  assert.equal(response.world.spatialMode, "splitStage");
  assert.equal(response.effects[0].primary.primitive, "geometry.mirror");
  assert.deepEqual(response.effects[0].evidence.lineIndices, [2, 3]);
  assert.deepEqual(response.directives.map((item) => item.lineIndex), [0, 1, 2, 3]);
  assert.equal(response.lyricsHash, requestFixture().lyricsHash);
  assert.equal(JSON.stringify(response).includes("静かな夜"), false);
});

test("fullscreen prompt treats layouts as evidence-backed dramaturgic positions", () => {
  assert.match(fullscreenSystemPrompt, /monument is a concentrated proclamation/u);
  assert.match(fullscreenSystemPrompt, /prefer one or two justified major transitions/u);
  assert.match(fullscreenSystemPrompt, /why the previous geometry no longer expresses it/u);
});

test("repairs invalid AI section boundaries without discarding the valid dramatic plan", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const ai = aiFixture();
  ai.sections = [
    { ...ai.sections[0], fromLineIndex: 0, toLineIndex: 2 },
    { ...ai.sections[1], fromLineIndex: 2, toLineIndex: 3 },
  ];
  ai.effects = [{ ...ai.effects[0], sectionIndex: 0 }];
  const response = finalizeFullscreenResponse(input, ai);
  assert.equal(response.degraded, false);
  assert.equal(response.sectionPartition, "repaired");
  assert.deepEqual(response.sections.map(({ fromLineIndex, toLineIndex }) => ({ fromLineIndex, toLineIndex })), [
    { fromLineIndex: 0, toLineIndex: 3 },
  ]);
  assert.equal(response.effects.length, 1);
  assert.equal(response.gestures.length, 1);
  assert.equal(response.dramaticScore.signatureMoments.length, 2);
});

test("estimated word cues reach the prompt but remain distinct from real timing", () => {
  const input = sanitizeFullscreenRequest(estimatedRequestFixture());
  const prompt = buildFullscreenPromptInput(input);
  assert.equal(input.lines[0].timingPrecision, "estimated");
  assert.equal(prompt.lines[0].realWordTiming, false);
  assert.equal(prompt.lines[0].estimatedWordTiming, true);
  assert.equal(prompt.lines[0].wordTiming.precision, "estimated");
  assert.deepEqual(prompt.lines[0].wordTiming.cues, [[0, 0, 2.1, "静かな", 0, 3], [1, 2.1, 4.6, "夜", 3, 4]]);
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

test("dramatic scenes use lyric order and derive stillness from the AI act when timings overlap", () => {
  const request = requestFixture();
  request.lines = request.lines.map((line, index) => index === 1 ? { ...line, from: 4, to: 10 } : line);
  const input = sanitizeFullscreenRequest(request);
  const ai = aiFixture();
  ai.dramaticScore = {
    ...ai.dramaticScore,
    signatureMoments: [
      ai.dramaticScore.signatureMoments[0],
      { ...ai.dramaticScore.signatureMoments[1], fromLineIndex: 1, anchorLineIndices: [1, 2, 3] },
    ],
    quietWindows: [],
  };
  const response = finalizeFullscreenResponse(input, ai);
  assert.equal(response.degraded, false);
  assert.equal(response.dramaticScore.signatureMoments.length, 2);
  assert.equal(response.dramaticScore.quietWindows.length, 1);
  assert.equal(response.dramaticScore.quietWindows[0].fromLineIndex, 0);
});

test("dramatic scene references normalize model prose while preserving a real return", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const ai = aiFixture();
  ai.dramaticScore = {
    ...ai.dramaticScore,
    signatureMoments: ai.dramaticScore.signatureMoments.map((moment) => ({
      ...moment,
      recallOf: "the image established earlier",
    })),
  };
  const response = finalizeFullscreenResponse(input, ai);
  assert.equal(response.degraded, false);
  assert.equal(response.dramaticScore.signatureMoments[0].recallOf, "");
  assert.equal(
    response.dramaticScore.signatureMoments.at(-1).recallOf,
    response.dramaticScore.signatureMoments[0].id,
  );
});

test("dramatic score requires the accepted arc to begin with a seed and end with an earlier recall", () => {
  const input = sanitizeFullscreenRequest(requestFixture());

  const transformedOpening = aiFixture();
  transformedOpening.dramaticScore = {
    ...transformedOpening.dramaticScore,
    signatureMoments: transformedOpening.dramaticScore.signatureMoments.map((moment, index) => index === 0
      ? { ...moment, motifState: "transform" }
      : moment),
  };
  const invalidOpening = finalizeFullscreenResponse(input, transformedOpening);
  assert.equal(invalidOpening.degraded, true);
  assert.match(invalidOpening.degradedReason, /dramaticScore:moments:arc:first/u);

  const transformedEnding = aiFixture();
  transformedEnding.dramaticScore = {
    ...transformedEnding.dramaticScore,
    signatureMoments: transformedEnding.dramaticScore.signatureMoments.map((moment, index) => index === 1
      ? { ...moment, motifState: "transform" }
      : moment),
  };
  const invalidEnding = finalizeFullscreenResponse(input, transformedEnding);
  assert.equal(invalidEnding.degraded, true);
  assert.match(invalidEnding.degradedReason, /dramaticScore/u);
});

test("non-return dramatic moments discard recall prose while the final return keeps an earlier id", () => {
  const request = requestFixture();
  request.lines[1] = { ...request.lines[1], text: "遠くへ" };
  const input = sanitizeFullscreenRequest(request);
  const ai = aiFixture();
  const finalMoment = {
    ...ai.dramaticScore.signatureMoments[1],
    evidence: {
      ...ai.dramaticScore.signatureMoments[1].evidence,
      sectionTriggers: ["duet_overlap", "final_resolution"],
    },
  };
  ai.dramaticScore = {
    ...ai.dramaticScore,
    signatureMoments: [
      ai.dramaticScore.signatureMoments[0],
      {
        id: "moment:middle", fromLineIndex: 1, toLineIndex: 1, anchorLineIndices: [1], purpose: "distance", motifState: "transform",
        actorFamily: "thread", stageAction: "memory.imprint", coverRole: "boundary", consequence: "reframe", recallOf: "moment:seed", intensity: 0.66,
        evidence: { sectionTriggers: ["semantic_distance"], rationale: "The anchored lyric names distance before the voices return.", confidence: 0.84 },
      },
      finalMoment,
    ],
  };
  const response = finalizeFullscreenResponse(input, ai);
  assert.equal(response.degraded, false, response.degradedReason);
  assert.equal(response.dramaticScore.signatureMoments[1].recallOf, "");
  assert.equal(response.dramaticScore.signatureMoments[2].recallOf, "moment:seed");
});

test("dramatic purpose, strong-action, and family matrices reject superficially grounded moments", () => {
  const input = sanitizeFullscreenRequest(requestFixture());

  const wrongPurpose = aiFixture();
  wrongPurpose.dramaticScore.signatureMoments[1] = {
    ...wrongPurpose.dramaticScore.signatureMoments[1],
    purpose: "release",
  };
  assert.equal(finalizeFullscreenResponse(input, wrongPurpose).degraded, true);

  const wrongStrongAction = aiFixture();
  wrongStrongAction.dramaticScore.signatureMoments[1] = {
    ...wrongStrongAction.dramaticScore.signatureMoments[1],
    stageAction: "duet.tension",
    evidence: {
      ...wrongStrongAction.dramaticScore.signatureMoments[1].evidence,
      sectionTriggers: ["repeated_hook"],
    },
  };
  assert.equal(finalizeFullscreenResponse(input, wrongStrongAction).degraded, true);

  const wrongFamily = aiFixture();
  wrongFamily.dramaticScore.signatureMoments[0] = {
    ...wrongFamily.dramaticScore.signatureMoments[0],
    stageAction: "window.reveal",
  };
  assert.equal(finalizeFullscreenResponse(input, wrongFamily).degraded, true);
});

test("lyric-local evidence must land on an anchor while structural evidence may bind the moment range", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const unsupportedAnchor = aiFixture();
  unsupportedAnchor.dramaticScore.signatureMoments[1] = {
    ...unsupportedAnchor.dramaticScore.signatureMoments[1],
    anchorLineIndices: [3],
    evidence: {
      ...unsupportedAnchor.dramaticScore.signatureMoments[1].evidence,
      sectionTriggers: ["repeated_hook"],
    },
  };
  assert.equal(finalizeFullscreenResponse(input, unsupportedAnchor).degraded, true);

  const rangeBound = aiFixture();
  rangeBound.dramaticScore.signatureMoments[1] = {
    ...rangeBound.dramaticScore.signatureMoments[1],
    anchorLineIndices: [2],
    purpose: "resolution",
    evidence: {
      ...rangeBound.dramaticScore.signatureMoments[1].evidence,
      sectionTriggers: ["final_resolution"],
    },
  };
  const accepted = finalizeFullscreenResponse(input, rangeBound);
  assert.equal(accepted.degraded, false, accepted.degradedReason);
  assert.deepEqual(accepted.dramaticScore.signatureMoments[1].evidence.sectionTriggers, ["final_resolution"]);
});

test("dramatic signature moments reject fabricated structural evidence", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const ai = aiFixture();
  ai.dramaticScore = {
    ...ai.dramaticScore,
    signatureMoments: [
      ai.dramaticScore.signatureMoments[0],
      {
        ...ai.dramaticScore.signatureMoments[1],
        evidence: {
          ...ai.dramaticScore.signatureMoments[1].evidence,
          sectionTriggers: ["silence_gap"],
        },
      },
    ],
  };
  const response = finalizeFullscreenResponse(input, ai);
  assert.equal(response.degraded, true);
  assert.match(response.degradedReason, /dramaticScore/u);
});

test("invalid blocking transitions and lyric gestures fail closed per cue", () => {
  const input = sanitizeFullscreenRequest(requestFixture());
  const tooSoon = finalizeFullscreenResponse(input, {
    ...aiFixture(),
    blocking: {
      version: "song-blocking-v1",
      baseLayout: "editorialSplit",
      transitions: [{
        atSectionIndex: 1,
        toLayout: "duetDivide",
        purpose: "voiceReframe",
        strength: "major",
        evidence: {
          sectionTriggers: ["section_boundary", "duet_overlap", "density_lift"],
          lineIndices: [2, 3],
          audioLandmarkIDs: [],
          rationale: "The duet requests a new frame too soon after the opening.",
          confidence: 0.92,
        },
      }],
    },
  });
  assert.equal(tooSoon.degraded, false);
  assert.equal(tooSoon.blocking.transitions.length, 0);

  const separatedInput = sanitizeFullscreenRequest({
    ...requestFixture(),
    lines: requestFixture().lines.map((line, index) => index < 2
      ? { ...line, from: index * 10, to: (index + 1) * 10 }
      : { ...line, from: 20, to: 25 }),
  });
  const wrongReason = finalizeFullscreenResponse(separatedInput, {
    ...aiFixture(),
    blocking: {
      version: "song-blocking-v1",
      baseLayout: "editorialSplit",
      transitions: [{
        atSectionIndex: 1,
        toLayout: "duetDivide",
        purpose: "voiceReframe",
        strength: "major",
        evidence: {
          sectionTriggers: ["section_boundary", "density_lift"],
          lineIndices: [2, 3],
          audioLandmarkIDs: [],
          rationale: "The denser section alone cannot prove that the voices need to divide.",
          confidence: 0.92,
        },
      }],
    },
  });
  assert.equal(wrongReason.degraded, false);
  assert.equal(wrongReason.blocking.transitions.length, 0);

  const rewritten = finalizeFullscreenResponse(input, {
    ...aiFixture(),
    gestures: [{
      ...aiFixture().gestures[0],
      target: { ...aiFixture().gestures[0].target, expectedText: "not-the-lyric" },
    }],
  });
  assert.equal(rewritten.degraded, true);
  assert.match(rewritten.degradedReason, /gestures/u);

  const partiallyValid = finalizeFullscreenResponse(input, {
    ...aiFixture(),
    gestures: [
      aiFixture().gestures[0],
      {
        ...aiFixture().gestures[0],
        id: "invalid-rewrite",
        target: { ...aiFixture().gestures[0].target, expectedText: "not-the-lyric" },
      },
    ],
  });
  assert.equal(partiallyValid.degraded, false);
  assert.equal(partiallyValid.gestures.length, 1);
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

test("HTTP core retries one rejected AI contract before degrading", async () => {
  const environment = {
    API_KEY: "client-test",
    GCP_API_KEY: "upstream-test",
    UPSTREAM_BASE_URL: "https://aiplatform.googleapis.com",
    MODEL: "gemini-3.5-flash",
    IDENTITY_MODEL: "gemma-4-26b-a4b-it",
    DIRECTOR_VERSION: "director-test-v1",
    CACHE_DIR: "/unused",
  };
  const prompts = [];
  const deadlines = [];
  const response = await handleRequest(new Request("https://director.test/v1/fullscreen/direct", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer client-test" },
    body: JSON.stringify(requestFixture()),
  }), environment, {
    cache: { get: async () => null, put: async () => undefined },
    provider: async (_environment, _systemPrompt, prompt, options) => {
      prompts.push(prompt);
      deadlines.push(options.deadlineUnixMs);
      return {
        value: prompts.length === 1 ? { ...aiFixture(), effects: [] } : aiFixture(),
        model: "gemini-3.5-flash",
      };
    },
  });
  const body = await response.json();
  assert.equal(prompts.length, 2);
  assert.equal(deadlines.length, 2);
  assert.equal(deadlines[0], deadlines[1]);
  assert.equal(prompts[1].retryContext.rejectedReason, "effects");
  assert.equal(body.degraded, false);
});

test("director cache failures are best-effort and never discard a valid plan", async () => {
  const environment = {
    API_KEY: "client-test",
    GCP_API_KEY: "upstream-test",
    UPSTREAM_BASE_URL: "https://aiplatform.googleapis.com",
    MODEL: "gemini-3.5-flash",
    IDENTITY_MODEL: "gemma-4-26b-a4b-it",
    DIRECTOR_VERSION: "director-test-v1",
    CACHE_DIR: "/unused",
  };
  const warnings = [];
  const response = await handleRequest(new Request("https://director.test/v1/fullscreen/direct", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer client-test" },
    body: JSON.stringify(requestFixture()),
  }), environment, {
    cache: {
      get: async () => { throw new Error("read EIO"); },
      put: async () => { throw new Error("write EIO"); },
    },
    warn: (event, detail) => warnings.push([event, detail]),
    provider: async () => ({ value: aiFixture(), model: "gemini-3.5-flash" }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.degraded, false);
  assert.deepEqual(warnings.map(([event]) => event), ["cache_read_failed", "cache_write_failed"]);
});

test("aborted clients release upstream slots instead of leaving the service busy", async () => {
  const environment = {
    API_KEY: "client-test",
    GCP_API_KEY: "upstream-test",
    UPSTREAM_BASE_URL: "https://aiplatform.googleapis.com",
    MODEL: "gemini-3.5-flash",
    IDENTITY_MODEL: "gemma-4-26b-a4b-it",
    DIRECTOR_VERSION: "director-test-v1",
    CACHE_DIR: "/unused",
  };
  const cache = { get: async () => null, put: async () => undefined };
  const makeRequest = (trackID, controller) => {
    const body = requestFixture();
    body.trackID = trackID;
    body.recordingID = `youtubeMusic:${trackID}`;
    return new Request("https://director.test/v1/fullscreen/direct", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer client-test" },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  };
  const slowProvider = async (_environment, _systemPrompt, _prompt, options) => new Promise((_resolve, reject) => {
    if (options.signal.aborted) {
      reject(options.signal.reason);
      return;
    }
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = handleRequest(makeRequest("abort-first", firstController), environment, { cache, provider: slowProvider });
  const second = handleRequest(makeRequest("abort-second", secondController), environment, { cache, provider: slowProvider });
  for (let index = 0; index < 6; index += 1) await Promise.resolve();

  const busy = await handleRequest(makeRequest("busy-third"), environment, {
    cache,
    provider: async () => ({ value: aiFixture(), model: "gemini-3.5-flash" }),
  });
  assert.equal(busy.status, 429);

  firstController.abort(new Error("first client disconnected"));
  secondController.abort(new Error("second client disconnected"));
  await Promise.all([first, second]);

  const recovered = await handleRequest(makeRequest("recovered-third"), environment, {
    cache,
    provider: async () => ({ value: aiFixture(), model: "gemini-3.5-flash" }),
  });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).degraded, false);
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
  assert.equal(body.status, "grounded", JSON.stringify(body));
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
  assert.equal(request.body.generationConfig.responseJsonSchema.properties.dramaticScore.type, "object");
  assert.doesNotMatch(JSON.stringify(request.body.generationConfig.responseJsonSchema), /"(?:minimum|maximum|minItems|maxItems|uniqueItems)"/u);
  assert.equal(result.value.concept, aiFixture().concept);
});

test("Gemini provider attaches exact public YouTube context and falls back safely when unsupported", async () => {
  const requests = [];
  const timeoutBudgets = [];
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
  }, {
    timeoutFactory: (milliseconds) => {
      timeoutBudgets.push(milliseconds);
      return new AbortController().signal;
    },
  });
  assert.equal(requests[0].body.contents[0].parts[0].fileData.fileUri, "https://www.youtube.com/watch?v=X9aN34E-f8Q");
  assert.equal(requests[1].body.contents[0].parts.some((part) => part.fileData), false);
  assert.deepEqual(timeoutBudgets, [96_000, 90_000]);
  assert.equal(result.wholeSongFallback, true);
});

test("Gemini provider keeps the text fallback inside the shared request deadline", async () => {
  const timeoutBudgets = [];
  await callVertexDirector({
    GCP_API_KEY: "upstream-test",
    UPSTREAM_BASE_URL: "https://aiplatform.googleapis.com",
    MODEL: "gemini-3.7-flash",
  }, "system", { song: "fixture" }, async () => new Response(JSON.stringify({
    modelVersion: "gemini-3.7-flash",
    candidates: [{ content: { parts: [{ text: JSON.stringify(aiFixture()) }] } }],
  }), { status: 200, headers: { "content-type": "application/json" } }), {
    deadlineUnixMs: 13_000,
    now: () => 1_000,
    timeoutFactory: (milliseconds) => {
      timeoutBudgets.push(milliseconds);
      return new AbortController().signal;
    },
  });
  assert.deepEqual(timeoutBudgets, [12_000]);
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
