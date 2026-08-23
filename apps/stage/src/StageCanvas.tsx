import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { YouTubeMusicSnapshotV0, YouTubeMusicTransportActionV0 } from "@lyricstage/companion";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import type { PlaybackClockV0 } from "@lyricstage/core";
import {
  directorSectionAtV1,
  compileEnvironmentSceneV1,
  effectRecipeAtV1,
  queueDirectorPlanV1,
  sampleDirectorPlanHandoffV1,
  stagePresentationAtV1,
  type DirectorPlanHandoffV1,
  type DirectorPlanV1,
  type SceneCardV1,
} from "@lyricstage/performance";
import {
  directedPaletteForIndexV1,
  drawDirectedStageV1,
  FrameSamplerV0,
  prepareDirectedStageV1,
  type DirectedStagePaletteV1,
  type PreparedDirectedStageV1,
} from "@lyricstage/renderer";
import {
  PerformanceEnvironment,
  type PerformanceEnvironmentHandle,
} from "./PerformanceEnvironment";
import {
  extractArtworkPaletteV1,
  mergeArtworkDirectorPaletteV1,
  paletteToneForV1,
} from "./artworkPalette";
import {
  directorPlanForStageEntry,
  directorStatusLabel,
  type DirectorLookupState,
} from "./playback/performanceDirector";
import { lyricsTimeForPlaybackMs } from "./playback/lyricsTimeOffset";
import { canvasBackingStoreForV1 } from "./canvasBackingStore";
import {
  queueRollingDirectorPlanV1,
  rollingPreparedRendererIdentityV1,
} from "./playback/rollingPerformanceDirector";
import { artworkCandidates, artworkShapeForAspectV1, type ArtworkShapeV1 } from "./artworkCandidates";
import {
  applyStageFrameDOMV1,
  createStageFrameBuffersV1,
  stageEnvironmentSceneKeyV1,
  writeStageFrameV1,
  type StageFrameBuffersV1,
} from "./stageFrame";

interface StageCanvasProps {
  lyrics: LyricDocumentV0;
  localDirectorPlan: DirectorPlanV1;
  remoteDirectorPlan?: DirectorPlanV1;
  directorLookupState: DirectorLookupState;
  directorMode?: "legacy" | "rolling";
  bibleSource?: "cache" | "network" | "local";
  rollingCards?: readonly SceneCardV1[];
  clock: PlaybackClockV0;
  continuous: boolean;
  displayTimeMs: number;
  lyricsOffsetMs: number;
  reduceMotion: boolean;
  vjMode: boolean;
  showGuides: boolean;
  onMetrics: (summary: { count: number; p95: number; p99: number; max: number }) => void;
  title?: string;
  artist?: string;
  artworkURL?: string;
  durationMs: number;
  playbackState?: "playing" | "paused" | "buffering" | "ended";
  controls?: YouTubeMusicSnapshotV0["controls"];
  onSeek?: (timeMs: number) => void | Promise<void>;
  onTransport?: (action: YouTubeMusicTransportActionV0) => void | Promise<void>;
}

const formatPlaybackTime = (timeMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

function TransportIcon({ kind }: { kind: "previous" | "next" | "play" | "pause" }) {
  if (kind === "play") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L19 12 8 5.4Z" /></svg>;
  }
  if (kind === "pause") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7V5Zm6.5 0H17v14h-3.5V5Z" /></svg>;
  }
  const path = kind === "previous"
    ? "M6 5h2v14H6V5Zm12 1v12L9 12l9-6Z"
    : "M16 5h2v14h-2V5ZM6 6l9 6-9 6V6Z";
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

