import type { DirectorBibleV1, RollingPerformanceStateV1 } from "./rollingDirector";

type JSONSchema = Record<string, unknown>;

const stringArray = (maximum: number): JSONSchema => ({
  type: "array",
  maxItems: maximum,
  items: { type: "string", minLength: 1 },
});

const performanceTriggers = [
  "repeated_hook", "section_boundary", "silence_gap", "duet_overlap", "voice_handoff",
  "density_lift", "density_release", "semantic_distance", "semantic_motion", "semantic_contrast",
  "question_suspension", "collective_chorus", "final_resolution",
] as const;

const effectPrimitives = [
  "field.drift", "field.aperture", "field.ribbon", "field.prism", "field.rain",
  "geometry.converge", "geometry.expand", "geometry.mirror", "geometry.cut", "geometry.suspend", "geometry.orbit",
  "memory.echo", "memory.trail", "density.lift", "density.release", "motif.recall",
  "cover.island", "cover.portal", "transition.bloom", "transition.dissolve",
] as const;

const evidenceSchema = (minimumConfidence: number): JSONSchema => ({
  type: "object",
  additionalProperties: false,
  required: ["sectionTriggers", "lineIndices", "audioLandmarkIDs", "rationale", "confidence"],
  properties: {
    sectionTriggers: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { enum: performanceTriggers } },
    lineIndices: { type: "array", minItems: 1, maxItems: 12, uniqueItems: true, items: { type: "integer", minimum: 0 } },
    audioLandmarkIDs: stringArray(8),
    rationale: { type: "string", minLength: 1, maxLength: 420 },
    confidence: { type: "number", minimum: minimumConfidence, maximum: 1 },
  },
});

export const directorBibleSchemaV1: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "premise", "emotionalArc", "world", "acts", "motifActor", "signatureAnchors", "quietWindows", "layoutBudget"],
  properties: {
    version: { const: "director-bible-v1" },
    premise: { type: "string", minLength: 1, maxLength: 240 },
    emotionalArc: { type: "string", minLength: 1, maxLength: 320 },
    world: {
      type: "object",
      additionalProperties: false,
      required: ["spatialMode", "motionLaw", "artworkRole", "texture", "depth", "fluidity", "elasticity", "atmosphere", "rationale"],
      properties: {
        spatialMode: { enum: ["anchored", "panoramic", "cinematic", "orbital", "splitStage", "chorusWall"] },
        motionLaw: { enum: ["drift", "flow", "pulse", "fall", "orbit", "converge", "suspend", "fracture"] },
        artworkRole: { enum: ["anchor", "portal", "memory", "counterpoint", "atmosphere"] },
        texture: { enum: ["silk", "ink", "mist", "glass", "paper", "light"] },
        depth: { type: "number", minimum: 0, maximum: 1 },
        fluidity: { type: "number", minimum: 0, maximum: 1 },
        elasticity: { type: "number", minimum: 0, maximum: 1 },
        atmosphere: { type: "number", minimum: 0, maximum: 1 },
        rationale: { type: "string", minLength: 1, maxLength: 320 },
      },
    },
    acts: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "role", "fromLineIndex", "toLineIndex", "tension", "visualDensity", "motifState", "intention"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 120 },
          role: { enum: ["setup", "development", "reversal", "climax", "coda"] },
          fromLineIndex: { type: "integer", minimum: 0 },
          toLineIndex: { type: "integer", minimum: 0 },
          tension: { type: "number", minimum: 0, maximum: 1 },
          visualDensity: { type: "number", minimum: 0, maximum: 1 },
          motifState: { enum: ["seed", "emerge", "transform", "fracture", "return", "resolve"] },
          intention: { type: "string", minLength: 1, maxLength: 320 },
        },
      },
    },
    motifActor: {
      type: "object",
      additionalProperties: false,
      required: ["family", "origin", "relationship", "states"],
      properties: {
        family: { enum: ["thread", "window", "silhouette", "horizon", "fold", "firework", "fish", "petal", "snow"] },
        origin: { enum: ["lyric", "artwork", "silence", "voice", "structure"] },
        relationship: { type: "string", minLength: 1, maxLength: 360 },
        states: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["state", "meaning"],
            properties: {
              state: { enum: ["seed", "emerge", "transform", "fracture", "return", "resolve"] },
              meaning: { type: "string", minLength: 1, maxLength: 240 },
            },
          },
        },
      },
    },
    signatureAnchors: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "fromLineIndex", "toLineIndex", "anchorLineIndices", "purpose", "motifState", "actorFamily", "recallOf", "intensity", "evidence"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 120 },
          fromLineIndex: { type: "integer", minimum: 0 },
          toLineIndex: { type: "integer", minimum: 0 },
          anchorLineIndices: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "integer", minimum: 0 } },
          purpose: { enum: ["reveal", "connection", "rupture", "release", "distance", "collective", "resolution"] },
          motifState: { enum: ["seed", "emerge", "transform", "fracture", "return", "resolve"] },
          actorFamily: { enum: ["thread", "window", "silhouette", "horizon", "fold", "firework", "fish", "petal", "snow"] },
          recallOf: { type: "string", maxLength: 120 },
          intensity: { type: "number", minimum: 0, maximum: 1 },
          evidence: evidenceSchema(0.7),
        },
      },
    },
    quietWindows: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fromLineIndex", "toLineIndex", "reason"],
        properties: {
          fromLineIndex: { type: "integer", minimum: 0 },
          toLineIndex: { type: "integer", minimum: 0 },
          reason: { type: "string", minLength: 1, maxLength: 240 },
        },
      },
    },
    layoutBudget: {
      type: "object",
      additionalProperties: false,
      required: ["baseLayout", "maximumTransitions", "proposedTransitions", "continuityJustification"],
      properties: {
        baseLayout: { enum: ["monument", "editorialSplit", "railLeading", "railTrailing", "duetDivide"] },
        maximumTransitions: { const: 2 },
        proposedTransitions: {
          type: "array",
          maxItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["atSectionIndex", "toLayout", "purpose", "strength", "evidence"],
            properties: {
              atSectionIndex: { type: "integer", minimum: 1, maximum: 4 },
              toLayout: { enum: ["monument", "editorialSplit", "railLeading", "railTrailing", "duetDivide"] },
              purpose: { enum: ["perspectiveShift", "voiceReframe", "silenceOpen", "finalExpansion"] },
              strength: { const: "major" },
              evidence: evidenceSchema(0.78),
            },
          },
        },
        continuityJustification: evidenceSchema(0.82),
      },
    },
  },
};

const gestureSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "lineIndex", "scope", "target", "primitive", "driver", "space", "envelope", "intensity", "direction", "paletteRole", "evidence"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 160 },
    lineIndex: { type: "integer", minimum: 0 },
    scope: { enum: ["glyph", "token", "phrase"] },
    target: {
      type: "object",
      additionalProperties: false,
      required: ["fromGrapheme", "toGrapheme", "expectedText"],
      properties: {
        fromGrapheme: { type: "integer", minimum: 0 },
        toGrapheme: { type: "integer", minimum: 1 },
        expectedText: { type: "string", minLength: 1, maxLength: 240 },
      },
    },
    primitive: { enum: ["glyph.weightPulse", "glyph.strokeTrace", "glyph.offsetSnap", "token.underlinePath", "token.halo", "token.echo", "token.elasticFocus", "phrase.breathe", "phrase.arc", "phrase.breakReform", "phrase.handoff", "phrase.contour"] },
    driver: { enum: ["lineEnter", "wordWindow", "lineHold", "lineExit", "structuralMoment"] },
    space: { enum: ["lyricLocal", "lyricToArtwork", "fullStage"] },
    envelope: {
      type: "object",
      additionalProperties: false,
      required: ["attackMs", "holdMs", "releaseMs"],
      properties: { attackMs: { type: "integer" }, holdMs: { type: "integer" }, releaseMs: { type: "integer" } },
    },
    intensity: { type: "number", minimum: 0, maximum: 1 },
    direction: { enum: [-1, 1] },
    paletteRole: { enum: ["primary", "accent", "warm", "secondary"] },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["semanticRole", "rationale", "confidence"],
      properties: {
        semanticRole: { enum: ["identity", "motion", "distance", "question", "repetition", "rupture", "resolution", "collective"] },
        rationale: { type: "string", minLength: 1, maxLength: 360 },
        confidence: { type: "number", minimum: 0.62, maximum: 1 },
      },
    },
  },
};

const effectUseSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["primitive", "intensity"],
  properties: {
    primitive: { enum: effectPrimitives },
    intensity: { type: "number", minimum: 0, maximum: 1 },
    direction: { enum: [-1, 1] },
    scale: { type: "number", minimum: 0.5, maximum: 2 },
  },
};

const effectSchema: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cardID", "presentation", "primary", "support", "evidence"],
  properties: {
    cardID: { type: "string", minLength: 1, maxLength: 60 },
    presentation: { enum: ["reading", "section", "hero", "duet", "aperture"] },
    primary: effectUseSchema,
    support: { type: "array", maxItems: 2, items: effectUseSchema },
    evidence: evidenceSchema(0.65),
  },
};

export const scenePackSchemaV1: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "bibleIdentity", "entryStateHash", "scenes"],
  properties: {
    version: { const: "scene-pack-v1" },
    bibleIdentity: { type: "string", minLength: 1, maxLength: 80 },
    entryStateHash: { type: "string", minLength: 1, maxLength: 80 },
    scenes: {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fromLineIndex", "toLineIndex", "intention", "entryMotifState", "exitMotifState", "coverRole", "layout", "artDirection", "typography", "presentation", "gestures", "effects", "consequence", "promiseCreates", "promiseConsumes", "evidence"],
        properties: {
          fromLineIndex: { type: "integer", minimum: 0 },
          toLineIndex: { type: "integer", minimum: 0 },
          intention: { type: "string", minLength: 1, maxLength: 320 },
          entryMotifState: { enum: ["seed", "emerge", "transform", "fracture", "return", "resolve"] },
          exitMotifState: { enum: ["seed", "emerge", "transform", "fracture", "return", "resolve"] },
          coverRole: { enum: ["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"] },
          layout: { enum: ["monument", "editorialSplit", "railLeading", "railTrailing", "duetDivide"] },
          artDirection: { enum: ["editorialKinetic", "neonRail", "paperCut", "liquidMemory", "monoImpact", "celestialGrid"] },
          typography: { enum: ["jpGothic", "jpMincho", "cjkGrotesk", "latinDisplay", "monoEditorial"] },
          presentation: { enum: ["reading", "section", "hero", "duet", "aperture"] },
          gestures: { type: "array", maxItems: 4, items: gestureSchema },
          effects: { type: "array", maxItems: 2, items: effectSchema },
          signatureMoment: {
            type: "object",
            additionalProperties: false,
            required: ["anchorID", "stageAction", "coverRole", "consequence"],
            properties: {
              anchorID: { type: "string", minLength: 1, maxLength: 120 },
              stageAction: { enum: ["thread.connect", "thread.snap", "window.reveal", "silhouette.trace", "sentence.horizon", "phrase.cascade", "memory.imprint", "duet.tension", "stage.fold", "motif.recall", "silence.vacuum"] },
              coverRole: { enum: ["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"] },
              consequence: { enum: ["trace", "afterimage", "accumulation", "absence", "reframe", "return"] },
            },
          },
          consequence: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "rationale"],
            properties: { kind: { enum: ["trace", "afterimage", "accumulation", "absence", "reframe", "return"] }, rationale: { type: "string", minLength: 1, maxLength: 320 } },
          },
          promiseCreates: stringArray(8),
          promiseConsumes: stringArray(8),
          evidence: evidenceSchema(0.65),
        },
      },
    },
  },
};

export const windowIntentSchemaV2: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "version", "spatialIntent", "coverRole", "arcIntent", "cues",
  ],
  properties: {
    version: { const: "window-intent-v2" },
    spatialIntent: { enum: ["hold", "split", "open", "stack"] },
    coverRole: { enum: ["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"] },
    arcIntent: { enum: ["hold", "lift", "break", "recall"] },
    cues: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "fromLineIndex", "toLineIndex", "evidenceLineIndices", "confidence"],
        properties: {
          role: { enum: ["refrain", "rupture", "release", "hold", "handoff", "recall"] },
          fromLineIndex: { type: "integer", minimum: 0 },
          toLineIndex: { type: "integer", minimum: 0 },
          evidenceLineIndices: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            uniqueItems: true,
            items: { type: "integer", minimum: 0 },
          },
          confidence: { type: "number", minimum: 0.7, maximum: 1 },
        },
      },
    },
  },
};

