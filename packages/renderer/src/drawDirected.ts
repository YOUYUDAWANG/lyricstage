import {
  directorSectionAtV1,
  effectPrimitiveRegistryV1,
  effectRecipeAtV1,
  stagePresentationAtV1,
  type EffectPrimitiveUseV1,
  type PerformanceBehaviorV1,
} from "@lyricstage/performance";
import type {
  DirectedStagePaletteV1,
  DrawDirectedStageOptionsV1,
  PreparedDirectedGlyphV1,
  PreparedDirectedLineV1,
  PreparedDirectedStageV1,
  PreparedLyricGestureV1,
} from "./directedTypes";
import { paletteColorForRoleV1 } from "./directedTypes";
import { directedPaletteForIndexV1 } from "./prepareDirected";
import { drawDramaticScenesV1 } from "./drawDramatic";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;
const easeOutBack = (value: number): number => {
  const amount = 1.70158;
  const shifted = value - 1;
  return 1 + (amount + 1) * shifted ** 3 + amount * shifted ** 2;
};

const withAlpha = (hex: string, alpha: number): string => {
  if (/^#[\da-f]{6}$/i.test(hex)) {
    const red = Number.parseInt(hex.slice(1, 3), 16);
    const green = Number.parseInt(hex.slice(3, 5), 16);
    const blue = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${red},${green},${blue},${alpha})`;
  }
  return hex;
};

export const dissolveEnvelopeAtV1 = (
  fromMs: number,
  toMs: number,
  timeMs: number,
  reduceMotion: boolean,
): number => {
  if (timeMs < fromMs || timeMs >= toMs) return 0;
  if (reduceMotion) return 0.28;
  const enter = easeOutCubic(clamp01((timeMs - fromMs) / 1_200));
  const leave = easeOutCubic(clamp01((toMs - timeMs) / 1_800));
  return enter * leave;
};

export const reducedMotionPrimitiveUseV1 = (
  use: EffectPrimitiveUseV1,
): EffectPrimitiveUseV1 => {
  const fallback = effectPrimitiveRegistryV1[use.primitive].reduceMotionFallback;
  if (!fallback) return use;
  return {
    primitive: fallback,
    intensity: use.intensity,
  };
};

const activeLinesAt = (stage: PreparedDirectedStageV1, timeMs: number): PreparedDirectedLineV1[] =>
  stage.lines.filter((line) => timeMs >= line.fromMs && timeMs < line.toMs);

const drawEditorialField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  palette: DirectedStagePaletteV1,
  intensity: number,
): void => {
  const { width, height } = stage.viewport;
  context.save();
  const wash = context.createLinearGradient(width * 0.08, height * 0.18, width * 0.88, height * 0.78);
  wash.addColorStop(0, withAlpha(palette.signal, 0.035 + intensity * 0.018));
  wash.addColorStop(0.48, withAlpha(palette.signalAlt, 0.012));
  wash.addColorStop(1, withAlpha(palette.ground, 0));
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);
  context.restore();
};

const drawNeonField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  palette: DirectedStagePaletteV1,
  timeMs: number,
  reduceMotion: boolean,
): void => {
  const { width, height } = stage.viewport;
  const travel = reduceMotion ? 0 : (timeMs % 8000) / 8000;
  context.save();
  context.lineCap = "round";
  [0.22, 0.78].forEach((y, index) => {
    const gradient = context.createLinearGradient(width * 0.04, 0, width * 0.96, 0);
    gradient.addColorStop(0, withAlpha(index ? palette.signalAlt : palette.signal, 0));
    gradient.addColorStop(clamp01(0.25 + travel * 0.5), withAlpha(index ? palette.signalAlt : palette.signal, 0.72));
    gradient.addColorStop(1, withAlpha(index ? palette.signalAlt : palette.signal, 0.04));
    context.strokeStyle = gradient;
    context.lineWidth = Math.max(2, height * (index ? 0.003 : 0.006));
    context.beginPath();
    context.moveTo(width * 0.04, height * y);
    context.lineTo(width * 0.96, height * (y + (index ? -0.08 : 0.05)));
    context.stroke();
  });
  context.restore();
};

const drawPaperField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  palette: DirectedStagePaletteV1,
  timeMs: number,
  reduceMotion: boolean,
): void => {
  const { width, height } = stage.viewport;
  context.save();
  const drift = reduceMotion ? 0 : Math.sin(timeMs / 2600) * height * 0.018;
  const light = context.createLinearGradient(0, height * 0.2, width, height * 0.8);
  light.addColorStop(0, withAlpha(palette.signal, 0.06));
  light.addColorStop(0.42, withAlpha(palette.ink, 0.018));
  light.addColorStop(1, withAlpha(palette.signalAlt, 0));
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);
  context.lineWidth = 1;
  context.setLineDash([height * 0.025, height * 0.045]);
  [0.3, 0.53, 0.72].forEach((y, index) => {
    context.strokeStyle = index === 1 ? withAlpha(palette.signal, 0.09) : withAlpha(palette.signalAlt, 0.055);
    context.beginPath();
    context.moveTo(width * (0.13 + index * 0.06), height * y + drift * (index - 1));
    context.quadraticCurveTo(width * 0.5, height * (y - 0.035), width * (0.76 + index * 0.04), height * (y + 0.018));
    context.stroke();
  });
  context.restore();
};

const drawLiquidField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  palette: DirectedStagePaletteV1,
  timeMs: number,
  reduceMotion: boolean,
): void => {
  const { width, height } = stage.viewport;
  const motion = reduceMotion ? 0 : timeMs / 2600;
  context.save();
  [[0.26, 0.38, 0.24], [0.76, 0.61, 0.31], [0.52, 0.18, 0.17]].forEach(([x, y, radius], index) => {
    const cx = width * (x! + Math.sin(motion + index * 2.1) * 0.018);
    const cy = height * (y! + Math.cos(motion * 0.8 + index) * 0.025);
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * radius!);
    gradient.addColorStop(0, withAlpha(index % 2 ? palette.signalAlt : palette.signal, 0.12));
    gradient.addColorStop(1, withAlpha(palette.ground, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cx, cy, Math.max(width, height) * radius!, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
};

const drawMonoField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  palette: DirectedStagePaletteV1,
  intensity: number,
): void => {
  const { width, height } = stage.viewport;
  context.save();
  const vignette = context.createRadialGradient(
    width * 0.54,
    height * 0.47,
    Math.min(width, height) * 0.08,
    width * 0.54,
    height * 0.47,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, withAlpha(palette.ink, 0.018 + intensity * 0.018));
  vignette.addColorStop(0.52, withAlpha(palette.ground, 0.04));
  vignette.addColorStop(1, withAlpha(palette.ground, 0));
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  context.restore();
};

const drawCelestialField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  palette: DirectedStagePaletteV1,
  timeMs: number,
  reduceMotion: boolean,
): void => {
  const { width, height } = stage.viewport;
  context.save();
  context.fillStyle = palette.signalAlt;
  context.globalAlpha = 0.24;
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const pulse = reduceMotion ? 1 : 0.65 + Math.sin(timeMs / 900 + row * 0.7 + column) * 0.35;
      context.beginPath();
      context.arc(width * (0.07 + column * 0.078), height * (0.12 + row * 0.125), Math.max(0.7, height * 0.0015 * pulse), 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
};

const drawStructuralField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  timeMs: number,
  reduceMotion: boolean,
  palette: DirectedStagePaletteV1,
): void => {
  const section = directorSectionAtV1(stage.plan, timeMs);
  if (section.artDirection === "editorialKinetic") drawEditorialField(context, stage, palette, section.intensity);
  if (section.artDirection === "neonRail") drawNeonField(context, stage, palette, timeMs, reduceMotion);
  if (section.artDirection === "paperCut") drawPaperField(context, stage, palette, timeMs, reduceMotion);
  if (section.artDirection === "liquidMemory") drawLiquidField(context, stage, palette, timeMs, reduceMotion);
  if (section.artDirection === "monoImpact") drawMonoField(context, stage, palette, section.intensity);
  if (section.artDirection === "celestialGrid") drawCelestialField(context, stage, palette, timeMs, reduceMotion);
};

const drawPrimitiveField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  use: EffectPrimitiveUseV1,
  timeMs: number,
  reduceMotion: boolean,
  palette: DirectedStagePaletteV1,
  support = false,
): void => {
  const { width, height } = stage.viewport;
  const intensity = use.intensity * (support ? 0.58 : 1);
  const phase = reduceMotion ? 0 : Math.sin(timeMs / 1800) * 0.035;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  if (use.primitive === "field.aperture") {
    const gradient = context.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, width * 0.54);
    gradient.addColorStop(0, withAlpha(palette.ground, 0));
    gradient.addColorStop(0.46, withAlpha(palette.ground, 0.16 + intensity * 0.18));
    gradient.addColorStop(1, withAlpha(palette.ground, 0.54));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  } else if (use.primitive === "field.ribbon") {
    const direction = use.direction ?? 1;
    const scale = use.scale ?? 1;
    const travel = reduceMotion ? 0 : Math.sin(timeMs / 1650) * width * 0.055;
    for (let index = 0; index < 4; index += 1) {
      const y = height * (0.24 + index * 0.17);
      const color = index % 2 === 0 ? palette.signal : palette.signalAlt;
      context.strokeStyle = withAlpha(color, 0.16 + intensity * (0.18 + index * 0.022));
      context.lineWidth = Math.max(1.8, height * (0.0032 + index * 0.0008) * scale);
      context.beginPath();
      context.moveTo(-width * 0.08, y + travel * direction);
      context.bezierCurveTo(
        width * 0.24,
        y - height * (0.13 + index * 0.015) * direction,
        width * 0.68,
        y + height * (0.12 - index * 0.012) * direction,
        width * 1.08,
        y - travel * direction,
      );
      context.stroke();
    }
  } else if (use.primitive === "field.prism") {
    const shift = reduceMotion ? 0 : Math.sin(timeMs / 2100) * width * 0.018;
    const gradient = context.createLinearGradient(width * 0.18, height * 0.18, width * 0.82, height * 0.78);
    gradient.addColorStop(0, withAlpha(palette.signal, 0));
    gradient.addColorStop(0.42, withAlpha(palette.ink, 0.035 + intensity * 0.07));
    gradient.addColorStop(0.66, withAlpha(palette.signalAlt, 0.04 + intensity * 0.12));
    gradient.addColorStop(1, withAlpha(palette.signalAlt, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(width * 0.12 + shift, height * 0.78);
    context.lineTo(width * 0.58 + shift, height * 0.10);
    context.lineTo(width * 0.88 + shift, height * 0.68);
    context.closePath();
    context.fill();
  } else if (use.primitive === "field.rain") {
    const direction = use.direction ?? 1;
    const travel = reduceMotion ? 0 : (timeMs % 2400) / 2400;
    context.strokeStyle = withAlpha(palette.signalAlt, 0.05 + intensity * 0.11);
    context.lineWidth = Math.max(0.8, height * 0.0013);
    for (let index = 0; index < 22; index += 1) {
      const x = width * ((index * 0.173 + travel * 0.18) % 1.16 - 0.08);
      const y = height * ((index * 0.317 + travel) % 1.18 - 0.09);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + width * 0.018 * direction, y + height * (0.05 + (index % 4) * 0.012));
      context.stroke();
    }
  } else if (use.primitive === "geometry.converge") {
    context.strokeStyle = withAlpha(palette.signal, 0.24 + intensity * 0.34);
    context.lineWidth = Math.max(1.6, height * 0.0034);
    [-1, 1].forEach((direction) => {
      context.beginPath();
      context.moveTo(width * (direction < 0 ? 0.04 : 0.96), height * (0.25 - phase * direction));
      context.quadraticCurveTo(width * (0.5 - direction * 0.12), height * 0.5, width * 0.5, height * 0.5);
      context.stroke();
    });
  } else if (use.primitive === "geometry.expand") {
    context.strokeStyle = withAlpha(palette.signalAlt, 0.2 + intensity * 0.28);
    context.lineWidth = Math.max(1.5, height * 0.0028);
    for (let ring = 1; ring <= 3; ring += 1) {
      context.beginPath();
      context.ellipse(width * 0.5, height * 0.5, width * (0.09 + ring * 0.1 + phase), height * (0.08 + ring * 0.07 + phase), 0, 0, Math.PI * 2);
      context.stroke();
    }
  } else if (use.primitive === "geometry.mirror") {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, withAlpha(palette.signal, 0));
    gradient.addColorStop(0.5, withAlpha(palette.ink, 0.34 * intensity));
    gradient.addColorStop(1, withAlpha(palette.signalAlt, 0));
    context.fillStyle = gradient;
    context.fillRect(width * 0.08, height * 0.498, width * 0.84, Math.max(1, height * 0.002));
  } else if (use.primitive === "geometry.cut") {
    context.strokeStyle = withAlpha(palette.warm, 0.2 + intensity * 0.23);
    context.lineWidth = Math.max(2, height * 0.004);
    context.beginPath();
    context.moveTo(width * 0.16, height * 0.82);
    context.lineTo(width * 0.84, height * 0.18);
    context.stroke();
  } else if (use.primitive === "geometry.suspend") {
    context.strokeStyle = withAlpha(palette.signalAlt, 0.18 + intensity * 0.18);
    context.lineWidth = 1;
    context.setLineDash([height * 0.01, height * 0.014]);
    context.beginPath();
    context.moveTo(width * 0.28, height * (0.49 + phase));
    context.lineTo(width * 0.72, height * (0.49 + phase));
    context.stroke();
  } else if (use.primitive === "geometry.orbit") {
    const scale = use.scale ?? 1;
    const rotation = reduceMotion ? 0 : timeMs / 7200 * Math.PI * 2 * (use.direction ?? 1);
    context.strokeStyle = withAlpha(palette.signalAlt, 0.08 + intensity * 0.18);
    context.lineWidth = Math.max(1, height * 0.0017);
    context.translate(width * 0.5, height * 0.5);
    context.rotate(rotation * 0.08);
    for (let ring = 0; ring < 3; ring += 1) {
      context.beginPath();
      context.ellipse(0, 0, width * (0.16 + ring * 0.09) * scale, height * (0.10 + ring * 0.055) * scale, ring * 0.46, 0.18, Math.PI * 1.72);
      context.stroke();
    }
    const dotRadius = Math.max(2, height * 0.006 * intensity);
    context.fillStyle = withAlpha(palette.signal, 0.36 + intensity * 0.34);
    context.beginPath();
    context.arc(Math.cos(rotation) * width * 0.28 * scale, Math.sin(rotation) * height * 0.18 * scale, dotRadius, 0, Math.PI * 2);
    context.fill();
  } else if (use.primitive === "density.lift") {
    context.fillStyle = withAlpha(palette.signal, 0.14 + intensity * 0.2);
    for (let index = 0; index < 18; index += 1) {
      const x = width * (0.08 + (index % 6) * 0.17);
      const y = height * (0.18 + Math.floor(index / 6) * 0.31 + phase * ((index % 3) - 1));
      context.fillRect(x, y, width * 0.06, Math.max(1, height * 0.003));
    }
  } else if (use.primitive === "density.release") {
    const gradient = context.createLinearGradient(0, height * 0.2, 0, height * 0.86);
    gradient.addColorStop(0, withAlpha(palette.ground, 0));
    gradient.addColorStop(1, withAlpha(palette.ground, 0.48 * intensity));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  } else if (use.primitive === "motif.recall" || use.primitive === "memory.echo" || use.primitive === "memory.trail") {
    context.strokeStyle = withAlpha(palette.signalAlt, (use.primitive === "memory.echo" ? 0.18 : 0.13) + intensity * 0.24);
    context.lineWidth = Math.max(1.4, height * (0.0014 + intensity * 0.0012));
    const positions = use.primitive === "memory.trail" ? [0.12, 0.31, 0.5, 0.69, 0.88] : [0.18, 0.5, 0.82];
    positions.forEach((x, index) => {
      context.beginPath();
      context.arc(width * x, height * (0.5 + phase * (index - (positions.length - 1) / 2)), height * (0.026 + index * 0.011), 0.15, Math.PI * 1.55);
      context.stroke();
    });
  } else if (use.primitive === "transition.bloom") {
    const sectionProgress = clamp01((timeMs - (effectRecipeAtV1(stage.plan.effects, timeMs)?.fromMs ?? timeMs)) / 1100);
    const radius = Math.max(width, height) * (0.12 + sectionProgress * 0.82);
    const gradient = context.createRadialGradient(width * 0.5, height * 0.52, 0, width * 0.5, height * 0.52, radius);
    gradient.addColorStop(0, withAlpha(palette.ink, (1 - sectionProgress) * (0.08 + intensity * 0.13)));
    gradient.addColorStop(0.42, withAlpha(palette.signal, (1 - sectionProgress) * (0.05 + intensity * 0.11)));
    gradient.addColorStop(1, withAlpha(palette.signalAlt, 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  } else if (use.primitive === "transition.dissolve") {
    const recipe = effectRecipeAtV1(stage.plan.effects, timeMs);
    const envelope = recipe ? dissolveEnvelopeAtV1(recipe.fromMs, recipe.toMs, timeMs, reduceMotion) : 0;
    if (envelope > 0) {
      const direction = use.direction ?? 1;
      const veil = context.createLinearGradient(
        width * (direction > 0 ? 0.08 : 0.92),
        height * 0.12,
        width * (direction > 0 ? 0.92 : 0.08),
        height * 0.88,
      );
      veil.addColorStop(0, withAlpha(palette.ground, 0));
      veil.addColorStop(0.44, withAlpha(palette.ground, envelope * (0.025 + intensity * 0.035)));
      veil.addColorStop(0.76, withAlpha(palette.signalAlt, envelope * (0.018 + intensity * 0.028)));
      veil.addColorStop(1, withAlpha(palette.ground, 0));
      context.fillStyle = veil;
      context.fillRect(0, 0, width, height);

      const absence = context.createRadialGradient(
        width * 0.54,
        height * 0.48,
        Math.min(width, height) * 0.08,
        width * 0.54,
        height * 0.48,
        Math.max(width, height) * 0.68,
      );
      absence.addColorStop(0, withAlpha(palette.ground, 0));
      absence.addColorStop(0.58, withAlpha(palette.ground, envelope * 0.018));
      absence.addColorStop(1, withAlpha(palette.ground, envelope * (0.08 + intensity * 0.09)));
      context.fillStyle = absence;
      context.fillRect(0, 0, width, height);
    }
  }
  context.restore();
};

const drawEffectField = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  timeMs: number,
  reduceMotion: boolean,
  palette: DirectedStagePaletteV1,
): void => {
  const recipe = effectRecipeAtV1(stage.plan.effects, timeMs);
  if (!recipe) return;
  const resolvedUses = [recipe.primary, ...recipe.support]
    .map((use) => reduceMotion ? reducedMotionPrimitiveUseV1(use) : use);
  const drawn = new Set<string>();
  resolvedUses.forEach((use, index) => {
    if (use.primitive === "cover.island" || drawn.has(use.primitive)) return;
    drawn.add(use.primitive);
    drawPrimitiveField(context, stage, use, timeMs, reduceMotion, palette, index > 0);
  });
};

const transformFor = (
  behavior: PerformanceBehaviorV1,
  glyph: PreparedDirectedGlyphV1,
  line: PreparedDirectedLineV1,
  progress: number,
  timeMs: number,
  reduceMotion: boolean,
): { x: number; y: number; scaleX: number; scaleY: number; rotation: number; alpha: number; blur: number } => {
  if (reduceMotion) return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, blur: 0 };
  if (behavior === "settle") return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, blur: 0 };
  const eased = behavior === "gravityDrop" ? easeOutBack(progress) : easeOutCubic(progress);
  const remainder = 1 - eased;
  const amount = 36 + line.directive.intensity * 72;
  const direction = line.directive.direction;
  if (behavior === "assemble") {
    return { x: remainder * direction * amount * (glyph.index % 2 ? -1 : 1), y: remainder * ((glyph.index % 3) - 1) * 28, scaleX: 1, scaleY: 1, rotation: remainder * direction * 0.045, alpha: 0.42 + eased * 0.58, blur: 0 };
  }
  if (behavior === "gravityDrop") {
    return { x: 0, y: -remainder * amount * 1.9, scaleX: 1, scaleY: 0.86 + eased * 0.14, rotation: 0, alpha: 0.4 + progress * 0.6, blur: 0 };
  }
  if (behavior === "ripple") {
    const wave = Math.sin(glyph.index * 0.72 + timeMs * 0.012) * amount * 0.18 * (0.3 + remainder * 0.7);
    return { x: 0, y: wave, scaleX: 1, scaleY: 1, rotation: wave * 0.0015, alpha: 1, blur: 0 };
  }
  if (behavior === "stretch") {
    return { x: 0, y: 0, scaleX: 0.62 + eased * 0.38, scaleY: 1.08 - eased * 0.08, rotation: 0, alpha: 0.62 + eased * 0.38, blur: 0 };
  }
  if (behavior === "echo") {
    return { x: 0, y: -remainder * amount * 0.12, scaleX: 0.94 + eased * 0.06, scaleY: 0.94 + eased * 0.06, rotation: 0, alpha: 0.7 + eased * 0.3, blur: 0 };
  }
  if (behavior === "drift") {
    return { x: direction * remainder * amount, y: remainder * amount * 0.45, scaleX: 1, scaleY: 1, rotation: direction * remainder * 0.03, alpha: 0.44 + eased * 0.56, blur: 0 };
  }
  if (behavior === "focus") {
    return { x: 0, y: remainder * 14, scaleX: 0.86 + eased * 0.14, scaleY: 0.86 + eased * 0.14, rotation: 0, alpha: 0.34 + eased * 0.66, blur: remainder * 16 };
  }
  if (behavior === "converge") {
    const center = line.bounds.x + line.bounds.width / 2;
    const side = glyph.x + glyph.width / 2 < center ? -1 : 1;
    return { x: side * remainder * amount * 1.65, y: 0, scaleX: 0.88 + eased * 0.12, scaleY: 1, rotation: -side * remainder * 0.04, alpha: 0.42 + eased * 0.58, blur: 0 };
  }
  return { x: 0, y: remainder * amount * 0.34, scaleX: 0.98 + eased * 0.02, scaleY: 0.98 + eased * 0.02, rotation: 0, alpha: 0.62 + eased * 0.38, blur: 0 };
};

const drawLine = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  line: PreparedDirectedLineV1,
  timeMs: number,
  palette: DirectedStagePaletteV1,
  reduceMotion: boolean,
  opacity = 1,
  overrideColor?: string,
  offsetX = 0,
  offsetY = 0,
  scale = 1,
  behaviorOverride?: PerformanceBehaviorV1,
): void => {
  const duration = Math.max(380, 760 - line.directive.intensity * 210);
  const baseColor = overrideColor ?? paletteColorForRoleV1(palette, line.directive.paletteRole);
  context.save();
  context.font = line.font;
  context.textBaseline = "alphabetic";
  context.fillStyle = baseColor;
  context.translate(offsetX, offsetY);
  context.scale(scale, scale);
  for (const glyph of line.glyphs) {
    if (timeMs < glyph.revealMs) continue;
    const staggerMs = line.directive.glyphStagger * 1000 * Math.min(glyph.index, 12);
    const progress = clamp01((timeMs - line.fromMs - staggerMs * 0.32) / duration);
    const revealOpacity = clamp01((timeMs - glyph.revealMs + 1) / 105);
    const transform = transformFor(behaviorOverride ?? line.directive.behavior, glyph, line, progress, timeMs, reduceMotion);
    context.save();
    context.globalAlpha = opacity * revealOpacity * transform.alpha;
    context.shadowColor = transform.blur > 0 ? baseColor : "transparent";
    context.shadowBlur = transform.blur;
    context.translate(glyph.x + transform.x, glyph.y + transform.y);
    context.rotate(transform.rotation);
    context.scale(transform.scaleX, transform.scaleY);
    context.fillText(glyph.text, 0, 0);
    context.restore();
  }
  context.restore();
};

const drawCounterpoint = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  active: PreparedDirectedLineV1[],
  timeMs: number,
  palette: DirectedStagePaletteV1,
  reduceMotion: boolean,
): void => {
  const { width, height } = stage.viewport;
  const first = active[0];
  if (!first) return;
  const previous = stage.linesByIndex.get(first.lineIndex - 1);
  if (previous) {
    const scale = Math.min(0.36, (width * 0.29) / Math.max(1, previous.bounds.width));
    drawLine(context, stage, previous, Number.POSITIVE_INFINITY, palette, true, 0.11, palette.inkMuted, width * 0.69 - previous.bounds.x * scale, height * 0.17 - previous.bounds.y * scale, scale);
  }
  if (first.directive.behavior === "echo" || first.repetitionCount > 1) {
    const residues = [
      { x: 0.12, y: 0.18, scale: 0.42, alpha: 0.12, color: palette.signalAlt },
      { x: 0.63, y: 0.74, scale: 0.31, alpha: 0.09, color: palette.signal },
      { x: 0.48, y: 0.24, scale: 0.55, alpha: 0.06, color: palette.warm },
    ];
    residues.slice(0, Math.min(3, Math.max(1, first.repetitionIndex + 1))).forEach((residue, index) => {
      const floatY = reduceMotion ? 0 : Math.sin(timeMs / 1300 + index) * height * 0.008;
      drawLine(context, stage, first, Number.POSITIVE_INFINITY, palette, true, residue.alpha, residue.color, width * residue.x - first.bounds.x * residue.scale, height * residue.y - first.bounds.y * residue.scale + floatY, residue.scale);
    });
  }
};

const drawAnchoredLine = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  line: PreparedDirectedLineV1,
  timeMs: number,
  palette: DirectedStagePaletteV1,
  reduceMotion: boolean,
  targetX: number,
  targetY: number,
  maxWidth: number,
  maxHeight: number,
  scaleCap: number,
  opacity: number,
  color?: string,
  behaviorOverride?: PerformanceBehaviorV1,
  horizontalAnchor: "center" | "leading" | "trailing" = "center",
): void => {
  const behavior = behaviorOverride ?? line.directive.behavior;
  const motionAmount = reduceMotion ? 0 : 24 + line.directive.intensity * 48;
  const horizontalReserve = behavior === "converge"
    ? motionAmount * 1.35
    : behavior === "assemble" || behavior === "drift"
      ? motionAmount
      : 0;
  const { scale, offsetX, offsetY } = fitAnchoredLineV1(
    stage.viewport,
    line.bounds,
    targetX,
    targetY,
    Math.max(1, maxWidth - horizontalReserve * 2),
    maxHeight,
    scaleCap,
    horizontalAnchor,
  );
  drawLine(context, stage, line, timeMs, palette, reduceMotion, opacity, color, offsetX, offsetY, scale, behaviorOverride);
};

export interface AnchoredLineTransformV1 {
  scale: number;
  offsetX: number;
  offsetY: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const fitAnchoredLineV1 = (
  viewport: { width: number; height: number },
  bounds: { x: number; y: number; width: number; height: number },
  targetX: number,
  targetY: number,
  maxWidth: number,
  maxHeight: number,
  scaleCap: number,
  horizontalAnchor: "center" | "leading" | "trailing" = "center",
): AnchoredLineTransformV1 => {
  const insetX = viewport.width * 0.055;
  const insetY = viewport.height * 0.055;
  const safeWidth = Math.max(1, viewport.width - insetX * 2);
  const safeHeight = Math.max(1, viewport.height - insetY * 2);
  const scale = Math.max(0.01, Math.min(
    scaleCap,
    Math.min(maxWidth, safeWidth) / Math.max(1, bounds.width),
    Math.min(maxHeight, safeHeight) / Math.max(1, bounds.height),
  ));
  const renderedWidth = bounds.width * scale;
  const renderedHeight = bounds.height * scale;
  const desiredCenterX = horizontalAnchor === "leading"
    ? targetX + renderedWidth / 2
    : horizontalAnchor === "trailing"
      ? targetX - renderedWidth / 2
      : targetX;
  const centerX = Math.min(
    viewport.width - insetX - renderedWidth / 2,
    Math.max(insetX + renderedWidth / 2, desiredCenterX),
  );
  const centerY = Math.min(viewport.height - insetY - renderedHeight / 2, Math.max(insetY + renderedHeight / 2, targetY));
  const offsetX = centerX - (bounds.x + bounds.width / 2) * scale;
  const offsetY = centerY - (bounds.y + bounds.height / 2) * scale;
  return {
    scale,
    offsetX,
    offsetY,
    left: bounds.x * scale + offsetX,
    top: bounds.y * scale + offsetY,
    right: (bounds.x + bounds.width) * scale + offsetX,
    bottom: (bounds.y + bounds.height) * scale + offsetY,
  };
};

export interface ReadingCompositionV1 {
  axisX: number;
  horizontalAnchor: "center" | "leading" | "trailing";
  currentX: number;
  currentY: number;
  currentWidth: number;
  previousX: number;
  previousY: number;
  nextX: number;
  nextY: number;
  adjacentWidth: number;
}

export const readingCompositionForV1 = (
  line: PreparedDirectedLineV1,
  viewport: { width: number; height: number },
  directorSource: "local" | "ai" | "cache" = "local",
): ReadingCompositionV1 => {
  const { width, height } = viewport;
  const layout = line.section.layout;
  const directed = directorSource === "ai" || directorSource === "cache";
  const trailing = directed && (layout === "railTrailing"
    || ((layout === "duetDivide" || layout === "editorialSplit")
      && (line.voiceRole === "duetB" || line.directive.alignment === "trailing")));
  const horizontalAnchor = !directed
    ? "leading"
    : layout === "monument"
    ? "center"
    : trailing
      ? "trailing"
      : "leading";
  const axisX = width * (horizontalAnchor === "center" ? 0.50 : horizontalAnchor === "trailing" ? 0.91 : 0.09);
  const currentY = !directed
    ? height * 0.50
    : layout === "duetDivide"
    ? height * (trailing ? 0.62 : 0.43)
    : layout === "editorialSplit"
      ? height * (trailing ? 0.59 : 0.45)
      : layout.startsWith("rail")
        ? height * 0.56
        : height * 0.52;
  return {
    axisX,
    horizontalAnchor,
    currentX: axisX,
    currentY,
    currentWidth: width * 0.80,
    previousX: axisX,
    previousY: Math.max(height * 0.20, currentY - height * 0.285),
    nextX: axisX,
    nextY: Math.min(height * 0.82, currentY + height * 0.275),
    adjacentWidth: width * 0.84,
  };
};

export interface ReadingStackStateV1 {
  previousY: number;
  currentY: number;
  nextY: number;
  previousScale: number;
  currentScale: number;
  nextScale: number;
  previousOpacity: number;
  currentOpacity: number;
  nextOpacity: number;
}

export const readingStackStateAtV1 = (
  current: PreparedDirectedLineV1,
  composition: ReadingCompositionV1,
  timeMs: number,
  hasPrevious: boolean,
  reduceMotion: boolean,
): ReadingStackStateV1 => {
  const raw = reduceMotion || !hasPrevious ? 1 : clamp01((timeMs - current.fromMs) / 760);
  const progress = easeOutCubic(raw);
  const mix = (from: number, to: number) => from + (to - from) * progress;
  return {
    previousY: mix(composition.currentY, composition.previousY),
    currentY: mix(composition.nextY, composition.currentY),
    nextY: mix(composition.nextY + (composition.nextY - composition.currentY) * 0.22, composition.nextY),
    previousScale: mix(0.88, 0.48),
    currentScale: mix(0.68, 1.02),
    nextScale: 0.54,
    previousOpacity: mix(0.92, 0.23),
    currentOpacity: mix(0.34, 1),
    nextOpacity: mix(0.08, 0.35),
  };
};

export const readingContextLinesV1 = (
  stage: PreparedDirectedStageV1,
  current: PreparedDirectedLineV1,
): PreparedDirectedLineV1[] => {
  const position = stage.lines.findIndex((line) => line.lineIndex === current.lineIndex);
  if (position < 0) return [current];
  const radius = stage.plan.source !== "local" && current.section.intensity >= 0.72 ? 3 : 2;
  return stage.lines.slice(Math.max(0, position - radius), Math.min(stage.lines.length, position + radius + 1));
};

const drawReading = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  active: PreparedDirectedLineV1[],
  timeMs: number,
  palette: DirectedStagePaletteV1,
  reduceMotion: boolean,
): void => {
  const { width, height } = stage.viewport;
  const current = active[0]
    ?? [...stage.lines].reverse().find((line) => line.fromMs <= timeMs)
    ?? stage.lines[0];
  if (!current) return;
  const composition = readingCompositionForV1(current, stage.viewport, stage.plan.source);
  const currentPosition = stage.lines.findIndex((line) => line.lineIndex === current.lineIndex);
  const previous = currentPosition > 0 ? stage.lines[currentPosition - 1] : undefined;
  const next = currentPosition >= 0 ? stage.lines[currentPosition + 1] : undefined;
  const contextLines = readingContextLinesV1(stage, current);
  const earlier = contextLines.filter((line) => line.lineIndex < current.lineIndex).reverse().slice(1);
  const later = contextLines.filter((line) => line.lineIndex > current.lineIndex).slice(1);
  const stack = readingStackStateAtV1(current, composition, timeMs, Boolean(previous), reduceMotion);
  earlier.forEach((line, index) => drawAnchoredLine(
    context, stage, line, Number.POSITIVE_INFINITY, palette, true,
    composition.previousX,
    Math.max(height * 0.09, stack.previousY - height * (0.12 + index * 0.105)),
    composition.adjacentWidth,
    height * 0.15,
    Math.max(0.24, 0.34 - index * 0.05),
    Math.max(0.055, 0.13 - index * 0.04),
    palette.ink,
    "settle",
    composition.horizontalAnchor,
  ));
  if (previous) drawAnchoredLine(context, stage, previous, Number.POSITIVE_INFINITY, palette, true, composition.previousX, stack.previousY, composition.adjacentWidth, height * 0.25, stack.previousScale, stack.previousOpacity, palette.ink, "settle", composition.horizontalAnchor);
  drawAnchoredLine(context, stage, current, Number.POSITIVE_INFINITY, palette, true, composition.currentX, stack.currentY, composition.currentWidth, height * 0.46, stack.currentScale, 0.12 * stack.currentOpacity, palette.ink, "settle", composition.horizontalAnchor);
  drawAnchoredLine(
    context,
    stage,
    current,
    timeMs,
    palette,
    reduceMotion,
    composition.currentX,
    stack.currentY,
    composition.currentWidth,
    height * 0.48,
    stack.currentScale,
    stack.currentOpacity,
    palette.ink,
    undefined,
    composition.horizontalAnchor,
  );
  if (next) drawAnchoredLine(context, stage, next, Number.POSITIVE_INFINITY, palette, true, composition.nextX, stack.nextY, composition.adjacentWidth, height * 0.29, stack.nextScale, stack.nextOpacity, palette.ink, "settle", composition.horizontalAnchor);
  later.forEach((line, index) => drawAnchoredLine(
    context, stage, line, Number.POSITIVE_INFINITY, palette, true,
    composition.nextX,
    Math.min(height * 0.91, stack.nextY + height * (0.11 + index * 0.095)),
    composition.adjacentWidth,
    height * 0.14,
    Math.max(0.22, 0.32 - index * 0.05),
    Math.max(0.05, 0.12 - index * 0.035),
    palette.ink,
    "settle",
    composition.horizontalAnchor,
  ));
  active.slice(1).forEach((line, index) => {
    drawAnchoredLine(context, stage, line, timeMs, palette, reduceMotion, width * (index % 2 ? 0.68 : 0.32), height * 0.62, width * 0.43, height * 0.30, 0.64, 0.84, palette.secondary);
  });
};

interface GestureDisplayTransformV1 {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const gestureDisplayTransform = (
  stage: PreparedDirectedStageV1,
  line: PreparedDirectedLineV1,
  timeMs: number,
  presentation: ReturnType<typeof stagePresentationAtV1>,
  reduceMotion: boolean,
): GestureDisplayTransformV1 => {
  const { width, height } = stage.viewport;
  if (presentation === "hero") {
    return fitAnchoredLineV1(stage.viewport, line.bounds, width * 0.5, height * 0.52, width * 0.80, height * 0.52, 1.22, "center");
  }
  if (presentation === "duet") return { scale: 1, offsetX: 0, offsetY: 0 };
  const composition = readingCompositionForV1(line, stage.viewport, stage.plan.source);
  const position = stage.lines.findIndex((candidate) => candidate.lineIndex === line.lineIndex);
  const stack = readingStackStateAtV1(line, composition, timeMs, position > 0, reduceMotion);
  return fitAnchoredLineV1(
    stage.viewport,
    line.bounds,
    composition.currentX,
    stack.currentY,
    composition.currentWidth,
    height * 0.48,
    stack.currentScale,
    composition.horizontalAnchor,
  );
};

const gestureEnvelope = (
  gesture: PreparedLyricGestureV1,
  timeMs: number,
  reduceMotion: boolean,
): { alpha: number; attack: number; release: number } => {
  if (timeMs < gesture.fromMs || timeMs >= gesture.toMs) return { alpha: 0, attack: 0, release: 0 };
  const attack = reduceMotion || gesture.attackEndMs <= gesture.fromMs
    ? 1
    : easeOutCubic(clamp01((timeMs - gesture.fromMs) / (gesture.attackEndMs - gesture.fromMs)));
  const release = reduceMotion || timeMs <= gesture.releaseStartMs || gesture.toMs <= gesture.releaseStartMs
    ? 1
    : 1 - easeOutCubic(clamp01((timeMs - gesture.releaseStartMs) / (gesture.toMs - gesture.releaseStartMs)));
  return { alpha: attack * release, attack, release };
};

const transformedGestureBounds = (
  prepared: PreparedLyricGestureV1,
  transform: GestureDisplayTransformV1,
): { x: number; y: number; width: number; height: number } => ({
  x: transform.offsetX + prepared.bounds.x * transform.scale,
  y: transform.offsetY + prepared.bounds.y * transform.scale,
  width: prepared.bounds.width * transform.scale,
  height: prepared.bounds.height * transform.scale,
});

const drawGestureTextCopy = (
  context: CanvasRenderingContext2D,
  line: PreparedDirectedLineV1,
  prepared: PreparedLyricGestureV1,
  transform: GestureDisplayTransformV1,
  color: string,
  alpha: number,
  offsetX = 0,
  offsetY = 0,
  stroke = false,
): void => {
  context.save();
  context.globalAlpha = alpha;
  context.font = line.font;
  context.textBaseline = "alphabetic";
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = Math.max(0.8, line.fontSize * 0.018);
  context.translate(transform.offsetX + offsetX, transform.offsetY + offsetY);
  context.scale(transform.scale, transform.scale);
  line.glyphs.forEach((glyph) => {
    if (!prepared.targetGlyphIndices.includes(glyph.index)) return;
    if (stroke) context.strokeText(glyph.text, glyph.x, glyph.y);
    else context.fillText(glyph.text, glyph.x, glyph.y);
  });
  context.restore();
};

const drawLyricGesture = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  prepared: PreparedLyricGestureV1,
  timeMs: number,
  reduceMotion: boolean,
  palette: DirectedStagePaletteV1,
  presentation: ReturnType<typeof stagePresentationAtV1>,
): void => {
  const line = stage.linesByIndex.get(prepared.lineIndex);
  if (!line) return;
  const phase = gestureEnvelope(prepared, timeMs, reduceMotion);
  if (phase.alpha <= 0) return;
  const transform = gestureDisplayTransform(stage, line, timeMs, presentation, reduceMotion);
  const bounds = transformedGestureBounds(prepared, transform);
  const gesture = prepared.gesture;
  const color = paletteColorForRoleV1(palette, gesture.paletteRole);
  const strength = gesture.intensity * phase.alpha;
  const { width, height } = stage.viewport;
  const motion = reduceMotion ? 0 : (1 - phase.attack) * gesture.direction;
  context.save();
  context.beginPath();
  context.rect(width * 0.055, height * 0.055, width * 0.89, height * 0.89);
  context.clip();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = Math.min(0.82, 0.18 + strength * 0.58);
  context.lineWidth = Math.max(1, height * (0.0012 + gesture.intensity * 0.0018));

  if (gesture.primitive === "glyph.weightPulse") {
    drawGestureTextCopy(context, line, prepared, transform, color, 0.22 + strength * 0.42, motion * line.fontSize * 0.025, 0, true);
  } else if (gesture.primitive === "glyph.strokeTrace") {
    const inset = Math.max(2, line.fontSize * transform.scale * 0.04);
    context.beginPath();
    context.moveTo(bounds.x - inset, bounds.y + bounds.height);
    context.lineTo(bounds.x - inset, bounds.y + bounds.height * (1 - phase.attack));
    context.quadraticCurveTo(bounds.x + bounds.width * 0.5, bounds.y - inset, bounds.x + bounds.width * phase.attack + inset, bounds.y + bounds.height * 0.08);
    context.stroke();
  } else if (gesture.primitive === "glyph.offsetSnap") {
    drawGestureTextCopy(context, line, prepared, transform, color, 0.12 + strength * 0.30, motion * line.fontSize * 0.11, -Math.abs(motion) * line.fontSize * 0.04);
  } else if (gesture.primitive === "token.underlinePath") {
    const startX = bounds.x;
    const localEnd = bounds.x + bounds.width * phase.attack;
    const stageEnd = gesture.space === "lyricLocal"
      ? localEnd
      : gesture.space === "lyricToArtwork"
        ? width * 0.24
        : gesture.direction > 0 ? width * 0.93 : width * 0.07;
    const endX = phase.attack < 1 ? localEnd : startX + (stageEnd - startX) * (1 - phase.release * 0.12);
    const y = bounds.y + bounds.height + Math.max(3, line.fontSize * transform.scale * 0.08);
    context.beginPath();
    context.moveTo(startX, y);
    context.bezierCurveTo(startX + (endX - startX) * 0.34, y, startX + (endX - startX) * 0.70, y + height * 0.035 * gesture.direction, endX, y);
    context.stroke();
  } else if (gesture.primitive === "token.halo") {
    context.beginPath();
    context.ellipse(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, Math.max(8, bounds.width * (0.52 + motion * 0.04)), Math.max(8, bounds.height * 0.62), -0.08 * gesture.direction, 0, Math.PI * 2);
    context.stroke();
  } else if (gesture.primitive === "token.echo") {
    drawGestureTextCopy(context, line, prepared, transform, color, 0.10 + strength * 0.24, gesture.direction * line.fontSize * transform.scale * 0.12, -line.fontSize * transform.scale * 0.06);
  } else if (gesture.primitive === "token.elasticFocus") {
    context.beginPath();
    context.ellipse(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width * (0.48 + phase.attack * 0.06), bounds.height * 0.58, 0, 0, Math.PI * 2);
    context.stroke();
  } else if (gesture.primitive === "phrase.arc") {
    context.beginPath();
    context.moveTo(bounds.x, bounds.y + bounds.height * 0.70);
    context.quadraticCurveTo(bounds.x + bounds.width * 0.5, bounds.y - bounds.height * (0.45 + phase.attack * 0.18), bounds.x + bounds.width, bounds.y + bounds.height * 0.70);
    context.stroke();
  } else if (gesture.primitive === "phrase.breakReform") {
    const centerX = bounds.x + bounds.width / 2;
    const gap = reduceMotion ? 0 : (1 - phase.attack) * width * 0.025;
    context.beginPath();
    context.moveTo(bounds.x - gap, bounds.y + bounds.height);
    context.lineTo(centerX - gap, bounds.y - bounds.height * 0.08);
    context.moveTo(centerX + gap, bounds.y - bounds.height * 0.08);
    context.lineTo(bounds.x + bounds.width + gap, bounds.y + bounds.height);
    context.stroke();
  } else if (gesture.primitive === "phrase.handoff") {
    const fromX = gesture.direction > 0 ? bounds.x : bounds.x + bounds.width;
    const toX = gesture.space === "lyricLocal" ? (gesture.direction > 0 ? bounds.x + bounds.width : bounds.x) : gesture.direction > 0 ? width * 0.94 : width * 0.06;
    const y = bounds.y + bounds.height * 0.72;
    context.beginPath();
    context.moveTo(fromX, y);
    context.bezierCurveTo(fromX + (toX - fromX) * 0.3, y - height * 0.045, fromX + (toX - fromX) * 0.72, y + height * 0.035, fromX + (toX - fromX) * phase.attack, y);
    context.stroke();
  } else if (gesture.primitive === "phrase.breathe") {
    drawGestureTextCopy(context, line, prepared, transform, color, 0.08 + strength * 0.18, 0, motion * line.fontSize * 0.055);
  } else if (gesture.primitive === "phrase.contour") {
    const y = bounds.y + bounds.height + Math.max(2, line.fontSize * transform.scale * 0.06);
    context.beginPath();
    context.moveTo(bounds.x, y);
    context.quadraticCurveTo(bounds.x + bounds.width * 0.52, y + bounds.height * 0.08, bounds.x + bounds.width, y);
    context.stroke();
  }
  context.restore();
};

const drawLyricGestures = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  timeMs: number,
  reduceMotion: boolean,
  palette: DirectedStagePaletteV1,
  presentation: ReturnType<typeof stagePresentationAtV1>,
  layer: "scenic" | "accent",
): void => {
  const active = stage.gestures
    .filter((gesture) => timeMs >= gesture.fromMs && timeMs < gesture.toMs)
    .sort((left, right) => right.gesture.intensity - left.gesture.intensity)
    .slice(0, 2);
  active.forEach((gesture) => {
    const scenic = gesture.gesture.space !== "lyricLocal" || gesture.gesture.scope === "phrase" || gesture.gesture.primitive === "token.underlinePath";
    if ((layer === "scenic") === scenic) drawLyricGesture(context, stage, gesture, timeMs, reduceMotion, palette, presentation);
  });
};

const drawHero = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  active: PreparedDirectedLineV1[],
  timeMs: number,
  palette: DirectedStagePaletteV1,
  reduceMotion: boolean,
): void => {
  const { width, height } = stage.viewport;
  const current = active[0];
  if (!current) return;
  drawAnchoredLine(context, stage, current, Number.POSITIVE_INFINITY, palette, true, width * 0.5, height * 0.52, width * 0.80, height * 0.52, 1.22, 0.18, palette.signal);
  drawAnchoredLine(context, stage, current, timeMs, palette, reduceMotion, width * 0.5, height * 0.52, width * 0.80, height * 0.52, 1.22, 1, palette.signal);
  active.slice(1).forEach((line, index) => {
    drawAnchoredLine(
      context,
      stage,
      line,
      timeMs,
      palette,
      reduceMotion,
      width * (index % 2 === 0 ? 0.76 : 0.24),
      height * 0.73,
      width * 0.38,
      height * 0.30,
      0.72,
      0.76,
      palette.secondary,
    );
  });
};

const drawPrimary = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  active: PreparedDirectedLineV1[],
  timeMs: number,
  palette: DirectedStagePaletteV1,
  reduceMotion: boolean,
): void => {
  active.forEach((line, index) => {
    drawLine(context, stage, line, timeMs, palette, reduceMotion, index === 0 ? 1 : 0.88);
    if (line.section.layout.startsWith("rail")) {
      const { width, height } = stage.viewport;
      const progress = reduceMotion ? 1 : easeOutCubic(clamp01((timeMs - line.fromMs) / 620));
      const trailing = line.section.layout === "railTrailing";
      context.save();
      context.strokeStyle = paletteColorForRoleV1(palette, line.directive.paletteRole);
      context.lineWidth = Math.max(2, height * 0.004);
      context.globalAlpha = 0.78;
      context.beginPath();
      context.moveTo(width * (trailing ? 0.94 : 0.06), height * 0.79);
      context.lineTo(width * (trailing ? 0.94 - 0.82 * progress : 0.06 + 0.82 * progress), height * 0.79);
      context.stroke();
      context.restore();
    }
  });
};

const drawTransitionVeil = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  timeMs: number,
  reduceMotion: boolean,
  palette: DirectedStagePaletteV1,
): void => {
  const { width, height } = stage.viewport;
  const section = directorSectionAtV1(stage.plan, timeMs);
  const progress = clamp01((timeMs - section.fromMs) / 520);
  if (progress < 1) {
    const eased = reduceMotion ? 1 : easeOutCubic(progress);
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, withAlpha(palette.signal, 0));
    gradient.addColorStop(0.45, palette.veil);
    gradient.addColorStop(1, withAlpha(palette.signalAlt, 0));
    context.save();
    context.globalAlpha = (1 - eased) * 0.9;
    context.fillStyle = gradient;
    context.fillRect(-width * (1 - eased), 0, width * 1.6, height);
    context.restore();
  }
  const active = activeLinesAt(stage, timeMs);
  if (active.length === 0) {
    const next = stage.lyrics.lines.find((line) => line.fromMs > timeMs);
    context.save();
    context.strokeStyle = palette.signalAlt;
    context.globalAlpha = next ? clamp01(1 - (next.fromMs - timeMs) / 1800) * 0.28 : 0.08;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(width * 0.42, height * 0.5);
    context.lineTo(width * 0.58, height * 0.5);
    context.stroke();
    context.restore();
  }
};

const drawGuides = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  active: PreparedDirectedLineV1[],
  palette: DirectedStagePaletteV1,
): void => {
  const { width, height } = stage.viewport;
  context.save();
  context.strokeStyle = palette.signal;
  context.globalAlpha = 0.35;
  context.setLineDash([6, 8]);
  context.strokeRect(width * 0.06, height * 0.08, width * 0.88, height * 0.84);
  active.forEach((line) => context.strokeRect(line.bounds.x, line.bounds.y, line.bounds.width, line.bounds.height));
  context.restore();
};

export const directedPaletteAtV1 = (
  stage: PreparedDirectedStageV1,
  timeMs: number,
): DirectedStagePaletteV1 => directedPaletteForIndexV1(directorSectionAtV1(stage.plan, timeMs).paletteIndex);

export const clearCanvasBackingStoreV1 = (context: CanvasRenderingContext2D): void => {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.restore();
};

export const drawDirectedStageV1 = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  options: DrawDirectedStageOptionsV1,
): number => {
  const startedAt = performance.now();
  const { width, height } = stage.viewport;
  const palette = options.palette ?? directedPaletteAtV1(stage, options.timeMs);
  const active = activeLinesAt(stage, options.timeMs);
  const presentation = stagePresentationAtV1(stage.plan.effects, options.timeMs, stage.lyrics);
  clearCanvasBackingStoreV1(context);
  context.save();
  context.globalAlpha = presentation === "hero"
    ? 0.94
    : presentation === "duet"
      ? 0.84
      : presentation === "aperture"
        ? 0.62
        : presentation === "section"
          ? 0.74
          : 0.42;
  drawStructuralField(context, stage, options.timeMs, options.reduceMotion, palette);
  drawEffectField(context, stage, options.timeMs, options.reduceMotion, palette);
  context.restore();
  drawDramaticScenesV1(context, stage, options.timeMs, options.reduceMotion, palette, "scenic");
  drawLyricGestures(context, stage, options.timeMs, options.reduceMotion, palette, presentation, "scenic");
  if (presentation === "hero") {
    drawCounterpoint(context, stage, active, options.timeMs, palette, options.reduceMotion);
    drawHero(context, stage, active, options.timeMs, palette, options.reduceMotion);
  } else if (presentation === "duet") {
    drawCounterpoint(context, stage, active, options.timeMs, palette, options.reduceMotion);
    drawPrimary(context, stage, active, options.timeMs, palette, options.reduceMotion);
  } else {
    drawReading(context, stage, active, options.timeMs, palette, options.reduceMotion);
  }
  drawLyricGestures(context, stage, options.timeMs, options.reduceMotion, palette, presentation, "accent");
  drawDramaticScenesV1(context, stage, options.timeMs, options.reduceMotion, palette, "accent");
  drawTransitionVeil(context, stage, options.timeMs, options.reduceMotion, palette);
  if (options.showGuides) drawGuides(context, stage, active, palette);
  return performance.now() - startedAt;
};
