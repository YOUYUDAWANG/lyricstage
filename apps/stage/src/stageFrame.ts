import {
  createEnvironmentFrameV1,
  directorSectionAtV1,
  reactiveBusAtTimeV1,
  sampleEnvironmentSceneIntoV1,
  type DirectorPlanV1,
  type EnvironmentFrameV1,
  type EnvironmentSceneV1,
  type PerformanceMotionLawV1,
  type ReactiveBusV1,
} from "@lyricstage/performance";
import type { DirectedStagePaletteV1 } from "@lyricstage/renderer";

export interface StageAmbientFrameV1 {
  motifTranslateXPct: number;
  motifTranslateYPct: number;
  motifScale: number;
  motifRotationDeg: number;
  motifOpacity: number;
  washPrimaryTranslateXPct: number;
  washPrimaryTranslateYPct: number;
  washPrimaryScale: number;
  washPrimaryRotationDeg: number;
  washSecondaryTranslateXPct: number;
  washSecondaryTranslateYPct: number;
  washSecondaryScale: number;
  washSecondaryRotationDeg: number;
  artworkSaturation: number;
  artworkBrightness: number;
  sceneEnterTranslateXPct: number;
  sceneEnterScale: number;
  sceneEnterOpacity: number;
}

export interface StageFrameV1 {
  generation: number;
  playbackTimeMs: number;
  timeMs: number;
  plan: DirectorPlanV1;
  environmentScene: EnvironmentSceneV1;
  palette: DirectedStagePaletteV1;
  reduceMotion: boolean;
  lightweight: boolean;
  vjMode: boolean;
  showGuides: boolean;
  reactiveBus?: ReactiveBusV1;
  ambient: StageAmbientFrameV1;
  environment: EnvironmentFrameV1;
}

export interface StageFrameInputV1 {
  playbackTimeMs: number;
  timeMs: number;
  plan: DirectorPlanV1;
  environmentScene: EnvironmentSceneV1;
  palette: DirectedStagePaletteV1;
  sectionIntensity: number;
  reduceMotion: boolean;
  lightweight: boolean;
  vjMode: boolean;
  showGuides: boolean;
  reactiveBus?: ReactiveBusV1;
}

export interface StageFrameBuffersV1 {
  readonly frames: readonly [StageFrameV1, StageFrameV1];
  generation: number;
  writeIndex: 0 | 1;
}

export interface StageFrameDOMTargetsV1 {
  host: HTMLDivElement;
  motif: HTMLDivElement | null;
  washPrimary: HTMLImageElement | null;
  washSecondary: HTMLImageElement | null;
  artwork: HTMLImageElement | null;
}

export const stageEnvironmentSceneKeyV1 = (planIdentity: string, sectionID: string): string =>
  `${planIdentity}\u0000${sectionID}`;

const TAU = Math.PI * 2;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const finiteTime = (timeMs: number): number => Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const easeInOutSine = (amount: number): number => (1 - Math.cos(Math.PI * clamp01(amount))) / 2;

const alternateProgress = (timeMs: number, legDurationMs: number, reverse = false): number => {
  const phase = (finiteTime(timeMs) / legDurationMs) % 2;
  const progress = phase <= 1 ? phase : 2 - phase;
  return reverse ? 1 - progress : progress;
};

const threePoint = (
  progress: number,
  midpoint: number,
  from: number,
  middle: number,
  to: number,
): number => progress <= midpoint
  ? lerp(from, middle, easeInOutSine(progress / midpoint))
  : lerp(middle, to, easeInOutSine((progress - midpoint) / (1 - midpoint)));

