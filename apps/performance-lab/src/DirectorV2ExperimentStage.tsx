import { useEffect, useLayoutEffect, useRef } from "react";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { directorSectionAtV1, effectRecipeAtV1, type DirectorPlanV1 } from "@lyricstage/performance";
import {
  directedPaletteForIndexV1,
  drawDirectedStageV1,
  prepareDirectedStageV1,
  type PreparedDirectedStageV1,
} from "@lyricstage/renderer";

export function DirectorV2ExperimentStage({
  lyrics,
  plan,
  timeMs,
  variantID,
  variantLabel,
}: {
  lyrics: LyricDocumentV0;
  plan: DirectorPlanV1;
  timeMs: number;
  variantID: string;
  variantLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preparedRef = useRef<PreparedDirectedStageV1 | null>(null);
  const timeRef = useRef(timeMs);
  timeRef.current = timeMs;

  const draw = () => {
    const canvas = canvasRef.current;
    const prepared = preparedRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!context || !prepared) return;
    const section = directorSectionAtV1(plan, timeRef.current);
    drawDirectedStageV1(context, prepared, {
      timeMs: timeRef.current,
      reduceMotion: false,
      showGuides: false,
      palette: directedPaletteForIndexV1(section.paletteIndex),
    });
  };

  useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return undefined;
    let disposed = false;
    const rebuild = () => {
      if (disposed) return;
      const rect = host.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      preparedRef.current = prepareDirectedStageV1(lyrics, plan, {
        width: rect.width,
        height: rect.height,
        rendererVersion: "performance-lab-director-v2",
      }, (text, font) => {
        context.font = font;
        return context.measureText(text).width;
      });
      draw();
    };
    const observer = new ResizeObserver(rebuild);
    observer.observe(host);
    void document.fonts.ready.then(rebuild);
    rebuild();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [lyrics, plan.planIdentity]);

  useEffect(draw, [timeMs, plan.planIdentity]);

  const activeEffect = effectRecipeAtV1(plan.effects, timeMs);
  return (
    <section ref={hostRef} className="director-v2-experiment-stage" data-variant={variantID}>
      <canvas ref={canvasRef} aria-label={`Director V2 ${variantID} 演出预览`} />
      <div className="director-v2-experiment-label">
        <strong>{variantID}</strong>
        <span>{variantLabel}</span>
      </div>
      <div className="director-v2-experiment-effect">
        {activeEffect ? `${activeEffect.primary.primitive} · ${activeEffect.presentation}` : "local reading"}
      </div>
    </section>
  );
}
