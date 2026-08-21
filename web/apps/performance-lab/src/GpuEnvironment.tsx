import { useEffect, useRef, useState } from "react";
import { Application, Graphics } from "pixi.js";
import {
  sampleEnvironmentSceneV1,
  type EnvironmentSceneV1,
  type EnvironmentTuningV1,
} from "@lyricstage/performance";

export type GpuRendererStatus = "loading" | "webgl" | "failed";

const drawEnvironment = (
  graphics: Graphics,
  width: number,
  height: number,
  scene: EnvironmentSceneV1,
  timeMs: number,
  tuning: EnvironmentTuningV1,
  structureEnergy: number,
) => {
  const frame = sampleEnvironmentSceneV1(scene, timeMs, tuning, structureEnergy);
  graphics.clear();
  graphics.rect(0, 0, width, height).fill({ color: frame.background });

  frame.orbs.forEach((orb) => {
    const radius = orb.radius * Math.max(width, height);
    for (let ring = 5; ring >= 1; ring -= 1) {
      graphics.circle(orb.x * width, orb.y * height, radius * ring / 5).fill({
        color: orb.color,
        alpha: orb.alpha * 0.12 * (6 - ring),
      });
    }
  });

  frame.rails.forEach((rail) => {
    const centerY = rail.offset * height;
    const rise = Math.tan(rail.angle) * width;
    graphics
      .moveTo(-width * 0.12, centerY - rise * 0.62)
      .lineTo(width * 1.12, centerY + rise * 0.62)
      .stroke({
        color: rail.color,
        alpha: rail.alpha,
        width: Math.max(0.7, rail.width * height),
      });
  });

  frame.particles.forEach((particle) => {
    graphics.circle(
      particle.x * width,
      particle.y * height,
      Math.max(0.8, particle.radius * height),
    ).fill({ color: particle.color, alpha: particle.alpha });
  });

  graphics.rect(0, 0, width, height).stroke({ color: frame.paper, alpha: 0.045, width: 1 });
};

export function GpuEnvironment({
  scene,
  timeMs,
  tuning,
  structureEnergy,
  onRendererStatus,
}: {
  scene: EnvironmentSceneV1;
  timeMs: number;
  tuning: EnvironmentTuningV1;
  structureEnergy: number;
  onRendererStatus?: (status: GpuRendererStatus) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<Application | null>(null);
  const graphicsRef = useRef<Graphics | null>(null);
  const latestFrameRef = useRef({ timeMs, tuning, structureEnergy });
  const [status, setStatus] = useState<GpuRendererStatus>("loading");
  latestFrameRef.current = { timeMs, tuning, structureEnergy };

  const reportStatus = (next: GpuRendererStatus) => {
    setStatus(next);
    onRendererStatus?.(next);
  };

  const renderCurrentFrame = () => {
    const application = applicationRef.current;
    const graphics = graphicsRef.current;
    if (!application || !graphics) return;
    const current = latestFrameRef.current;
    drawEnvironment(
      graphics,
      application.screen.width,
      application.screen.height,
      scene,
      current.timeMs,
      current.tuning,
      current.structureEnergy,
    );
    application.render();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let disposed = false;
    let initialized = false;
    const application = new Application();

    void application.init({
      resizeTo: host,
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
      application.canvas.className = "lab-gpu-canvas";
      host.appendChild(application.canvas);
      reportStatus("webgl");
      renderCurrentFrame();
    }).catch(() => {
      if (!disposed) reportStatus("failed");
    });

    const observer = new ResizeObserver(() => requestAnimationFrame(renderCurrentFrame));
    observer.observe(host);
    return () => {
      disposed = true;
      observer.disconnect();
      graphicsRef.current = null;
      applicationRef.current = null;
      if (initialized) application.destroy(true, { children: true });
    };
  }, [scene]);

  useEffect(renderCurrentFrame, [scene, timeMs, tuning, structureEnergy]);

  return <div ref={hostRef} className="lab-gpu-environment" data-renderer={status} aria-hidden="true" />;
}
