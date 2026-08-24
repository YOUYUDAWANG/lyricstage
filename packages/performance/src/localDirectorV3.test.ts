import { describe, expect, it } from "vitest";
import { lyricFixtures, type LyricDocumentV0 } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV3 } from "./directorV2Rolling";
import {
  compileLocalLineEvidenceV3,
  compileLocalSceneRangesV3,
  compileLocalSceneTreatmentV3,
} from "./localDirectorV3";
import type { MusicMapV1 } from "./musicMap";
import {
  compileLocalDirectorBibleV1,
  initialRollingPerformanceStateV1,
} from "./rollingDirector";
import { signatureChoreographyClipIDsV2 } from "./signatureChoreographyV2";

const longSong = (): LyricDocumentV0 => ({
  version: "lyric-document-v0",
  recordingID: "fixture:local-first-director-v3-long-song",
  durationMs: 240_000,
  lines: Array.from({ length: 60 }, (_, lineIndex) => ({
    lineIndex,
    fromMs: lineIndex * 4_000,
    toMs: lineIndex * 4_000 + 3_400,
    text: [8, 24, 40, 56].includes(lineIndex) ? "我们一起回到这里"
      : lineIndex === 12 ? "你还会回来吗？"
        : lineIndex === 13 ? "我会在这里回答"
          : lineIndex === 28 ? "但是光忽然断开"
            : `叙事歌词 ${lineIndex}`,
    voiceRole: lineIndex === 18 ? "duetA" as const : lineIndex === 19 ? "duetB" as const : "lead" as const,
  })),
});

const structuralLyrics: LyricDocumentV0 = {
  version: "lyric-document-v0",
  recordingID: "fixture:local-first-structure",
  durationMs: 40_000,
  lines: Array.from({ length: 10 }, (_, lineIndex) => ({
    lineIndex,
    fromMs: lineIndex * 4_000,
    toMs: lineIndex * 4_000 + 3_400,
    text: `结构歌词 ${lineIndex}`,
    voiceRole: "lead" as const,
  })),
};

const structuralMusicMap: MusicMapV1 = {
  version: "music-map-v1",
  source: "tab-capture",
  durationMs: structuralLyrics.durationMs,
  analyzedMs: structuralLyrics.durationMs,
  featureRateHz: 30,
  tempo: null,
  summary: { dynamicRange: 0.5, meanEnergy: 0.5, peakEnergy: 0.8, silenceRatio: 0 },
  segments: [{
    fromMs: 0, toMs: structuralLyrics.durationMs,
    energy: 0.5, bass: 0.5, mid: 0.5, treble: 0.5,
    brightness: 0.5, flux: 0.5, onsetDensity: 0.5, stereoWidth: 0.5,
  }],
  landmarks: [{ atMs: 20_000, type: "section_boundary", strength: 1 }],
};

