import { sampleTimeline } from "@lyricstage/core";
import type {
  DrawStageOptionsV0,
  PreparedGlyphV0,
  PreparedStageV0,
  PreparedVisualLineV0,
} from "./types";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number): number => 1 - (1 - value) ** 3;

const drawGlyphs = (
  context: CanvasRenderingContext2D,
  line: PreparedVisualLineV0,
  timeMs: number,
  opacity: number,
  offsetX = 0,
  offsetY = 0,
  scale = 1,
  color?: string,
): void => {
  context.save();
  context.font = line.font;
  context.textBaseline = "alphabetic";
  context.fillStyle = color ?? "#fff";
  context.translate(offsetX, offsetY);
  context.scale(scale, scale);
  for (const glyph of line.glyphs) {
    if (timeMs < glyph.revealMs) continue;
    const revealOpacity = clamp01((timeMs - glyph.revealMs + 1) / 120);
    context.globalAlpha = opacity * revealOpacity;
    context.fillText(glyph.text, glyph.x, glyph.y);
  }
  context.restore();
};

const drawRail = (
  context: CanvasRenderingContext2D,
  stage: PreparedStageV0,
  line: PreparedVisualLineV0,
  timeMs: number,
  settle: number,
): void => {
  const { width, height } = stage.viewport;
  const railY = Math.min(height * 0.82, line.bounds.y + line.bounds.height + 22);
  context.save();
  context.strokeStyle = stage.palette.signal;
  context.lineWidth = Math.max(2, height * 0.003);
  context.globalAlpha = 0.95;
  context.beginPath();
  context.moveTo(width * 0.06, railY);
  context.lineTo(width * (0.06 + 0.88 * settle), railY);
  context.stroke();
  context.fillStyle = stage.palette.signalAlt;
  context.fillRect(width * 0.78, railY - 7, width * 0.12 * settle, 7);
  context.restore();

  const travel = (1 - settle) * -width * 0.05;
  drawGlyphs(context, line, timeMs, 1, travel, 0, 1, stage.palette.ink);

  const previous = stage.lines[line.lineIndex - 1];
  if (previous) {
    const targetX = width * 0.58;
    const targetY = height * 0.20;
    const source = previous.bounds;
    const scale = Math.min(0.48, (width * 0.34) / Math.max(1, source.width));
    drawGlyphs(
      context,
      previous,
      Number.POSITIVE_INFINITY,
      0.16,
      targetX - source.x * scale,
      targetY - source.y * scale,
      scale,
      stage.palette.ink,
    );
  }
};

const memoryOffsets = [
  { x: 0.58, y: 0.18, scale: 0.42, alpha: 0.10 },
  { x: 0.27, y: 0.72, scale: 0.56, alpha: 0.14 },
  { x: 0.66, y: 0.66, scale: 0.32, alpha: 0.08 },
];

const drawChorus = (
  context: CanvasRenderingContext2D,
  stage: PreparedStageV0,
  line: PreparedVisualLineV0,
  timeMs: number,
  settle: number,
): void => {
  const { width, height } = stage.viewport;
  const residueCount = Math.min(line.scene.repetitionIndex, memoryOffsets.length);
  for (let index = 0; index < residueCount; index += 1) {
    const residue = memoryOffsets[index];
    drawGlyphs(
      context,
      line,
      Number.POSITIVE_INFINITY,
      residue.alpha,
      width * residue.x - line.bounds.x * residue.scale,
      height * residue.y - line.bounds.y * residue.scale,
      residue.scale,
      index % 2 === 0 ? stage.palette.signalAlt : stage.palette.signal,
    );
  }

  const scale = 0.96 + settle * 0.04;
  const originX = line.bounds.x;
  const originY = line.bounds.y + line.fontSize;
  drawGlyphs(
    context,
    line,
    timeMs,
    1,
    originX * (1 - scale),
    originY * (1 - scale) + (1 - settle) * height * 0.025,
    scale,
    stage.palette.ink,
  );

  context.save();
  context.globalAlpha = 0.92;
  context.fillStyle = stage.palette.signal;
  context.fillRect(width * 0.08, height * 0.79, width * 0.018, height * 0.018);
  context.fillStyle = stage.palette.signalAlt;
  context.fillRect(width * 0.105, height * 0.79, width * (0.16 + 0.34 * settle), height * 0.006);
  context.restore();
};

