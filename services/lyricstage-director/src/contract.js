import { performanceDirectionSkill, performanceDirectionSystemPrompt } from "./skill.js";

export const requestVersion = "lyricstage-fullscreen-director-request-v1";
export const responseVersion = "lyricstage-fullscreen-director-v2";
export const directorVersion = "lyricstage-fullscreen-gemini-3.7-world-v4";

const artDirections = [
  "editorialKinetic", "neonRail", "paperCut", "liquidMemory", "monoImpact", "celestialGrid",
];
const layouts = ["monument", "editorialSplit", "railLeading", "railTrailing", "duetDivide"];
const typographies = ["jpGothic", "jpMincho", "cjkGrotesk", "latinDisplay", "monoEditorial"];
const behaviors = ["settle", "assemble", "gravityDrop", "ripple", "stretch", "echo", "drift", "focus", "converge"];
const alignments = ["leading", "center", "trailing"];
const paletteRoles = ["primary", "accent", "warm", "secondary"];
const highMotionBehaviors = new Set(["gravityDrop", "ripple", "stretch", "echo", "converge"]);
const spatialModes = ["anchored", "panoramic", "cinematic", "orbital", "splitStage", "chorusWall"];
const motionLaws = ["drift", "flow", "pulse", "fall", "orbit", "converge", "suspend", "fracture"];
const artworkRoles = ["anchor", "portal", "memory", "counterpoint", "atmosphere"];
const textures = ["silk", "ink", "mist", "glass", "paper", "light"];
const effectGrammar = performanceDirectionSkill.grammar;
const effectCards = new Map(performanceDirectionSkill.cards.cards.map((card) => [card.id, card]));
const primitiveNames = new Set(Object.keys(effectGrammar.primitives));
const triggerNames = new Set(effectGrammar.triggers);
const presentationNames = new Set(effectGrammar.presentations);
const musicMapLandmarkTypes = new Set(["silence", "onset_cluster", "energy_lift", "energy_release", "section_boundary"]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clean = (value, maximum) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const normalize = (value) => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
const unit = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const rounded = (value) => Math.round(value * 10_000) / 10_000;

function sanitizeMusicMap(value, durationSeconds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const durationMs = Math.round(finite(value.durationMs, 0));
  const analyzedMs = Math.round(finite(value.analyzedMs, -1));
  const featureRateHz = finite(value.featureRateHz, 0);
  if (
    value.version !== "music-map-v1" || value.source !== "tab-capture"
    || durationMs <= 0 || Math.abs(durationMs - durationSeconds * 1000) > 5_000
    || analyzedMs < 0 || analyzedMs > durationMs + 1_000
    || featureRateHz < 8 || featureRateHz > 60
    || !value.summary || typeof value.summary !== "object" || Array.isArray(value.summary)
    || !unit(value.summary.dynamicRange) || !unit(value.summary.meanEnergy)
    || !unit(value.summary.peakEnergy) || !unit(value.summary.silenceRatio)
    || !Array.isArray(value.segments) || value.segments.length > 96
    || !Array.isArray(value.landmarks) || value.landmarks.length > 256
  ) return null;
  let previousSegmentFrom = -1;
  const segments = [];
  for (const candidate of value.segments) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const fromMs = Math.round(finite(candidate.fromMs, -1));
    const toMs = Math.round(finite(candidate.toMs, -1));
    if (
      fromMs < previousSegmentFrom || fromMs < 0 || toMs <= fromMs || toMs > durationMs + 1_000
      || !unit(candidate.energy) || !unit(candidate.bass) || !unit(candidate.mid)
      || !unit(candidate.treble) || !unit(candidate.brightness) || !unit(candidate.flux)
      || !unit(candidate.onsetDensity) || !unit(candidate.stereoWidth)
    ) return null;
    previousSegmentFrom = fromMs;
    segments.push({
      fromMs,
      toMs,
      energy: rounded(candidate.energy),
      bass: rounded(candidate.bass),
      mid: rounded(candidate.mid),
      treble: rounded(candidate.treble),
      brightness: rounded(candidate.brightness),
      flux: rounded(candidate.flux),
      onsetDensity: rounded(candidate.onsetDensity),
      stereoWidth: rounded(candidate.stereoWidth),
    });
  }
  let previousLandmarkAt = -1;
  const landmarks = [];
  for (const candidate of value.landmarks) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const atMs = Math.round(finite(candidate.atMs, -1));
    if (
      atMs < previousLandmarkAt || atMs < 0 || atMs > durationMs + 1_000
      || !musicMapLandmarkTypes.has(candidate.type) || !unit(candidate.strength)
    ) return null;
    previousLandmarkAt = atMs;
    landmarks.push({ atMs, type: candidate.type, strength: rounded(candidate.strength) });
  }
  const tempo = value.tempo === null
    ? null
    : value.tempo && typeof value.tempo === "object" && !Array.isArray(value.tempo)
      && finite(value.tempo.bpm, 0) >= 40 && finite(value.tempo.bpm, 0) <= 240
      && unit(value.tempo.confidence)
      ? { bpm: rounded(value.tempo.bpm), confidence: rounded(value.tempo.confidence) }
      : undefined;
  if (tempo === undefined) return null;
  return {
    version: "music-map-v1",
    source: "tab-capture",
    durationMs,
    analyzedMs,
    featureRateHz: rounded(featureRateHz),
    tempo,
    summary: {
      dynamicRange: rounded(value.summary.dynamicRange),
      meanEnergy: rounded(value.summary.meanEnergy),
      peakEnergy: rounded(value.summary.peakEnergy),
      silenceRatio: rounded(value.summary.silenceRatio),
    },
    segments,
    landmarks,
  };
}

