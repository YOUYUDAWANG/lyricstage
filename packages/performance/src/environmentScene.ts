export interface EnvironmentPaletteV1 {
  background: number;
  shadow: number;
  accentA: number;
  accentB: number;
  paper: number;
}

export interface EnvironmentTuningV1 {
  intensity: number;
  bloom: number;
  drift: number;
  railOpacity: number;
}

interface EnvironmentParticleSeedV1 {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
  driftX: number;
  driftY: number;
  alpha: number;
  tone: 0 | 1;
}

interface EnvironmentRailSeedV1 {
  offset: number;
  angle: number;
  width: number;
  phase: number;
  speed: number;
  alpha: number;
  tone: 0 | 1;
}

interface EnvironmentOrbSeedV1 {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
  alpha: number;
  tone: 0 | 1;
}

export interface EnvironmentSceneV1 {
  version: "environment-scene-v1";
  id: string;
  seed: number;
  palette: EnvironmentPaletteV1;
  particles: EnvironmentParticleSeedV1[];
  rails: EnvironmentRailSeedV1[];
  orbs: EnvironmentOrbSeedV1[];
}

export interface EnvironmentParticleFrameV1 {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: number;
}

export interface EnvironmentRailFrameV1 {
  offset: number;
  angle: number;
  width: number;
  alpha: number;
  color: number;
}

export interface EnvironmentOrbFrameV1 {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: number;
}

export interface EnvironmentFrameV1 {
  background: number;
  shadow: number;
  paper: number;
  particles: EnvironmentParticleFrameV1[];
  rails: EnvironmentRailFrameV1[];
  orbs: EnvironmentOrbFrameV1[];
}

export const defaultEnvironmentTuningV1: EnvironmentTuningV1 = {
  intensity: 0.72,
  bloom: 0.66,
  drift: 0.44,
  railOpacity: 0.48,
};