const drawFallback = (
  context: CanvasRenderingContext2D,
  stage: PreparedStageV0,
  line: PreparedVisualLineV0,
  timeMs: number,
  settle: number,
): void => {
  const { width, height } = stage.viewport;
  drawGlyphs(
    context,
    line,
    timeMs,
    1,
    0,
    (1 - settle) * height * 0.018,
    1,
    stage.palette.ink,
  );
  context.save();
  context.globalAlpha = 0.72;
  context.strokeStyle = stage.palette.signalAlt;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(width * 0.09, height * 0.25);
  context.lineTo(width * 0.42, height * 0.25);
  context.stroke();
  context.restore();
};

const drawStageFrame = (
  context: CanvasRenderingContext2D,
  stage: PreparedStageV0,
  options: DrawStageOptionsV0,
): void => {
  const { width, height } = stage.viewport;
  context.clearRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.08;
  context.strokeStyle = stage.palette.ink;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(width * 0.06, height * 0.08);
  context.lineTo(width * 0.94, height * 0.08);
  context.moveTo(width * 0.06, height * 0.92);
  context.lineTo(width * 0.94, height * 0.92);
  context.stroke();
  context.restore();

  const activeIndices = sampleTimeline(stage.timeline, options.timeMs);
  if (activeIndices.length === 0) {
    context.save();
    context.font = `650 ${Math.max(18, height * 0.024)}px ${stage.viewport.fontFamily}`;
    context.fillStyle = stage.palette.inkMuted;
    context.fillText("LYRICSTAGE / WAITING FOR THE NEXT CUE", width * 0.09, height * 0.84);
    context.restore();
  }

  for (const sceneIndex of activeIndices) {
    const line = stage.lines[sceneIndex];
    if (!line) continue;
    const rawSettle = clamp01((options.timeMs - line.scene.fromMs) / 650);
    const settle = options.reduceMotion ? 1 : easeOutCubic(rawSettle);
    if (line.family === "railHandoff") {
      drawRail(context, stage, line, options.timeMs, settle);
    } else if (line.family === "chorusMemory") {
      drawChorus(context, stage, line, options.timeMs, settle);
    } else {
      drawFallback(context, stage, line, options.timeMs, settle);
    }
  }

  context.save();
  context.fillStyle = stage.palette.inkMuted;
  context.font = `600 ${Math.max(11, height * 0.014)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.textAlign = "right";
  context.fillText(
    `${stage.plan.recordingID} · ${(options.timeMs / 1000).toFixed(1)}s`,
    width * 0.94,
    height * 0.92,
  );
  context.restore();

  if (options.showGuides) {
    context.save();
    context.strokeStyle = stage.palette.signal;
    context.globalAlpha = 0.35;
    context.setLineDash([6, 8]);
    context.strokeRect(width * 0.06, height * 0.08, width * 0.88, height * 0.84);
    context.restore();
  }
};

export const drawStage = (
  context: CanvasRenderingContext2D,
  stage: PreparedStageV0,
  options: DrawStageOptionsV0,
): number => {
  const startedAt = performance.now();
  drawStageFrame(context, stage, options);
  return performance.now() - startedAt;
};

export class FrameSamplerV0 {
  readonly #samples: number[] = [];
  readonly #limit: number;

  constructor(limit = 240) {
    this.#limit = limit;
  }

  push(durationMs: number): void {
    if (!Number.isFinite(durationMs)) return;
    this.#samples.push(durationMs);
    if (this.#samples.length > this.#limit) this.#samples.shift();
  }

  summary(): { count: number; p50: number; p95: number; p99: number; max: number } {
    if (this.#samples.length === 0) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const sorted = [...this.#samples].sort((left, right) => left - right);
    const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
    return {
      count: sorted.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: sorted[sorted.length - 1],
    };
  }
}