export function sanitizeFullscreenRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
  if (value.version !== requestVersion) throw new Error("unsupported_request_version");
  const trackID = clean(value.trackID, 200);
  const recordingID = clean(value.recordingID, 240);
  const lyricsHash = clean(value.lyricsHash, 64);
  const lyricsIdentity = clean(value.lyricsIdentity, 32);
  const title = clean(value.title, 300);
  const artist = clean(value.artist, 300);
  const duration = Math.round(finite(value.duration, 0));
  let mediaContext = null;
  if (value.mediaContext && typeof value.mediaContext === "object" && !Array.isArray(value.mediaContext)) {
    const videoID = clean(value.mediaContext.videoID, 32);
    const youtubeURL = clean(value.mediaContext.youtubeURL, 300);
    if (
      value.mediaContext.kind === "public-youtube-video"
      && value.mediaContext.analysis === "whole-song"
      && /^[\w-]{11}$/u.test(videoID)
      && youtubeURL === `https://www.youtube.com/watch?v=${videoID}`
      && trackID === videoID
    ) {
      mediaContext = { kind: "public-youtube-video", videoID, youtubeURL, analysis: "whole-song" };
    }
  }
  if (
    !trackID || !recordingID || !title || !artist
    || !/^[a-f0-9]{64}$/u.test(lyricsHash)
    || !/^[a-f0-9]{8,32}$/u.test(lyricsIdentity)
    || duration <= 0 || duration > 7_200
    || !Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > 180
  ) throw new Error("invalid_request");
  const musicMap = value.musicMap === undefined ? null : sanitizeMusicMap(value.musicMap, duration);
  if (value.musicMap !== undefined && !musicMap) throw new Error("invalid_music_map");

  let previousFrom = -1;
  let totalCharacters = 0;
  let totalWords = 0;
  const lines = value.lines.map((line, position) => {
    if (!line || typeof line !== "object" || Array.isArray(line) || line.index !== position) {
      throw new Error("invalid_line_index");
    }
    const from = finite(line.from, -1);
    const to = finite(line.to, -1);
    const text = clean(line.text, 800);
    if (from < previousFrom || to <= from || from < 0 || to > duration + 8 || !text) {
      throw new Error("invalid_line_timing");
    }
    previousFrom = from;
    totalCharacters += text.length;
    if (totalCharacters > 24_000) throw new Error("lyrics_too_large");
    const sanitizeWords = (value) => Array.isArray(value) ? value.map((word, wordPosition) => {
        if (!word || typeof word !== "object" || Array.isArray(word) || word.index !== wordPosition) {
          throw new Error("invalid_word_index");
        }
        const wordFrom = finite(word.from, -1);
        const wordTo = finite(word.to, -1);
        const wordText = clean(word.text, 120);
        if (wordFrom < from || wordTo <= wordFrom || wordTo > to + 0.25 || !wordText) {
          throw new Error("invalid_word_timing");
        }
        totalWords += 1;
        if (totalWords > 6_000) throw new Error("words_too_large");
        return { index: wordPosition, from: wordFrom, to: wordTo, text: wordText };
      }) : [];
    const nativeWords = sanitizeWords(line.words);
    const estimatedWords = sanitizeWords(line.estimatedWords);
    if (nativeWords.length > 0 && estimatedWords.length > 0) throw new Error("ambiguous_word_precision");
    const words = nativeWords.length > 0 ? nativeWords : estimatedWords;
    const timingPrecision = line.timingPrecision === undefined
      ? nativeWords.length > 0 ? "word" : estimatedWords.length > 0 ? "estimated" : "line"
      : ["line", "word", "estimated"].includes(line.timingPrecision)
        ? line.timingPrecision
        : null;
    if (
      !timingPrecision
      || (timingPrecision === "line" && (nativeWords.length > 0 || estimatedWords.length > 0))
      || (timingPrecision === "word" && (nativeWords.length === 0 || estimatedWords.length > 0))
      || (timingPrecision === "estimated" && (estimatedWords.length === 0 || nativeWords.length > 0))
    ) throw new Error("invalid_timing_precision");
    const voiceRole = ["lead", "backing", "duetA", "duetB", "together"].includes(line.voiceRole)
      ? line.voiceRole
      : "lead";
    return {
      index: position,
      from,
      to,
      text,
      words,
      timingPrecision,
      voiceRole,
      layerID: clean(line.layerID, 120) || `line-${position}`,
      overlapGroup: clean(line.overlapGroup, 120) || null,
    };
  });
  return { version: requestVersion, trackID, recordingID, lyricsHash, lyricsIdentity, title, artist, duration, mediaContext, musicMap, lines };
}

