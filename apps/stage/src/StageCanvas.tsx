import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { YouTubeMusicSnapshotV0, YouTubeMusicTransportActionV0 } from "@lyricstage/companion";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import type { PlaybackClockV0 } from "@lyricstage/core";
import {
  directorSectionAtV1,
  compileEnvironmentSceneV1,
  effectRecipeAtV1,
  stagePresentationAtV1,
  type DirectorPlanV1,
  type ReactiveBusV1,
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
import type { DirectorLookupState } from "./playback/performanceDirector";
import { lyricsTimeForPlaybackMs } from "./playback/lyricsTimeOffset";
import { canvasBackingStoreForV1 } from "./canvasBackingStore";
import { rollingPreparedRendererIdentityV1 } from "./playback/rollingPerformanceDirector";
import { artworkCandidates, artworkShapeForAspectV1, type ArtworkShapeV1 } from "./artworkCandidates";
import { LyricScroller } from "./lyrics/LyricScroller";
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
  reactiveBus?: ReactiveBusV1;
  reactiveStatus?: "idle" | "analyzing" | "ready" | "error";
  reactiveFailure?: string;
  clock: PlaybackClockV0;
  continuous: boolean;
  displayTimeMs: number;
  lyricsOffsetMs: number;
  reduceMotion: boolean;
  lightweight: boolean;
  vjMode: boolean;
  showGuides: boolean;
  onMetrics: (summary: { count: number; p95: number; p99: number; max: number }) => void;
  title?: string;
  artist?: string;
  artworkURL?: string;
  durationMs: number;
  playbackState?: "playing" | "paused" | "buffering" | "ended";
  playbackDetails?: YouTubeMusicSnapshotV0["playback"];
  controls?: YouTubeMusicSnapshotV0["controls"];
  engagement?: YouTubeMusicSnapshotV0["engagement"];
  queue?: YouTubeMusicSnapshotV0["queue"];
  onSeek?: (timeMs: number) => void | Promise<void>;
  onTransport?: (action: YouTubeMusicTransportActionV0) => void | Promise<void>;
  onLike?: (liked: boolean) => void | Promise<void>;
  onQueueSelect?: (trackID: string, queueIndex: number) => void | Promise<void>;
  onPlaybackMode?: (mode: "shuffle" | "repeat", value: boolean | "off" | "all" | "one") => void | Promise<void>;
}

