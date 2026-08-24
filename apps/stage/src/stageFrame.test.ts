import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import {
  compileEnvironmentSceneV1,
  compileLocalDirectorPlanV1,
  type ReactiveBusV1,
} from "@lyricstage/performance";
import { directedPaletteForIndexV1 } from "@lyricstage/renderer";
import {
  createStageFrameBuffersV1,
  writeStageFrameV1,
  type StageFrameInputV1,
} from "./stageFrame";

const plan = compileLocalDirectorPlanV1(lyricFixtures.longSongStructure);
const palette = directedPaletteForIndexV1(0);
const environmentScene = compileEnvironmentSceneV1(plan.recordingID, plan.planIdentity);
const reactiveBus = (atMs: number): ReactiveBusV1 => ({
  version: "reactive-bus-v1",
  source: "tab-capture",
  atMs,
  beatPhase: null,
  energy: 0.82,
  bass: 0.9,
  brightness: 0.74,
  onset: 0.68,
  stereoWidth: 0.7,
  silence: 0,
});
const input = (timeMs: number, changes: Partial<StageFrameInputV1> = {}): StageFrameInputV1 => ({
  playbackTimeMs: timeMs,
  timeMs,
  plan,
  environmentScene,
  palette,
  sectionIntensity: 0.72,
  reduceMotion: false,
  lightweight: false,
  vjMode: false,
  showGuides: false,
  ...changes,
});

