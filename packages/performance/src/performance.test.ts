import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import {
  compileEnvironmentSceneV1,
  defaultEnvironmentTuningV1,
  sampleEnvironmentSceneV1,
} from "./environmentScene";
import {
  adaptFullscreenDirectorResponseV1,
  adaptFullscreenDirectorResponseV2,
  adaptFullscreenDirectorResponseV3,
  adaptFullscreenDirectorResponseV4,
  adaptLegacyDirectorResponseV1,
  applyMusicMapToDirectorPlanV1,
  compileLocalDirectorPlanV1,
  directorSectionAtV1,
  directorPlanToRecipeV0,
  isDirectorPlanV1ForLyrics,
  queueDirectorPlanV1,
  sampleDirectorPlanHandoffV1,
} from "./directorPlan";
import { lyricGraphemesV1 } from "./lyricChoreography";
import { buildDirectorRequestPayloadV1 } from "./directorRequest";
import { motionClipsV1, sampleMotionClipV1 } from "./motionClip";
import { compileMusicMapV1, sanitizeMusicMapV1, type MusicMapV1 } from "./musicMap";
import { TimedTextIndexV1 } from "./timedText";
import {
  compileVocalTimingMapV1,
  compileVocalTimingSampleV1,
  estimateLyricsOffsetFromVocalTimingV1,
  sanitizeVocalTimingMapV1,
  vocalAwareVirtualTimeMs,
} from "./vocalTiming";
import {
  effectCardsV1,
  effectPrimitiveRegistryV1,
  effectRecipeAtV1,
  stagePresentationAtV1,
  validateEffectRecipeV1,
} from "./effectGrammar";

describe("TimedTextIndexV1", () => {
  it("returns every active overlapping phrase without flattening duet voices", () => {
    const index = new TimedTextIndexV1(lyricFixtures.duetOverlap);
    expect(index.phrasesAt(15_000).map((unit) => unit.lineIndex)).toEqual([2, 3]);
  });

  it("uses real word windows and does not invent word timing for line-only lyrics", () => {
    const precise = new TimedTextIndexV1(lyricFixtures.wordTimedMixed);
    expect(precise.wordsAt(2_900).map((unit) => unit.text)).toEqual(["trace"]);
    expect(precise.charactersAt(2_900).map((unit) => unit.text).join("" )).toBe("trace");

    const lineOnly = new TimedTextIndexV1(lyricFixtures.lineOnlyJA);
    expect(lineOnly.words).toHaveLength(0);
    expect(lineOnly.characters).toHaveLength(0);
  });

  it("resamples endpoint state on forward and backward seeks", () => {
    const index = new TimedTextIndexV1(lyricFixtures.lineOnlyJA);
    const forward = index.changesBetween("phrase", 1_000, 6_000);
    expect(forward.direction).toBe("forward");
    expect(forward.entered.map((unit) => unit.lineIndex)).toEqual([1]);
    expect(forward.left.map((unit) => unit.lineIndex)).toEqual([0]);

    const backward = index.changesBetween("phrase", 6_000, 1_000);
    expect(backward.direction).toBe("backward");
    expect(backward.entered.map((unit) => unit.lineIndex)).toEqual([0]);
    expect(backward.left.map((unit) => unit.lineIndex)).toEqual([1]);
  });

  it("clamps progress to a stable zero-to-one range", () => {
    const index = new TimedTextIndexV1(lyricFixtures.lineOnlyJA);
    const phrase = index.phrases[0]!;
    expect(index.progress(phrase, -1)).toBe(0);
    expect(index.progress(phrase, 2_600)).toBe(0.5);
    expect(index.progress(phrase, 9_000)).toBe(1);
  });
});

describe("MotionClipV1", () => {
  it("samples clips deterministically at arbitrary positions", () => {
    const clip = motionClipsV1[0]!;
    expect(sampleMotionClipV1(clip, 0)).toMatchObject({ opacity: 0, translateY: 52, scale: 0.94 });
    expect(sampleMotionClipV1(clip, 900)).toMatchObject({ opacity: 1, translateY: 0, scale: 1 });
    expect(sampleMotionClipV1(clip, 450)).toEqual(sampleMotionClipV1(clip, 450));
  });
});

