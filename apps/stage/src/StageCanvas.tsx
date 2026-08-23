import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { YouTubeMusicSnapshotV0, YouTubeMusicTransportActionV0 } from "@lyricstage/companion";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import type { PlaybackClockV0 } from "@lyricstage/core";
import {
  directorSectionAtV1,
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
import { PerformanceEnvironment } from "./PerformanceEnvironment";
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

export const artworkCandidates = (value?: string): string[] => {
  if (!value) return [];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return [];
    const candidates: string[] = [];
    if (url.hostname === "i.ytimg.com") {
      const match = url.pathname.match(/^\/vi(?:_webp)?\/([^/]+)\//u);
      if (match) {
        const videoID = match[1];
        candidates.push(
          `https://i.ytimg.com/vi/${videoID}/maxresdefault.jpg`,
          `https://i.ytimg.com/vi/${videoID}/sddefault.jpg`,
          `https://i.ytimg.com/vi/${videoID}/hqdefault.jpg`,
        );
      }
    } else if (url.hostname === "yt3.googleusercontent.com") {
      const highResolution = new URL(url.href);
      highResolution.pathname = highResolution.pathname.replace(/=w\d+-h\d+(?=-|$)/u, "=w1200-h1200");
      candidates.push(highResolution.href);
    }
    candidates.push(url.href);
    return [...new Set(candidates)];
  } catch {
    return [];
  }
};

export type ArtworkShapeV1 = "square" | "landscape" | "portrait";

export const artworkShapeForAspectV1 = (aspect: number): ArtworkShapeV1 => {
  if (!Number.isFinite(aspect) || aspect <= 0) return "square";
  if (aspect >= 1.28) return "landscape";
  if (aspect <= 0.82) return "portrait";
  return "square";
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
  const progressRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const remainingRef = useRef<HTMLSpanElement>(null);
  const scrubbingRef = useRef(false);
  const renderFrameRef = useRef<(() => void) | null>(null);
  const preparedRef = useRef<PreparedDirectedStageV1 | null>(null);
  const samplerRef = useRef(new FrameSamplerV0(240));
  const displayTimeRef = useRef(displayTimeMs);
  const frameTimeRef = useRef(lyricsTimeForPlaybackMs(displayTimeMs, lyricsOffsetMs, durationMs));
  const handoffRef = useRef<DirectorPlanHandoffV1>({ active: entryDirectorPlan });
  const layoutTransitionIdentityRef = useRef<string | undefined>(undefined);
  const [activeDirectorPlan, setActiveDirectorPlan] = useState(entryDirectorPlan);
  const [layoutTransitionPhase, setLayoutTransitionPhase] = useState<0 | 1>(0);
  const [palette, setPalette] = useState<DirectedStagePaletteV1>(() =>
    directedPaletteForIndexV1(localDirectorPlan.sections[0]?.paletteIndex ?? 0),
  );
  const paletteRef = useRef(palette);
  const [artworkPalette, setArtworkPalette] = useState<DirectedStagePaletteV1 | undefined>();
  const [artworkCandidateIndex, setArtworkCandidateIndex] = useState(0);
  const [artworkAspect, setArtworkAspect] = useState(1);
  const [presentation, setPresentation] = useState(() => stagePresentationAtV1(
    entryDirectorPlan.effects,
    lyricsTimeForPlaybackMs(displayTimeMs, lyricsOffsetMs, durationMs),
    lyrics,
  ));
  const presentationRef = useRef(presentation);
  displayTimeRef.current = displayTimeMs;
  const normalizedArtworkCandidates = useMemo(() => artworkCandidates(artworkURL), [artworkURL]);
  const normalizedArtworkURL = normalizedArtworkCandidates[artworkCandidateIndex];
  const coverInitial = Array.from(title?.trim() || "L")[0]?.toUpperCase() ?? "L";
  const sectionPalettes = useMemo(() => new Map(activeDirectorPlan.sections.map((section) => {
    const directed = directedPaletteForIndexV1(section.paletteIndex);
    const composed = artworkPalette
      ? activeDirectorPlan.source === "local"
        ? artworkPalette
        : mergeArtworkDirectorPaletteV1(artworkPalette, directed, section.intensity)
      : directed;
    return [section.id, composed] as const;
  })), [activeDirectorPlan.planIdentity, artworkPalette]);
  const paletteForTime = useMemo(() => (timeMs: number): DirectedStagePaletteV1 => {
    const section = directorSectionAtV1(activeDirectorPlan, timeMs);
    return sectionPalettes.get(section.id) ?? directedPaletteForIndexV1(section.paletteIndex);
  }, [activeDirectorPlan, sectionPalettes]);

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
    layoutTransitionIdentityRef.current = undefined;
    setActiveDirectorPlan(entry);
    const timeMs = lyricsTimeForPlaybackMs(displayTimeRef.current, lyricsOffsetMs, durationMs);
    const nextPresentation = stagePresentationAtV1(entry.effects, timeMs, lyrics);
    presentationRef.current = nextPresentation;
    setPresentation(nextPresentation);
  }, [localDirectorPlan.planIdentity]);

  useLayoutEffect(() => {
    if (!remoteDirectorPlan) {
      if (directorMode === "rolling" && handoffRef.current.active.planIdentity !== localDirectorPlan.planIdentity) {
        handoffRef.current = { active: localDirectorPlan };
        setActiveDirectorPlan(localDirectorPlan);
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
    () => rollingPreparedRendererIdentityV1(lyrics.recordingID, activeDirectorPlan.planIdentity),
    [activeDirectorPlan.planIdentity, lyrics.recordingID],
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
      const prepared = prepareDirectedStageV1(
        lyrics,
        activeDirectorPlan,
        {
          width: rect.width,
          height: rect.height,
          rendererVersion: "canvas2d-directed-v1",
        },
        (text, font) => {
          context.font = font;
          return context.measureText(text).width;
        },
      );
      preparedRef.current = prepared;
      samplerRef.current = new FrameSamplerV0(240);
      const initialTimeMs = lyricsTimeForPlaybackMs(displayTimeRef.current, lyricsOffsetMs, durationMs);
      const initialPalette = paletteForTime(initialTimeMs);
      paletteRef.current = initialPalette;
      setPalette(initialPalette);
      drawDirectedStageV1(context, prepared, {
        timeMs: initialTimeMs,
        reduceMotion,
        showGuides,
        palette: initialPalette,
      });
    };

    const observer = new ResizeObserver(rebuild);
    observer.observe(host);
    void document.fonts.ready.then(rebuild);
    rebuild();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [activeDirectorPlan, durationMs, lyrics, lyricsOffsetMs, paletteForTime, reduceMotion, rendererIdentity, showGuides]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    const prepared = preparedRef.current;
    if (!context || !prepared) return undefined;

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
        setActiveDirectorPlan(handoff.active);
      }
      const activeSection = directorSectionAtV1(handoff.active, timeMs);
      const layoutTransitionIdentity = [
        handoff.active.source,
        handoff.active.world.spatialMode,
        activeSection.layout,
      ].join(":");
      if (layoutTransitionIdentityRef.current === undefined) {
        layoutTransitionIdentityRef.current = layoutTransitionIdentity;
      } else if (layoutTransitionIdentityRef.current !== layoutTransitionIdentity) {
        layoutTransitionIdentityRef.current = layoutTransitionIdentity;
        if (!reduceMotion) setLayoutTransitionPhase((phase) => phase === 0 ? 1 : 0);
      }
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
          const uses = [activeEffect.primary, ...activeEffect.support];
          if (uses.some((use) => use.primitive === "cover.portal")) hostRef.current.dataset.directorCoverEffect = "portal";
          else if (uses.some((use) => use.primitive === "cover.island")) hostRef.current.dataset.directorCoverEffect = "island";
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
        if (activeScene) hostRef.current.dataset.sceneId = activeScene.sceneID;
        else delete hostRef.current.dataset.sceneId;
      }
      const nextPalette = paletteForTime(timeMs);
      if (paletteRef.current !== nextPalette) {
        paletteRef.current = nextPalette;
        setPalette(nextPalette);
      }
      const nextPresentation = stagePresentationAtV1(handoff.active.effects, timeMs, lyrics);
      if (presentationRef.current !== nextPresentation) {
        presentationRef.current = nextPresentation;
        setPresentation(nextPresentation);
      }
      updateProgress(playbackTimeMs);
      const duration = drawDirectedStageV1(context, prepared, {
        timeMs,
        reduceMotion,
        showGuides,
        palette: paletteRef.current,
      });
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
  }, [bibleSource, clock, continuous, directorMode, durationMs, lyricsOffsetMs, onMetrics, paletteForTime, reduceMotion, remoteDirectorPlan?.planIdentity, rollingCards, showGuides]);

  useEffect(() => {
    if (!continuous) renderFrameRef.current?.();
  }, [continuous, displayTimeMs, lyricsOffsetMs]);

  const background = `
    radial-gradient(circle at 12% 78%, ${palette.signal}66, transparent 46%),
    radial-gradient(circle at 86% 18%, ${palette.signalAlt}59, transparent 44%),
    radial-gradient(circle at 58% 92%, ${palette.warm}38, transparent 42%),
    linear-gradient(128deg, ${palette.groundLift}, ${palette.ground} 48%, ${palette.ground})
  `;

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
  const paletteTone = paletteToneForV1(palette);
  const artworkShape = artworkShapeForAspectV1(artworkAspect);
  const directorStatusSource = directorMode === "rolling"
    && (remoteDirectorPlan?.source === "ai" || remoteDirectorPlan?.source === "cache")
    ? remoteDirectorPlan.source
    : activeDirectorPlan.source;
  const directorStatus = directorStatusLabel(
    directorLookupState,
    directorStatusSource,
    directorMode === "legacy" && Boolean(remoteDirectorPlan),
  );
  const renderedPlaybackState = playbackState ?? (continuous ? "playing" : "paused");
  const observedTimeMs = frameTimeRef.current;
  const observedSection = directorSectionAtV1(activeDirectorPlan, observedTimeMs);
  const observedScene = rollingCards.find((card) => observedSection.id === `rolling:${card.sceneID}`
    && observedTimeMs >= card.fromMs && observedTimeMs < card.toMs);
  const observedSceneCoverageMs = observedScene ? Math.max(0, observedScene.toMs - observedTimeMs) : 0;

  return (
    <div
      ref={hostRef}
      className="stage-canvas-host"
      style={{
        background,
        "--stage-signal": palette.signal,
        "--stage-signal-alt": palette.signalAlt,
        "--stage-ground": palette.ground,
        "--stage-ink": palette.ink,
        "--stage-ink-muted": palette.inkMuted,
        "--stage-artwork-aspect": String(Math.min(2.4, Math.max(0.55, artworkAspect))),
        "--stage-world-depth": String(activeDirectorPlan.world.depth),
        "--stage-world-fluidity": String(activeDirectorPlan.world.fluidity),
        "--stage-world-elasticity": String(activeDirectorPlan.world.elasticity),
        "--stage-world-atmosphere": String(activeDirectorPlan.world.atmosphere),
        "--stage-world-opacity-local": String(0.08 + activeDirectorPlan.world.atmosphere * 0.14),
        "--stage-world-opacity-directed": String(0.18 + activeDirectorPlan.world.atmosphere * 0.3),
        "--stage-world-opacity-pulse-low": String(0.15 + activeDirectorPlan.world.atmosphere * 0.22),
        "--stage-world-opacity-pulse-high": String(0.22 + activeDirectorPlan.world.atmosphere * 0.34),
        "--stage-world-pulse-scale": String(1.08 + activeDirectorPlan.world.elasticity * 0.055),
        "--stage-world-blur-silk": `${24 + activeDirectorPlan.world.depth * 42}px`,
        "--stage-world-blur-ink": `${34 + activeDirectorPlan.world.depth * 54}px`,
        "--stage-world-blur-mist": `${58 + activeDirectorPlan.world.depth * 72}px`,
        "--stage-world-blur-glass": `${12 + activeDirectorPlan.world.depth * 26}px`,
        "--stage-world-blur-paper": `${8 + activeDirectorPlan.world.depth * 16}px`,
        "--stage-world-blur-light": `${18 + activeDirectorPlan.world.depth * 34}px`,
        "--stage-world-glow-portal": `${72 + activeDirectorPlan.world.atmosphere * 90}px`,
        "--stage-world-glow-directed": `${90 + activeDirectorPlan.world.atmosphere * 120}px`,
      } as CSSProperties}
      data-director-source={activeDirectorPlan.source}
      data-director-mode={directorMode}
      data-bible-source={bibleSource ?? "local"}
      data-scene-count={rollingCards.length}
      data-scene-id={observedScene?.sceneID}
      data-scene-coverage-ms={Math.round(observedSceneCoverageMs)}
      data-director-state={directorLookupState.status}
      data-director-version={activeDirectorPlan.directorVersion}
      data-layout-change-count={activeDirectorPlan.blocking.transitions.length}
      data-gesture-count={activeDirectorPlan.gestures.length}
      data-effect-count={activeDirectorPlan.effects.length}
      data-dramatic-moment-count={activeDirectorPlan.dramaticScore.signatureMoments.length}
      data-dramatic-motif={activeDirectorPlan.dramaticScore.motifActor.family}
      data-playback-state={renderedPlaybackState}
      data-shell-layout="lower-leading-dock"
      data-presentation={presentation}
      data-reduce-motion={reduceMotion || undefined}
      data-palette-source={artworkPalette
        ? activeDirectorPlan.source === "local" ? "artwork" : "artwork-directed"
        : "fallback"}
      data-palette-tone={paletteTone}
      data-artwork-shape={artworkShape}
      data-world-spatial={activeDirectorPlan.world.spatialMode}
      data-world-motion={activeDirectorPlan.world.motionLaw}
      data-world-artwork={activeDirectorPlan.world.artworkRole}
      data-world-texture={activeDirectorPlan.world.texture}
    >
      {normalizedArtworkURL && (
        <>
          <img className="stage-artwork-wash stage-artwork-wash-primary" src={normalizedArtworkURL} alt="" aria-hidden="true" />
          <img className="stage-artwork-wash stage-artwork-wash-secondary" src={normalizedArtworkURL} alt="" aria-hidden="true" />
        </>
      )}
      <div className="stage-world-motif" aria-hidden="true" />
      <PerformanceEnvironment
        plan={activeDirectorPlan}
        timeMsRef={frameTimeRef}
        continuous={continuous}
        displayTimeMs={lyricsTimeForPlaybackMs(displayTimeMs, lyricsOffsetMs, durationMs)}
        reduceMotion={reduceMotion}
        vjMode={vjMode}
        palette={palette}
      />
      <div className="stage-now-playing-layout" data-layout-transition-phase={layoutTransitionPhase}>
        <aside className="stage-now-playing-info" aria-label="正在播放">
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
