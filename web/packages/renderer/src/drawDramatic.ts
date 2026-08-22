import type { MotifActorFamilyV1 } from "@lyricstage/performance";
import type {
  DirectedStagePaletteV1,
  PreparedDirectedStageV1,
  PreparedDramaticMomentV1,
} from "./directedTypes";
import { vectorActorRegistryV1 } from "./vectorActorRegistry";

type DramaticLayerV1 = "scenic" | "accent";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const ease = (value: number): number => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};
const unit = (seed: number): number => {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffff_ffff;
};

const pathCache = new Map<string, Path2D>();
const pathFor = (data: string): Path2D | undefined => {
  if (typeof Path2D === "undefined") return undefined;
  const cached = pathCache.get(data);
  if (cached) return cached;
  try {
    const path = new Path2D(data);
    pathCache.set(data, path);
    return path;
  } catch {
    return undefined;
  }
};

const drawFallbackActor = (
  context: CanvasRenderingContext2D,
  family: MotifActorFamilyV1,
): void => {
  context.beginPath();
  if (family === "fish") {
    context.ellipse(0, 0, 34, 18, 0, 0, Math.PI * 2);
    context.moveTo(32, 0);
    context.lineTo(52, -17);
    context.lineTo(49, 17);
    context.closePath();
  } else if (family === "petal") {
    context.moveTo(0, -42);
    context.bezierCurveTo(32, -26, 34, 12, 0, 42);
    context.bezierCurveTo(-34, 12, -32, -26, 0, -42);
  } else if (family === "snow" || family === "firework") {
    for (let index = 0; index < (family === "snow" ? 6 : 8); index += 1) {
      const angle = index * Math.PI * 2 / (family === "snow" ? 6 : 8);
      context.moveTo(0, 0);
      context.lineTo(Math.cos(angle) * 46, Math.sin(angle) * 46);
    }
  } else if (family === "window") {
    context.rect(-42, -46, 84, 92);
    context.moveTo(0, -46);
    context.lineTo(0, 46);
  } else if (family === "fold") {
    context.moveTo(-46, -38);
    context.lineTo(31, -44);
    context.lineTo(46, 35);
    context.lineTo(-24, 46);
    context.closePath();
  } else {
    context.moveTo(-48, 10);
    context.bezierCurveTo(-22, -34, 12, 36, 48, -12);
  }
  context.stroke();
};

const drawVectorActor = (
  context: CanvasRenderingContext2D,
  family: MotifActorFamilyV1,
  x: number,
  y: number,
  size: number,
  rotation: number,
  color: string,
  alpha: number,
  lineWidth = 1.4,
): void => {
  if (size <= 0 || alpha <= 0) return;
  const asset = vectorActorRegistryV1[family];
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(size / asset.viewBox[2], size / asset.viewBox[3]);
  context.translate(-50, -50);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth * 100 / Math.max(1, size);
  context.lineCap = "round";
  context.lineJoin = "round";
  let drewPath = false;
  for (const entry of asset.paths) {
    const path = pathFor(entry.d);
    if (!path) continue;
    drewPath = true;
    context.globalAlpha = alpha * entry.opacity;
    if (entry.mode === "fill") context.fill(path);
    else context.stroke(path);
  }
  if (!drewPath) {
    context.translate(50, 50);
    context.globalAlpha = alpha;
    drawFallbackActor(context, family);
  }
  context.restore();
};

const momentProgress = (moment: PreparedDramaticMomentV1, timeMs: number): number =>
  clamp01((timeMs - moment.fromMs) / Math.max(1, moment.toMs - moment.fromMs));

const beatProgress = (
  timeMs: number,
  fromMs: number,
  toMs: number,
): number => ease((timeMs - fromMs) / Math.max(1, toMs - fromMs));