const palettes: EnvironmentPaletteV1[] = [
  { background: 0x100c16, shadow: 0x050609, accentA: 0xff446f, accentB: 0x4de0ed, paper: 0xf5eee6 },
  { background: 0x07131b, shadow: 0x03070b, accentA: 0x00d1ff, accentB: 0xffcc4a, paper: 0xe8f7ff },
  { background: 0x17100c, shadow: 0x080505, accentA: 0xff7538, accentB: 0xe85dbe, paper: 0xfff1dc },
  { background: 0x0d1020, shadow: 0x04050b, accentA: 0x8a7dff, accentB: 0x77ffd1, paper: 0xf0efff },
];

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number): (() => number) => () => {
  seed |= 0;
  seed = seed + 0x6d2b79f5 | 0;
  let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
  value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const wrap01 = (value: number): number => ((value % 1) + 1) % 1;
const colorForTone = (palette: EnvironmentPaletteV1, tone: 0 | 1): number =>
  tone === 0 ? palette.accentA : palette.accentB;

export const compileEnvironmentSceneV1 = (recordingID: string, directionIdentity = ""): EnvironmentSceneV1 => {
  const seed = hashString(`${recordingID}\u0000${directionIdentity}`);
  const random = mulberry32(seed);
  const palette = palettes[seed % palettes.length]!;
  return {
    version: "environment-scene-v1",
    id: `environment:${recordingID}:${directionIdentity}`,
    seed,
    palette,
    particles: Array.from({ length: 42 }, () => ({
      x: random(),
      y: random(),
      radius: 0.0018 + random() * 0.0062,
      phase: random() * Math.PI * 2,
      speed: 0.22 + random() * 0.55,
      driftX: (random() - 0.5) * 0.24,
      driftY: (random() - 0.5) * 0.18,
      alpha: 0.18 + random() * 0.42,
      tone: random() > 0.48 ? 1 : 0,
    })),
    rails: Array.from({ length: 7 }, () => ({
      offset: random(),
      angle: -0.28 + random() * 0.56,
      width: 0.0007 + random() * 0.0022,
      phase: random() * Math.PI * 2,
      speed: 0.028 + random() * 0.072,
      alpha: 0.12 + random() * 0.24,
      tone: random() > 0.5 ? 1 : 0,
    })),
    orbs: Array.from({ length: 4 }, () => ({
      x: 0.08 + random() * 0.84,
      y: 0.08 + random() * 0.84,
      radius: 0.17 + random() * 0.28,
      phase: random() * Math.PI * 2,
      speed: 0.12 + random() * 0.2,
      alpha: 0.14 + random() * 0.2,
      tone: random() > 0.5 ? 1 : 0,
    })),
  };
};

export const createEnvironmentFrameV1 = (scene: EnvironmentSceneV1): EnvironmentFrameV1 => ({
  background: scene.palette.background,
  shadow: scene.palette.shadow,
  paper: scene.palette.paper,
  particles: scene.particles.map(() => ({ x: 0, y: 0, radius: 0, alpha: 0, color: 0 })),
  rails: scene.rails.map(() => ({ offset: 0, angle: 0, width: 0, alpha: 0, color: 0 })),
  orbs: scene.orbs.map(() => ({ x: 0, y: 0, radius: 0, alpha: 0, color: 0 })),
});

export const sampleEnvironmentSceneIntoV1 = (
  scene: EnvironmentSceneV1,
  timeMs: number,
  tuning: EnvironmentTuningV1,
  structureEnergy: number,
  target: EnvironmentFrameV1,
): EnvironmentFrameV1 => {
  if (
    target.particles.length !== scene.particles.length
    || target.rails.length !== scene.rails.length
    || target.orbs.length !== scene.orbs.length
  ) throw new Error("environment-frame-shape-mismatch");
  const time = Math.max(0, timeMs) / 1000;
  const intensity = clamp01(tuning.intensity) * (0.52 + clamp01(structureEnergy) * 0.48);
  const drift = clamp01(tuning.drift);
  target.background = scene.palette.background;
  target.shadow = scene.palette.shadow;
  target.paper = scene.palette.paper;
  for (let index = 0; index < scene.particles.length; index += 1) {
    const particle = scene.particles[index]!;
    const output = target.particles[index]!;
    const pulse = 0.55 + Math.sin(time * particle.speed * 2.4 + particle.phase) * 0.45;
    output.x = wrap01(particle.x + Math.sin(time * particle.speed + particle.phase) * particle.driftX * drift);
    output.y = wrap01(particle.y + Math.cos(time * particle.speed * 0.74 + particle.phase) * particle.driftY * drift);
    output.radius = particle.radius * (0.8 + pulse * 0.38);
    output.alpha = clamp01(particle.alpha * pulse * intensity);
    output.color = colorForTone(scene.palette, particle.tone);
  }
  for (let index = 0; index < scene.rails.length; index += 1) {
    const rail = scene.rails[index]!;
    const output = target.rails[index]!;
    output.offset = wrap01(rail.offset + time * rail.speed * drift + Math.sin(time * 0.08 + rail.phase) * 0.025);
    output.angle = rail.angle;
    output.width = rail.width;
    output.alpha = clamp01(rail.alpha * intensity * clamp01(tuning.railOpacity));
    output.color = colorForTone(scene.palette, rail.tone);
  }
  for (let index = 0; index < scene.orbs.length; index += 1) {
    const orb = scene.orbs[index]!;
    const output = target.orbs[index]!;
    output.x = clamp01(orb.x + Math.sin(time * orb.speed + orb.phase) * 0.08 * drift);
    output.y = clamp01(orb.y + Math.cos(time * orb.speed * 0.82 + orb.phase) * 0.06 * drift);
    output.radius = orb.radius * (0.92 + Math.sin(time * orb.speed * 1.7 + orb.phase) * 0.08);
    output.alpha = clamp01(orb.alpha * intensity * clamp01(tuning.bloom));
    output.color = colorForTone(scene.palette, orb.tone);
  }
  return target;
};

export const sampleEnvironmentSceneV1 = (
  scene: EnvironmentSceneV1,
  timeMs: number,
  tuning: EnvironmentTuningV1 = defaultEnvironmentTuningV1,
  structureEnergy = 0.6,
): EnvironmentFrameV1 => {
  return sampleEnvironmentSceneIntoV1(
    scene,
    timeMs,
    tuning,
    structureEnergy,
    createEnvironmentFrameV1(scene),
  );
};