describe("EnvironmentSceneV1", () => {
  it("compiles a stable seeded scene for the same recording", () => {
    const first = compileEnvironmentSceneV1("fixture:word-timed-mixed");
    const second = compileEnvironmentSceneV1("fixture:word-timed-mixed");
    expect(first).toEqual(second);
    expect(first.particles).toHaveLength(42);
    expect(first.rails).toHaveLength(7);
    expect(first.orbs).toHaveLength(4);
  });

  it("produces distinct art direction seeds for different recordings", () => {
    const first = compileEnvironmentSceneV1("fixture:a");
    const second = compileEnvironmentSceneV1("fixture:b");
    expect(first.seed).not.toBe(second.seed);
    expect(first.particles[0]).not.toEqual(second.particles[0]);
  });

  it("samples arbitrary seek positions deterministically inside normalized bounds", () => {
    const scene = compileEnvironmentSceneV1("fixture:duet-overlap");
    const frame = sampleEnvironmentSceneV1(scene, 15_000, defaultEnvironmentTuningV1, 1);
    expect(frame).toEqual(sampleEnvironmentSceneV1(scene, 15_000, defaultEnvironmentTuningV1, 1));
    expect(frame.particles.every((particle) => (
      particle.x >= 0 && particle.x <= 1
      && particle.y >= 0 && particle.y <= 1
      && particle.alpha >= 0 && particle.alpha <= 1
    ))).toBe(true);
    expect(frame.rails.every((rail) => rail.offset >= 0 && rail.offset <= 1)).toBe(true);
    expect(frame.orbs.every((orb) => orb.x >= 0 && orb.x <= 1 && orb.y >= 0 && orb.y <= 1)).toBe(true);
  });

  it("lets a safe baseline suppress environmental light without changing geometry", () => {
    const scene = compileEnvironmentSceneV1("fixture:quiet");
    const frame = sampleEnvironmentSceneV1(scene, 4_000, {
      intensity: 0,
      bloom: 0,
      drift: 0,
      railOpacity: 0,
    });
    expect(frame.particles.every((particle) => particle.alpha === 0)).toBe(true);
    expect(frame.rails.every((rail) => rail.alpha === 0)).toBe(true);
    expect(frame.orbs.every((orb) => orb.alpha === 0)).toBe(true);
  });
});