export function buildFullscreenPromptInput(input) {
  const facts = deriveFacts(input.lines);
  return {
    track: {
      title: input.title,
      artist: input.artist,
      durationSeconds: input.duration,
      recordingID: input.recordingID,
    },
    canvas: { aspectRatio: "16:9", surface: "Chrome fullscreen", coverVisible: true, shell: "adaptive full-screen scene graph" },
    wholeSong: input.mediaContext ? {
      source: "exact public YouTube video",
      videoID: input.mediaContext.videoID,
      youtubeURL: input.mediaContext.youtubeURL,
      useFor: ["structure", "energy", "timbre", "emotion", "audio-lyric relationship"],
      timingAuthority: "lyrics remain authoritative; audio analysis supplies structure and emphasis only",
    } : null,
    musicMap: input.musicMap ? {
      source: "local tab audio DSP; no raw audio",
      durationMs: input.musicMap.durationMs,
      analyzedMs: input.musicMap.analyzedMs,
      featureRateHz: input.musicMap.featureRateHz,
      tempo: input.musicMap.tempo,
      summary: input.musicMap.summary,
      segments: input.musicMap.segments,
      landmarks: input.musicMap.landmarks,
      timingAuthority: "lyrics remain authoritative; landmarks may emphasize only after their measured time",
    } : null,
    sectionHints: facts.sectionHints,
    lines: input.lines.map((line) => ({
      lineIndex: line.index,
      fromSeconds: line.from,
      toSeconds: line.to,
      exactText: line.text,
      voiceRole: line.voiceRole,
      overlapGroup: line.overlapGroup,
      timingPrecision: line.timingPrecision,
      realWordTiming: line.timingPrecision === "word",
      estimatedWordTiming: line.timingPrecision === "estimated",
      wordCount: line.words.length,
      wordTiming: line.timingPrecision === "line" ? null : {
        precision: line.timingPrecision,
        cues: line.words.map((word) => [word.from, word.to, word.text]),
      },
      repetitionCount: facts.repetitionCounts.get(normalize(line.text)) || 1,
    })),
  };
}

