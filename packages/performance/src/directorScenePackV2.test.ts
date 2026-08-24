import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { scenePackRequestProfileV2 } from "./directorScenePackV2";
import { signatureChoreographyClipsV2 } from "./signatureChoreographyV2";
import { windowIntentRequestProfileV2 } from "./directorV2Provider";
import { compileDirectorPlanFromRollingV1, compileLocalDirectorBibleV1, initialRollingPerformanceStateV1 } from "./rollingDirector";

const lyrics = {
  ...lyricFixtures.longSongStructure,
  recordingID: "fixture:scene-pack-v2",
  durationMs: 60_000,
  lines: Array.from({ length: 15 }, (_, lineIndex) => ({
    lineIndex, fromMs: lineIndex * 4_000, toMs: lineIndex * 4_000 + 3_600,
    text: `scene pack lyric ${lineIndex}`, voiceRole: "lead" as const,
  })),
};
const bible = compileLocalDirectorBibleV1(lyrics);
const state = initialRollingPerformanceStateV1(bible);
const input = {
  lyrics, bible, state,
  promptInput: { bible, state, fromLineIndex: 0, toLineIndex: 14, lines: lyrics.lines },
};
const validRanges = windowIntentRequestProfileV2.adapt(input, {
  version: "window-intent-v2", spatialIntent: "open", coverRole: "portal", arcIntent: "lift", cues: [],
}).response!.map((card) => [card.fromLineIndex, card.toLineIndex] as const);

const scene = (
  fromLineIndex: number,
  toLineIndex: number,
  purpose: "establish" | "develop" | "turn" | "aftermath" | "resolve",
  change: "focus" | "scale" | "spacing" | "energy" | "voiceOwnership",
  leave: "trace" | "absence" | "displacement" | "connection" | "question" | "resolution",
) => ({
  fromLineIndex, toLineIndex, purpose,
  spatialIntent: purpose === "turn" ? "split" : purpose === "resolve" ? "open" : "hold",
  coverRole: purpose === "resolve" ? "destination" : "anchor",
  arcIntent: purpose === "turn" ? "break" : purpose === "resolve" ? "lift" : "hold",
  continuity: { preserve: ["motif"], change, leave },
  cues: [],
  signatureClip: purpose === "turn" ? "bridge-fracture" : purpose === "resolve" ? "final-resolve" : "none",
  linePerformances: Array.from({ length: toLineIndex - fromLineIndex + 1 }, (_, offset) => ({
    lineIndex: fromLineIndex + offset,
    dramaticRole: purpose === "turn" ? "rupture" : purpose === "resolve" ? "release" : "statement",
    entrance: (["line-rise", "line-slide", "line-reveal", "line-break"] as const)[(fromLineIndex + offset) % 4],
    hold: (["hold-breathe", "hold-suspend", "hold-echo", "hold-tension"] as const)[(fromLineIndex + offset) % 4],
    exit: (["exit-dissolve", "exit-recede", "exit-handoff", "exit-cut"] as const)[(fromLineIndex + offset) % 4],
    motifRelationship: purpose === "turn" ? "break" : purpose === "resolve" ? "resolve" : "introduce",
    intensity: purpose === "turn" ? 0.86 : 0.68,
  })),
});

describe("ScenePackV2 provider profile", () => {
  it("compiles multiple authored contiguous sub-scenes instead of one local window", () => {
    const scenes = validRanges.map(([fromLineIndex, toLineIndex], index) => scene(
      fromLineIndex, toLineIndex,
      index === 0 ? "establish" : index === validRanges.length - 1 ? "resolve" : index === 2 ? "turn" : "develop",
      index === 2 ? "voiceOwnership" : index === validRanges.length - 1 ? "scale" : "focus",
      index === 2 ? "question" : index === validRanges.length - 1 ? "resolution" : "trace",
    ));
    const result = scenePackRequestProfileV2.adapt(input, {
      version: "scene-pack-v2",
      scenes,
    });
    expect(result.response, result.reason).toHaveLength(validRanges.length);
    expect(result.response?.map((card) => [card.fromLineIndex, card.toLineIndex])).toEqual(validRanges);
    expect(new Set(result.response?.map((card) => card.layout)).size).toBeGreaterThanOrEqual(2);
    expect(result.response?.every((card) => card.semanticScene?.version === "semantic-scene-direction-v2")).toBe(true);
    expect(result.response?.[0]?.intention).toBe("establish: preserve motif; change focus; leave trace.");
    expect(result.response?.at(-1)?.intention).toContain("Choreography final-resolve");
    const lineGestures = result.response?.flatMap((card) => card.gestures) ?? [];
    expect(result.response?.flatMap((card) => card.directives ?? [])).toHaveLength(lyrics.lines.length);
    expect(lineGestures.length).toBeGreaterThanOrEqual(lyrics.lines.length - 2);
    expect(new Set(lineGestures.map((gesture) => gesture.primitive)).size).toBeGreaterThanOrEqual(4);
    const signatureEffects = result.response?.flatMap((card) => card.effects)
      .filter((effect) => effect.id.startsWith("signature-clip-v2:")) ?? [];
    expect(signatureEffects.some((effect) => effect.id.includes("bridge-fracture"))).toBe(true);
    expect(signatureEffects.some((effect) => effect.id.includes("final-resolve"))).toBe(true);
    expect(signatureChoreographyClipsV2).toHaveLength(8);
    const plan = compileDirectorPlanFromRollingV1(lyrics, bible, result.response!);
    expect(plan.blocking.transitions.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects count padding, gaps, overlap and concrete visual fields", () => {
    expect(scenePackRequestProfileV2.adapt(input, {
      version: "scene-pack-v2",
      scenes: validRanges.map(([from, to], index) => scene(index === 1 ? from + 1 : from, to, index === validRanges.length - 1 ? "resolve" : "develop", "energy", "trace")),
    }).response).toBeUndefined();
    expect(scenePackRequestProfileV2.adapt(input, {
      version: "scene-pack-v2",
      scenes: validRanges.map(([from, to], index) => index === 0
        ? { ...scene(from, to, "establish", "focus", "trace"), primitive: "field.ribbon" }
        : scene(from, to, index === validRanges.length - 1 ? "resolve" : "develop", "energy", "trace")),
    }).response).toBeUndefined();
  });

  it("keeps legacy WindowIntentV2 readable during migration", () => {
    const result = scenePackRequestProfileV2.adapt(input, {
      version: "window-intent-v2",
      spatialIntent: "open",
      coverRole: "portal",
      arcIntent: "lift",
      cues: [],
    });
    expect(result.response?.length).toBe(validRanges.length);
  });
});