describe("Local-First Director V3", () => {
  it.each([
    ["fast/word-timed", lyricFixtures.wordTimedMixed],
    ["slow/line-only", lyricFixtures.lineOnlyJA],
    ["repeated chorus", lyricFixtures.repeatedHook],
    ["duet", lyricFixtures.duetOverlap],
    ["long lines", lyricFixtures.longSongStructure],
  ])("keeps %s on the expressive local compiler without AI", (_label, lyrics) => {
    const plan = compileLocalDirectorPlanV3(lyrics);
    expect(plan.directorVersion).toBe("lyricstage-local-first-director-v3");
    expect(plan.directives).toHaveLength(lyrics.lines.length);
    expect(plan.sections[0]?.fromLineIndex).toBe(lyrics.lines[0]?.lineIndex);
    expect(plan.sections.at(-1)?.toLineIndex).toBe(lyrics.lines.at(-1)?.lineIndex);
    expect(plan.gestures.length).toBeGreaterThan(0);
    expect(plan.effects.length).toBeGreaterThan(0);
  });

  it("builds a deterministic full local performance with long-form scenes and bounded signatures", () => {
    const lyrics = longSong();
    const first = compileLocalDirectorPlanV3(lyrics);
    const second = compileLocalDirectorPlanV3(lyrics);
    expect(second).toEqual(first);
    expect(first.source).toBe("local");
    expect(first.directorVersion).toBe("lyricstage-local-first-director-v3");
    expect(first.sections.length).toBeGreaterThanOrEqual(14);
    expect(first.sections.length).toBeLessThanOrEqual(20);
    expect(first.sections.every((section) => section.toLineIndex - section.fromLineIndex + 1 <= 6)).toBe(true);
    expect(first.directives).toHaveLength(lyrics.lines.length);
    const behaviors = new Set(first.directives.map((directive) => directive.behavior));
    ["echo", "focus", "gravityDrop", "stretch"].forEach((behavior) => expect(behaviors).toContain(behavior));
    expect(first.gestures.length).toBeGreaterThanOrEqual(first.sections.length);
    expect(first.gestures.length).toBeLessThanOrEqual(48);
    const signatureClips = signatureChoreographyClipIDsV2.filter((clip) =>
      first.effects.some((effect) => effect.id.startsWith(`signature-clip-v2:${clip}:`)));
    expect(signatureClips.length).toBeGreaterThanOrEqual(5);
    expect(signatureClips.length).toBeLessThanOrEqual(7);
    const layoutChanges = first.sections.slice(1).filter((section, index) =>
      section.layout !== first.sections[index]!.layout).length;
    expect(layoutChanges).toBeGreaterThanOrEqual(3);
    expect(layoutChanges).toBeLessThanOrEqual(4);
  });

  it("prefers a real MusicMap structural landmark over equal-time cutting", () => {
    const bible = compileLocalDirectorBibleV1(structuralLyrics);
    const ranges = compileLocalSceneRangesV3(structuralLyrics, bible, 0, 9, structuralMusicMap);
    expect(ranges.length).toBeGreaterThanOrEqual(3);
    expect(ranges.some((range) => range.toLineIndex === 4)).toBe(true);
    expect(ranges.every((range) => range.toLineIndex - range.fromLineIndex + 1 <= 6)).toBe(true);
  });

  it("derives question, answer, rupture, refrain and release roles without AI", () => {
    const lyrics: LyricDocumentV0 = {
      version: "lyric-document-v0",
      recordingID: "fixture:local-first-line-roles",
      durationMs: 30_000,
      lines: [
        { lineIndex: 0, fromMs: 0, toMs: 4_000, text: "你会回来吗？", voiceRole: "lead" },
        { lineIndex: 1, fromMs: 4_200, toMs: 8_000, text: "我会回答", voiceRole: "lead" },
        { lineIndex: 2, fromMs: 8_200, toMs: 12_000, text: "但是我要离开", voiceRole: "lead" },
        { lineIndex: 3, fromMs: 12_200, toMs: 16_000, text: "我们一起唱", voiceRole: "lead" },
        { lineIndex: 4, fromMs: 16_200, toMs: 20_000, text: "我们一起唱", voiceRole: "lead" },
        { lineIndex: 5, fromMs: 20_200, toMs: 24_000, text: "终于回家", voiceRole: "lead" },
      ],
    };
    const bible = compileLocalDirectorBibleV1(lyrics);
    const treatment = compileLocalSceneTreatmentV3(
      lyrics,
      initialRollingPerformanceStateV1(bible),
      [],
      { fromLineIndex: 0, toLineIndex: 5 },
    );
    const roles = treatment.linePerformances.map((performance) => performance.dramaticRole);
    expect(roles).toEqual(["question", "answer", "rupture", "refrain", "refrain", "release"]);
    const evidence = compileLocalLineEvidenceV3(lyrics);
    expect(evidence[2]?.triggers).toContain("semantic_contrast");
    expect(evidence[4]?.repetitionOrdinal).toBe(2);
  });
});