describe("DirectorPlanV1", () => {
  it("keeps the local Japanese baseline neutral, wide, and left-readable", () => {
    const plan = compileLocalDirectorPlanV1(lyricFixtures.lineOnlyJA);
    expect(plan.sections.every((section) => section.typography === "jpGothic")).toBe(true);
    expect(plan.sections.every((section) => section.layout === "monument")).toBe(true);
    expect(plan.directives.every((directive) => directive.alignment === "leading")).toBe(true);
  });

  it("keeps the deterministic fallback cover-led instead of defaulting to technology styling", () => {
    const plan = compileLocalDirectorPlanV1(lyricFixtures.longSongStructure);
    expect(plan.sections.every((section) => (
      section.artDirection !== "neonRail"
      && section.artDirection !== "celestialGrid"
      && section.layout !== "railLeading"
      && section.layout !== "railTrailing"
    ))).toBe(true);
    expect(plan.motif).toBe("cover-led editorial atmosphere");
    expect(plan.world).toMatchObject({ spatialMode: "anchored", artworkRole: "anchor", texture: "silk" });
  });

  it("compiles a complete deterministic local fallback for every lyric line", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const first = compileLocalDirectorPlanV1(lyrics);
    const second = compileLocalDirectorPlanV1(lyrics);
    expect(first).toEqual(second);
    expect(first.source).toBe("local");
    expect(first.sections.length).toBeGreaterThan(1);
    expect(first.blocking.transitions.length).toBeLessThanOrEqual(2);
    expect(first.sections.slice(1).filter((section, index) => section.layout !== first.sections[index]!.layout).length).toBeLessThanOrEqual(2);
    expect(first.directives.map((directive) => directive.lineIndex)).toEqual(
      lyrics.lines.map((line) => line.lineIndex),
    );
    expect(isDirectorPlanV1ForLyrics(first, lyrics)).toBe(true);
    expect(directorSectionAtV1(first, -1)).toBe(first.sections[0]);
  });

  it("rejects mutated cache content even when its outer identity fields look valid", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const plan = compileLocalDirectorPlanV1(lyrics);
    expect(isDirectorPlanV1ForLyrics({
      ...plan,
      sections: [{ ...plan.sections[0]!, paletteIndex: 99 }],
    }, lyrics)).toBe(false);
    expect(isDirectorPlanV1ForLyrics({
      ...plan,
      directives: plan.directives.slice(1),
    }, lyrics)).toBe(false);
  });

  it("uses duet/repetition facts without inventing timing", () => {
    const duet = compileLocalDirectorPlanV1(lyricFixtures.duetOverlap);
    expect(duet.sections.some((section) => section.layout === "duetDivide")).toBe(true);
    expect(duet.directives.some((directive) => directive.behavior === "converge")).toBe(true);

    const hook = compileLocalDirectorPlanV1(lyricFixtures.repeatedHook);
    expect(hook.directives.some((directive) => directive.behavior === "echo")).toBe(true);
    expect(hook.effects.every((effect) => effect.evidence.lineIndices.every((lineIndex) => (
      hook.sections.some((section) => section.id === effect.sectionID
        && lineIndex >= section.fromLineIndex && lineIndex <= section.toLineIndex)
    )))).toBe(true);
  });

  it("applies a late MusicMap locally without changing blocking or layout", () => {
    const plan = compileLocalDirectorPlanV1(lyricFixtures.longSongStructure);
    const map: MusicMapV1 = {
      version: "music-map-v1", source: "tab-capture", durationMs: lyricFixtures.longSongStructure.durationMs,
      analyzedMs: lyricFixtures.longSongStructure.durationMs, featureRateHz: 30, tempo: null,
      summary: { dynamicRange: 0.8, meanEnergy: 0.8, peakEnergy: 1, silenceRatio: 0 },
      segments: [{ fromMs: 0, toMs: lyricFixtures.longSongStructure.durationMs, energy: 1, bass: 0.5, mid: 0.5, treble: 0.5, brightness: 0.5, flux: 0.5, onsetDensity: 0.5, stereoWidth: 0.5 }],
      landmarks: [],
    };
    const adapted = applyMusicMapToDirectorPlanV1(plan, map);
    expect(adapted.blocking).toEqual(plan.blocking);
    expect(adapted.sections.map((section) => section.layout)).toEqual(plan.sections.map((section) => section.layout));
    expect(adapted.sections.some((section, index) => section.intensity !== plan.sections[index]!.intensity)).toBe(true);
    expect(adapted.planIdentity).not.toBe(plan.planIdentity);
  });

  it("adapts only a matching non-degraded bounded AI response", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const wire = {
      version: "lyric-performance-v4",
      directorVersion: "director-test-v1",
      trackID: "track-1",
      lyricsHash: "a".repeat(64),
      degraded: false,
      stageBible: {
        concept: "late-night editorial signal",
        motif: "split rails converge at the hook",
        intensityArc: "quiet to luminous",
      },
      stageDirectives: [
        {
          lineIndex: 0,
          behavior: "assemble",
          alignment: "leading",
          direction: -1,
          intensity: 4,
          fontScale: 9,
          glyphStagger: 2,
          paletteRole: "accent",
        },
      ],
    };
    const plan = adaptLegacyDirectorResponseV1(lyrics, "track-1", "a".repeat(64), wire);
    expect(plan?.source).toBe("ai");
    expect(plan?.directives[0]).toMatchObject({
      behavior: "assemble",
      intensity: 1.25,
      fontScale: 1.22,
      glyphStagger: 0.14,
    });
    expect(plan && isDirectorPlanV1ForLyrics(plan, lyrics)).toBe(true);
    expect(adaptLegacyDirectorResponseV1(lyrics, "other", "a".repeat(64), wire)).toBeNull();
    expect(adaptLegacyDirectorResponseV1(lyrics, "track-1", "a".repeat(64), { ...wire, degraded: true })).toBeNull();
    expect(adaptLegacyDirectorResponseV1(lyrics, "track-1", "a".repeat(64), { ...wire, partial: true })).toBeNull();
  });

  it("adapts the native fullscreen response without the legacy phone envelope", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const local = compileLocalDirectorPlanV1(lyrics);
    const wire = {
      version: "lyricstage-fullscreen-director-v1",
      directorVersion: "fullscreen-gemini-test-v1",
      trackID: "track-1",
      recordingID: lyrics.recordingID,
      lyricsHash: "b".repeat(64),
      lyricsIdentity: local.lyricsIdentity,
      degraded: false,
      concept: "Japanese editorial signal blooms across the full screen",
      motif: "split rails resolve into one monumental hook",
      intensityArc: "restrained verse, widening bridge, explosive final hook",
      sections: local.sections.map((section) => ({
        fromLineIndex: section.fromLineIndex,
        toLineIndex: section.toLineIndex,
        artDirection: "paperCut",
        layout: "editorialSplit",
        typography: "jpGothic",
        paletteIndex: 4,
        intensity: 0.8,
      })),
      directives: local.directives,
    };
    const plan = adaptFullscreenDirectorResponseV1(lyrics, "track-1", "b".repeat(64), wire);
    expect(plan?.source).toBe("ai");
    expect(plan?.directorVersion).toBe("fullscreen-gemini-test-v1");
    expect(plan && isDirectorPlanV1ForLyrics(plan, lyrics)).toBe(true);
    expect(adaptFullscreenDirectorResponseV1(lyrics, "wrong", "b".repeat(64), wire)).toBeNull();
    expect(adaptFullscreenDirectorResponseV1(lyrics, "track-1", "b".repeat(64), {
      ...wire,
      directives: wire.directives.slice(1),
    })).toBeNull();
  });

  it("adapts typed v2 effects and rejects an invalid primitive at the client boundary", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const local = compileLocalDirectorPlanV1(lyrics);
    const base = {
      version: "lyricstage-fullscreen-director-v2",
      directorVersion: "fullscreen-skill-test-v2",
      trackID: "track-2",
      recordingID: lyrics.recordingID,
      lyricsHash: "c".repeat(64),
      lyricsIdentity: local.lyricsIdentity,
      degraded: false,
      concept: "measured editorial breathing room",
      motif: "one fine line releases into quiet space",
      intensityArc: "restrained reading, measured release",
      world: {
        spatialMode: "cinematic",
        motionLaw: "flow",
        artworkRole: "portal",
        texture: "mist",
        depth: 0.72,
        fluidity: 0.78,
        elasticity: 0.42,
        atmosphere: 0.86,
        rationale: "The quiet line opens into a soft full-screen field.",
      },
      sections: local.sections.map((section) => ({
        fromLineIndex: section.fromLineIndex,
        toLineIndex: section.toLineIndex,
        artDirection: "editorialKinetic",
        layout: "monument",
        typography: "cjkGrotesk",
        paletteIndex: 3,
        intensity: 0.62,
      })),
      directives: local.directives,
      effects: [{
        version: "effect-recipe-v1",
        id: "ai-effect:fixture",
        cardID: "field-release",
        sectionID: `ai:0:${local.sections[0]!.fromLineIndex}-${local.sections[0]!.toLineIndex}`,
        fromMs: -1,
        toMs: -1,
        presentation: "section",
        primary: { primitive: "density.release", intensity: 0.64 },
        support: [],
        evidence: {
          songMotif: "one fine line releases into quiet space",
          sectionTriggers: ["density_release"],
          lineIndices: [local.sections[0]!.fromLineIndex],
          rationale: "The verified sparse section releases the established fine-line motif.",
          confidence: 0.82,
        },
      }],
    };
    const plan = adaptFullscreenDirectorResponseV2(lyrics, "track-2", "c".repeat(64), base);
    expect(plan?.effects[0]).toMatchObject({
      cardID: "field-release",
      primary: { primitive: "density.release" },
      fromMs: plan?.sections[0]?.fromMs,
      toMs: plan?.sections[0]?.toMs,
    });
    expect(plan?.world).toMatchObject({ spatialMode: "cinematic", artworkRole: "portal", texture: "mist" });
    expect(plan && isDirectorPlanV1ForLyrics(plan, lyrics)).toBe(true);
    expect(adaptFullscreenDirectorResponseV2(lyrics, "track-2", "c".repeat(64), {
      ...base,
      effects: [{ ...base.effects[0], primary: { primitive: "shader.glitch", intensity: 1 } }],
    })).toBeNull();
  });

  it("adapts V3 blocking and exact phrase choreography without trusting rewritten text", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const local = compileLocalDirectorPlanV1(lyrics);
    const line = lyrics.lines[0]!;
    const base = {
      version: "lyricstage-fullscreen-director-v3",
      directorVersion: "fullscreen-choreography-test-v3",
      trackID: "track-v3",
      recordingID: lyrics.recordingID,
      lyricsHash: "d".repeat(64),
      lyricsIdentity: local.lyricsIdentity,
      degraded: false,
      concept: "one lyric trace crosses a stable editorial stage",
      motif: "a fine underline becomes a remembered path",
      intensityArc: "quiet inscription, open center, resolved trace",
      world: local.world,
      blocking: { version: "song-blocking-v1", baseLayout: "monument", transitions: [] },
      sections: local.sections.map((section) => ({
        fromLineIndex: section.fromLineIndex,
        toLineIndex: section.toLineIndex,
        artDirection: "editorialKinetic",
        layout: "monument",
        typography: "jpGothic",
        paletteIndex: 2,
        intensity: 0.62,
      })),
      directives: local.directives,
      effects: [{
        version: "effect-recipe-v1",
        id: "ai-effect:v3",
        cardID: "field-release",
        sectionID: `ai:0:${local.sections[0]!.fromLineIndex}-${local.sections[0]!.toLineIndex}`,
        fromMs: -1,
        toMs: -1,
        presentation: "section",
        primary: { primitive: "density.release", intensity: 0.52 },
        support: [],
        evidence: {
          songMotif: "a fine underline becomes a remembered path",
          sectionTriggers: ["density_release"],
          lineIndices: [local.sections[0]!.fromLineIndex],
          rationale: "The quiet section releases the established trace.",
          confidence: 0.82,
        },
      }],
      gestures: [{
        version: "lyric-gesture-v1",
        id: "gesture:phrase:0",
        lineIndex: line.lineIndex,
        scope: "phrase",
        target: { fromGrapheme: 0, toGrapheme: lyricGraphemesV1(line.text).length, expectedText: line.text },
        primitive: "phrase.contour",
        driver: "lineEnter",
        space: "lyricLocal",
        envelope: { attackMs: 320, holdMs: 240, releaseMs: 480 },
        intensity: 0.58,
        direction: 1,
        paletteRole: "accent",
        evidence: { semanticRole: "identity", rationale: "The opening phrase establishes the song trace.", confidence: 0.78 },
      }],
    };
    const plan = adaptFullscreenDirectorResponseV3(lyrics, "track-v3", "d".repeat(64), base);
    expect(plan?.blocking.transitions).toHaveLength(0);
    expect(plan?.gestures[0]?.primitive).toBe("phrase.contour");
    expect(plan && isDirectorPlanV1ForLyrics(plan, lyrics)).toBe(true);
    expect(adaptFullscreenDirectorResponseV3(lyrics, "track-v3", "d".repeat(64), {
      ...base,
      gestures: [{ ...base.gestures[0], target: { ...base.gestures[0].target, expectedText: "rewritten" } }],
    })).toBeNull();

    const v4 = adaptFullscreenDirectorResponseV4(lyrics, "track-v3", "d".repeat(64), {
      ...base,
      version: "lyricstage-fullscreen-director-v4",
      dramaticScore: local.dramaticScore,
    });
    expect(v4?.dramaticScore.signatureMoments.length).toBeGreaterThanOrEqual(2);
    expect(v4?.dramaticScore.motifActor.states.map((state) => state.state)).toEqual(expect.arrayContaining(["seed", "return"]));
    expect(v4 && isDirectorPlanV1ForLyrics(v4, lyrics)).toBe(true);
  });

  it("queues an AI plan at the next section boundary and never swaps mid-section", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const local = compileLocalDirectorPlanV1(lyrics);
    const ai = { ...local, source: "ai" as const, planIdentity: `${local.planIdentity}-ai` };
    const currentTimeMs = local.sections[0]!.fromMs + 100;
    const queued = queueDirectorPlanV1({ active: local }, ai, currentTimeMs);
    expect(queued.pending?.planIdentity).toBe(ai.planIdentity);
    expect(queued.activateAtMs).toBe(local.sections[1]!.fromMs);
    expect(sampleDirectorPlanHandoffV1(queued, queued.activateAtMs! - 1).active).toBe(local);
    expect(sampleDirectorPlanHandoffV1(queued, queued.activateAtMs!).active).toBe(ai);
  });

  it("keeps the current plan when no later section boundary exists", () => {
    const local = compileLocalDirectorPlanV1(lyricFixtures.lineOnlyJA);
    const ai = { ...local, source: "ai" as const, planIdentity: `${local.planIdentity}-ai` };
    const queued = queueDirectorPlanV1({ active: local }, ai, local.sections.at(-1)!.fromMs + 10);
    expect(queued).toEqual({ active: local });
  });

  it("converts bounded behaviors into the existing prepared renderer recipe", () => {
    const local = compileLocalDirectorPlanV1(lyricFixtures.repeatedHook);
    const recipe = directorPlanToRecipeV0(local);
    expect(recipe.recordingID).toBe(local.recordingID);
    expect(recipe.recipes).toHaveLength(local.directives.length);
    expect(recipe.recipes.some((entry) => entry.family === "chorusMemory")).toBe(true);
  });
});

