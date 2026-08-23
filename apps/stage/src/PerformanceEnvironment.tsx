import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application, Graphics } from "pixi.js";
import {
  directorSectionAtV1,
  effectRecipeAtV1,
  sampleEnvironmentSceneV1,
  type DirectorPlanV1,
  type EnvironmentFrameV1,
  type EnvironmentTuningV1,
} from "@lyricstage/performance";
import {
  clearCanvasBackingStoreV1,
  type DirectedStagePaletteV1,
} from "@lyricstage/renderer";
import { canvasBackingStoreForV1 } from "./canvasBackingStore";
import type { StageFrameV1 } from "./stageFrame";

export type PerformanceEnvironmentStatus = "loading" | "webgl" | "canvas2d" | "failed";

export interface PerformanceEnvironmentHandle {
  renderFrame: (frame: StageFrameV1) => void;
}

const tuningFor = (
  plan: DirectorPlanV1,
  timeMs: number,
  reduceMotion: boolean,
  vjMode: boolean,
): { tuning: EnvironmentTuningV1; energy: number } => {
  const section = directorSectionAtV1(plan, timeMs);
  const recipe = effectRecipeAtV1(plan.effects, timeMs);
  const world = plan.world;
  const recipeEnergy = recipe?.primary.primitive === "field.aperture" || recipe?.primary.primitive === "density.release"
    ? 0.42
    : recipe?.primary.primitive === "density.lift" || recipe?.presentation === "hero"
      ? 1.08
      : 1;
  const presentationEnergy = recipe?.presentation === "hero"
    ? 0.86
    : recipe?.presentation === "duet"
      ? 0.72
      : recipe?.presentation === "aperture"
        ? 0.28
        : recipe?.presentation === "section"
          ? 0.58
        : 0.68;
  const sectionEnergy = Math.min(1, Math.max(
    0.22,
    section.intensity * recipeEnergy * presentationEnergy * (0.72 + world.atmosphere * 0.44),
  ));
  const energy = vjMode && !reduceMotion
    ? Math.min(1, 0.24 + sectionEnergy * 0.82)
    : sectionEnergy;
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
  return {
    energy,
    tuning: {
      intensity: energy,
      bloom: vjMode && !reduceMotion ? Math.min(1, artBloom + 0.14) : artBloom,
      drift: reduceMotion ? 0 : vjMode ? Math.min(0.96, artDrift + 0.2) : artDrift,
      railOpacity: section.artDirection === "neonRail"
        || section.layout.startsWith("rail")
        || world.motionLaw === "flow"
        || world.motionLaw === "converge"
        ? vjMode && !reduceMotion ? 0.96 : 0.82
        : 0,
    },
  };
};

const cssColor = (value: number): string => `#${value.toString(16).padStart(6, "0")}`;