describe("StageFrameV1", () => {
  it("swaps exactly two preallocated buffers while generations advance", () => {
    const buffers = createStageFrameBuffersV1(input(0));
    const first = writeStageFrameV1(buffers, input(1_000));
    const second = writeStageFrameV1(buffers, input(2_000));
    const firstEnvironment = first.environment;
    const third = writeStageFrameV1(buffers, input(3_000));
    expect(first).not.toBe(second);
    expect(third).toBe(first);
    expect(third.environment).toBe(firstEnvironment);
    expect(second.generation).toBe(2);
    expect(third.generation).toBe(3);
  });

  it("reconstructs the same ambient numbers after playback, seek, and hidden resume", () => {
    const targetTimeMs = 187_321;
    const directBuffers = createStageFrameBuffersV1(input(0));
    const directFrame = writeStageFrameV1(directBuffers, input(targetTimeMs));
    const direct = { ...directFrame.ambient };
    const directEnvironment = structuredClone(directFrame.environment);

    const playbackBuffers = createStageFrameBuffersV1(input(0));
    for (let timeMs = 0; timeMs < targetTimeMs; timeMs += 1_000 / 60) {
      writeStageFrameV1(playbackBuffers, input(timeMs));
    }
    const playbackFrame = writeStageFrameV1(playbackBuffers, input(targetTimeMs));
    const playback = { ...playbackFrame.ambient };

    const resumeBuffers = createStageFrameBuffersV1(input(0));
    writeStageFrameV1(resumeBuffers, input(12_000));
    const resumedFrame = writeStageFrameV1(resumeBuffers, input(targetTimeMs));
    const resumed = { ...resumedFrame.ambient };
    expect(playback).toEqual(direct);
    expect(resumed).toEqual(direct);
    expect(playbackFrame.environment).toEqual(directEnvironment);
    expect(resumedFrame.environment).toEqual(directEnvironment);
  });

  it("keeps reduced motion static while preserving a restrained visible atmosphere", () => {
    const buffers = createStageFrameBuffersV1(input(0, { reduceMotion: true }));
    const early = { ...writeStageFrameV1(buffers, input(1_000, { reduceMotion: true })).ambient };
    const late = { ...writeStageFrameV1(buffers, input(91_000, { reduceMotion: true })).ambient };
    expect(late).toEqual(early);
    expect(late.motifOpacity).toBeGreaterThan(0);
    expect(late.motifTranslateXPct).toBe(0);
    expect(late.motifRotationDeg).toBe(0);
  });

  it("gives motion laws distinct spatial silhouettes without relying on color", () => {
    const silhouettes = (["flow", "fall", "orbit", "converge", "suspend", "fracture"] as const).map((motionLaw) => {
      const directedPlan = { ...plan, world: { ...plan.world, motionLaw } };
      const buffers = createStageFrameBuffersV1(input(0, { plan: directedPlan }));
      const ambient = writeStageFrameV1(buffers, input(6_321, { plan: directedPlan })).ambient;
      return [ambient.motifTranslateXPct, ambient.motifTranslateYPct, ambient.motifScale, ambient.motifRotationDeg]
        .map((value) => value.toFixed(5)).join(":");
    });
    expect(new Set(silhouettes).size).toBe(silhouettes.length);
  });

  it("uses a fresh audio snapshot without making frame history authoritative", () => {
    const targetTimeMs = 42_000;
    const reactiveInput = input(targetTimeMs, { reactiveBus: reactiveBus(targetTimeMs) });
    const direct = writeStageFrameV1(createStageFrameBuffersV1(input(0)), reactiveInput);
    const replayBuffers = createStageFrameBuffersV1(input(0));
    writeStageFrameV1(replayBuffers, input(12_000, { reactiveBus: reactiveBus(12_000) }));
    const replay = writeStageFrameV1(replayBuffers, reactiveInput);
    const baseline = writeStageFrameV1(createStageFrameBuffersV1(input(0)), input(targetTimeMs));
    expect(replay.ambient).toEqual(direct.ambient);
    expect(replay.environment).toEqual(direct.environment);
    expect(direct.ambient.artworkScale).toBeGreaterThan(baseline.ambient.artworkScale);
    expect(direct.ambient.motifScale - baseline.ambient.motifScale).toBeGreaterThan(0.05);
    expect(direct.reactiveBus?.atMs).toBe(targetTimeMs);
  });

  it("gives each rolling Scene a deterministic visible entrance without a wall clock", () => {
    const first = plan.sections[0]!;
    const rollingPlan = { ...plan, sections: plan.sections.map((section, index) => index === 0
      ? { ...section, id: "rolling:perceptual-entry", layout: "editorialSplit" as const } : section) };
    const entrance = writeStageFrameV1(createStageFrameBuffersV1(input(first.fromMs, { plan: rollingPlan })), input(first.fromMs, { plan: rollingPlan }));
    const settled = writeStageFrameV1(createStageFrameBuffersV1(input(first.fromMs + 900, { plan: rollingPlan })), input(first.fromMs + 900, { plan: rollingPlan }));
    expect(entrance.ambient.sceneEnterOpacity).toBeLessThan(0.6);
    expect(Math.abs(entrance.ambient.sceneEnterTranslateXPct)).toBeGreaterThan(4);
    expect(settled.ambient.sceneEnterOpacity).toBe(1);
    expect(settled.ambient.sceneEnterTranslateXPct).toBe(0);
  });

  it("ignores stale audio snapshots after seek and keeps reduced motion static", () => {
    const targetTimeMs = 42_000;
    const stale = writeStageFrameV1(
      createStageFrameBuffersV1(input(0)),
      input(targetTimeMs, { reactiveBus: reactiveBus(38_000) }),
    );
    const baseline = writeStageFrameV1(createStageFrameBuffersV1(input(0)), input(targetTimeMs));
    expect(stale.reactiveBus).toBeUndefined();
    expect(stale.ambient).toEqual(baseline.ambient);

    const reduced = writeStageFrameV1(
      createStageFrameBuffersV1(input(0, { reduceMotion: true })),
      input(targetTimeMs, { reduceMotion: true, reactiveBus: reactiveBus(targetTimeMs) }),
    );
    expect(reduced.ambient.motifTranslateXPct).toBe(0);
    expect(reduced.ambient.motifRotationDeg).toBe(0);
  });
});