export const fullscreenSystemPrompt = `${performanceDirectionSystemPrompt}

## LyricStage runtime contract

You are the visual director for a 16:9 fullscreen lyric-performance system. Create a song-specific editorial direction that feels authored rather than shuffled from a theme pack. The whole screen is a scene graph: background, artwork, lyrics, structure, camera and post-processing are actors. The cover and transport begin as a stable Apple-like local reading state, but an AI direction may reposition the artwork and open the lyric composition across the full canvas when the song provides evidence. The runtime derives its palette from the actual cover. Default Reading is cover-led color, light, material and negative space—not generic technology styling. Never add empty symmetric panels, persistent grids, continuous rails, scanning lines, converging rays or particle soup merely to make the frame look active. One layer owns each structural motif.

The runtime can render only these artDirection values: editorialKinetic, neonRail, paperCut, liquidMemory, monoImpact, celestialGrid.
Layouts: monument, editorialSplit, railLeading, railTrailing, duetDivide.
Typography: jpGothic, jpMincho, cjkGrotesk, latinDisplay, monoEditorial.
Line behaviors: settle, assemble, gravityDrop, ripple, stretch, echo, drift, focus, converge.
Alignment: leading, center, trailing. Palette roles: primary, accent, warm, secondary. paletteIndex is an integer 0-11.

Treat the registered grammar as instruments, not a fixed recipe. Compose them according to this song, and use continuous world parameters to avoid theme-pack repetition. If exact whole-song video context is attached, listen to it before directing: use its structure, energy, timbre, silence and lyric-audio relationship. If a local MusicMap is attached, use its normalized segments and landmarks to refine structural emphasis and energy development. Never move lyric or word reveal away from supplied real word timing. Estimated word timing is a low-confidence phrasing hint for visual pacing only: never treat it as exact reveal, beat, onset or structural evidence. Be static-first before AI handoff and in ordinary lines. Reserve strong motion for structural turns, repetitions, hooks and overlapping voices; keep high-motion lines below 45 percent. Repeated hooks may grow across returns. duetA/duetB overlaps should normally use duetDivide and opposing directions.

Return one JSON object only with concept, motif, intensityArc, world, sections, directives, effects.
world defines the song-wide visual physics and contains spatialMode, motionLaw, artworkRole, texture, depth, fluidity, elasticity, atmosphere and rationale. spatialMode: anchored, panoramic, cinematic, orbital, splitStage, chorusWall. motionLaw: drift, flow, pulse, fall, orbit, converge, suspend, fracture. artworkRole: anchor, portal, memory, counterpoint, atmosphere. texture: silk, ink, mist, glass, paper, light. Numeric world parameters are 0-1. Choose a coherent combination for this exact song; do not merely rotate choices.
sections must be a contiguous cover of every zero-based line exactly once, use 2-8 lines where possible, and contain fromLineIndex, toLineIndex, artDirection, layout, typography, paletteIndex, intensity (0-1).
directives must contain exactly one entry for every lineIndex and contain behavior, alignment, direction (-1 or 1), intensity (0.35-1.25), fontScale (0.78-1.22), glyphStagger (0-0.14), paletteRole.
effects must contain at least one grounded entry across the song and at most one entry per section. A calm song may use a restrained field, memory or dissolution effect, but an empty effects array is not a completed direction. Each effect uses zero-based sectionIndex, a cardID or custom, presentation, one primary primitive, at most two support primitives, and evidence with songMotif, controlled sectionTriggers, real lineIndices, rationale and confidence.
Never return lyric text, coordinates, colors, animation keyframes, audio instructions, translations, or rewritten lyrics.`;