const numericColor = (value: string, fallback: number): number => {
  const match = value.match(/^#([\da-f]{6})$/iu);
  return match ? Number.parseInt(match[1]!, 16) : fallback;
};

const mixNumericColor = (base: number, toward: number, amount: number): number => {
  const mixChannel = (shift: number) => {
    const left = (base >> shift) & 0xff;
    const right = (toward >> shift) & 0xff;
    return Math.round(left + (right - left) * amount);
  };
  return (mixChannel(16) << 16) | (mixChannel(8) << 8) | mixChannel(0);
};

const applyDirectedPalette = (
  frame: EnvironmentFrameV1,
  palette?: DirectedStagePaletteV1,
): EnvironmentFrameV1 => {
  if (!palette) return frame;
  const signal = numericColor(palette.signal, frame.orbs[0]?.color ?? frame.paper);
  const signalAlt = numericColor(palette.signalAlt, frame.rails[0]?.color ?? frame.paper);
  return {
    ...frame,
    background: numericColor(palette.ground, frame.background),
    shadow: numericColor(palette.groundLift, frame.shadow),
    paper: numericColor(palette.ink, frame.paper),
    particles: frame.particles.map((particle, index) => ({
      ...particle,
      color: index % 3 === 0 ? signalAlt : signal,
    })),
    rails: frame.rails.map((rail, index) => ({
      ...rail,
      color: index % 2 === 0 ? signal : signalAlt,
    })),
    orbs: frame.orbs.map((orb, index) => ({
      ...orb,
      color: index % 2 === 0 ? signal : signalAlt,
    })),
  };
};

const drawCanvas2D = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  stageFrame: StageFrameV1,
) => {
  const { tuning, energy } = tuningFor(
    stageFrame.plan,
    stageFrame.timeMs,
    stageFrame.reduceMotion,
    stageFrame.vjMode,
  );
  const frame = applyDirectedPalette(sampleEnvironmentSceneV1(
    stageFrame.environmentScene,
    stageFrame.timeMs,
    tuning,
    energy,
  ), stageFrame.palette);
  clearCanvasBackingStoreV1(context);
  context.save();
  context.globalAlpha = 0.72;
  context.fillStyle = cssColor(frame.background);
  context.fillRect(0, 0, width, height);
  context.restore();
  frame.orbs.forEach((orb) => {
    const radius = Math.max(1, orb.radius * Math.max(width, height) * 1.42);
    const glowColor = mixNumericColor(orb.color, frame.paper, 0.34);
    const gradient = context.createRadialGradient(orb.x * width, orb.y * height, 0, orb.x * width, orb.y * height, radius);
    gradient.addColorStop(0, `${cssColor(glowColor)}${Math.round(Math.min(0.42, 0.11 + orb.alpha * 1.7) * 255).toString(16).padStart(2, "0")}`);
    gradient.addColorStop(0.64, `${cssColor(glowColor)}${Math.round(Math.min(0.12, 0.025 + orb.alpha * 0.34) * 255).toString(16).padStart(2, "0")}`);
    gradient.addColorStop(1, `${cssColor(glowColor)}00`);
    context.fillStyle = gradient;
    context.fillRect(orb.x * width - radius, orb.y * height - radius, radius * 2, radius * 2);
  });
  frame.rails.forEach((rail) => {
    const centerY = rail.offset * height;
    const rise = Math.tan(rail.angle) * width;
    context.save();
    context.globalAlpha = Math.min(0.62, rail.alpha * 2.2);
    context.strokeStyle = cssColor(rail.color);
    context.lineWidth = Math.max(1, rail.width * height);
    context.beginPath();
    context.moveTo(-width * 0.15, centerY - rise * 0.65);
    context.lineTo(width * 1.15, centerY + rise * 0.65);
    context.stroke();
    context.restore();
  });
  frame.particles.forEach((particle) => {
    context.save();
    context.globalAlpha = Math.min(0.46, particle.alpha * 0.72);
    context.fillStyle = cssColor(particle.color);
    context.beginPath();
    context.arc(particle.x * width, particle.y * height, Math.max(1.1, particle.radius * height), 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
};

const draw = (
  graphics: Graphics,
  width: number,
  height: number,
  stageFrame: StageFrameV1,
) => {
  const { tuning, energy } = tuningFor(
    stageFrame.plan,
    stageFrame.timeMs,
    stageFrame.reduceMotion,
    stageFrame.vjMode,
  );
  const frame = applyDirectedPalette(sampleEnvironmentSceneV1(
    stageFrame.environmentScene,
    stageFrame.timeMs,
    tuning,
    energy,
  ), stageFrame.palette);
  graphics.clear();
  graphics.rect(0, 0, width, height).fill({ color: frame.background, alpha: 0.72 });
  frame.orbs.forEach((orb) => {
    const radius = orb.radius * Math.max(width, height) * 1.42;
    const glowColor = mixNumericColor(orb.color, frame.paper, 0.34);
    const ringCount = 40;
    for (let ring = ringCount; ring >= 1; ring -= 1) {
      const radialPosition = ring / ringCount;
      const softness = (1 - radialPosition) ** 1.65;
      graphics.circle(orb.x * width, orb.y * height, radius * radialPosition).fill({
        color: glowColor,
        alpha: 0.0007 + softness * Math.min(0.012, 0.003 + orb.alpha * 0.026),
      });
    }
  });
  frame.rails.forEach((rail) => {
    const centerY = rail.offset * height;
    const rise = Math.tan(rail.angle) * width;
    graphics
      .moveTo(-width * 0.15, centerY - rise * 0.65)
      .lineTo(width * 1.15, centerY + rise * 0.65)
      .stroke({ color: rail.color, alpha: Math.min(0.62, rail.alpha * 2.2), width: Math.max(1, rail.width * height) });
  });
  frame.particles.forEach((particle) => {
    graphics.circle(
      particle.x * width,
      particle.y * height,
      Math.max(0.75, particle.radius * height),
    ).fill({ color: particle.color, alpha: Math.min(0.46, particle.alpha * 0.72) });
  });
};

export const PerformanceEnvironment = forwardRef<PerformanceEnvironmentHandle, {
  onStatus?: (status: PerformanceEnvironmentStatus) => void;
}>(function PerformanceEnvironment({ onStatus }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<Application | null>(null);
  const graphicsRef = useRef<Graphics | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const failedRef = useRef(false);
  const latestFrameRef = useRef<StageFrameV1 | null>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const report = (next: PerformanceEnvironmentStatus) => {
    failedRef.current = next === "failed";
    if (hostRef.current) hostRef.current.dataset.renderer = next;
    onStatusRef.current?.(next);
  };
  const renderCurrent = () => {
    const application = applicationRef.current;
    const graphics = graphicsRef.current;
    const frame = latestFrameRef.current;
    if (failedRef.current || !frame) return;
    try {
      if (application && graphics) {
        draw(
          graphics,
          application.screen.width,
          application.screen.height,
          frame,
        );
        application.render();
        return;
      }
      const host = hostRef.current;
      const canvas = fallbackCanvasRef.current;
      const context = fallbackContextRef.current;
      if (!host || !canvas || !context) return;
      const { width, height } = sizeRef.current;
      if (width < 2 || height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const backing = canvasBackingStoreForV1(width, height, dpr);
      if (canvas.width !== backing.pixelWidth || canvas.height !== backing.pixelHeight) {
        canvas.width = backing.pixelWidth;
        canvas.height = backing.pixelHeight;
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(backing.scaleX, 0, 0, backing.scaleY, 0, 0);
      drawCanvas2D(
        context,
        width,
        height,
        frame,
      );
    } catch {
      report("failed");
    }
  };

  useImperativeHandle(ref, () => ({
    renderFrame: (frame) => {
      latestFrameRef.current = frame;
      renderCurrent();
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const rect = host.getBoundingClientRect();
    sizeRef.current = {
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
    let disposed = false;
    let initialized = false;
    let onContextLost: ((event: Event) => void) | undefined;
    let onContextRestored: (() => void) | undefined;
    const application = new Application();
    const activateCanvasFallback = (reason: string) => {
      if (disposed || fallbackCanvasRef.current) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) {
        host.dataset.failureReason = reason.slice(0, 160);
        report("failed");
        return;
      }
      applicationRef.current = null;
      graphicsRef.current = null;
      if (initialized) application.canvas.style.display = "none";
      canvas.className = "performance-environment-canvas performance-environment-canvas-fallback";
      canvas.dataset.fallbackReason = reason.slice(0, 160);
      fallbackCanvasRef.current = canvas;
      fallbackContextRef.current = context;
      host.appendChild(canvas);
      report("canvas2d");
      renderCurrent();
    };
    void application.init({
      width: sizeRef.current.width,
      height: sizeRef.current.height,
      preference: "webgl",
      powerPreference: "high-performance",
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoStart: false,
    }).then(() => {
      if (disposed) {
        application.destroy(true);
        return;
      }
      initialized = true;
      const graphics = new Graphics();
      application.stage.addChild(graphics);
      applicationRef.current = application;
      graphicsRef.current = graphics;
      application.canvas.className = "performance-environment-canvas";
      onContextLost = (event: Event) => {
        event.preventDefault();
        activateCanvasFallback("webgl-context-lost");
      };
      onContextRestored = () => {
        if (disposed) return;
        const frame = latestFrameRef.current;
        if (!frame) return;
        try {
          // Prove that Pixi can draw and submit a frame again before removing
          // the functioning Canvas2D fallback or reporting WebGL recovery.
          draw(
            graphics,
            application.screen.width,
            application.screen.height,
            frame,
          );
          application.render();
        } catch {
          applicationRef.current = null;
          graphicsRef.current = null;
          application.canvas.style.display = "none";
          report("canvas2d");
          renderCurrent();
          return;
        }
        applicationRef.current = application;
        graphicsRef.current = graphics;
        application.canvas.style.display = "";
        fallbackContextRef.current = null;
        fallbackCanvasRef.current?.remove();
        fallbackCanvasRef.current = null;
        delete host.dataset.failureReason;
        report("webgl");
      };
      application.canvas.addEventListener("webglcontextlost", onContextLost);
      application.canvas.addEventListener("webglcontextrestored", onContextRestored);
      host.appendChild(application.canvas);
      report("webgl");
      renderCurrent();
    }).catch((error) => {
      if (!disposed) {
        activateCanvasFallback(error instanceof Error ? error.message : "webgl-init-failed");
      }
    });
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      sizeRef.current = { width, height };
      if (applicationRef.current) applicationRef.current.renderer.resize(width, height);
      renderCurrent();
    });
    observer.observe(host);
    return () => {
      disposed = true;
      observer.disconnect();
      graphicsRef.current = null;
      applicationRef.current = null;
      fallbackContextRef.current = null;
      fallbackCanvasRef.current?.remove();
      fallbackCanvasRef.current = null;
      if (onContextLost) application.canvas.removeEventListener("webglcontextlost", onContextLost);
      if (onContextRestored) application.canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (initialized) application.destroy(true, { children: true });
    };
  }, []);

  return <div className="performance-environment" ref={hostRef} data-renderer="loading" aria-hidden="true" />;
});