describe("EffectGrammarV1", () => {
  it("ships seventeen bounded cards backed only by registered primitives", () => {
    expect(effectCardsV1).toHaveLength(17);
    expect(new Set(effectCardsV1.map((card) => card.id)).size).toBe(17);
    effectCardsV1.forEach((card) => {
      expect(effectPrimitiveRegistryV1[card.primary]).toBeDefined();
      expect(card.support.length).toBeLessThanOrEqual(2);
      card.support.forEach((primitive) => expect(effectPrimitiveRegistryV1[primitive]).toBeDefined());
      expect(card.requiredAny.length).toBeGreaterThan(0);
      expect(card.contraindications.length).toBeGreaterThan(0);
    });
  });

  it("compiles deterministic evidence and samples presentation at arbitrary seeks", () => {
    const first = compileLocalDirectorPlanV1(lyricFixtures.longSongStructure);
    const second = compileLocalDirectorPlanV1(lyricFixtures.longSongStructure);
    expect(first.effects).toEqual(second.effects);
    first.effects.forEach((effect) => {
      const section = first.sections.find((candidate) => candidate.id === effect.sectionID)!;
      expect(validateEffectRecipeV1(effect, section, new Set(first.directives.map((item) => item.lineIndex)))).toBe(true);
      expect(effect.support.length).toBeLessThanOrEqual(2);
      expect(effectRecipeAtV1(first.effects, effect.fromMs)).toBe(effect);
      expect(stagePresentationAtV1(first.effects, effect.fromMs)).toBe(effect.presentation);
    });
  });

  it("rejects conflicting, over-budget and ungrounded strong recipes", () => {
    const plan = compileLocalDirectorPlanV1(lyricFixtures.longSongStructure);
    const section = plan.sections[0]!;
    const base = plan.effects.find((effect) => effect.sectionID === section.id) ?? {
      version: "effect-recipe-v1" as const,
      id: "test",
      cardID: "custom" as const,
      sectionID: section.id,
      fromMs: section.fromMs,
      toMs: section.toMs,
      presentation: "hero" as const,
      primary: { primitive: "geometry.converge" as const, intensity: 0.8 },
      support: [],
      evidence: {
        songMotif: "bounded fixture",
        sectionTriggers: ["section_boundary" as const],
        lineIndices: [section.fromLineIndex],
        rationale: "The section boundary develops the fixture motif.",
        confidence: 0.8,
      },
    };
    const validLines = new Set(plan.directives.map((item) => item.lineIndex));
    expect(validateEffectRecipeV1({
      ...base,
      primary: { primitive: "geometry.converge", intensity: 0.8 },
      support: [{ primitive: "geometry.expand", intensity: 0.7 }],
    }, section, validLines)).toBe(false);
    expect(validateEffectRecipeV1({
      ...base,
      evidence: { ...base.evidence, lineIndices: [], rationale: "" },
    }, section, validLines)).toBe(false);
  });
});