export function finalizeFullscreenResponse(input, aiValue, version = directorVersion) {
  const facts = deriveFacts(input.lines);
  const concept = clean(aiValue?.concept, 160);
  const motif = clean(aiValue?.motif, 160);
  const intensityArc = clean(aiValue?.intensityArc, 200);
  const world = sanitizeWorld(aiValue?.world, concept, motif);
  const validAISections = sanitizeAISections(aiValue?.sections, input.lines);
  const sectionBlueprints = validAISections || facts.sectionHints;
  const aiSections = Array.isArray(aiValue?.sections) ? aiValue.sections : [];
  const sections = sectionBlueprints.map((blueprint, index) => {
    const candidate = (validAISections ? validAISections[index] : aiSections[index]) || {};
    const lines = input.lines.slice(blueprint.fromLineIndex, blueprint.toLineIndex + 1);
    const hasOverlap = lines.some((line) => facts.overlapLines.has(line.index));
    const hasRepeat = lines.some((line) => (facts.repetitionCounts.get(normalize(line.text)) || 1) > 1);
    const fromMs = Math.round(lines[0].from * 1000);
    const toMs = Math.round(Math.max(...lines.map((line) => line.to)) * 1000);
    return {
      id: `ai:${index}:${blueprint.fromLineIndex}-${blueprint.toLineIndex}`,
      fromLineIndex: blueprint.fromLineIndex,
      toLineIndex: blueprint.toLineIndex,
      fromMs,
      toMs,
      artDirection: allowed(candidate.artDirection, artDirections, artDirections[index % artDirections.length]),
      layout: hasOverlap
        ? "duetDivide"
        : allowed(candidate.layout, layouts, layouts[index % 4]),
      typography: allowed(candidate.typography, typographies, typographyFor(input.lines)),
      paletteIndex: clamp(Math.round(finite(candidate.paletteIndex, index * 3)), 0, 11),
      intensity: clamp(finite(candidate.intensity, hasRepeat ? 0.9 : 0.55 + index * 0.06), 0, 1),
    };
  });

  const aiDirectives = new Map();
  if (Array.isArray(aiValue?.directives)) {
    for (const candidate of aiValue.directives) {
      const directive = sanitizeDirective(candidate, input.lines.length);
      if (directive && !aiDirectives.has(directive.lineIndex)) aiDirectives.set(directive.lineIndex, directive);
    }
  }
  const minimumAICoverage = Math.max(1, Math.ceil(input.lines.length * 0.35));
  let highMotionCount = 0;
  const highMotionBudget = Math.max(1, Math.floor(input.lines.length * 0.45));
  const directives = input.lines.map((line) => {
    const repetition = facts.repetitionCounts.get(normalize(line.text)) || 1;
    const overlapping = facts.overlapLines.has(line.index);
    const section = sections.find((item) => line.index >= item.fromLineIndex && line.index <= item.toLineIndex);
    let directive = aiDirectives.get(line.index) || fallbackDirective(line, repetition, overlapping, section?.intensity || 0.6);
    if (highMotionBehaviors.has(directive.behavior)) {
      if (highMotionCount >= highMotionBudget && repetition === 1 && !overlapping) {
        directive = { ...directive, behavior: line.index % 2 === 0 ? "settle" : "focus", intensity: Math.min(directive.intensity, 0.72) };
      } else {
        highMotionCount += 1;
      }
    }
    return directive;
  });
  const effects = [];
  const usedSections = new Set();
  let heroCount = 0;
  const heroBudget = Math.floor(sections.length * effectGrammar.budget.heroSongShareTarget[1]);
  if (Array.isArray(aiValue?.effects)) {
    for (const candidate of aiValue.effects) {
      const effect = sanitizeAIEffect(candidate, input, sections, facts, motif);
      if (!effect || usedSections.has(effect.sectionID)) continue;
      if (effect.presentation === "hero") {
        const sectionShare = (effect.toMs - effect.fromMs) / Math.max(1, input.duration * 1000);
        const targetLines = input.lines.filter((line) => effect.evidence.lineIndices.includes(line.index));
        if (heroCount >= heroBudget || sectionShare > 0.30 || targetLines.some((line) => Array.from(line.text).length > 34)) continue;
        heroCount += 1;
      }
      effects.push(effect);
      usedSections.add(effect.sectionID);
    }
  }
  const usableAI = Boolean(
    concept
    && motif
    && intensityArc
    && world
    && validAISections
    && aiDirectives.size >= minimumAICoverage
    && effects.length > 0
  );
  const degradedReason = !usableAI
    ? [
        !concept ? "concept" : null,
        !motif ? "motif" : null,
        !intensityArc ? "intensityArc" : null,
        !world ? "world" : null,
        !validAISections ? "sections" : null,
        aiDirectives.size < minimumAICoverage
          ? `directives:${aiDirectives.size}/${minimumAICoverage}`
          : null,
        effects.length === 0 ? "effects" : null,
      ].filter(Boolean).join(",")
    : "";
  return {
    version: responseVersion,
    directorVersion: version,
    trackID: input.trackID,
    recordingID: input.recordingID,
    lyricsHash: input.lyricsHash,
    lyricsIdentity: input.lyricsIdentity,
    degraded: !usableAI,
    ...(!usableAI ? { degradedReason } : {}),
    ...(usableAI ? { concept, motif, intensityArc, world } : {}),
    sections,
    directives,
    effects,
  };
}