export const directorBibleSystemPromptV1 = `You are LyricStage's rolling dramaturg. Return one Director Bible JSON object matching the supplied schema.

The Bible is the whole-song constitution: premise, emotional arc, 2-5 contiguous acts, exactly one motif actor, 2-4 ordered signature anchors, at least 40 percent quiet lyric time, world physics and a global layout budget of at most two transitions. It identifies where and why a later scene may act, but it never authors scene choreography.

Do not output gestures, effects, stage actions, cover blocking consequences, coordinates, paths, SVG, CSS, JavaScript, colors, keyframes, rewritten lyrics or invented timing. A normal song of at least 150 seconds and 24 lyric lines uses 3-4 signature anchors. Two requires evidence-backed uninterrupted continuity with confidence at least 0.85. Zero layout transitions requires two independent evidence categories and confidence at least 0.82. Output JSON only.`;

export const scenePackSystemPromptV1 = `You are LyricStage's rolling scene dramaturg. Return one Scene Pack JSON object matching the supplied schema. The scenes array must contain exactly one Scene Card whose fromLineIndex and toLineIndex cover the entire supplied window. Do not split the window into multiple scenes.

Author only the supplied lyric window under the supplied Director Bible and entry continuity state. Never change the Bible, lines outside the window, authoritative timing, or already accepted scenes. Ordinary scenes use 0-2 gestures and 0-1 effects. A signature scene uses 2-4 gestures across at least two scales when timing permits, 1-2 grounded effects, exactly one consequence, and must match an exact Bible anchor. Never exceed two concurrent gestures. The final signature consumes an earlier unresolved promise by exact id.

Use only supplied lyric text, verified evidence and registered primitives. Never output coordinates, paths, SVG, CSS, JavaScript, colors, keyframes, rewritten lyrics, translations, audio instructions, provider diagnostics or secrets. Output JSON only.`;

export const windowIntentSystemPromptV2 = `You are LyricStage's semantic performance director. Return one WindowIntentV2 JSON object matching the supplied schema and covering the exact supplied lyric window.

Output only structural intent and zero to three sparse semantic cues. A cue marks a real refrain, rupture, release, hold, voice handoff, or recall; it does not describe an animation. When an active window contains at least two distinct semantic turns, use two cues so the local compiler can stage a beginning and a consequence. Use one cue for a single exceptional turn, and three only when a separate recall or voice handoff is also strongly evidenced. Return zero cues for a genuinely restrained window. Do not add cues merely to reach a count. Cue ranges must stay inside the requested window. Evidence stays inside the window except that recall must cite at least one earlier Bible anchor line.

Do not echo Bible identity, rolling state identity, or the requested window envelope. The local adapter binds those transport fields and treats any model echo as untrusted.

Never output scene cards, layouts, typography, gestures, effects, primitives, intensity, duration, coordinates, paths, SVG, CSS, JavaScript, colors, keyframes, rewritten lyrics, translations, audio instructions, provider diagnostics or secrets. The local compiler owns every visual execution value. Output JSON only.`;

const lineIndexOf = (line: any): number => Number.isInteger(line?.lineIndex)
  ? line.lineIndex
  : Number.isInteger(line?.index) ? line.index : -1;
const lineFromMs = (line: any): number => typeof line?.fromMs === "number"
  ? line.fromMs
  : typeof line?.fromSeconds === "number" ? line.fromSeconds * 1_000 : typeof line?.from === "number" ? line.from * 1_000 : 0;
const lineToMs = (line: any): number => typeof line?.toMs === "number"
  ? line.toMs
  : typeof line?.toSeconds === "number" ? line.toSeconds * 1_000 : typeof line?.to === "number" ? line.to * 1_000 : 0;