describe("DirectorRequestPayloadV1", () => {
  const musicMap = (durationMs: number): MusicMapV1 => ({
    version: "music-map-v1",
    source: "tab-capture",
    durationMs,
    analyzedMs: Math.min(durationMs, 8_000),
    featureRateHz: 30,
    tempo: { bpm: 124.25, confidence: 0.82 },
    summary: { dynamicRange: 0.72, meanEnergy: 0.48, peakEnergy: 0.91, silenceRatio: 0.04 },
    segments: [{
      fromMs: 0,
      toMs: Math.min(durationMs, 4_000),
      energy: 0.46,
      bass: 0.58,
      mid: 0.42,
      treble: 0.37,
      brightness: 0.44,
      flux: 0.63,
      onsetDensity: 0.52,
      stereoWidth: 0.68,
    }],
    landmarks: [{ atMs: Math.min(durationMs, 2_000), type: "energy_lift", strength: 0.78 }],
  });

  it("sends complete lyric facts without uploading raw audio or artwork", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const payload = await buildDirectorRequestPayloadV1({
      trackID: "track-1",
      title: "Fixture Song",
      artist: "Fixture Artist",
      durationMs: lyrics.durationMs,
    }, lyrics);
    expect(payload?.lyricsHash).toMatch(/^[a-f0-9]{64}$/u);
    const body = JSON.parse(payload!.body) as Record<string, unknown>;
    const lines = body.lines as Array<{ text: string; words: unknown[]; from: number; timingPrecision: string }>;
    expect(lines.map((line) => line.text)).toEqual(lyrics.lines.map((line) => line.text));
    expect(lines[0]!.words.length).toBe(lyrics.lines[0]!.words!.length);
    expect(lines[0]!.timingPrecision).toBe("word");
    expect(lines[0]!.from).toBe(lyrics.lines[0]!.fromMs / 1000);
    expect(body.version).toBe("lyricstage-fullscreen-director-request-v1");
    expect(body.recordingID).toBe(lyrics.recordingID);
    expect(body.lyricsIdentity).toBe(compileLocalDirectorPlanV1(lyrics).lyricsIdentity);
    expect(body).not.toHaveProperty("audio");
    expect(body).not.toHaveProperty("artwork");
    expect(body).not.toHaveProperty("cover");
  });

  it("sends lightweight estimates as explicitly low-confidence director cues", async () => {
    const lyrics = lyricFixtures.lineOnlyJA;
    const payload = await buildDirectorRequestPayloadV1({
      trackID: "line-only",
      title: "Line-only Fixture",
      artist: "Fixture Artist",
      durationMs: lyrics.durationMs,
    }, lyrics);
    const body = JSON.parse(payload!.body) as {
      lines: Array<{
        text: string;
        timingPrecision: "line" | "word" | "estimated";
        words: Array<{ index: number; from: number; to: number; text: string }>;
        estimatedWords: Array<{ index: number; from: number; to: number; text: string }>;
      }>;
    };
    const estimated = body.lines.filter((line) => line.timingPrecision === "estimated");
    expect(estimated.length).toBeGreaterThan(0);
    expect(estimated[0]!.words).toEqual([]);
    expect(estimated[0]!.estimatedWords.length).toBeGreaterThan(1);
    expect(estimated[0]!.estimatedWords.map((word) => word.text).join("")).toBe(estimated[0]!.text);
  });

  it("can retry a rejected request with line-only timing while preserving the lyric text", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const payload = await buildDirectorRequestPayloadV1({
      trackID: "line-only-retry",
      title: "Line-only Retry",
      artist: "Fixture Artist",
      durationMs: lyrics.durationMs,
    }, lyrics, undefined, { lineTimingOnly: true });
    const body = JSON.parse(payload!.body) as {
      lines: Array<{ text: string; timingPrecision: string; words: unknown[]; estimatedWords: unknown[] }>;
    };
    expect(body.lines.map((line) => line.text)).toEqual(lyrics.lines.map((line) => line.text));
    expect(body.lines.every((line) => line.timingPrecision === "line")).toBe(true);
    expect(body.lines.every((line) => line.words.length === 0 && line.estimatedWords.length === 0)).toBe(true);
  });

  it("clips a trailing lyric sentinel to the authoritative media duration", async () => {
    const fixture = lyricFixtures.lineOnlyJA;
    const lyrics = {
      ...fixture,
      lines: fixture.lines.map((line, index) => index === fixture.lines.length - 1
        ? { ...line, toMs: fixture.durationMs + 60_000 }
        : line),
    };
    const payload = await buildDirectorRequestPayloadV1({
      trackID: "trailing-sentinel",
      title: "Trailing Sentinel",
      artist: "Fixture Artist",
      durationMs: fixture.durationMs,
    }, lyrics);
    const body = JSON.parse(payload!.body) as {
      duration: number;
      lines: Array<{ from: number; to: number; estimatedWords: Array<{ from: number; to: number }> }>;
    };
    const last = body.lines.at(-1)!;
    expect(last.to).toBe(body.duration);
    expect(last.to).toBeGreaterThan(last.from);
    expect(last.estimatedWords.every((word) => word.from >= last.from && word.to <= last.to)).toBe(true);
  });

  it("adds the exact public YouTube video as whole-song context", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const payload = await buildDirectorRequestPayloadV1({
      trackID: "X9aN34E-f8Q",
      title: "Fixture Cover",
      artist: "Fixture Artist",
      durationMs: lyrics.durationMs,
    }, lyrics);
    const body = JSON.parse(payload!.body) as { mediaContext?: Record<string, unknown> };
    expect(body.mediaContext).toMatchObject({
      kind: "public-youtube-video",
      videoID: "X9aN34E-f8Q",
      youtubeURL: "https://www.youtube.com/watch?v=X9aN34E-f8Q",
      analysis: "whole-song",
    });
  });

  it("sends only a bounded normalized MusicMap and strips unknown audio-bearing fields", async () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const map = { ...musicMap(lyrics.durationMs), rawAudio: "must-not-leave-browser" } as MusicMapV1;
    const payload = await buildDirectorRequestPayloadV1({
      trackID: "X9aN34E-f8Q",
      title: "Fixture Cover",
      artist: "Fixture Artist",
      durationMs: lyrics.durationMs,
    }, lyrics, map);
    const body = JSON.parse(payload!.body) as { musicMap?: Record<string, unknown> };
    expect(body.musicMap).toMatchObject({ version: "music-map-v1", source: "tab-capture", featureRateHz: 30 });
    expect(body.musicMap).not.toHaveProperty("rawAudio");
    expect(sanitizeMusicMapV1({ ...map, segments: [{ ...map.segments[0], energy: 1.2 }] })).toBeUndefined();
  });

  it("fails closed for more lines than the deployed director accepts", async () => {
    const base = lyricFixtures.lineOnlyJA.lines[0]!;
    const lyrics = {
      ...lyricFixtures.lineOnlyJA,
      lines: Array.from({ length: 181 }, (_, lineIndex) => ({
        ...base,
        lineIndex,
        fromMs: lineIndex * 1000,
        toMs: lineIndex * 1000 + 900,
      })),
    };
    await expect(buildDirectorRequestPayloadV1({
      trackID: "too-long",
      title: "Too Long",
      artist: "Fixture",
      durationMs: lyrics.durationMs,
    }, lyrics)).resolves.toBeUndefined();
  });
});