function sanitizeWorld(candidate, concept, motif) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const rationale = clean(candidate.rationale, 320);
  if (!rationale || !concept || !motif) return null;
  return {
    spatialMode: allowed(candidate.spatialMode, spatialModes, "panoramic"),
    motionLaw: allowed(candidate.motionLaw, motionLaws, "flow"),
    artworkRole: allowed(candidate.artworkRole, artworkRoles, "portal"),
    texture: allowed(candidate.texture, textures, "silk"),
    depth: clamp(finite(candidate.depth, 0.58), 0, 1),
    fluidity: clamp(finite(candidate.fluidity, 0.58), 0, 1),
    elasticity: clamp(finite(candidate.elasticity, 0.46), 0, 1),
    atmosphere: clamp(finite(candidate.atmosphere, 0.72), 0, 1),
    rationale,
  };
}

function semanticTriggers(lines) {
  const body = normalize(lines.map((line) => line.text).join(" "));
  const output = new Set();
  if (/[?？]$/u.test(lines.at(-1)?.text.trim() || "")) output.add("question_suspension");
  if (/(远|近|距离|靠近|离开|far|near|distance|closer|away|遠く|近く)/iu.test(body)) output.add("semantic_distance");
  if (/(但是|却|相反|明暗|黑白|but|yet|however|opposite|光と影|でも)/iu.test(body)) output.add("semantic_contrast");
  if (/(走|跑|飞|坠|追|流动|run|fly|fall|chase|move|歩|走|飛|落ち)/iu.test(body)) output.add("semantic_motion");
  return output;
}

function verifiedTriggersForSection(input, section, facts, sectionIndex, sectionCount) {
  const lines = input.lines.slice(section.fromLineIndex, section.toLineIndex + 1);
  const output = semanticTriggers(lines);
  if (sectionIndex > 0) output.add("section_boundary");
  if (lines.some((line) => (facts.repetitionCounts.get(normalize(line.text)) || 1) > 1)) output.add("repeated_hook");
  if (lines.some((line) => facts.overlapLines.has(line.index))) output.add("duet_overlap");
  if (lines.some((line) => ["backing", "duetA", "duetB", "together"].includes(line.voiceRole))) output.add("voice_handoff");
  const previous = input.lines[section.fromLineIndex - 1];
  if (previous && lines[0].from - previous.to >= 2.8) output.add("silence_gap");
  const density = lines.reduce((sum, line) => sum + Array.from(line.text).length, 0)
    / Math.max(0.001, Math.max(...lines.map((line) => line.to)) - Math.min(...lines.map((line) => line.from)));
  if (density > facts.averageDensity * 1.22) output.add("density_lift");
  if (density < facts.averageDensity * 0.74) output.add("density_release");
  if (lines.some((line) => /(我们|一起|所有|we|together|everyone|僕ら|みんな)/iu.test(line.text))) output.add("collective_chorus");
  if (sectionIndex === sectionCount - 1) output.add("final_resolution");
  return output;
}