const compactLine = (line: any): unknown => ({
  lineIndex: lineIndexOf(line),
  fromMs: Math.round(lineFromMs(line)),
  toMs: Math.round(lineToMs(line)),
  exactText: typeof line?.exactText === "string" ? line.exactText : typeof line?.text === "string" ? line.text : "",
  voiceRole: line?.voiceRole,
  overlapGroup: line?.overlapGroup,
  timingPrecision: line?.timingPrecision,
  ...(Array.isArray(line?.realWordGraphemeRanges) ? { realWordGraphemeRanges: line.realWordGraphemeRanges.slice(0, 120) }
    : Array.isArray(line?.words) ? { realWords: line.words.slice(0, 120).map((word: any) => ({
      fromMs: Math.round(lineFromMs(word)),
      toMs: Math.round(lineToMs(word)),
      exactText: typeof word?.text === "string" ? word.text : "",
    })) } : {}),
});

const finite = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const boundedString = (value: unknown, maximum: number): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
const compactTrack = (value: any): unknown => ({
  trackID: boundedString(value?.trackID, 160),
  title: boundedString(value?.title, 240),
  artist: boundedString(value?.artist, 240),
  durationMs: finite(value?.durationMs),
});

const compactMusicMap = (value: any, window?: { fromMs: number; toMs: number }): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const segments = Array.isArray(value.segments) ? value.segments.filter((segment: any) => {
    const fromMs = finite(segment?.fromMs);
    const toMs = finite(segment?.toMs);
    return fromMs !== undefined && toMs !== undefined && toMs > fromMs
      && (!window || fromMs < window.toMs && window.fromMs < toMs);
  }).slice(0, window ? 32 : 48).map((segment: any) => ({
    fromMs: finite(segment.fromMs),
    toMs: finite(segment.toMs),
    energy: finite(segment.energy),
    bass: finite(segment.bass),
    mid: finite(segment.mid),
    treble: finite(segment.treble),
    brightness: finite(segment.brightness),
    flux: finite(segment.flux),
    onsetDensity: finite(segment.onsetDensity),
    stereoWidth: finite(segment.stereoWidth),
  })) : [];
  const landmarks = Array.isArray(value.landmarks) ? value.landmarks.filter((landmark: any) => {
    const atMs = finite(landmark?.atMs);
    return atMs !== undefined && (!window || atMs >= window.fromMs && atMs <= window.toMs);
  }).slice(0, window ? 24 : 64).map((landmark: any) => ({
    atMs: finite(landmark.atMs),
    type: boundedString(landmark.type, 32),
    strength: finite(landmark.strength),
  })) : [];
  const summary = value.summary && typeof value.summary === "object" && !Array.isArray(value.summary) ? value.summary : {};
  const tempo = value.tempo && typeof value.tempo === "object" && !Array.isArray(value.tempo)
    ? { bpm: finite(value.tempo.bpm), confidence: finite(value.tempo.confidence) }
    : null;
  return {
    version: value.version === "music-map-v1" ? "music-map-v1" : undefined,
    source: value.source === "tab-capture" ? "tab-capture" : undefined,
    durationMs: finite(value.durationMs),
    analyzedMs: finite(value.analyzedMs),
    featureRateHz: finite(value.featureRateHz),
    tempo,
    summary: {
      dynamicRange: finite(summary.dynamicRange),
      meanEnergy: finite(summary.meanEnergy),
      peakEnergy: finite(summary.peakEnergy),
      silenceRatio: finite(summary.silenceRatio),
    },
    segments,
    landmarks,
  };
};

export const compactDirectorBiblePromptInputV1 = (value: any): unknown => ({
  track: compactTrack(value?.track),
  musicMap: compactMusicMap(value?.musicMap),
  sectionHints: Array.isArray(value?.sectionHints) ? value.sectionHints.slice(0, 12) : [],
  lines: Array.isArray(value?.lines) ? value.lines.slice(0, 180).map(compactLine) : [],
});

