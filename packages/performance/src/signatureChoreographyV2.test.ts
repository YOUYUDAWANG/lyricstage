import { describe, expect, it } from "vitest";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import type { SceneDramaticPurposeV2 } from "./directorScenePackV2";
import type { LinePerformanceV2 } from "./directorLinePerformanceV2";
import {
  compileLocalDirectorBibleV1,
  compileLocalSceneCardForWindowV1,
  initialRollingPerformanceStateV1,
} from "./rollingDirector";
import {
  applySignatureChoreographyV2,
  signatureChoreographyClipIDsV2,
  signatureChoreographyClipsV2,
  type SignatureChoreographyClipIDV2,
} from "./signatureChoreographyV2";

const lyrics: LyricDocumentV0 = {
  version: "lyric-document-v0",
  recordingID: "fixture:signature-choreography-v2",
  durationMs: 42_000,
  lines: Array.from({ length: 6 }, (_, lineIndex) => ({
    lineIndex,
    fromMs: lineIndex * 7_000,
    toMs: lineIndex * 7_000 + 5_800,
    text: `choreography lyric ${lineIndex}`,
    voiceRole: lineIndex === 2 ? "duetA" as const : lineIndex === 3 ? "duetB" as const : "lead" as const,
  })),
};

const purposeFor = (clipID: SignatureChoreographyClipIDV2): SceneDramaticPurposeV2 => {
  if (clipID === "motif-introduce") return "establish";
  if (clipID === "silence-vacuum" || clipID === "motif-recall") return "aftermath";
  if (clipID === "final-resolve") return "resolve";
  return clipID === "bridge-fracture" ? "turn" : "develop";
};

const performancesFor = (clipID: SignatureChoreographyClipIDV2): LinePerformanceV2[] => lyrics.lines.map((line) => ({
  lineIndex: line.lineIndex,
  dramaticRole: clipID === "bridge-fracture" ? "rupture"
    : clipID === "chorus-lift" || clipID === "refrain-upgrade" ? "refrain"
      : clipID === "final-resolve" || clipID === "motif-recall" ? "release" : "statement",
  entrance: clipID === "bridge-fracture" ? "line-break" : clipID === "duet-handoff" ? "line-slide" : "line-rise",
  hold: clipID === "silence-vacuum" ? "hold-suspend" : clipID === "refrain-upgrade" ? "hold-echo" : "hold-breathe",
  exit: clipID === "bridge-fracture" ? "exit-cut" : clipID === "duet-handoff" ? "exit-handoff" : "exit-dissolve",
  motifRelationship: clipID === "bridge-fracture" ? "break"
    : clipID === "final-resolve" || clipID === "motif-recall" ? "resolve"
      : clipID === "refrain-upgrade" ? "echo" : "introduce",
  intensity: 0.82,
}));

describe("Signature Choreography V2", () => {
  it("registers eight bounded, reduced-motion-aware compositions", () => {
    expect(signatureChoreographyClipIDsV2).toHaveLength(8);
    expect(new Set(signatureChoreographyClipsV2.map((clip) => clip.id)).size).toBe(8);
    expect(signatureChoreographyClipsV2.every((clip) => clip.observableFact.length > 20)).toBe(true);
    expect(signatureChoreographyClipsV2.every((clip) => clip.reducedMotionStrategy.length > 20)).toBe(true);
  });

  it.each(signatureChoreographyClipIDsV2)("compiles %s into one lyric event and a restrained consequence", (clipID) => {
    const bible = compileLocalDirectorBibleV1(lyrics);
    const state = initialRollingPerformanceStateV1(bible);
    const card = compileLocalSceneCardForWindowV1(lyrics, bible, state, 0, 5);
    expect(card).not.toBeNull();
    const performances = performancesFor(clipID);
    const result = applySignatureChoreographyV2(
      lyrics,
      bible,
      state,
      card!,
      { purpose: purposeFor(clipID), linePerformances: performances },
      clipID,
    );
    expect(result, clipID).not.toBeNull();
    expect(result?.gestures.filter((gesture) => gesture.id.startsWith(`signature-clip-v2:${clipID}:`))).toHaveLength(2);
    expect(result?.effects.map((effect) => effect.id.split(":").at(-1))).toEqual(["event", "consequence"]);
    expect(Math.max(...result!.effects.map((effect) => effect.primary.intensity))).toBeLessThanOrEqual(0.76);
    expect(result?.consequence.rationale).toContain(signatureChoreographyClipsV2.find((clip) => clip.id === clipID)!.observableFact);
  });
});