describe("MusicMapV1", () => {
  it("compresses 30Hz normalized features into deterministic bounded sections and landmarks", () => {
    const frames = Array.from({ length: 360 }, (_, index) => {
      const lifted = index >= 180;
      return {
        atMs: index * (1000 / 30),
        energy: lifted ? 0.82 : 0.18,
        bass: lifted ? 0.76 : 0.22,
        mid: lifted ? 0.66 : 0.25,
        treble: lifted ? 0.61 : 0.18,
        brightness: lifted ? 0.72 : 0.24,
        flux: lifted ? 0.74 : 0.18,
        onset: lifted ? 0.69 : 0.12,
        stereoWidth: lifted ? 0.78 : 0.31,
      };
    });
    const first = compileMusicMapV1(12_000, frames, { bpm: 126, confidence: 0.84 });
    const second = compileMusicMapV1(12_000, frames, { bpm: 126, confidence: 0.84 });
    expect(first).toEqual(second);
    expect(first?.featureRateHz).toBeCloseTo(30, 1);
    expect(first?.analyzedMs).toBeCloseTo(frames.length / (first?.featureRateHz ?? 30) * 1000, -1);
    expect(first?.segments.length).toBeLessThanOrEqual(96);
    expect(first?.landmarks.some((landmark) => landmark.type === "energy_lift")).toBe(true);
    expect(first?.landmarks.some((landmark) => landmark.type === "section_boundary")).toBe(true);
  });
});