const sampleWorldMotion = (
  motionLaw: PerformanceMotionLawV1,
  timeMs: number,
  elasticity: number,
  target: StageAmbientFrameV1,
): void => {
  target.motifTranslateXPct = 0;
  target.motifTranslateYPct = 0;
  target.motifScale = 1.08;
  target.motifRotationDeg = 0;
  const elasticScale = 0.7 + clamp01(elasticity) * 0.3;
  if (motionLaw === "flow") {
    const progress = easeInOutSine(alternateProgress(timeMs, 13_000));
    target.motifTranslateXPct = lerp(-2.4, 2.8, progress) * elasticScale;
    target.motifTranslateYPct = lerp(1.2, -1.8, progress) * elasticScale;
    target.motifScale = lerp(1.08, 1.14, progress);
    target.motifRotationDeg = lerp(-0.4, 0.5, progress) * elasticScale;
    return;
  }
  if (motionLaw === "pulse") {
    const progress = easeInOutSine((finiteTime(timeMs) % 4_800) / 4_800);
    const mirrored = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
    target.motifScale = lerp(1.06, 1.08 + clamp01(elasticity) * 0.055, mirrored);
    return;
  }
  if (motionLaw === "fall") {
    const progress = easeInOutSine(alternateProgress(timeMs, 10_000));
    target.motifTranslateYPct = lerp(-4, 4, progress) * elasticScale;
    target.motifScale = lerp(1.1, 1.12, progress);
    return;
  }
  if (motionLaw === "orbit") {
    const progress = (finiteTime(timeMs) % 18_000) / 18_000;
    target.motifScale = 1.12;
    target.motifRotationDeg = progress * 360;
    return;
  }
  if (motionLaw === "converge") {
    const progress = easeInOutSine(alternateProgress(timeMs, 8_000));
    target.motifScale = lerp(1.24, 1.04, progress);
    return;
  }
  if (motionLaw === "suspend") {
    const progress = easeInOutSine(alternateProgress(timeMs, 14_000));
    target.motifTranslateYPct = lerp(-0.8, 0.8, progress) * elasticScale;
    target.motifScale = 1.1;
    return;
  }
  if (motionLaw === "fracture") {
    const progress = (finiteTime(timeMs) % 7_000) / 7_000;
    target.motifScale = 1.1;
    if (progress >= 0.9 && progress < 0.92) {
      target.motifTranslateXPct = -0.6 * elasticScale;
      target.motifTranslateYPct = 0.2 * elasticScale;
      target.motifScale = 1.105;
    } else if (progress >= 0.92 && progress < 0.94) {
      target.motifTranslateXPct = 0.5 * elasticScale;
      target.motifTranslateYPct = -0.2 * elasticScale;
      target.motifScale = 1.095;
    }
  }
};