const drawThreadScene = (
  context: CanvasRenderingContext2D,
  moment: PreparedDramaticMomentV1,
  timeMs: number,
  width: number,
  height: number,
  color: string,
  reduceMotion: boolean,
): void => {
  const anticipation = reduceMotion ? 1 : beatProgress(timeMs, moment.fromMs, moment.anticipationEndMs);
  const event = reduceMotion ? 1 : beatProgress(timeMs, moment.anticipationEndMs, moment.eventEndMs);
  const consequence = reduceMotion
    ? 1
    : timeMs > moment.consequenceEndMs
    ? 1 - beatProgress(timeMs, moment.consequenceEndMs, moment.toMs) * 0.72
    : 1;
  const originX = moment.moment.coverRole === "absent" ? width * 0.08 : width * 0.25;
  const destinationX = moment.moment.coverRole === "destination" ? width * 0.27 : width * 0.88;
  const y = height * (0.34 + unit(moment.seed) * 0.34);
  const reach = reduceMotion ? 1 : Math.max(anticipation * 0.34, event);
  const targetX = originX + (destinationX - originX) * reach;
  const action = moment.moment.stageAction;
  const strandCount = action === "phrase.cascade" ? 5 : action === "duet.tension" ? 2 : 1;
  const visibleAlpha = (0.16 + event * 0.42) * consequence * (0.72 + moment.moment.intensity * 0.28);
  context.save();
  context.strokeStyle = color;
  context.lineWidth = Math.max(1.4, height * (0.002 + moment.moment.intensity * 0.0011));
  context.globalAlpha = visibleAlpha;
  for (let strand = 0; strand < strandCount; strand += 1) {
    const normalized = strandCount === 1 ? 0 : strand / (strandCount - 1) - 0.5;
    const offset = normalized * height * 0.25;
    const delayedReach = reduceMotion ? 1 : clamp01(reach - strand * 0.055);
    const strandTargetX = originX + (targetX - originX) * delayedReach;
    context.globalAlpha = visibleAlpha * (1 - Math.abs(normalized) * 0.38);
    context.beginPath();
    context.moveTo(originX, y + offset * 0.42);
    context.bezierCurveTo(
      width * (0.39 + normalized * 0.05),
      y - height * 0.18 + offset,
      width * (0.62 - normalized * 0.04),
      y + height * 0.15 + offset * 0.48,
      strandTargetX,
      y - height * 0.03 + offset * 0.16,
    );
    context.stroke();
  }
  if (action === "memory.imprint" || action === "motif.recall") {
    const imprint = reduceMotion ? 1 : event;
    const centerX = action === "memory.imprint" ? width * 0.61 : width * 0.50;
    const centerY = height * 0.48;
    for (let ring = 0; ring < 3; ring += 1) {
      const radiusX = width * (0.17 + ring * 0.055) * (0.72 + imprint * 0.28);
      const radiusY = height * (0.20 + ring * 0.045) * (0.72 + imprint * 0.28);
      context.globalAlpha = visibleAlpha * (0.48 - ring * 0.1);
      context.lineWidth = Math.max(1, height * (0.0015 - ring * 0.0002));
      context.beginPath();
      context.ellipse(centerX, centerY, radiusX, radiusY, -0.08 + ring * 0.06, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.globalAlpha = visibleAlpha * 0.9;
  context.fillStyle = color;
  context.beginPath();
  context.arc(originX, y, Math.max(3, height * 0.0065), 0, Math.PI * 2);
  context.fill();
  if (reach > 0.7) {
    context.globalAlpha = visibleAlpha * event;
    context.beginPath();
    context.arc(targetX, y - height * 0.03, Math.max(2.5, height * 0.005), 0, Math.PI * 2);
    context.fill();
  }
  if (moment.moment.stageAction === "thread.snap" && event > 0.7) {
    context.globalAlpha *= 0.7;
    context.beginPath();
    context.moveTo(width * 0.53, y - height * 0.02);
    context.lineTo(width * 0.58, y - height * 0.09);
    context.moveTo(width * 0.55, y + height * 0.02);
    context.lineTo(width * 0.61, y + height * 0.08);
    context.stroke();
  }
  context.restore();
};

const drawSwarmScene = (
  context: CanvasRenderingContext2D,
  moment: PreparedDramaticMomentV1,
  timeMs: number,
  width: number,
  height: number,
  color: string,
  reduceMotion: boolean,
): void => {
  const family = moment.moment.actorFamily;
  const progress = reduceMotion ? 0.5 : momentProgress(moment, timeMs);
  const event = reduceMotion ? 1 : beatProgress(timeMs, moment.anticipationEndMs, moment.eventEndMs);
  const fade = reduceMotion
    ? 1
    : timeMs > moment.consequenceEndMs ? 1 - beatProgress(timeMs, moment.consequenceEndMs, moment.toMs) * 0.72 : 1;
  const count = family === "firework" ? 1 : Math.round(7 + moment.moment.intensity * (family === "snow" ? 22 : 14));
  for (let index = 0; index < count; index += 1) {
    const a = unit(moment.seed + index * 101);
    const b = unit(moment.seed + index * 307 + 17);
    const c = unit(moment.seed + index * 593 + 29);
    let x = width * (0.08 + a * 0.84);
    let y = height * (0.12 + b * 0.76);
    let rotation = c * Math.PI * 2;
    let scale = height * (family === "fish" ? 0.075 : family === "snow" ? 0.034 : family === "petal" ? 0.045 : 0.22);
    if (!reduceMotion) {
      if (family === "fish") {
        x = width * (((a + progress * (0.36 + c * 0.24)) % 1.16) - 0.08);
        y += Math.sin(progress * Math.PI * 3 + index) * height * 0.045;
        rotation = Math.sin(progress * Math.PI * 2 + index) * 0.12;
      } else if (family === "petal" || family === "snow") {
        y = height * (((b + progress * (0.32 + c * 0.24)) % 1.12) - 0.06);
        x += Math.sin(progress * Math.PI * 2 + index * 0.7) * width * (family === "snow" ? 0.018 : 0.045);
        rotation += progress * Math.PI * (family === "petal" ? 1.8 : 0.4);
      } else if (family === "firework") {
        x = width * (0.66 + (a - 0.5) * 0.22);
        y = height * (0.33 + (b - 0.5) * 0.16);
        scale *= 0.25 + event * 0.9;
        rotation = 0;
      }
    }
    drawVectorActor(context, family, x, y, scale, rotation, color, (0.08 + event * 0.34) * fade * (0.58 + c * 0.42));
  }
};

const drawArchitecturalScene = (
  context: CanvasRenderingContext2D,
  moment: PreparedDramaticMomentV1,
  timeMs: number,
  width: number,
  height: number,
  color: string,
  reduceMotion: boolean,
): void => {
  const progress = reduceMotion ? 0.5 : momentProgress(moment, timeMs);
  const event = reduceMotion ? 1 : beatProgress(timeMs, moment.anticipationEndMs, moment.eventEndMs);
  const fade = reduceMotion
    ? 1
    : timeMs > moment.consequenceEndMs ? 1 - beatProgress(timeMs, moment.consequenceEndMs, moment.toMs) * 0.76 : 1;
  const family = moment.moment.actorFamily;
  const size = Math.min(width, height) * (family === "window" ? 0.6 : 0.48);
  const x = width * (moment.moment.coverRole === "boundary" ? 0.5 : 0.68);
  const travel = reduceMotion ? 0 : (1 - event) * width * 0.055;
  const y = height * (0.47 + (unit(moment.seed) - 0.5) * 0.12);
  drawVectorActor(context, family, x + travel, y, size * (0.82 + event * 0.18), (progress - 0.5) * (reduceMotion ? 0 : 0.05), color, (0.08 + event * 0.28) * fade, 1.15);
};

const drawMemoryTrace = (
  context: CanvasRenderingContext2D,
  moment: PreparedDramaticMomentV1,
  timeMs: number,
  width: number,
  height: number,
  color: string,
  reduceMotion: boolean,
): void => {
  if (timeMs < moment.toMs || timeMs >= moment.memoryToMs) return;
  const fade = reduceMotion
    ? 0.55
    : 1 - (timeMs - moment.toMs) / Math.max(1, moment.memoryToMs - moment.toMs);
  const family = moment.moment.actorFamily;
  drawVectorActor(context, family, width * 0.78, height * 0.27, Math.min(width, height) * 0.13, 0, color, fade * 0.075, 1);
};

const drawAccent = (
  context: CanvasRenderingContext2D,
  moment: PreparedDramaticMomentV1,
  timeMs: number,
  width: number,
  height: number,
  color: string,
  reduceMotion: boolean,
): void => {
  if (timeMs < moment.anticipationEndMs || timeMs >= moment.consequenceEndMs) return;
  const event = reduceMotion ? 1 : beatProgress(timeMs, moment.anticipationEndMs, moment.eventEndMs);
  const release = reduceMotion
    ? 1
    : timeMs > moment.eventEndMs ? 1 - beatProgress(timeMs, moment.eventEndMs, moment.consequenceEndMs) : 1;
  const radius = Math.min(width, height) * (0.012 + event * (reduceMotion ? 0.008 : 0.035));
  context.save();
  context.strokeStyle = color;
  context.globalAlpha = 0.12 * release;
  context.lineWidth = Math.max(1, height * 0.0016);
  context.beginPath();
  context.arc(width * 0.72, height * 0.5, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
};

export const drawDramaticScenesV1 = (
  context: CanvasRenderingContext2D,
  stage: PreparedDirectedStageV1,
  timeMs: number,
  reduceMotion: boolean,
  palette: DirectedStagePaletteV1,
  layer: DramaticLayerV1,
): void => {
  const { width, height } = stage.viewport;
  const active = stage.dramaticMoments
    .filter((moment) => timeMs >= moment.fromMs && timeMs < moment.toMs)
    .sort((left, right) => right.moment.intensity - left.moment.intensity)[0];
  context.save();
  context.beginPath();
  context.rect(width * 0.055, height * 0.055, width * 0.89, height * 0.89);
  context.clip();
  if (layer === "scenic") {
    for (const moment of stage.dramaticMoments) {
      drawMemoryTrace(context, moment, timeMs, width, height, palette.signalAlt, reduceMotion);
    }
    if (active) {
      if (["fish", "petal", "snow", "firework"].includes(active.moment.actorFamily)) {
        drawSwarmScene(context, active, timeMs, width, height, palette.signal, reduceMotion);
      } else if (active.moment.actorFamily === "thread" || active.moment.actorFamily === "horizon") {
        drawThreadScene(context, active, timeMs, width, height, palette.signal, reduceMotion);
      } else {
        drawArchitecturalScene(context, active, timeMs, width, height, palette.signal, reduceMotion);
      }
    }
  } else if (active) {
    drawAccent(context, active, timeMs, width, height, palette.signal, reduceMotion);
  }
  context.restore();
};