const formatPlaybackTime = (timeMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const seekKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

const writeDatasetValue = (host: HTMLElement, key: string, value?: string) => {
  if (value === undefined) {
    if (host.dataset[key] !== undefined) delete host.dataset[key];
  } else if (host.dataset[key] !== value) {
    host.dataset[key] = value;
  }
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

function PlayerActionIcon({ kind }: { kind: "like" | "queue" | "shuffle" | "repeat" }) {
  if (kind === "shuffle") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5h-2V6.4l-3.8 3.8-1.4-1.4L17.6 5H16V3ZM3 6h4.6l9.8 9.8H21v2h-4.4L6.8 8H3V6Zm7.8 6.6 1.4 1.4-5.4 5.4H3v-2h3l4.8-4.8ZM19 16.6l-2.2-2.2 1.4-1.4 1.8 1.8V13h2v5h-5v-2h2v.6Z" /></svg>;
  if (kind === "repeat") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10V4l4 4-4 4V9H7a3 3 0 0 0-3 3H2a5 5 0 0 1 5-5Zm10 10H7v3l-4-4 4-4v3h10a3 3 0 0 0 3-3h2a5 5 0 0 1-5 5Z" /></svg>;
  return kind === "like" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4 10.55 19.1C5.4 14.54 2 11.45 2 7.65 2 4.56 4.42 2.2 7.5 2.2c1.74 0 3.41.81 4.5 2.08A6.02 6.02 0 0 1 16.5 2.2C19.58 2.2 22 4.56 22 7.65c0 3.8-3.4 6.89-8.55 11.46L12 20.4Z" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h11v2H4V5Zm0 6h11v2H4v-2Zm0 6h7v2H4v-2Zm13-4.2v6.4l5-3.2-5-3.2Z" /></svg>
  );
}

export function StageCanvas({
  lyrics,
  localDirectorPlan,
  directorLookupState,
  directorMode = "legacy",
  bibleSource,
  rollingCards = [],
  reactiveBus,
  reactiveStatus,
  reactiveFailure,
  clock,
  continuous,
  displayTimeMs,
  lyricsOffsetMs,
  reduceMotion,
  lightweight,
  vjMode,
  showGuides,
  onMetrics,
  title,
  artist,
  artworkURL,
  durationMs,
  playbackState,
  playbackDetails,
  controls,
  engagement,
  queue,
  onSeek,
  onTransport,
  onLike,
  onQueueSelect,
  onPlaybackMode,
}: StageCanvasProps) {
  const entryDirectorPlan = localDirectorPlan;
  const hostRef = useRef<HTMLDivElement>(null);
  const lyricViewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const environmentRef = useRef<PerformanceEnvironmentHandle>(null);
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
  const reactiveBusRef = useRef(reactiveBus);
  const handoffRef = useRef({ active: entryDirectorPlan });
  const [artworkPalette, setArtworkPalette] = useState<DirectedStagePaletteV1 | undefined>();
  const [artworkCandidateIndex, setArtworkCandidateIndex] = useState(0);
  const [artworkAspect, setArtworkAspect] = useState(1);
  const [queueOpen, setQueueOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const selectedQueueTrackID = queue?.items[queue.currentIndex]?.trackID;
  useEffect(() => setQueueOpen(false), [selectedQueueTrackID]);
  displayTimeRef.current = displayTimeMs;
  reactiveBusRef.current = reactiveBus;
  const normalizedArtworkCandidates = useMemo(() => artworkCandidates(artworkURL), [artworkURL]);
  const normalizedArtworkURL = normalizedArtworkCandidates[artworkCandidateIndex];
  const coverInitial = Array.from(title?.trim() || "L")[0]?.toUpperCase() ?? "L";
  const availablePlans = useMemo(() => {
    const plans = new Map<string, DirectorPlanV1>();
    plans.set(localDirectorPlan.planIdentity, localDirectorPlan);
    return plans;
  }, [localDirectorPlan]);
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
    handoffRef.current = { active: localDirectorPlan };
    frameBuffersRef.current = null;
  }, [localDirectorPlan.planIdentity]);

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
      const dpr = lightweight ? 1 : Math.min(window.devicePixelRatio || 1, 2);
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
          drawLyrics: false,
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
  }, [availablePlans, durationMs, lightweight, lyrics, lyricsOffsetMs, paletteForPlanTime, reduceMotion, rendererIdentity, showGuides]);

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
        progressRef.current.setAttribute(
          "aria-valuetext",
          `${formatPlaybackTime(bounded)} / ${formatPlaybackTime(durationMs)}`,
        );
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
      const handoff = handoffRef.current;
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
      const host = hostRef.current;
      if (host) {
        writeDatasetValue(host, "directorSource", handoff.active.source);
        writeDatasetValue(host, "directorLayout", activeSection.layout);
        writeDatasetValue(host, "directorArtDirection", activeSection.artDirection);
        writeDatasetValue(host, "directorTypography", activeSection.typography);
        if (activeEffect) {
          writeDatasetValue(host, "directorEffect", activeEffect.primary.primitive);
          const uses = [activeEffect.primary, ...activeEffect.support];
          writeDatasetValue(host, "directorCoverEffect", uses.some((use) => use.primitive === "cover.portal")
            ? "portal"
            : uses.some((use) => use.primitive === "cover.island") ? "island" : undefined);
        } else {
          writeDatasetValue(host, "directorEffect");
          writeDatasetValue(host, "directorCoverEffect");
        }
        writeDatasetValue(host, "directorBehavior", activeDirective?.behavior);
        writeDatasetValue(host, "directorMode", directorMode);
        writeDatasetValue(host, "bibleSource", bibleSource ?? "local");
        writeDatasetValue(host, "sceneCoverageMs", String(Math.round(sceneCoverage / 250) * 250));
        writeDatasetValue(host, "sceneCount", String(rollingCards.length));
        writeDatasetValue(host, "sceneId", activeScene?.sceneID);
        writeDatasetValue(host, "semanticPurpose", activeScene?.semanticScene?.purpose);
        writeDatasetValue(host, "signatureClip", activeEffect?.id.match(/^signature-clip-v2:([^:]+)/u)?.[1]);
        writeDatasetValue(host, "reactiveStatus", reactiveStatus);
        writeDatasetValue(host, "reactiveFailure", reactiveFailure);
        writeDatasetValue(host, "layoutChangeCount", String(handoff.active.blocking.transitions.length));
        writeDatasetValue(host, "gestureCount", String(handoff.active.gestures.length));
        writeDatasetValue(host, "effectCount", String(handoff.active.effects.length));
        writeDatasetValue(host, "dramaticMomentCount", String(handoff.active.dramaticScore.signatureMoments.length));
        writeDatasetValue(host, "dramaticMotif", handoff.active.dramaticScore.motifActor.family);
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
        lightweight,
        vjMode,
        showGuides,
        reactiveBus: reactiveBusRef.current,
      };
      if (!frameBuffersRef.current) frameBuffersRef.current = createStageFrameBuffersV1(stageFrameInput);
      const stageFrame = writeStageFrameV1(frameBuffersRef.current, stageFrameInput);
      if (hostRef.current) {
        applyStageFrameDOMV1(stageFrame, {
          host: hostRef.current,
          motif: null,
          washPrimary: null,
          washSecondary: null,
          artwork: null,
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
        drawLyrics: false,
      });
      environmentRef.current?.renderFrame(stageFrame);
      samplerRef.current.push(duration);
      frameCount += 1;
      if (frameCount % 60 === 0) {
        const summary = samplerRef.current.summary();
        if (host) {
          writeDatasetValue(host, "frameCount", String(summary.count));
          writeDatasetValue(host, "frameP95", summary.p95.toFixed(3));
          writeDatasetValue(host, "frameP99", summary.p99.toFixed(3));
          writeDatasetValue(host, "frameMax", summary.max.toFixed(3));
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
  }, [artworkPalette, bibleSource, clock, continuous, directorMode, durationMs, environmentScenes, lightweight, lyrics, lyricsOffsetMs, onMetrics, paletteForPlanTime, reduceMotion, rollingCards, showGuides, vjMode]);

  useEffect(() => {
    if (!continuous) renderFrameRef.current?.();
  }, [continuous, displayTimeMs, lyricsOffsetMs]);

  const previewScrub = (timeMs: number) => {
    const bounded = Math.min(Math.max(0, durationMs), Math.max(0, timeMs));
    const progress = durationMs > 0 ? bounded / durationMs : 0;
    if (progressRef.current) {
      progressRef.current.style.setProperty("--stage-progress", `${progress * 100}%`);
      progressRef.current.setAttribute(
        "aria-valuetext",
        `${formatPlaybackTime(bounded)} / ${formatPlaybackTime(durationMs)}`,
      );
    }
    if (elapsedRef.current) elapsedRef.current.textContent = formatPlaybackTime(bounded);
    if (remainingRef.current) remainingRef.current.textContent = `−${formatPlaybackTime(Math.max(0, durationMs - bounded))}`;
  };

  const commitScrub = (timeMs: number) => {
    scrubbingRef.current = false;
    setScrubbing(false);
    void onSeek?.(Math.min(Math.max(0, durationMs), Math.max(0, timeMs)));
  };

  const cancelScrub = () => {
    scrubbingRef.current = false;
    setScrubbing(false);
    renderFrameRef.current?.();
  };

  const isPlaying = playbackState === "playing" || playbackState === "buffering";
  const hasTransport = Boolean(controls?.playPause || controls?.previous || controls?.next);
  const hasPlayerActions = Boolean(controls?.like || controls?.queue);
  const liked = engagement?.likeStatus === "liked";
  const artworkShape = artworkShapeForAspectV1(artworkAspect);
  const observedPlan = handoffRef.current.active;
  const observedTimeMs = frameTimeRef.current;
  const observedSection = directorSectionAtV1(observedPlan, observedTimeMs);
  const observedScene = rollingCards.find((card) => observedSection.id === `rolling:${card.sceneID}`
    && observedTimeMs >= card.fromMs && observedTimeMs < card.toMs);
  const renderedPlaybackState = playbackState ?? (continuous ? "playing" : "paused");
  return (
    <div
      ref={hostRef}
      className="stage-canvas-host"
      style={{
        "--stage-artwork-aspect": String(Math.min(2.4, Math.max(0.55, artworkAspect))),
      } as CSSProperties}
      data-director-mode={directorMode}
      data-bible-source={bibleSource ?? "local"}
      data-scene-count={rollingCards.length}
      data-scene-ranges={rollingCards.map((card) => `${card.fromLineIndex}-${card.toLineIndex}:${card.fromMs}-${card.toMs}`).join("|")}
      data-scene-id={observedScene?.sceneID}
      data-director-state={directorLookupState.status}
      data-director-reason={directorLookupState.reason}
      data-layout-change-count={observedPlan.blocking.transitions.length}
      data-gesture-count={observedPlan.gestures.length}
      data-effect-count={observedPlan.effects.length}
      data-dramatic-moment-count={observedPlan.dramaticScore.signatureMoments.length}
      data-dramatic-motif={observedPlan.dramaticScore.motifActor.family}
      data-playback-state={renderedPlaybackState}
      data-shell-layout="apple-player"
      data-artwork-shape={artworkShape}
    >
      {normalizedArtworkURL && (
        <>
          <img className="stage-artwork-wash stage-artwork-wash-primary" src={normalizedArtworkURL} alt="" aria-hidden="true" />
          <img className="stage-artwork-wash stage-artwork-wash-secondary" src={normalizedArtworkURL} alt="" aria-hidden="true" />
        </>
      )}
      <div className="stage-world-motif" aria-hidden="true" />
      <PerformanceEnvironment ref={environmentRef} />
      <div className="stage-now-playing-layout">
        <aside className="stage-now-playing-info" aria-label="正在播放">
          <div className="stage-artwork-stage">
            <div className="stage-artwork-frame">
              {normalizedArtworkURL ? (
                <img
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
          </div>

          <div className="stage-track-meta">
            <strong>{title || "LyricStage"}</strong>
            <span>{artist || "Local rehearsal"}</span>
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
              aria-valuetext={`${formatPlaybackTime(displayTimeMs)} / ${formatPlaybackTime(durationMs)}`}
              disabled={!controls?.seek || !onSeek}
              onPointerDown={() => {
                scrubbingRef.current = true;
                setScrubbing(true);
              }}
              onInput={(event) => {
                scrubbingRef.current = true;
                setScrubbing(true);
                previewScrub(event.currentTarget.valueAsNumber);
              }}
              onPointerUp={(event) => commitScrub(event.currentTarget.valueAsNumber)}
              onPointerCancel={cancelScrub}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelScrub();
                  event.currentTarget.blur();
                } else if (seekKeys.has(event.key)) {
                  scrubbingRef.current = true;
                  setScrubbing(true);
                }
              }}
              onKeyUp={(event) => {
                if (seekKeys.has(event.key) && scrubbingRef.current) {
                  commitScrub(event.currentTarget.valueAsNumber);
                }
              }}
              onBlur={(event) => {
                if (scrubbingRef.current) commitScrub(event.currentTarget.valueAsNumber);
              }}
            />
            <div className="stage-time-row" aria-hidden="true">
              <span ref={elapsedRef}>{formatPlaybackTime(displayTimeMs)}</span>
              <span ref={remainingRef}>−{formatPlaybackTime(Math.max(0, durationMs - displayTimeMs))}</span>
            </div>
          </div>

          {(hasTransport || hasPlayerActions) && (
            <div className="stage-transport" role="group" aria-label="播放控制">
              {controls?.like && onLike && (
                <button
                  type="button"
                  className="stage-like-button"
                  aria-label={liked ? "取消点赞" : "点赞"}
                  aria-pressed={liked}
                  onClick={() => void onLike(!liked)}
                >
                  <PlayerActionIcon kind="like" />
                </button>
              )}
              {controls?.shuffle && onPlaybackMode && (
                <button type="button" aria-label="随机播放" aria-pressed={playbackDetails?.shuffle === true}
                  onClick={() => void onPlaybackMode("shuffle", playbackDetails?.shuffle !== true)}>
                  <PlayerActionIcon kind="shuffle" />
                </button>
              )}
              {controls?.previous && onTransport && (
                <button type="button" aria-label="上一首" onClick={() => void onTransport("previous")}>
                  <TransportIcon kind="previous" />
                </button>
              )}
              {controls?.playPause && onTransport && (
                <button
                  type="button"
                  className="stage-play-pause"
                  aria-label={isPlaying ? "暂停" : "播放"}
                  onClick={() => void onTransport(isPlaying ? "pause" : "play")}
                >
                  <TransportIcon kind={isPlaying ? "pause" : "play"} />
                </button>
              )}
              {controls?.next && onTransport && (
                <button type="button" aria-label="下一首" onClick={() => void onTransport("next")}>
                  <TransportIcon kind="next" />
                </button>
              )}
              {controls?.repeat && onPlaybackMode && (
                <button type="button" aria-label={`循环播放：${playbackDetails?.repeat ?? "off"}`}
                  aria-pressed={playbackDetails?.repeat !== "off"}
                  onClick={() => void onPlaybackMode("repeat", playbackDetails?.repeat === "off" ? "all" : playbackDetails?.repeat === "all" ? "one" : "off")}>
                  <PlayerActionIcon kind="repeat" />
                </button>
              )}
              {controls?.queue && Boolean(queue?.items.length) && (
                <button
                  type="button"
                  className="stage-queue-button"
                  aria-label="播放列表"
                  aria-expanded={queueOpen}
                  onClick={() => setQueueOpen((open) => !open)}
                >
                  <PlayerActionIcon kind="queue" />
                </button>
              )}
            </div>
          )}
        </aside>

        <div ref={lyricViewportRef} className="stage-lyric-viewport">
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            aria-hidden="true"
          />
          <LyricScroller
            lyrics={lyrics}
            lyricTimeMs={lyricsTimeForPlaybackMs(displayTimeMs, lyricsOffsetMs, durationMs)}
            lyricsOffsetMs={lyricsOffsetMs}
            durationMs={durationMs}
            density="fullscreen"
            reduceMotion={reduceMotion || lightweight}
            followSuspended={scrubbing}
            onSeek={(timeMs) => onSeek?.(timeMs)}
          />
        </div>
      </div>
      {queueOpen && queue?.items.length ? (
        <aside className="stage-queue-panel" aria-label="当前播放列表">
          <header>
            <div>
              <span>当前播放列表</span>
              <strong>{queue.items.length} 首</strong>
            </div>
            <button type="button" aria-label="关闭播放列表" onClick={() => setQueueOpen(false)}>×</button>
          </header>
          <ol>
            {queue.items.map((item, index) => (
              <li key={`${item.trackID}:${index}`} data-selected={item.selected || undefined}>
                <button
                  type="button"
                  aria-current={item.selected ? "true" : undefined}
                  disabled={item.selected || !onQueueSelect}
                  onClick={() => {
                    setQueueOpen(false);
                    void onQueueSelect?.(item.trackID, index);
                  }}
                >
                  {item.artworkURL ? <img src={item.artworkURL} alt="" /> : <span className="stage-queue-index">{index + 1}</span>}
                  <span className="stage-queue-copy"><strong>{item.title}</strong><span>{item.artist || "YouTube Music"}</span></span>
                  {item.selected ? <span className="stage-queue-playing">播放中</span> : null}
                </button>
              </li>
            ))}
          </ol>
        </aside>
      ) : null}
    </div>
  );
}