const numericColor = (value: string, fallback: number): number => {
  const match = value.match(/^#([\da-f]{6})$/iu);
  return match ? Number.parseInt(match[1]!, 16) : fallback;
};

const sampleStageEnvironmentIntoV1 = (
  input: StageFrameInputV1,
  target: EnvironmentFrameV1,
): EnvironmentFrameV1 => {
  const { plan, timeMs, reduceMotion, vjMode, environmentScene, palette } = input;
  const section = directorSectionAtV1(plan, timeMs);
  const world = plan.world;
  const energy = vjMode && !reduceMotion
    ? Math.min(0.82, 0.42 + world.atmosphere * 0.32)
    : Math.min(0.46, 0.24 + world.atmosphere * 0.18);
  const artBloomBase = section.artDirection === "monoImpact"
    ? 0.28
    : section.artDirection === "neonRail" || section.artDirection === "celestialGrid"
      ? 0.82
      : 0.62;
  const artBloom = Math.min(1, artBloomBase * (0.72 + world.depth * 0.5));
  const artDriftBase = section.artDirection === "liquidMemory"
    ? 0.72
    : section.artDirection === "paperCut"
      ? 0.24
      : 0.4;
  const artDrift = Math.min(1, artDriftBase * (0.5 + world.fluidity * 1.15));
  sampleEnvironmentSceneIntoV1(environmentScene, timeMs, {
    intensity: energy,
    bloom: Math.min(1, vjMode && !reduceMotion ? artBloom + 0.14 : artBloom),
    drift: reduceMotion ? 0 : (vjMode ? Math.min(0.96, artDrift + 0.2) : artDrift),
    railOpacity: section.artDirection === "neonRail"
      || section.layout.startsWith("rail")
      || world.motionLaw === "flow"
      || world.motionLaw === "converge"
      ? Math.min(1, vjMode && !reduceMotion ? 0.96 : 0.82)
      : 0,
  }, energy, target);
  const signal = numericColor(palette.signal, target.orbs[0]?.color ?? target.paper);
  const signalAlt = numericColor(palette.signalAlt, target.rails[0]?.color ?? target.paper);
  target.background = numericColor(palette.ground, target.background);
  target.shadow = numericColor(palette.groundLift, target.shadow);
  target.paper = numericColor(palette.ink, target.paper);
  for (let index = 0; index < target.particles.length; index += 1) {
    target.particles[index]!.color = index % 3 === 0 ? signalAlt : signal;
  }
  for (let index = 0; index < target.rails.length; index += 1) {
    target.rails[index]!.color = index % 2 === 0 ? signal : signalAlt;
  }
  for (let index = 0; index < target.orbs.length; index += 1) {
    target.orbs[index]!.color = index % 2 === 0 ? signal : signalAlt;
  }
  return target;
};

export const sampleStageAmbientIntoV1 = (
  plan: DirectorPlanV1,
  timeMs: number,
  sectionIntensity: number,
  reduceMotion: boolean,
  target: StageAmbientFrameV1,
): StageAmbientFrameV1 => {
  const world = plan.world;
  const baseOpacity = plan.source === "local"
    ? 0.08 + clamp01(world.atmosphere) * 0.14
    : 0.18 + clamp01(world.atmosphere) * 0.3;
  target.motifOpacity = baseOpacity * (0.82 + clamp01(sectionIntensity) * 0.18);

  const primaryProgress = alternateProgress(timeMs, 22_000);
  target.washPrimaryTranslateXPct = threePoint(primaryProgress, 0.48, -1.4, 1.1, 0.3);
  target.washPrimaryTranslateYPct = threePoint(primaryProgress, 0.48, 0.8, -0.9, 1.1);
  target.washPrimaryScale = threePoint(primaryProgress, 0.48, 1.12, 1.16, 1.14);
  target.washPrimaryRotationDeg = threePoint(primaryProgress, 0.48, -0.22, 0.16, 0.24);

  const secondaryProgress = alternateProgress(timeMs, 29_000, true);
  target.washSecondaryTranslateXPct = threePoint(secondaryProgress, 0.48, -1.4, 1.1, 0.3);
  target.washSecondaryTranslateYPct = threePoint(secondaryProgress, 0.48, 0.8, -0.9, 1.1);
  target.washSecondaryScale = threePoint(secondaryProgress, 0.48, 1.12, 1.16, 1.14);
  target.washSecondaryRotationDeg = threePoint(secondaryProgress, 0.48, -0.22, 0.16, 0.24);

  target.artworkSaturation = 1.02;
  target.artworkBrightness = 1;
  // Scene changes are editorial metadata, not a reason to re-enter the whole
  // stage. Lyric gestures carry phrase-level motion while the global geometry
  // remains a stable reading surface.
  target.sceneEnterTranslateXPct = 0;
  target.sceneEnterScale = 1;
  target.sceneEnterOpacity = 1;
  sampleWorldMotion(world.motionLaw, timeMs, world.elasticity, target);
  if (world.motionLaw === "pulse") {
    const phase = (finiteTime(timeMs) % 4_800) / 4_800;
    const pulse = (1 - Math.cos(phase * TAU)) / 2;
    const low = 0.15 + clamp01(world.atmosphere) * 0.22;
    const high = 0.22 + clamp01(world.atmosphere) * 0.34;
    target.motifOpacity = lerp(low, high, pulse) * (0.82 + clamp01(sectionIntensity) * 0.18);
  }

  if (reduceMotion) {
    target.motifTranslateXPct = 0;
    target.motifTranslateYPct = 0;
    target.motifScale = 1.08;
    target.motifRotationDeg = 0;
    target.washPrimaryTranslateXPct = 0;
    target.washPrimaryTranslateYPct = 0;
    target.washPrimaryScale = 1.12;
    target.washPrimaryRotationDeg = 0;
    target.washSecondaryTranslateXPct = 0;
    target.washSecondaryTranslateYPct = 0;
    target.washSecondaryScale = 1.12;
    target.washSecondaryRotationDeg = 0;
    target.artworkSaturation = 1.02;
    target.artworkBrightness = 1;
  }
  return target;
};

const createAmbientFrame = (): StageAmbientFrameV1 => ({
  motifTranslateXPct: 0,
  motifTranslateYPct: 0,
  motifScale: 1,
  motifRotationDeg: 0,
  motifOpacity: 0,
  washPrimaryTranslateXPct: 0,
  washPrimaryTranslateYPct: 0,
  washPrimaryScale: 1,
  washPrimaryRotationDeg: 0,
  washSecondaryTranslateXPct: 0,
  washSecondaryTranslateYPct: 0,
  washSecondaryScale: 1,
  washSecondaryRotationDeg: 0,
  artworkSaturation: 1,
  artworkBrightness: 1,
  sceneEnterTranslateXPct: 0,
  sceneEnterScale: 1,
  sceneEnterOpacity: 1,
});

const createFrame = (input: StageFrameInputV1): StageFrameV1 => ({
  generation: 0,
  playbackTimeMs: input.playbackTimeMs,
  timeMs: input.timeMs,
  plan: input.plan,
  environmentScene: input.environmentScene,
  palette: input.palette,
  reduceMotion: input.reduceMotion,
  lightweight: input.lightweight,
  vjMode: input.vjMode,
  showGuides: input.showGuides,
  reactiveBus: reactiveBusAtTimeV1(input.reactiveBus, input.playbackTimeMs),
  ambient: sampleStageAmbientIntoV1(
    input.plan,
    input.timeMs,
    input.sectionIntensity,
    input.reduceMotion,
    createAmbientFrame(),
  ),
  environment: sampleStageEnvironmentIntoV1(
    input,
    createEnvironmentFrameV1(input.environmentScene),
  ),
});

export const createStageFrameBuffersV1 = (input: StageFrameInputV1): StageFrameBuffersV1 => ({
  frames: [createFrame(input), createFrame(input)],
  generation: 0,
  writeIndex: 0,
});

export const writeStageFrameV1 = (
  buffers: StageFrameBuffersV1,
  input: StageFrameInputV1,
): StageFrameV1 => {
  const frame = buffers.frames[buffers.writeIndex];
  buffers.generation += 1;
  frame.generation = buffers.generation;
  frame.playbackTimeMs = input.playbackTimeMs;
  frame.timeMs = input.timeMs;
  frame.plan = input.plan;
  frame.environmentScene = input.environmentScene;
  frame.palette = input.palette;
  frame.reduceMotion = input.reduceMotion;
  frame.lightweight = input.lightweight;
  frame.vjMode = input.vjMode;
  frame.showGuides = input.showGuides;
  frame.reactiveBus = reactiveBusAtTimeV1(input.reactiveBus, input.playbackTimeMs);
  sampleStageAmbientIntoV1(
    input.plan, input.timeMs, input.sectionIntensity, input.reduceMotion, frame.ambient,
  );
  sampleStageEnvironmentIntoV1(input, frame.environment);
  buffers.writeIndex = buffers.writeIndex === 0 ? 1 : 0;
  return frame;
};

const transformFor = (
  translateXPct: number,
  translateYPct: number,
  scale: number,
  rotationDeg: number,
): string => `translate3d(${translateXPct.toFixed(4)}%, ${translateYPct.toFixed(4)}%, 0) scale(${scale.toFixed(5)}) rotate(${rotationDeg.toFixed(4)}deg)`;

export const applyStageFrameDOMV1 = (
  frame: StageFrameV1,
  targets: StageFrameDOMTargetsV1,
): void => {
  const { host, motif, washPrimary, washSecondary, artwork } = targets;
  const { palette, plan, ambient } = frame;
  const visualIdentity = `${plan.planIdentity}:${palette.ground}:${palette.groundLift}:${palette.signal}:${palette.signalAlt}:${palette.warm}`;
  if (host.dataset.frameVisualIdentity !== visualIdentity) {
    host.dataset.frameVisualIdentity = visualIdentity;
    host.style.background = `radial-gradient(circle at 12% 78%, ${palette.signal}26, transparent 52%), radial-gradient(circle at 86% 18%, ${palette.signalAlt}20, transparent 50%), linear-gradient(128deg, ${palette.groundLift}, ${palette.ground} 48%, ${palette.ground})`;
    host.style.setProperty("--stage-signal", palette.signal);
    host.style.setProperty("--stage-signal-alt", palette.signalAlt);
    host.style.setProperty("--stage-ground", palette.ground);
    host.style.setProperty("--stage-ink", palette.ink);
    host.style.setProperty("--stage-ink-muted", palette.inkMuted);
    host.style.setProperty("--stage-world-glow-portal", `${72 + plan.world.atmosphere * 90}px`);
    host.style.setProperty("--stage-world-glow-directed", `${90 + plan.world.atmosphere * 120}px`);
  }
  host.style.setProperty("--stage-scene-enter-x", `${ambient.sceneEnterTranslateXPct.toFixed(4)}%`);
  host.style.setProperty("--stage-scene-enter-scale", ambient.sceneEnterScale.toFixed(5));
  host.style.setProperty("--stage-scene-enter-opacity", ambient.sceneEnterOpacity.toFixed(5));
  host.dataset.directorSource = plan.source;
  host.dataset.directorVersion = plan.directorVersion;
  host.dataset.worldSpatial = plan.world.spatialMode;
  host.dataset.worldMotion = plan.world.motionLaw;
  host.dataset.worldArtwork = plan.world.artworkRole;
  host.dataset.worldTexture = plan.world.texture;
  host.dataset.reduceMotion = frame.reduceMotion ? "true" : "false";
  host.dataset.lightweight = frame.lightweight ? "true" : "false";
  host.dataset.reactiveActive = frame.reactiveBus ? "true" : "false";
  host.dataset.reactiveVisual = "off";
  host.dataset.reactiveEnergy = frame.reactiveBus?.energy.toFixed(4) ?? "0";
  host.dataset.reactiveBass = frame.reactiveBus?.bass.toFixed(4) ?? "0";
  host.dataset.reactiveOnset = frame.reactiveBus?.onset.toFixed(4) ?? "0";
  if (motif) {
    motif.style.transform = transformFor(
      ambient.motifTranslateXPct,
      ambient.motifTranslateYPct,
      ambient.motifScale,
      ambient.motifRotationDeg,
    );
    motif.style.opacity = ambient.motifOpacity.toFixed(5);
  }
  if (washPrimary) {
    washPrimary.style.transform = transformFor(
      ambient.washPrimaryTranslateXPct,
      ambient.washPrimaryTranslateYPct,
      ambient.washPrimaryScale,
      ambient.washPrimaryRotationDeg,
    );
  }
  if (washSecondary) {
    washSecondary.style.transform = transformFor(
      ambient.washSecondaryTranslateXPct,
      ambient.washSecondaryTranslateYPct,
      ambient.washSecondaryScale,
      ambient.washSecondaryRotationDeg,
    );
  }
  if (artwork) {
    artwork.style.filter = `saturate(${ambient.artworkSaturation.toFixed(5)}) brightness(${ambient.artworkBrightness.toFixed(5)})`;
  }
};