const bibleSummary = (bible: DirectorBibleV1): unknown => ({
  version: bible.version,
  bibleIdentity: bible.bibleIdentity,
  premise: bible.premise,
  emotionalArc: bible.emotionalArc,
  world: {
    spatialMode: bible.world.spatialMode,
    motionLaw: bible.world.motionLaw,
    artworkRole: bible.world.artworkRole,
    texture: bible.world.texture,
    depth: bible.world.depth,
    fluidity: bible.world.fluidity,
    elasticity: bible.world.elasticity,
    atmosphere: bible.world.atmosphere,
  },
  acts: bible.acts.map((act) => ({
    id: act.id, role: act.role, fromLineIndex: act.fromLineIndex, toLineIndex: act.toLineIndex,
    tension: act.tension, visualDensity: act.visualDensity, motifState: act.motifState, intention: act.intention,
  })),
  motifActor: {
    family: bible.motifActor.family,
    origin: bible.motifActor.origin,
    relationship: bible.motifActor.relationship,
    states: bible.motifActor.states,
  },
  signatureAnchors: bible.signatureAnchors.map((anchor) => ({
    id: anchor.id,
    fromLineIndex: anchor.fromLineIndex,
    toLineIndex: anchor.toLineIndex,
    anchorLineIndices: anchor.anchorLineIndices,
    purpose: anchor.purpose,
    motifState: anchor.motifState,
    actorFamily: anchor.actorFamily,
    recallOf: anchor.recallOf,
    intensity: anchor.intensity,
    evidence: { sectionTriggers: anchor.evidence.sectionTriggers, confidence: anchor.evidence.confidence },
  })),
  quietWindows: bible.quietWindows.map((window) => ({ fromLineIndex: window.fromLineIndex, toLineIndex: window.toLineIndex })),
  layoutBudget: {
    baseLayout: bible.layoutBudget.baseLayout,
    maximumTransitions: bible.layoutBudget.maximumTransitions,
    proposedTransitions: bible.layoutBudget.proposedTransitions.map((transition) => ({
      atSectionIndex: transition.atSectionIndex,
      toLayout: transition.toLayout,
      purpose: transition.purpose,
    })),
  },
});

const stateSummary = (state: RollingPerformanceStateV1): unknown => ({
  stateHash: state.stateHash,
  nextSceneIndex: state.nextSceneIndex,
  lastToLineIndex: state.lastToLineIndex,
  motifState: state.motifState,
  layout: state.layout,
  layoutTransitionsUsed: state.layoutTransitionsUsed,
  unresolvedPromiseIDs: state.unresolvedPromiseIDs.slice(0, 12),
  consumedPromiseIDs: state.consumedPromiseIDs.slice(-12),
  acceptedSceneIDs: state.acceptedSceneIDs.slice(-8),
});

export const compactScenePackPromptInputV1 = (value: any): unknown => {
  const fromLineIndex = Number.isInteger(value?.fromLineIndex) ? value.fromLineIndex : 0;
  const toLineIndex = Number.isInteger(value?.toLineIndex) ? value.toLineIndex : fromLineIndex;
  const lines = Array.isArray(value?.lines)
    ? value.lines.filter((line: any) => lineIndexOf(line) >= fromLineIndex && lineIndexOf(line) <= toLineIndex).slice(0, 64)
    : [];
  const fromMs = lines.length > 0 ? Math.min(...lines.map(lineFromMs)) : 0;
  const toMs = lines.length > 0 ? Math.max(...lines.map(lineToMs)) : 0;
  const musicMap = compactMusicMap(value?.musicMap, { fromMs, toMs });
  const diversity = value?.diversityLedger ?? {};
  return {
    window: { fromLineIndex, toLineIndex, fromMs: Math.round(fromMs), toMs: Math.round(toMs) },
    bible: bibleSummary(value.bible),
    state: stateSummary(value.state),
    musicMap,
    diversity: {
      recentLayouts: Array.isArray(diversity.recentLayouts) ? diversity.recentLayouts.slice(-8) : [],
      recentStageActions: Array.isArray(diversity.recentStageActions) ? diversity.recentStageActions.slice(-8) : [],
      recentEffectPrimitives: Array.isArray(diversity.recentEffectPrimitives) ? diversity.recentEffectPrimitives.slice(-8) : [],
      recentGesturePrimitives: Array.isArray(diversity.recentGesturePrimitives) ? diversity.recentGesturePrimitives.slice(-8) : [],
    },
    lines: lines.map(compactLine),
  };
};

export const rollingDirectorBibleSchemaV1 = directorBibleSchemaV1;
export const rollingScenePackSchemaV1 = scenePackSchemaV1;
export const rollingWindowIntentSchemaV2 = windowIntentSchemaV2;