export function StageCanvas({
  lyrics,
  localDirectorPlan,
  remoteDirectorPlan,
  directorLookupState,
  directorMode = "legacy",
  bibleSource,
  rollingCards = [],
  clock,
  continuous,
  displayTimeMs,
  lyricsOffsetMs,
  reduceMotion,
  vjMode,
  showGuides,
  onMetrics,
  title,
  artist,
  artworkURL,
  durationMs,
  playbackState,
  controls,
  onSeek,
  onTransport,
}: StageCanvasProps) {
  const entryDirectorPlan = directorPlanForStageEntry(localDirectorPlan, remoteDirectorPlan);
  const hostRef = useRef<HTMLDivElement>(null);
  const lyricViewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const environmentRef = useRef<PerformanceEnvironmentHandle>(null);
  const washPrimaryRef = useRef<HTMLImageElement>(null);
  const washSecondaryRef = useRef<HTMLImageElement>(null);
  const motifRef = useRef<HTMLDivElement>(null);
  const artworkRef = useRef<HTMLImageElement>(null);
  const progressRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const remainingRef = useRef<HTMLSpanElement>(null);
  const scrubbingRef = useRef(false);
  const renderFrameRef = useRef<(() => void) | null>(null);
  const preparedPlansRef = useRef(new Map<string, PreparedDirectedStageV1>());
  const samplerRef = useRef(new FrameSamplerV0(240));
  const displayTimeRef = useRef(displayTimeMs);
  const frameTimeRef = useRef(lyricsTimeForPlaybackMs(displayTimeMs, lyricsOffsetMs, durationMs));
  const frameBuffersRef = useRef<StageFrameBuffersV1 | null>(null);
  const handoffRef = useRef<DirectorPlanHandoffV1>({ active: entryDirectorPlan });
  const [artworkPalette, setArtworkPalette] = useState<DirectedStagePaletteV1 | undefined>();
  const [artworkCandidateIndex, setArtworkCandidateIndex] = useState(0);
  const [artworkAspect, setArtworkAspect] = useState(1);
  displayTimeRef.current = displayTimeMs;
  const normalizedArtworkCandidates = useMemo(() => artworkCandidates(artworkURL), [artworkURL]);
  const normalizedArtworkURL = normalizedArtworkCandidates[artworkCandidateIndex];
  const coverInitial = Array.from(title?.trim() || "L")[0]?.toUpperCase() ?? "L";
  const availablePlans = useMemo(() => {
    const plans = new Map<string, DirectorPlanV1>();
    plans.set(localDirectorPlan.planIdentity, localDirectorPlan);
    plans.set(entryDirectorPlan.planIdentity, entryDirectorPlan);
    if (remoteDirectorPlan) plans.set(remoteDirectorPlan.planIdentity, remoteDirectorPlan);
    return plans;
  }, [entryDirectorPlan, localDirectorPlan, remoteDirectorPlan]);
  const sectionPalettes = useMemo(() => {
    const palettes = new Map<string, DirectedStagePaletteV1>();
    availablePlans.forEach((plan) => plan.sections.forEach((section) => {
      const directed = directedPaletteForIndexV1(section.paletteIndex);
      const composed = artworkPalette
        ? plan.source === "local"
          ? artworkPalette
          : mergeArtworkDirectorPaletteV1(artworkPalette, directed, section.intensity)
        : directed;
      palettes.set(stageEnvironmentSceneKeyV1(plan.planIdentity, section.id), composed);
    }));
    return palettes;
  }, [artworkPalette, availablePlans]);
  const paletteForPlanTime = useMemo(() => (
    plan: DirectorPlanV1,
    timeMs: number,
  ): DirectedStagePaletteV1 => {
    const section = directorSectionAtV1(plan, timeMs);
    return sectionPalettes.get(stageEnvironmentSceneKeyV1(plan.planIdentity, section.id))
      ?? directedPaletteForIndexV1(section.paletteIndex);
  }, [sectionPalettes]);
  const environmentScenes = useMemo(() => {
    const scenes = new Map<string, ReturnType<typeof compileEnvironmentSceneV1>>();
    availablePlans.forEach((plan) => plan.sections.forEach((section) => {
      scenes.set(
        stageEnvironmentSceneKeyV1(plan.planIdentity, section.id),
        compileEnvironmentSceneV1(
          plan.recordingID,
          `${plan.planIdentity}:${section.artDirection}:${section.paletteIndex}:${section.id}`,
        ),
      );
    }));
    return scenes;
  }, [availablePlans]);

  useEffect(() => {
    setArtworkCandidateIndex(0);
    setArtworkAspect(1);
  }, [artworkURL]);

  useEffect(() => {
    if (!normalizedArtworkURL) {
      setArtworkPalette(undefined);
      return undefined;
    }
    let cancelled = false;
    const sampler = new Image();
    sampler.crossOrigin = "anonymous";
    sampler.decoding = "async";
    sampler.onload = () => {
      if (cancelled || sampler.naturalWidth < 1 || sampler.naturalHeight < 1) return;
      try {
        if (!cancelled) setArtworkAspect(sampler.naturalWidth / sampler.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(sampler, 0, 0, sampler.naturalWidth, sampler.naturalHeight, 0, 0, 48, 48);
        const imageData = context.getImageData(0, 0, 48, 48);
        const next = extractArtworkPaletteV1(imageData);
        if (!cancelled) setArtworkPalette(next);
      } catch {
        if (!cancelled) setArtworkPalette(undefined);
      }
    };
    sampler.onerror = () => {
      if (!cancelled) setArtworkPalette(undefined);
    };
    sampler.src = normalizedArtworkURL;
    return () => {
      cancelled = true;
      sampler.src = "";
    };
  }, [normalizedArtworkURL]);

  useEffect(() => {
    const entry = directorPlanForStageEntry(localDirectorPlan, remoteDirectorPlan);
    handoffRef.current = { active: entry };
    frameBuffersRef.current = null;
  }, [localDirectorPlan.planIdentity]);

  useLayoutEffect(() => {
    if (!remoteDirectorPlan) {
      if (directorMode === "rolling" && handoffRef.current.active.planIdentity !== localDirectorPlan.planIdentity) {
        handoffRef.current = { active: localDirectorPlan };
      }
      return;
    }
    const sample = clock.sample();
    const playbackTimeMs = sample.state === "unavailable" ? displayTimeRef.current : sample.timeMs;
    const timeMs = lyricsTimeForPlaybackMs(playbackTimeMs, lyricsOffsetMs, durationMs);
    handoffRef.current = directorMode === "rolling"
      ? queueRollingDirectorPlanV1(lyrics, handoffRef.current, remoteDirectorPlan, timeMs)
      : queueDirectorPlanV1(handoffRef.current, remoteDirectorPlan, timeMs);
  }, [clock, directorMode, durationMs, lyrics, lyricsOffsetMs, remoteDirectorPlan?.planIdentity]);

  const rendererIdentity = useMemo(
    () => Array.from(availablePlans.keys())
      .sort()
      .map((planIdentity) => rollingPreparedRendererIdentityV1(lyrics.recordingID, planIdentity))
      .join("|"),
    [availablePlans, lyrics.recordingID],
  );

  useLayoutEffect(() => {
    const host = lyricViewportRef.current;
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
      const backing = canvasBackingStoreForV1(rect.width, rect.height, dpr);
      canvas.width = backing.pixelWidth;
      canvas.height = backing.pixelHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      context.setTransform(backing.scaleX, 0, 0, backing.scaleY, 0, 0);
      const preparedPlans = new Map<string, PreparedDirectedStageV1>();
      availablePlans.forEach((plan) => {
        preparedPlans.set(plan.planIdentity, prepareDirectedStageV1(
          lyrics,
          plan,
          {
            width: rect.width,
            height: rect.height,
            rendererVersion: "canvas2d-directed-v1",
          },
          (text, font) => {
            context.font = font;
            return context.measureText(text).width;
          },
        ));
      });
      preparedPlansRef.current = preparedPlans;
      samplerRef.current = new FrameSamplerV0(240);
      const initialTimeMs = lyricsTimeForPlaybackMs(displayTimeRef.current, lyricsOffsetMs, durationMs);
      const initialPlan = handoffRef.current.active;
      const initialPrepared = preparedPlans.get(initialPlan.planIdentity);
      if (initialPrepared) {
        drawDirectedStageV1(context, initialPrepared, {
          timeMs: initialTimeMs,
          reduceMotion,
          showGuides,
          palette: paletteForPlanTime(initialPlan, initialTimeMs),
        });
      }
    };

    const observer = new ResizeObserver(rebuild);
    observer.observe(host);
    void document.fonts.ready.then(rebuild);
    rebuild();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [availablePlans, durationMs, lyrics, lyricsOffsetMs, paletteForPlanTime, reduceMotion, rendererIdentity, showGuides]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!context) return undefined;

    let frameID = 0;
    let frameCount = 0;
    const updateProgress = (timeMs: number) => {
      if (scrubbingRef.current) return;
      const bounded = Math.min(Math.max(0, durationMs), Math.max(0, timeMs));
      const progress = durationMs > 0 ? bounded / durationMs : 0;
      if (progressRef.current) {
        progressRef.current.value = String(bounded);
        progressRef.current.style.setProperty("--stage-progress", `${progress * 100}%`);
      }
      if (elapsedRef.current) elapsedRef.current.textContent = formatPlaybackTime(bounded);
      if (remainingRef.current) remainingRef.current.textContent = `−${formatPlaybackTime(Math.max(0, durationMs - bounded))}`;
    };
    const render = () => {
      frameID = 0;
      const sample = clock.sample();
      const playbackTimeMs = !continuous || sample.state === "unavailable"
        ? displayTimeRef.current
        : sample.timeMs;
      const timeMs = lyricsTimeForPlaybackMs(playbackTimeMs, lyricsOffsetMs, durationMs);
      frameTimeRef.current = timeMs;
      const handoff = sampleDirectorPlanHandoffV1(handoffRef.current, timeMs);
      if (handoff.active.planIdentity !== handoffRef.current.active.planIdentity) {
        handoffRef.current = handoff;
      }
      const activeSection = directorSectionAtV1(handoff.active, timeMs);
      const activeEffect = effectRecipeAtV1(handoff.active.effects, timeMs);
      const activeLine = lyrics.lines.find((line) => timeMs >= line.fromMs && timeMs < line.toMs);
      const activeDirective = activeLine
        ? handoff.active.directives.find((directive) => directive.lineIndex === activeLine.lineIndex)
        : undefined;
      const activeScene = rollingCards.find((card) => activeSection.id === `rolling:${card.sceneID}`
        && timeMs >= card.fromMs && timeMs < card.toMs);
      const sceneCoverage = activeScene
        ? Math.max(0, activeScene.toMs - timeMs)
        : 0;
      if (hostRef.current) {
        hostRef.current.dataset.directorSource = handoff.active.source;
        hostRef.current.dataset.directorLayout = activeSection.layout;
        hostRef.current.dataset.directorArtDirection = activeSection.artDirection;
        hostRef.current.dataset.directorTypography = activeSection.typography;
        if (activeEffect) {
          hostRef.current.dataset.directorEffect = activeEffect.primary.primitive;
          const coverPortal = activeEffect.primary.primitive === "cover.portal"
            || activeEffect.support.some((use) => use.primitive === "cover.portal");
          const coverIsland = activeEffect.primary.primitive === "cover.island"
            || activeEffect.support.some((use) => use.primitive === "cover.island");
          if (coverPortal) hostRef.current.dataset.directorCoverEffect = "portal";
          else if (coverIsland) hostRef.current.dataset.directorCoverEffect = "island";
          else delete hostRef.current.dataset.directorCoverEffect;
        } else {
          delete hostRef.current.dataset.directorEffect;
          delete hostRef.current.dataset.directorCoverEffect;
        }
        if (activeDirective) hostRef.current.dataset.directorBehavior = activeDirective.behavior;
        else delete hostRef.current.dataset.directorBehavior;
        hostRef.current.dataset.directorMode = directorMode;
        hostRef.current.dataset.bibleSource = bibleSource ?? "local";
        hostRef.current.dataset.sceneCoverageMs = String(Math.round(sceneCoverage));
        hostRef.current.dataset.sceneCount = String(rollingCards.length);
        hostRef.current.dataset.layoutChangeCount = String(handoff.active.blocking.transitions.length);
        hostRef.current.dataset.gestureCount = String(handoff.active.gestures.length);
        hostRef.current.dataset.effectCount = String(handoff.active.effects.length);
        hostRef.current.dataset.dramaticMomentCount = String(handoff.active.dramaticScore.signatureMoments.length);
        hostRef.current.dataset.dramaticMotif = handoff.active.dramaticScore.motifActor.family;
        if (activeScene) hostRef.current.dataset.sceneId = activeScene.sceneID;
        else delete hostRef.current.dataset.sceneId;
      }
      const nextPalette = paletteForPlanTime(handoff.active, timeMs);
      const environmentScene = environmentScenes.get(stageEnvironmentSceneKeyV1(
        handoff.active.planIdentity,
        activeSection.id,
      )) ?? environmentScenes.values().next().value!;
      const stageFrameInput = {
        playbackTimeMs,
        timeMs,
        plan: handoff.active,
        environmentScene,
        palette: nextPalette,
        sectionIntensity: activeSection.intensity,
        reduceMotion,
        vjMode,
        showGuides,
      };
      if (!frameBuffersRef.current) frameBuffersRef.current = createStageFrameBuffersV1(stageFrameInput);
      const stageFrame = writeStageFrameV1(frameBuffersRef.current, stageFrameInput);
      if (hostRef.current) {
        applyStageFrameDOMV1(stageFrame, {
          host: hostRef.current,
          motif: motifRef.current,
          washPrimary: washPrimaryRef.current,
          washSecondary: washSecondaryRef.current,
          artwork: artworkRef.current,
        });
        hostRef.current.dataset.presentation = stagePresentationAtV1(handoff.active.effects, timeMs, lyrics);
        hostRef.current.dataset.paletteTone = paletteToneForV1(nextPalette);
        hostRef.current.dataset.paletteSource = artworkPalette
          ? handoff.active.source === "local" ? "artwork" : "artwork-directed"
          : "fallback";
      }
      updateProgress(playbackTimeMs);
      const prepared = preparedPlansRef.current.get(handoff.active.planIdentity)
        ?? preparedPlansRef.current.values().next().value!;
      const duration = drawDirectedStageV1(context, prepared, {
        timeMs: stageFrame.timeMs,
        reduceMotion: stageFrame.reduceMotion,
        showGuides: stageFrame.showGuides,
        palette: stageFrame.palette,
      });
      environmentRef.current?.renderFrame(stageFrame);
      samplerRef.current.push(duration);
      frameCount += 1;
      if (frameCount % 60 === 0) {
        const summary = samplerRef.current.summary();
        if (hostRef.current) {
          hostRef.current.dataset.frameCount = String(summary.count);
          hostRef.current.dataset.frameP95 = summary.p95.toFixed(3);
          hostRef.current.dataset.frameP99 = summary.p99.toFixed(3);
          hostRef.current.dataset.frameMax = summary.max.toFixed(3);
        }
        onMetrics(summary);
      }
      if (continuous && !document.hidden) frameID = requestAnimationFrame(render);
    };
    renderFrameRef.current = render;
    const visibilityChanged = () => {
      if (document.hidden) {
        if (frameID) cancelAnimationFrame(frameID);
        frameID = 0;
      } else if (continuous && !frameID) {
        render();
      }
    };
    render();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      if (frameID) cancelAnimationFrame(frameID);
      if (renderFrameRef.current === render) renderFrameRef.current = null;
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [artworkPalette, bibleSource, clock, continuous, directorMode, durationMs, environmentScenes, lyrics, lyricsOffsetMs, onMetrics, paletteForPlanTime, reduceMotion, remoteDirectorPlan?.planIdentity, rollingCards, showGuides, vjMode]);

  useEffect(() => {
    if (!continuous) renderFrameRef.current?.();
  }, [continuous, displayTimeMs, lyricsOffsetMs]);

  const previewScrub = (timeMs: number) => {
    const bounded = Math.min(Math.max(0, durationMs), Math.max(0, timeMs));
    const progress = durationMs > 0 ? bounded / durationMs : 0;
    if (progressRef.current) progressRef.current.style.setProperty("--stage-progress", `${progress * 100}%`);
    if (elapsedRef.current) elapsedRef.current.textContent = formatPlaybackTime(bounded);
    if (remainingRef.current) remainingRef.current.textContent = `−${formatPlaybackTime(Math.max(0, durationMs - bounded))}`;
  };

  const commitScrub = (timeMs: number) => {
    scrubbingRef.current = false;
    void onSeek?.(Math.min(Math.max(0, durationMs), Math.max(0, timeMs)));
  };

  const cancelScrub = () => {
    scrubbingRef.current = false;
    renderFrameRef.current?.();
  };

  const isPlaying = playbackState === "playing" || playbackState === "buffering";
  const hasTransport = Boolean(controls?.playPause || controls?.previous || controls?.next);
  const artworkShape = artworkShapeForAspectV1(artworkAspect);
  const observedPlan = handoffRef.current.active;
  const observedTimeMs = frameTimeRef.current;
  const observedPalette = paletteForPlanTime(observedPlan, observedTimeMs);
  const paletteTone = paletteToneForV1(observedPalette);
  const observedSection = directorSectionAtV1(observedPlan, observedTimeMs);
  const observedScene = rollingCards.find((card) => observedSection.id === `rolling:${card.sceneID}`
    && observedTimeMs >= card.fromMs && observedTimeMs < card.toMs);
  const hasSemanticRollingCard = rollingCards.some((card) => card.directives !== undefined);
  const directorStatusSource = directorMode === "rolling" && hasSemanticRollingCard
    ? observedScene?.directives !== undefined ? observedPlan.source : "continuity"
    : observedPlan.source;
  const directorStatus = directorStatusLabel(
    directorLookupState,
    directorStatusSource,
    directorMode === "legacy" && Boolean(remoteDirectorPlan),
  );
  const renderedPlaybackState = playbackState ?? (continuous ? "playing" : "paused");
  const observedSceneCoverageMs = observedScene ? Math.max(0, observedScene.toMs - observedTimeMs) : 0;

  return (
    <div
      ref={hostRef}
      className="stage-canvas-host"
      style={{
        background: `radial-gradient(circle at 12% 78%, ${observedPalette.signal}66, transparent 46%), radial-gradient(circle at 86% 18%, ${observedPalette.signalAlt}59, transparent 44%), radial-gradient(circle at 58% 92%, ${observedPalette.warm}38, transparent 42%), linear-gradient(128deg, ${observedPalette.groundLift}, ${observedPalette.ground} 48%, ${observedPalette.ground})`,
        "--stage-signal": observedPalette.signal,
        "--stage-signal-alt": observedPalette.signalAlt,
        "--stage-ground": observedPalette.ground,
        "--stage-ink": observedPalette.ink,
        "--stage-ink-muted": observedPalette.inkMuted,
        "--stage-artwork-aspect": String(Math.min(2.4, Math.max(0.55, artworkAspect))),
        "--stage-world-blur-silk": `${24 + observedPlan.world.depth * 42}px`,
        "--stage-world-blur-ink": `${34 + observedPlan.world.depth * 54}px`,
        "--stage-world-blur-mist": `${58 + observedPlan.world.depth * 72}px`,
        "--stage-world-blur-glass": `${12 + observedPlan.world.depth * 26}px`,
        "--stage-world-blur-paper": `${8 + observedPlan.world.depth * 16}px`,
        "--stage-world-blur-light": `${18 + observedPlan.world.depth * 34}px`,
        "--stage-world-glow-portal": `${72 + observedPlan.world.atmosphere * 90}px`,
        "--stage-world-glow-directed": `${90 + observedPlan.world.atmosphere * 120}px`,
      } as CSSProperties}
      data-director-source={observedPlan.source}
      data-director-mode={directorMode}
      data-bible-source={bibleSource ?? "local"}
      data-scene-count={rollingCards.length}
      data-scene-id={observedScene?.sceneID}
      data-scene-coverage-ms={Math.round(observedSceneCoverageMs)}
      data-director-state={directorLookupState.status}
      data-director-version={observedPlan.directorVersion}
      data-layout-change-count={observedPlan.blocking.transitions.length}
      data-gesture-count={observedPlan.gestures.length}
      data-effect-count={observedPlan.effects.length}
      data-dramatic-moment-count={observedPlan.dramaticScore.signatureMoments.length}
      data-dramatic-motif={observedPlan.dramaticScore.motifActor.family}
      data-playback-state={renderedPlaybackState}
      data-shell-layout="lower-leading-dock"
      data-presentation={stagePresentationAtV1(observedPlan.effects, observedTimeMs, lyrics)}
      data-reduce-motion={reduceMotion || undefined}
      data-palette-source={artworkPalette
        ? observedPlan.source === "local" ? "artwork" : "artwork-directed"
        : "fallback"}
      data-palette-tone={paletteTone}
      data-artwork-shape={artworkShape}
      data-world-spatial={observedPlan.world.spatialMode}
      data-world-motion={observedPlan.world.motionLaw}
      data-world-artwork={observedPlan.world.artworkRole}
      data-world-texture={observedPlan.world.texture}
    >
      {normalizedArtworkURL && (
        <>
          <img ref={washPrimaryRef} className="stage-artwork-wash stage-artwork-wash-primary" src={normalizedArtworkURL} alt="" aria-hidden="true" />
          <img ref={washSecondaryRef} className="stage-artwork-wash stage-artwork-wash-secondary" src={normalizedArtworkURL} alt="" aria-hidden="true" />
        </>
      )}
      <div ref={motifRef} className="stage-world-motif" aria-hidden="true" />
      <PerformanceEnvironment
        ref={environmentRef}
      />
      <div className="stage-now-playing-layout">
        <aside className="stage-now-playing-info" aria-label="正在播放">
          <div className="stage-artwork-frame">
            {normalizedArtworkURL ? (
              <img
                ref={artworkRef}
                className="stage-artwork"
                src={normalizedArtworkURL}
                alt={title ? `${title} 的歌曲封面` : "当前歌曲封面"}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setArtworkAspect(image.naturalWidth / image.naturalHeight);
                  }
                }}
                onError={() => setArtworkCandidateIndex((index) => (
                  index + 1 < normalizedArtworkCandidates.length ? index + 1 : normalizedArtworkCandidates.length
                ))}
              />
            ) : (
              <div className="stage-artwork-fallback" aria-label="当前歌曲无可用封面">{coverInitial}</div>
            )}
          </div>

          <div className="stage-track-meta">
            <strong>{title || "LyricStage"}</strong>
            <span>{artist || "Local rehearsal"}</span>
            <span
              className="stage-director-status"
              aria-live="polite"
              title={directorLookupState.reason}
            >
              {directorStatus}
            </span>
          </div>

          <div className="stage-progress-group">
            <input
              ref={progressRef}
              className="stage-progress"
              type="range"
              min={0}
              max={Math.max(1, durationMs)}
              step={100}
              defaultValue={Math.min(displayTimeMs, Math.max(1, durationMs))}
              aria-label="播放进度"
              disabled={!controls?.seek || !onSeek}
              onPointerDown={() => { scrubbingRef.current = true; }}
              onInput={(event) => previewScrub(event.currentTarget.valueAsNumber)}
              onPointerUp={(event) => commitScrub(event.currentTarget.valueAsNumber)}
              onPointerCancel={cancelScrub}
              onKeyUp={(event) => commitScrub(event.currentTarget.valueAsNumber)}
              onBlur={(event) => {
                if (scrubbingRef.current) commitScrub(event.currentTarget.valueAsNumber);
              }}
            />
            <div className="stage-time-row" aria-hidden="true">
              <span ref={elapsedRef}>{formatPlaybackTime(displayTimeMs)}</span>
              <span ref={remainingRef}>−{formatPlaybackTime(Math.max(0, durationMs - displayTimeMs))}</span>
            </div>
          </div>

          {hasTransport && onTransport && (
            <div className="stage-transport" role="group" aria-label="播放控制">
              {controls?.previous && (
                <button type="button" aria-label="上一首" onClick={() => void onTransport("previous")}>
                  <TransportIcon kind="previous" />
                </button>
              )}
              {controls?.playPause && (
                <button
                  type="button"
                  className="stage-play-pause"
                  aria-label={isPlaying ? "暂停" : "播放"}
                  onClick={() => void onTransport(isPlaying ? "pause" : "play")}
                >
                  <TransportIcon kind={isPlaying ? "pause" : "play"} />
                </button>
              )}
              {controls?.next && (
                <button type="button" aria-label="下一首" onClick={() => void onTransport("next")}>
                  <TransportIcon kind="next" />
                </button>
              )}
            </div>
          )}
        </aside>

        <div ref={lyricViewportRef} className="stage-lyric-viewport">
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            role="img"
            aria-label="当前歌词演出画面"
          />
        </div>
      </div>
    </div>
  );
}