describe("VocalTimingMapV1", () => {
  const samples = (presence: (index: number) => number) => Array.from({ length: 120 }, (_, index) => ({
    atMs: 1_000 + index * 50,
    presence: presence(index),
    attack: index % 12 === 0 ? 0.72 : 0.08,
    confidence: 0.78,
  }));

  it("keeps only a bounded rolling local feature window", () => {
    const map = compileVocalTimingMapV1(30_000, samples((index) => index < 30 ? 0.12 : 0.76), 4_000);
    expect(map?.version).toBe("vocal-timing-map-v1");
    expect(map?.source).toBe("tab-capture");
    expect(map?.samples.length).toBeLessThanOrEqual(81);
    expect(map?.featureRateHz).toBeCloseTo(20, 1);
    expect(map).not.toHaveProperty("audio");
    expect(map).not.toHaveProperty("spectrum");
    expect(sanitizeVocalTimingMapV1({ ...map, samples: [{ atMs: 1, presence: 2, attack: 0, confidence: 1 }] })).toBeUndefined();
  });

  it("scores centered vocal-band energy above a wide bass-heavy mixture", () => {
    const vocal = compileVocalTimingSampleV1({
      atMs: 1_000,
      energy: 0.58,
      centerBass: 0.18,
      centerMid: 0.72,
      centerTreble: 0.24,
      sideMid: 0.16,
      centerFlux: 0.42,
    });
    const mixture = compileVocalTimingSampleV1({
      atMs: 1_000,
      energy: 0.72,
      centerBass: 0.78,
      centerMid: 0.38,
      centerTreble: 0.44,
      sideMid: 0.36,
      centerFlux: 0.42,
    });
    expect(vocal!.presence).toBeGreaterThan(mixture!.presence);
    expect(vocal!.confidence).toBeGreaterThan(mixture!.confidence);
    expect(vocal!.attack).toBeGreaterThan(0);
  });

  it("slows estimated reveal through a confident vocal pause and accelerates on vocal activity", () => {
    const quiet = compileVocalTimingMapV1(10_000, samples(() => 0.04));
    const active = compileVocalTimingMapV1(10_000, samples(() => 0.86));
    const neutralTime = 4_000;
    expect(vocalAwareVirtualTimeMs(1_000, 7_000, neutralTime, quiet)).toBeLessThan(neutralTime);
    expect(vocalAwareVirtualTimeMs(1_000, 7_000, neutralTime, active)).toBeGreaterThan(neutralTime);
  });

  it("falls back exactly when acoustic coverage or confidence is insufficient", () => {
    const lowConfidence = compileVocalTimingMapV1(10_000, samples(() => 0.8).map((sample) => ({
      ...sample,
      confidence: 0.1,
    })));
    expect(vocalAwareVirtualTimeMs(1_000, 7_000, 4_000, lowConfidence)).toBe(4_000);
    expect(vocalAwareVirtualTimeMs(1_000, 7_000, 4_000, undefined)).toBe(4_000);
  });

  it("keeps the warped acoustic clock monotonic", () => {
    const map = compileVocalTimingMapV1(10_000, samples((index) => index < 36 ? 0.05 : 0.84));
    const times = Array.from({ length: 45 }, (_, index) => 1_300 + index * 100);
    const warped = times.map((time) => vocalAwareVirtualTimeMs(1_000, 7_000, time, map));
    expect(warped.every((time, index) => index === 0 || time >= warped[index - 1]!)).toBe(true);
  });

  it("estimates a shared lyric offset from several irregular vocal attacks", () => {
    const lineStarts = [4_000, 9_300, 15_800, 22_400];
    const trueOffsetMs = 1_300;
    const acousticSamples = Array.from({ length: 480 }, (_, index) => {
      const atMs = 2_000 + index * 50;
      const distance = Math.min(...lineStarts.map((start) => Math.abs(atMs - (start + trueOffsetMs))));
      const attack = distance <= 100 ? 0.92 : distance <= 250 ? 0.48 : 0.025;
      const afterOnset = lineStarts.some((start) => atMs >= start + trueOffsetMs && atMs <= start + trueOffsetMs + 1_800);
      return {
        atMs,
        presence: afterOnset ? 0.82 : 0.08,
        attack,
        confidence: 0.86,
      };
    });
    const map = compileVocalTimingMapV1(30_000, acousticSamples, 25_000);
    const estimate = estimateLyricsOffsetFromVocalTimingV1(
      lineStarts.map((fromMs) => ({ fromMs, toMs: fromMs + 2_600 })),
      map,
    );
    expect(estimate).toBeDefined();
    expect(Math.abs(estimate!.offsetMs - trueOffsetMs)).toBeLessThanOrEqual(200);
    expect(estimate!.matchedLineCount).toBeGreaterThanOrEqual(3);
    expect(estimate!.confidence).toBeGreaterThanOrEqual(0.45);
  });

  it("does not auto-shift from a flat or ambiguous vocal window", () => {
    const flat = compileVocalTimingMapV1(20_000, Array.from({ length: 300 }, (_, index) => ({
      atMs: 1_000 + index * 50,
      presence: 0.45,
      attack: 0.04,
      confidence: 0.8,
    })), 15_000);
    expect(estimateLyricsOffsetFromVocalTimingV1([
      { fromMs: 4_000, toMs: 6_000 },
      { fromMs: 9_000, toMs: 11_000 },
      { fromMs: 14_000, toMs: 16_000 },
    ], flat)).toBeUndefined();
  });
});
