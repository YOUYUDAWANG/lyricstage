import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { compileLocalDirectorBibleV1, initialRollingPerformanceStateV1 } from "./rollingDirector";
import {
  compactDirectorBiblePromptInputV1,
  compactScenePackPromptInputV1,
  directorBibleSchemaV1,
  directorBibleSystemPromptV1,
  scenePackSchemaV1,
  scenePackSystemPromptV1,
  windowIntentSystemPromptV2,
} from "./rollingDirectorPrompt";

describe("rolling director prompts", () => {
  it("keeps the Bible schema constitutional and free of scene choreography", () => {
    const schema = JSON.stringify(directorBibleSchemaV1);
    expect(schema).not.toContain('"gestures"');
    expect(schema).not.toContain('"effects"');
    expect(schema).not.toContain('"stageAction"');
    expect(schema).toContain('"signatureAnchors"');
    expect(directorBibleSystemPromptV1).toContain("whole-song constitution");
    expect(JSON.stringify(scenePackSchemaV1)).toContain('"stageAction"');
    expect((scenePackSchemaV1.properties as any).scenes.maxItems).toBe(1);
    expect(scenePackSystemPromptV1).toContain("supplied lyric window");
  });

  it("asks active windows for enough semantic structure without turning cue count into a hard art metric", () => {
    expect(windowIntentSystemPromptV2).toContain("two distinct semantic turns");
    expect(windowIntentSystemPromptV2).toContain("use two cues");
    expect(windowIntentSystemPromptV2).toContain("Do not add cues merely to reach a count");
  });

  it("keeps JSON Schema required fields aligned with strict local evidence validation", () => {
    const bible = directorBibleSchemaV1 as any;
    const anchorEvidence = bible.properties.signatureAnchors.items.properties.evidence;
    expect(anchorEvidence.required).toContain("audioLandmarkIDs");
    expect(anchorEvidence.properties.sectionTriggers.items.enum).toContain("final_resolution");
    expect(bible.properties.layoutBudget.required).toContain("continuityJustification");
    const effect = (scenePackSchemaV1 as any).properties.scenes.items.properties.effects.items;
    expect(effect.properties.primary.properties.primitive.enum).toContain("transition.dissolve");
    expect(effect.properties.support.items.additionalProperties).toBe(false);
  });

  it("keeps the Scene Pack input inside the requested lines and compact ledgers", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const lines = lyrics.lines.map((line) => ({ ...line, exactText: line.text }));
    const compact = compactScenePackPromptInputV1({
      bible,
      state,
      fromLineIndex: 3,
      toLineIndex: 5,
      lines,
      musicMap: {
        version: "music-map-v1",
        source: "tab-capture",
        summary: { meanEnergy: 0.5, rawResponse: "nested-secret" },
        endpoint: "nested-secret",
        segments: [
          { fromMs: 0, toMs: 1_000, energy: 0.2, providerKey: "nested-secret" },
          { fromMs: lines[3]!.fromMs, toMs: lines[5]!.toMs, energy: 0.7, rawResponse: "nested-secret" },
          { fromMs: 500_000, toMs: 501_000, energy: 0.1, endpoint: "nested-secret" },
        ],
      },
      diversityLedger: {
        recentLayouts: Array.from({ length: 20 }, (_, index) => `layout:${index}`),
        recentStageActions: Array.from({ length: 20 }, (_, index) => `action:${index}`),
        recentEffectPrimitives: Array.from({ length: 20 }, (_, index) => `effect:${index}`),
        recentGesturePrimitives: Array.from({ length: 20 }, (_, index) => `gesture:${index}`),
      },
      providerKey: "must-not-pass-through",
      diagnostics: { rawResponse: "must-not-pass-through" },
    }) as any;
    expect(compact.lines.map((line: any) => line.lineIndex)).toEqual([3, 4, 5]);
    expect(compact.musicMap.segments).toHaveLength(1);
    expect(compact.musicMap.segments[0].energy).toBe(0.7);
    expect(compact.bible.bibleIdentity).toBe(bible.bibleIdentity);
    expect(compact.state.stateHash).toBe(state.stateHash);
    expect(compact.diversity.recentLayouts).toHaveLength(8);
    expect(JSON.stringify(compact)).not.toContain("must-not-pass-through");
    expect(JSON.stringify(compact)).not.toContain("nested-secret");
  });

  it("compacts whole-song Bible inputs without passing unrelated fields", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const compact = compactDirectorBiblePromptInputV1({
      track: {
        trackID: "fixture-track",
        title: "fixture",
        artist: "fixture artist",
        metadata: { providerKey: "nested-secret", endpoint: "nested-secret" },
      },
      musicMap: {
        version: "music-map-v1",
        source: "tab-capture",
        summary: { meanEnergy: 0.4, rawResponse: "nested-secret" },
        segments: [{ fromMs: 0, toMs: 1_000, energy: 0.4, providerKey: "nested-secret" }],
        rawResponse: "nested-secret",
      },
      lines: lyrics.lines,
      sectionHints: Array.from({ length: 20 }, (_, index) => `section:${index}`),
      providerKey: "must-not-pass-through",
    }) as any;
    expect(compact.lines).toHaveLength(lyrics.lines.length);
    expect(compact.sectionHints).toHaveLength(12);
    expect(JSON.stringify(compact)).not.toContain("must-not-pass-through");
    expect(JSON.stringify(compact)).not.toContain("nested-secret");
    expect(compact.track).toEqual({ trackID: "fixture-track", title: "fixture", artist: "fixture artist" });
  });

  it("keeps a Scene Pack request smaller than the representative whole-song input", () => {
    const lyrics = {
      ...lyricFixtures.longSongStructure,
      lines: Array.from({ length: 50 }, (_, lineIndex) => ({
        lineIndex, fromMs: lineIndex * 4_000, toMs: lineIndex * 4_000 + 3_500,
        text: `bounded fixture lyric ${lineIndex}`,
      })),
      durationMs: 204_000,
    };
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const whole = compactDirectorBiblePromptInputV1({ track: { title: "Fixture" }, lines: lyrics.lines });
    const scene = compactScenePackPromptInputV1({
      bible, state, fromLineIndex: 20, toLineIndex: 30, lines: lyrics.lines, diversityLedger: {},
    }) as any;
    expect(new TextEncoder().encode(JSON.stringify(scene)).byteLength)
      .toBeLessThan(new TextEncoder().encode(JSON.stringify(whole)).byteLength);
    expect(scene.lines.map((line: any) => line.lineIndex)).toEqual(Array.from({ length: 11 }, (_, index) => index + 20));
  });
});