function sanitizePrimitiveUse(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || !primitiveNames.has(candidate.primitive)) return null;
  const output = {
    primitive: candidate.primitive,
    intensity: clamp(finite(candidate.intensity, 0.65), 0, 1),
  };
  if (candidate.direction === -1 || candidate.direction === 1) output.direction = candidate.direction;
  if (typeof candidate.scale === "number" && Number.isFinite(candidate.scale)) output.scale = clamp(candidate.scale, 0.4, 1.2);
  return output;
}

function sanitizeAIEffect(candidate, input, sections, facts, motif) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const sectionIndex = Number.isInteger(candidate.sectionIndex) ? candidate.sectionIndex : -1;
  const section = sections[sectionIndex];
  if (!section || !presentationNames.has(candidate.presentation)) return null;
  const cardID = candidate.cardID === "custom" || effectCards.has(candidate.cardID) ? candidate.cardID : null;
  if (!cardID) return null;
  const card = cardID === "custom" ? null : effectCards.get(cardID);
  if (card && candidate.presentation !== card.presentation
    && !(card.presentation === "hero" && ["section", "reading"].includes(candidate.presentation))) return null;
  const primary = sanitizePrimitiveUse(candidate.primary);
  const support = Array.isArray(candidate.support) ? candidate.support.map(sanitizePrimitiveUse) : [];
  if (!primary || support.some((item) => !item) || support.length > effectGrammar.budget.maximumSupport) return null;
  const uses = [primary, ...support];
  const primitiveIDs = uses.map((use) => use.primitive);
  if (new Set(primitiveIDs).size !== primitiveIDs.length) return null;
  const cost = uses.reduce((total, use) => total + effectGrammar.primitives[use.primitive].cost, 0);
  if (cost > effectGrammar.budget.maximumCost) return null;
  if (uses.some((use, index) => uses.some((other, otherIndex) => index !== otherIndex
    && effectGrammar.primitives[use.primitive].conflictsWith.includes(other.primitive)))) return null;
  const evidence = candidate.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const verified = verifiedTriggersForSection(input, section, facts, sectionIndex, sections.length);
  const sectionTriggers = Array.isArray(evidence.sectionTriggers)
    ? [...new Set(evidence.sectionTriggers.filter((trigger) => triggerNames.has(trigger) && verified.has(trigger)))]
    : [];
  const lineIndices = Array.isArray(evidence.lineIndices)
    ? [...new Set(evidence.lineIndices.filter((lineIndex) => Number.isInteger(lineIndex)
      && lineIndex >= section.fromLineIndex && lineIndex <= section.toLineIndex))]
    : [];
  const songMotif = clean(evidence.songMotif, 160);
  const rationale = clean(evidence.rationale, 400);
  const confidence = clamp(finite(evidence.confidence, 0), 0, 1);
  if (!songMotif || !motif || !rationale || confidence < 0.55 || sectionTriggers.length === 0 || lineIndices.length === 0) return null;
  if (card && !card.requiredAny.some((trigger) => sectionTriggers.includes(trigger))) return null;
  const structural = sectionTriggers.some((trigger) => !trigger.startsWith("semantic_") && trigger !== "question_suspension");
  if ((candidate.presentation === "hero" || cost >= 3) && !structural) return null;
  return {
    version: "effect-recipe-v1",
    id: `ai-effect:${section.id}:${cardID}`,
    cardID,
    sectionID: section.id,
    fromMs: candidate.presentation === "hero"
      ? Math.round(input.lines[lineIndices[0]].from * 1000)
      : section.fromMs,
    toMs: candidate.presentation === "hero"
      ? Math.round(input.lines[lineIndices[0]].to * 1000)
      : section.toMs,
    presentation: candidate.presentation,
    primary,
    support,
    evidence: { songMotif, sectionTriggers, lineIndices, rationale, confidence },
  };
}

