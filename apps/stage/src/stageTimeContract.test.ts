import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compileEnvironmentSceneV1,
  defaultEnvironmentTuningV1,
  sampleEnvironmentSceneV1,
} from "@lyricstage/performance";

const stageSource = readFileSync(new URL("./StageCanvas.tsx", import.meta.url), "utf8");
const stageFrameSource = readFileSync(new URL("./stageFrame.ts", import.meta.url), "utf8");
const environmentSource = readFileSync(new URL("./PerformanceEnvironment.tsx", import.meta.url), "utf8");
const stageCSS = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("Stage authoritative-time contract", () => {
  it("keeps one continuous frame owner and no child choreography rAF", () => {
    expect(stageSource.match(/requestAnimationFrame\(/gu) ?? []).toHaveLength(1);
    expect(environmentSource).not.toContain("requestAnimationFrame(");
    expect(environmentSource).not.toContain("continuous:");
  });

  it("keeps fullscreen ambience on stable compositor layers instead of per-frame DOM writes", () => {
    expect(stageSource).toContain("<PerformanceEnvironment");
    expect(stageSource).toContain("stage-artwork-wash");
    expect(stageSource).toContain("stage-world-motif");
    expect(stageSource).toContain("environmentRef.current?.renderFrame");
    expect(stageSource).toContain("motif: null");
    expect(stageSource).toContain("washPrimary: null");
    expect(stageSource).toContain("washSecondary: null");
    expect(stageFrameSource).toContain("frameVisualIdentity");
  });

  it("does not enqueue React state from the continuous frame body", () => {
    const frameBody = stageSource.match(/const render = \(\) => \{([\s\S]*?)\n      if \(continuous/um)?.[1] ?? "";
    expect(frameBody.length).toBeGreaterThan(100);
    expect(frameBody).not.toMatch(/(?<!\.)\bset[A-Z]\w*\(/u);
  });

  it("does not let CSS own directed Stage time", () => {
    expect(stageCSS).not.toContain("data-layout-transition-phase");
    expect(stageCSS).toContain("animation: stage-wash-drift 22s");
    expect(stageCSS).toContain("[data-world-motion=\"flow\"] .stage-world-motif");
    const directedTransitionRule = stageCSS.match(/:is\(\.stage-now-playing-info, \.stage-lyric-viewport\) \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(directedTransitionRule).not.toContain("transition:");
    const artworkFrameRule = stageCSS.match(/(?:^|\n)\.stage-artwork-frame \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(artworkFrameRule).not.toContain("transition:");
  });

  it("reconstructs environment state from time instead of frame history", () => {
    const scene = compileEnvironmentSceneV1("fixture:authoritative-stage", "section:2");
    const targetTimeMs = 87_321;
    const directSeek = sampleEnvironmentSceneV1(scene, targetTimeMs, defaultEnvironmentTuningV1, 0.74);
    for (let timeMs = 0; timeMs < targetTimeMs; timeMs += 1_000 / 60) {
      sampleEnvironmentSceneV1(scene, timeMs, defaultEnvironmentTuningV1, 0.74);
    }
    const playbackArrival = sampleEnvironmentSceneV1(scene, targetTimeMs, defaultEnvironmentTuningV1, 0.74);
    sampleEnvironmentSceneV1(scene, 14_000, defaultEnvironmentTuningV1, 0.74);
    const hiddenResume = sampleEnvironmentSceneV1(scene, targetTimeMs, defaultEnvironmentTuningV1, 0.74);
    expect(playbackArrival).toEqual(directSeek);
    expect(hiddenResume).toEqual(directSeek);
  });
});