function deriveFacts(lines) {
  const repetitionCounts = new Map();
  for (const line of lines) {
    const key = normalize(line.text);
    repetitionCounts.set(key, (repetitionCounts.get(key) || 0) + 1);
  }
  const overlapLines = new Set();
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      if (lines[left].from < lines[right].to && lines[right].from < lines[left].to) {
        overlapLines.add(left);
        overlapLines.add(right);
      }
    }
  }
  const sectionHints = [];
  let start = 0;
  for (let index = 1; index < lines.length; index += 1) {
    const gap = lines[index].from - lines[index - 1].to;
    if (gap >= 2.8 || index - start >= 6) {
      sectionHints.push({ fromLineIndex: start, toLineIndex: index - 1 });
      start = index;
    }
  }
  sectionHints.push({ fromLineIndex: start, toLineIndex: lines.length - 1 });
  const densities = sectionHints.map((section) => {
    const members = lines.slice(section.fromLineIndex, section.toLineIndex + 1);
    return members.reduce((sum, line) => sum + Array.from(line.text).length, 0)
      / Math.max(0.001, Math.max(...members.map((line) => line.to)) - Math.min(...members.map((line) => line.from)));
  });
  const averageDensity = densities.reduce((sum, density) => sum + density, 0) / Math.max(1, densities.length);
  return { repetitionCounts, overlapLines, sectionHints, averageDensity };
}

function sanitizeAISections(value, lines) {
  if (!Array.isArray(value) || value.length === 0 || value.length > Math.ceil(lines.length / 2) + 1) return null;
  const output = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const fromLineIndex = Number.isInteger(candidate.fromLineIndex) ? candidate.fromLineIndex : -1;
    const toLineIndex = Number.isInteger(candidate.toLineIndex) ? candidate.toLineIndex : -1;
    if (
      fromLineIndex < 0 || toLineIndex < fromLineIndex || toLineIndex >= lines.length
      || toLineIndex - fromLineIndex >= 8
      || (output.length > 0 && fromLineIndex !== output.at(-1).toLineIndex + 1)
    ) return null;
    output.push({ ...candidate, fromLineIndex, toLineIndex });
  }
  return output[0].fromLineIndex === 0 && output.at(-1).toLineIndex === lines.length - 1 ? output : null;
}

function sanitizeDirective(candidate, lineCount) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const lineIndex = Number.isInteger(candidate.lineIndex) ? candidate.lineIndex : -1;
  if (lineIndex < 0 || lineIndex >= lineCount || !behaviors.includes(candidate.behavior)) return null;
  return {
    lineIndex,
    behavior: candidate.behavior,
    alignment: allowed(candidate.alignment, alignments, "center"),
    direction: finite(candidate.direction, 1) < 0 ? -1 : 1,
    intensity: clamp(finite(candidate.intensity, 0.65), 0.35, 1.25),
    fontScale: clamp(finite(candidate.fontScale, 1), 0.78, 1.22),
    glyphStagger: clamp(finite(candidate.glyphStagger, 0.03), 0, 0.14),
    paletteRole: allowed(candidate.paletteRole, paletteRoles, "primary"),
  };
}

function fallbackDirective(line, repetition, overlapping, sectionIntensity) {
  const behavior = overlapping ? "converge" : repetition > 1 ? "echo" : line.index % 3 === 0 ? "settle" : line.index % 3 === 1 ? "focus" : "assemble";
  return {
    lineIndex: line.index,
    behavior,
    alignment: overlapping ? line.voiceRole === "duetB" ? "trailing" : "leading" : line.index % 4 === 1 ? "leading" : "center",
    direction: line.index % 2 === 0 ? 1 : -1,
    intensity: clamp(repetition > 1 ? 0.95 : overlapping ? 0.9 : sectionIntensity, 0.35, 1.25),
    fontScale: repetition > 1 ? 1.08 : 1,
    glyphStagger: line.timingPrecision === "word" ? 0.035 : line.timingPrecision === "estimated" ? 0.018 : 0,
    paletteRole: repetition > 1 ? "accent" : overlapping ? "secondary" : "primary",
  };
}

function typographyFor(lines) {
  const text = lines.map((line) => line.text).join("");
  if (/[\u3040-\u30ff]/u.test(text)) return "jpGothic";
  if (/[\u3400-\u9fff]/u.test(text)) return "cjkGrotesk";
  return "latinDisplay";
}

function allowed(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}
