import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lyricFixtures, type LyricDocumentV0 } from "@lyricstage/contracts";
import {
  youtubeMusicRecordingID,
  type YouTubeMusicSnapshotV0,
  type YouTubeMusicTransportActionV0,
} from "@lyricstage/companion";
import {
  compilePerformancePlan,
  localRecordingID,
  parseLyricSource,
  prepareTimeline,
  sampleTimeline,
  type PlaybackClockV0,
} from "@lyricstage/core";
import {
  lyricsProviderLabel,
  type LyricsCandidateV0,
  type LyricsLookupResponseV0,
  type LyricsLookupTrackV0,
} from "@lyricstage/lyrics";
import { applyNonMusicSegments } from "@lyricstage/lyrics";
import {
  applyMusicMapToDirectorPlanV1,
  compileLocalDirectorPlanV3,
  type DirectorPlanV1,
} from "@lyricstage/performance";
import {
  canEnterEmbeddedFullscreen,
  embeddedFullscreenSurface,
  fullscreenOwnershipConfirmed,
} from "./column/embeddedFullscreen";
import { FullscreenTrackTransition } from "./column/FullscreenTrackTransition";
import { retainCandidatesAfterChoice } from "./column/timedLineText";
import {
  controlYouTubeMusic,
  isYouTubeMusicExtensionContext,
  selectYouTubeMusicQueueItem,
  seekYouTubeMusic,
  setYouTubeMusicLiked,
  setYouTubeMusicPlaybackMode,
  startYouTubeMusicAudioAnalysis,
  stopYouTubeMusicAudioAnalysis,
  useYouTubeMusicBridge,
} from "./playback/youtubeMusicBridge";
import { createYouTubeMusicPlayerActions } from "./playback/youtubeMusicPlayerActions";
import {
  readExtensionPreferences,
  rollingDirectorRouteV1,
  readLyricsOffset,
  saveLyricsOffset,
  subscribeExtensionPreferences,
} from "./playback/extensionPreferences";
import {
  clampLyricsOffsetMs,
  formatLyricsOffset,
  lyricsOffsetFromLineAnchor,
  lyricsOffsetForIdentity,
  lyricsTimeForPlaybackMs,
} from "./playback/lyricsTimeOffset";
import { usePrefersReducedMotion, useTransientNotice } from "./playback/runtimeExperience";
import { lyricDocumentFromCandidate } from "./playback/lyricsCandidateDocument";
import {
  directorStatusDetail,
  directorStatusLabel,
  requestAutomaticDirectorPlan,
  requestDirectorBibleV1,
  requestDirectorCoverageV1,
  type DirectorLookupState,
} from "./playback/performanceDirector";
import {
  applyMusicMapToRollingDirectorPlanV1,
  createRollingDirectorRuntimeStateV1,
  detectRollingSeekTargetV1,
  handleRollingSeekV1,
  reduceRollingCoverageResultV1,
  rollingCoverageAtV1,
  rollingHasRemainingDirectionV1,
  rollingRefillTargetV1,
  rollingRequestStateV1,
  selectRollingRequestedWindowV1,
  shouldRefillRollingCoverageV1,
  type RollingDirectorRuntimeStateV1,
} from "./playback/rollingPerformanceDirector";
import {
  lyricsTrackIdentity,
  lyricsTrackFromSnapshot,
  rememberLocalLyrics,
  rememberLyricsCandidate,
  requestAutomaticLyrics,
  requestManualLyrics,
} from "./playback/youtubeMusicLyrics";

const loadStageCanvasModule = () => import("./StageCanvas");
const StageCanvas = lazy(() => loadStageCanvasModule().then((module) => ({ default: module.StageCanvas })));
const ColumnStageView = import.meta.env.DEV || import.meta.env.LYRICSTAGE_CONTENT_UI
  ? lazy(() => import("./column/ColumnStageView").then((module) => ({ default: module.ColumnStageView })))
  : null;
const stageCanvasFallback = <div className="stage-canvas-loading" role="status">正在装入全屏演出引擎…</div>;

const fixtureParameter = import.meta.env.DEV
  ? new URLSearchParams(globalThis.location?.search ?? "").get("fixture")
  : null;
const selectedFixture = fixtureParameter && fixtureParameter in lyricFixtures
  ? fixtureParameter as keyof typeof lyricFixtures
  : "repeatedHook";
const demoLyrics = lyricFixtures[selectedFixture];
const requestedDemoTime = import.meta.env.DEV
  ? Number(new URLSearchParams(globalThis.location?.search ?? "").get("time"))
  : Number.NaN;
const requestedDemoArtwork = import.meta.env.DEV
  ? new URLSearchParams(globalThis.location?.search ?? "").get("artwork")?.trim()
  : undefined;
const requestedDemoTitle = import.meta.env.DEV
  ? new URLSearchParams(globalThis.location?.search ?? "").get("title")?.trim()
  : undefined;
const requestedPreviewWorld = import.meta.env.DEV
  ? new URLSearchParams(globalThis.location?.search ?? "").get("world")?.trim()
  : undefined;
const demoTimeMs = Number.isFinite(requestedDemoTime)
  ? Math.min(demoLyrics.durationMs, Math.max(0, requestedDemoTime))
  : Math.min(16000, demoLyrics.durationMs);
const localStageControls: NonNullable<YouTubeMusicSnapshotV0["controls"]> = {
  seek: true,
  playPause: true,
  previous: false,
  next: false,
};
const embeddedStageFromLocation =
  new URLSearchParams(globalThis.location?.search ?? "").get("embedded") === "1";
const benchmarkStage = import.meta.env.DEV
  && new URLSearchParams(globalThis.location?.search ?? "").get("benchmark") === "1";
const rollingDirectorDevOverride = import.meta.env.DEV
  ? (() => {
      const value = new URLSearchParams(globalThis.location?.search ?? "").get("rollingDirector");
      if (value === "1" || value === "on") return "on" as const;
      if (value === "shadow" || value === "off") return value;
      return undefined;
    })()
  : undefined;

interface AppProps {
  embedded?: boolean;
  onEmbeddedReady?: () => void;
}

type PlaybackSource = "youtubeMusic" | "local";
type AutomaticLyricsState = {
  status: "idle" | "searching" | "matched" | "candidates" | "miss" | "error" | "manual";
  source?: LyricsLookupResponseV0["source"];
  trackID?: string;
  trackIdentity?: string;
  candidates: LyricsCandidateV0[];
  selectedCandidateKey?: string;
};

const lyricsCandidateKey = (candidate: LyricsCandidateV0) => `${candidate.provider}:${candidate.id}`;

const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export default function App({ embedded = embeddedStageFromLocation, onEmbeddedReady }: AppProps = {}) {
  const embeddedStage = embedded;
  const audioRef = useRef<HTMLAudioElement>(null);
  const stageShellRef = useRef<HTMLElement>(null);
  const objectURLRef = useRef<string | null>(null);
  const displayTimeRef = useRef(demoTimeMs);
  const youtubeMusic = useYouTubeMusicBridge();
  const musicMapAtRenderRef = useRef(youtubeMusic.musicMap);
  musicMapAtRenderRef.current = youtubeMusic.musicMap;
  const [source, setSource] = useState<PlaybackSource>(() =>
    isYouTubeMusicExtensionContext() ? "youtubeMusic" : "local",
  );
  const [lyrics, setLyrics] = useState<LyricDocumentV0>(demoLyrics);
  const [lyricsLabel, setLyricsLabel] = useState("内置无版权 Hook 样片");
  const [audioLabel, setAudioLabel] = useState("尚未导入音频");
  const [audioRecordingID, setAudioRecordingID] = useState<string | null>(null);
  const [hasUserLyrics, setHasUserLyrics] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [displayTimeMs, setDisplayTimeMs] = useState(demoTimeMs);
  const [durationMs, setDurationMs] = useState(demoLyrics.durationMs);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [reduceMotionOverride, setReduceMotion] = useState(false);
  const reduceMotion = prefersReducedMotion || reduceMotionOverride;
  const interaction = useTransientNotice();
  const [showGuides, setShowGuides] = useState(false);
  const [message, setMessage] = useState("样片已就绪。选择音乐来源后导入匹配歌词即可排练。");
  const [metrics, setMetrics] = useState({ count: 0, p95: 0, p99: 0, max: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [automaticLyrics, setAutomaticLyrics] = useState<AutomaticLyricsState>({
    status: "idle",
    candidates: [],
  });
  const [presentation, setPresentation] = useState<"column" | "fullscreen">("column");
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const [manualSearchPending, setManualSearchPending] = useState(false);
  const [lightweight, setLightweight] = useState(false);
  const [vjMode, setVJMode] = useState(false);
  const [rollingDirectorPreference, setRollingDirectorPreference] = useState<"off" | "shadow" | "on">("off");
  const rollingDirectorMode = rollingDirectorDevOverride ?? rollingDirectorPreference;
  const rollingDirectorRoute = rollingDirectorRouteV1(rollingDirectorMode);
  const [lyricsOffsetMs, setLyricsOffsetMs] = useState(0);
  const [installedYouTubeLyricsIdentity, setInstalledYouTubeLyricsIdentity] = useState<string | null>(null);
  const [remoteDirectorPlan, setRemoteDirectorPlan] = useState<DirectorPlanV1 | undefined>();
  const [directorLookupState, setDirectorLookupState] = useState<DirectorLookupState>({ status: "idle" });
  const previousYouTubeIdentityRef = useRef<string | null>(null);
  const lyricsLookupGenerationRef = useRef(0);
  const directorLookupGenerationRef = useRef(0);
  const manualLyricsIdentityRef = useRef<string | null>(null);
  const currentYouTubeIdentityRef = useRef<string | null>(null);
  const lyricsOffsetIdentityRef = useRef<string | null>(null);
  const columnClockCommitRef = useRef(0);
  const everConnectedRef = useRef(false);
  const lastTrackRef = useRef<{ title: string; artist: string }>({ title: "", artist: "" });
  const audioAnalysisRef = useRef<{ trackID: string; captureID?: string } | null>(null);
  const audioAnalysisGenerationRef = useRef(0);
  const stopStageAudioAnalysis = useCallback(() => {
    audioAnalysisGenerationRef.current += 1;
    const active = audioAnalysisRef.current;
    audioAnalysisRef.current = null;
    if (active) void stopYouTubeMusicAudioAnalysis(active.trackID, active.captureID);
  }, []);

  displayTimeRef.current = displayTimeMs;
  const localClockRef = useRef<PlaybackClockV0>({
    source: "localMedia",
    sample: (nowMs = performance.now()) => {
      const media = audioRef.current;
      if (!media?.src) {
        return {
          timeMs: displayTimeRef.current,
          durationMs: 0,
          playbackRate: 1,
          state: "unavailable",
          authoritativeAtMs: nowMs,
        };
      }
      const state = media.ended
        ? "ended"
        : media.paused
          ? "paused"
          : media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
            ? "buffering"
            : "playing";
      return {
        timeMs: Math.max(0, media.currentTime * 1000),
        durationMs: Number.isFinite(media.duration) ? Math.max(0, media.duration * 1000) : 0,
        playbackRate: media.playbackRate,
        state,
        authoritativeAtMs: nowMs,
      };
    },
  });
  const previewClockRef = useRef<PlaybackClockV0>({
    source: "preview",
    sample: (nowMs = performance.now()) => ({
      timeMs: demoTimeMs,
      durationMs: demoLyrics.durationMs,
      playbackRate: 1,
      state: "paused",
      authoritativeAtMs: nowMs,
    }),
  });

  const youtubeRecordingID = youtubeMusic.snapshot
    ? youtubeMusicRecordingID(youtubeMusic.snapshot.track.trackID)
    : null;
  const youtubeLyricsTrack = youtubeMusic.snapshot
    ? lyricsTrackFromSnapshot(youtubeMusic.snapshot)
    : undefined;
  const youtubeLyricsIdentity = youtubeLyricsTrack
    ? lyricsTrackIdentity(youtubeLyricsTrack)
    : null;
  const currentLyricsOffsetIdentity = source === "youtubeMusic" ? youtubeLyricsIdentity : null;
  const effectiveLyricsOffsetMs = lyricsOffsetForIdentity(
    lyricsOffsetIdentityRef.current,
    currentLyricsOffsetIdentity,
    lyricsOffsetMs,
  );
  currentYouTubeIdentityRef.current = youtubeLyricsIdentity;
  const expectedRecordingID = source === "youtubeMusic" ? youtubeRecordingID : audioRecordingID;
  const hasMatchingLyrics =
    hasUserLyrics &&
    expectedRecordingID !== null &&
    lyrics.recordingID === expectedRecordingID &&
    (source !== "youtubeMusic" || installedYouTubeLyricsIdentity === youtubeLyricsIdentity);
  const sourceReady = source === "youtubeMusic"
    ? youtubeMusic.connected && youtubeMusic.snapshot !== undefined
    : audioRecordingID !== null;
  const stageReady = sourceReady && hasMatchingLyrics;
  const selectedClock = stageReady
    ? source === "youtubeMusic"
      ? youtubeMusic.clock
      : localClockRef.current
    : previewClockRef.current;
  const selectedPlaying = stageReady && (
    source === "youtubeMusic"
      ? youtubeMusic.snapshot?.playback.state === "playing"
      : playing
  );
  const stageDisplayTimeMs = stageReady ? displayTimeMs : demoTimeMs;
  const stageLyricTimeMs = stageReady
    ? lyricsTimeForPlaybackMs(stageDisplayTimeMs, effectiveLyricsOffsetMs, durationMs)
    : demoTimeMs;

  const plan = useMemo(() => compilePerformancePlan(lyrics), [lyrics]);
  const localDirectorPlan = useMemo(() => {
    const base = compileLocalDirectorPlanV3(lyrics);
    if (!requestedPreviewWorld) return base;
    const spatialMode = ["panoramic", "cinematic", "orbital", "splitStage", "chorusWall"].includes(requestedPreviewWorld)
      ? requestedPreviewWorld as "panoramic" | "cinematic" | "orbital" | "splitStage" | "chorusWall"
      : "cinematic";
    const previewSection = base.sections.find((section) => demoTimeMs >= section.fromMs && demoTimeMs < section.toMs)
      ?? base.sections[0];
    const previewLineIndices = previewSection
      ? lyrics.lines
        .filter((line) => line.lineIndex >= previewSection.fromLineIndex && line.lineIndex <= previewSection.toLineIndex)
        .map((line) => line.lineIndex)
      : [];
    return {
      ...base,
      source: "ai" as const,
      directorVersion: "dev-world-preview-v1",
      planIdentity: `${base.planIdentity}:dev-world:${spatialMode}`,
      concept: "whole-song directed preview",
      motif: "artwork and lyrics inhabit one continuous stage",
      world: {
        spatialMode,
        motionLaw: "flow" as const,
        artworkRole: "portal" as const,
        texture: "mist" as const,
        depth: 0.76,
        fluidity: 0.78,
        elasticity: 0.48,
        atmosphere: 0.86,
        rationale: "Development-only preview of the full-stage AI visual world.",
      },
      effects: previewSection && previewLineIndices.length > 0
        ? [{
            version: "effect-recipe-v1" as const,
            id: `dev-world-effect:${previewSection.id}`,
            cardID: "motion-ribbon" as const,
            sectionID: previewSection.id,
            fromMs: previewSection.fromMs,
            toMs: previewSection.toMs,
            presentation: "section" as const,
            primary: { primitive: "field.ribbon" as const, intensity: 0.72, scale: 1.04 },
            support: [{ primitive: "memory.trail" as const, intensity: 0.42 }],
            evidence: {
              songMotif: "artwork and lyrics inhabit one continuous stage",
              sectionTriggers: ["section_boundary" as const],
              lineIndices: previewLineIndices,
              rationale: "Development-only visual QA for a grounded full-stage motion phrase.",
              confidence: 0.92,
            },
          }]
        : base.effects,
    };
  }, [lyrics]);
  const [rollingDirectorState, setRollingDirectorState] = useState<RollingDirectorRuntimeStateV1>(() =>
    createRollingDirectorRuntimeStateV1(localDirectorPlan, 0)
  );
  const rollingDirectorStateRef = useRef(rollingDirectorState);
  const rollingSeekTargetRef = useRef<number | undefined>(undefined);
  const rollingCoverageRequestEpochRef = useRef(0);
  const rollingClockObservationRef = useRef<{
    lyricTimeMs: number;
    observedAtMs: number;
    playing: boolean;
  } | undefined>(undefined);
  const [rollingForceLocal, setRollingForceLocal] = useState(false);
  rollingDirectorStateRef.current = rollingDirectorState;
  const displayedRemoteDirectorPlan = useMemo(
    () => {
      const selected = rollingDirectorRoute.renderRolling
        ? !rollingForceLocal && rollingHasRemainingDirectionV1(rollingDirectorState.cards, stageLyricTimeMs)
          ? rollingDirectorState.compiledPlan
          : undefined
        : remoteDirectorPlan;
      return selected
        ? rollingDirectorRoute.renderRolling
          ? applyMusicMapToRollingDirectorPlanV1(selected, youtubeMusic.musicMap, rollingDirectorState.cards)
          : applyMusicMapToDirectorPlanV1(selected, youtubeMusic.musicMap)
        : undefined;
    },
    [remoteDirectorPlan, rollingDirectorRoute.renderRolling, rollingDirectorState, rollingForceLocal, stageLyricTimeMs, youtubeMusic.musicMap],
  );
  const timeline = useMemo(() => prepareTimeline(plan), [plan]);

  useEffect(() => {
    setRemoteDirectorPlan(undefined);
    setDirectorLookupState({ status: "idle" });
    const generation = ++directorLookupGenerationRef.current;
    rollingCoverageRequestEpochRef.current += 1;
    rollingSeekTargetRef.current = undefined;
    rollingClockObservationRef.current = undefined;
    setRollingForceLocal(false);
    setRollingDirectorState(createRollingDirectorRuntimeStateV1(localDirectorPlan, generation));
  }, [localDirectorPlan.planIdentity]);

  useEffect(() => {
    if (!rollingDirectorRoute.generateLegacy) return undefined;
    if (source !== "youtubeMusic" || !youtubeMusic.snapshot || !hasMatchingLyrics) return undefined;
    const track = lyricsTrackFromSnapshot(youtubeMusic.snapshot);
    if (!track) return undefined;
    const generation = ++directorLookupGenerationRef.current;
    let cancelled = false;
    setDirectorLookupState({ status: "requesting" });
    void requestAutomaticDirectorPlan(track, lyrics, musicMapAtRenderRef.current).then((response) => {
      if (
        cancelled
        || generation !== directorLookupGenerationRef.current
      ) return;
      setDirectorLookupState(response);
      const next = response.status === "ready" ? response.plan : undefined;
      if (
        !next
        || next.recordingID !== lyrics.recordingID
        || next.lyricsIdentity !== localDirectorPlan.lyricsIdentity
      ) return;
      setRemoteDirectorPlan(next);
    }).catch((error) => {
      if (cancelled || generation !== directorLookupGenerationRef.current) return;
      setDirectorLookupState({
        type: "director-resolution-v1",
        status: "error",
        source: "network",
        reason: error instanceof Error ? error.message : "director-request-failed",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    hasMatchingLyrics,
    localDirectorPlan.lyricsIdentity,
    rollingDirectorMode,
    source,
    youtubeMusic.snapshot?.track.trackID,
  ]);

  useEffect(() => {
    if (!rollingDirectorRoute.generateRolling || source !== "youtubeMusic" || !youtubeMusic.snapshot || !hasMatchingLyrics) return undefined;
    const track = lyricsTrackFromSnapshot(youtubeMusic.snapshot);
    if (!track) return undefined;
    const generation = directorLookupGenerationRef.current;
    let cancelled = false;
    const requesting = {
      ...createRollingDirectorRuntimeStateV1(localDirectorPlan, generation),
      status: "bible-requesting" as const,
    };
    rollingDirectorStateRef.current = requesting;
    setRollingDirectorState(requesting);
    setDirectorLookupState({ status: "requesting", reason: "rolling-bible" });
    void requestDirectorBibleV1(track, lyrics, musicMapAtRenderRef.current).then((response) => {
      if (cancelled || generation !== directorLookupGenerationRef.current) return;
      if (response.status !== "ready" || !response.bible) {
        const degraded = { ...requesting, status: "degraded" as const, consecutiveFailures: 1 };
        rollingDirectorStateRef.current = degraded;
        setRollingDirectorState(degraded);
        setDirectorLookupState(response.status === "error" || response.status === "unavailable"
          ? { type: "director-resolution-v1", status: response.status, source: "local", reason: response.reason }
          : { status: "idle", reason: response.reason });
        return;
      }
      const ready = {
        ...requesting,
        status: "ready" as const,
        bible: response.bible,
        bibleSource: response.source,
      };
      rollingDirectorStateRef.current = ready;
      setRollingDirectorState(ready);
      setDirectorLookupState(response.source === "local" && response.reason
        ? { type: "director-resolution-v1", status: "error", source: "local", reason: response.reason }
        : { status: "idle", reason: "rolling-bible-ready" });
    }).catch(() => {
      if (cancelled || generation !== directorLookupGenerationRef.current) return;
      const degraded = { ...requesting, status: "degraded" as const, consecutiveFailures: 1 };
      rollingDirectorStateRef.current = degraded;
      setRollingDirectorState(degraded);
      setDirectorLookupState({
        type: "director-resolution-v1", status: "error", source: "local", reason: "rolling-bible-request-failed",
      });
    });
    return () => { cancelled = true; };
  }, [hasMatchingLyrics, localDirectorPlan.planIdentity, rollingDirectorMode, source, youtubeMusic.snapshot?.track.trackID]);

  useEffect(() => {
    if (!rollingDirectorRoute.generateRolling || source !== "youtubeMusic" || !youtubeMusic.snapshot || !hasMatchingLyrics) return undefined;
    const track = lyricsTrackFromSnapshot(youtubeMusic.snapshot);
    if (!track) return undefined;
    let disposed = false;
    const tick = () => {
      let current = rollingDirectorStateRef.current;
      const sample = youtubeMusic.clock.sample();
      const playbackMs = sample.state === "unavailable" ? displayTimeRef.current : sample.timeMs;
      const lyricMs = lyricsTimeForPlaybackMs(playbackMs, effectiveLyricsOffsetMs, durationMs);
      const paused = sample.state !== "playing" && sample.state !== "buffering";
      const observation = { lyricTimeMs: lyricMs, observedAtMs: performance.now(), playing: !paused };
      const detectedSeek = detectRollingSeekTargetV1(rollingClockObservationRef.current, observation);
      rollingClockObservationRef.current = observation;
      if (detectedSeek !== undefined) {
        rollingSeekTargetRef.current = detectedSeek;
        const seek = handleRollingSeekV1(current, localDirectorPlan, detectedSeek, lyrics);
        current = seek.state;
        rollingDirectorStateRef.current = current;
        setRollingDirectorState(current);
        setRollingForceLocal(seek.useLocalImmediately);
      }
      let seekTargetMs = rollingSeekTargetRef.current;
      if (seekTargetMs !== undefined && rollingCoverageAtV1(current.cards, seekTargetMs).aheadMs > 0) {
        rollingSeekTargetRef.current = undefined;
        seekTargetMs = undefined;
        setRollingForceLocal(false);
      }
      if (seekTargetMs !== undefined && current.consecutiveFailures >= 3) {
        rollingSeekTargetRef.current = undefined;
        return;
      }
      if (!shouldRefillRollingCoverageV1(current, lyricMs, durationMs, paused, seekTargetMs)) return;
      const targetMs = rollingRefillTargetV1(current, lyricMs, durationMs, seekTargetMs);
      const window = selectRollingRequestedWindowV1(lyrics, targetMs);
      if (!window || current.pendingWindow?.identity === window.identity || !current.bible) return;
      const requesting = { ...current, status: "coverage-requesting" as const, pendingWindow: window };
      const requestEpoch = ++rollingCoverageRequestEpochRef.current;
      rollingDirectorStateRef.current = requesting;
      setRollingDirectorState(requesting);
      setDirectorLookupState({ status: "requesting", reason: "rolling-coverage" });
      const requestState = rollingRequestStateV1(lyrics, current.bible, current.cards, window.fromLineIndex);
      void requestDirectorCoverageV1(track, lyrics, current.bible, targetMs, 60_000, {
        musicMap: musicMapAtRenderRef.current,
        paused,
        ...(seekTargetMs !== undefined ? { seekTargetMs } : {}),
        state: requestState,
      }).then((response) => {
        if (disposed || current.generation !== directorLookupGenerationRef.current
          || requestEpoch !== rollingCoverageRequestEpochRef.current
          || rollingDirectorStateRef.current.pendingWindow?.identity !== window.identity) return;
        const next = reduceRollingCoverageResultV1(lyrics, requesting, response, targetMs, current.generation);
        if (seekTargetMs !== undefined && rollingSeekTargetRef.current === seekTargetMs) {
          rollingSeekTargetRef.current = undefined;
          setRollingForceLocal(!rollingHasRemainingDirectionV1(next.cards, seekTargetMs));
        }
        rollingDirectorStateRef.current = next;
        setRollingDirectorState(next);
        setDirectorLookupState(response.status === "error" || response.status === "unavailable"
          ? { type: "director-resolution-v1", status: response.status, source: "local", reason: response.reason }
          : response.source === "local" && response.reason
            ? { type: "director-resolution-v1", status: "error", source: "local", reason: response.reason }
            : { status: "idle", reason: response.reason });
      }).catch(() => {
        if (disposed || current.generation !== directorLookupGenerationRef.current
          || requestEpoch !== rollingCoverageRequestEpochRef.current
          || rollingDirectorStateRef.current.pendingWindow?.identity !== window.identity) return;
        const next = { ...requesting, status: "degraded" as const, pendingWindow: undefined, consecutiveFailures: current.consecutiveFailures + 1 };
        if (rollingSeekTargetRef.current === seekTargetMs) rollingSeekTargetRef.current = undefined;
        rollingDirectorStateRef.current = next;
        setRollingDirectorState(next);
        setDirectorLookupState({
          type: "director-resolution-v1", status: "error", source: "local", reason: "rolling-coverage-request-failed",
        });
      });
    };
    tick();
    const timer = globalThis.setInterval(tick, 1_000);
    return () => { disposed = true; globalThis.clearInterval(timer); };
  }, [durationMs, effectiveLyricsOffsetMs, hasMatchingLyrics, lyrics, localDirectorPlan, rollingDirectorMode, source, youtubeMusic.clock, youtubeMusic.snapshot?.track.trackID]);
  const activeLineText = useMemo(() => {
    const active = sampleTimeline(timeline, stageLyricTimeMs);
    return active.map((index) => lyrics.lines[index]?.text).filter(Boolean).join(" / ") || "器乐段 / 等待下一句";
  }, [lyrics.lines, stageLyricTimeMs, timeline]);

  const handleMetrics = useCallback(
    (summary: { count: number; p95: number; p99: number; max: number }) => setMetrics(summary),
    [],
  );

  const installLyricsCandidate = useCallback((
    track: LyricsLookupTrackV0,
    candidate: LyricsCandidateV0,
    sourceLabel: string,
  ): boolean => {
    const recordingID = youtubeMusicRecordingID(track.trackID);
    const result = lyricDocumentFromCandidate(candidate, recordingID, track.durationMs);
    if (!result.ok) {
      setMessage(result.issues.map((issue) => issue.message).join("；"));
      return false;
    }
    const installed = applyNonMusicSegments(
      result.value,
      candidate.nonMusicSegmentsMs ?? [],
      track.durationMs,
    );
    setLyrics(installed);
    setLyricsLabel(
      `${sourceLabel} · ${candidate.title}${candidate.timingKind === "word" ? " · 逐字" : ""}${candidate.nonMusicSegmentsMs?.length ? " · SponsorBlock 对齐" : ""}`,
    );
    setHasUserLyrics(true);
    setInstalledYouTubeLyricsIdentity(lyricsTrackIdentity(track));
    setDurationMs(track.durationMs);
    setDisplayTimeMs(youtubeMusic.clock.sample().timeMs);
    return true;
  }, [youtubeMusic.clock]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement || stageShellRef.current?.matches(":fullscreen"));
      setIsFullscreen(active);
      if (!active && embeddedStage) setPresentation("column");
    };
    const root = stageShellRef.current?.getRootNode();
    document.addEventListener("fullscreenchange", onFullscreenChange);
    if (root instanceof ShadowRoot) root.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (root instanceof ShadowRoot) root.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [embeddedStage]);

  useEffect(() => {
    if (
      !embeddedStage ||
      presentation !== "column" ||
      source !== "youtubeMusic" ||
      !youtubeMusic.connected
    ) return undefined;
    let frame = 0;
    const tick = (nowMs: number) => {
      const sample = youtubeMusic.clock.sample();
      const intervalMs = lightweight ? 200 : 50;
      if (sample.state !== "unavailable" && nowMs - columnClockCommitRef.current >= intervalMs) {
        columnClockCommitRef.current = nowMs;
        setDisplayTimeMs((current) => Math.abs(current - sample.timeMs) >= 20 ? sample.timeMs : current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lightweight, presentation, source, youtubeMusic.clock, youtubeMusic.connected]);

  useEffect(() => interaction.clear(), [interaction.clear, youtubeLyricsIdentity]);

  useEffect(() => {
    if (!embeddedStage) return undefined;
    if (onEmbeddedReady) {
      onEmbeddedReady();
    } else {
      window.parent?.postMessage({ type: "lyricstage-embedded-ready" }, "*");
    }
    document.getElementById("lyricstage-boot")?.remove();
    return undefined;
  }, [embeddedStage, onEmbeddedReady]);

  useEffect(() => {
    let cancelled = false;
    const applyPreferences = (preferences: { lightweight: boolean; vjMode: boolean; rollingDirectorV1: "off" | "shadow" | "on" }) => {
      if (cancelled) return;
      setLightweight(preferences.lightweight);
      setVJMode(preferences.vjMode);
      setRollingDirectorPreference(preferences.rollingDirectorV1);
    };
    void readExtensionPreferences().then(applyPreferences).catch(() => undefined);
    const unsubscribe = subscribeExtensionPreferences(applyPreferences);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!embeddedStage || !hasMatchingLyrics) return undefined;
    const timer = globalThis.setTimeout(() => { void loadStageCanvasModule(); }, 250);
    return () => globalThis.clearTimeout(timer);
  }, [embeddedStage, hasMatchingLyrics]);

  useEffect(() => {
    const recordingIdentity = source === "youtubeMusic" ? youtubeLyricsIdentity : null;
    lyricsOffsetIdentityRef.current = recordingIdentity;
    setLyricsOffsetMs(0);
    if (!recordingIdentity) return undefined;
    let cancelled = false;
    void readLyricsOffset(recordingIdentity).then((storedOffset) => {
      if (!cancelled && lyricsOffsetIdentityRef.current === recordingIdentity) {
        setLyricsOffsetMs(clampLyricsOffsetMs(storedOffset));
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [source, youtubeLyricsIdentity]);

  useEffect(() => {
    if (!embeddedStage || presentation !== "fullscreen" || !selectedPlaying) return undefined;
    let disposed = false;
    let acquiring = false;
    let sentinel: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (
        disposed
        || acquiring
        || sentinel
        || document.visibilityState !== "visible"
        || !navigator.wakeLock
      ) return;
      acquiring = true;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (disposed) {
          await acquired.release().catch(() => undefined);
          return;
        }
        sentinel = acquired;
        acquired.addEventListener("release", () => {
          if (sentinel === acquired) sentinel = null;
          if (!disposed && document.visibilityState === "visible") void acquire();
        }, { once: true });
      } catch {
        // Fullscreen remains usable when the browser or OS denies wake lock.
      } finally {
        acquiring = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void acquire();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const current = sentinel;
      sentinel = null;
      void current?.release().catch(() => undefined);
    };
  }, [embeddedStage, presentation, selectedPlaying]);

  useEffect(() => {
    if (youtubeMusic.connected) everConnectedRef.current = true;
    if (youtubeMusic.snapshot) {
      lastTrackRef.current = {
        title: youtubeMusic.snapshot.track.title,
        artist: youtubeMusic.snapshot.track.artist || "YouTube Music",
      };
    }
  }, [youtubeMusic.connected, youtubeMusic.snapshot]);

  useEffect(() => {
    const active = audioAnalysisRef.current;
    if (active && active.trackID !== youtubeMusic.snapshot?.track.trackID) stopStageAudioAnalysis();
  }, [stopStageAudioAnalysis, youtubeMusic.snapshot?.track.trackID]);

  useEffect(() => () => stopStageAudioAnalysis(), [stopStageAudioAnalysis]);

  useEffect(
    () => () => {
      if (objectURLRef.current) URL.revokeObjectURL(objectURLRef.current);
    },
    [],
  );

  useEffect(() => {
    if (source !== "youtubeMusic" || !youtubeMusic.snapshot) return;
    const { track, playback } = youtubeMusic.snapshot;
    const lookupTrack = lyricsTrackFromSnapshot(youtubeMusic.snapshot);
    const identity = lookupTrack ? lyricsTrackIdentity(lookupTrack) : null;
    setDisplayTimeMs(playback.currentTimeMs);
    setDurationMs(Math.max(1, playback.durationMs));
    if (previousYouTubeIdentityRef.current !== identity) {
      previousYouTubeIdentityRef.current = identity;
      lyricsLookupGenerationRef.current += 1;
      manualLyricsIdentityRef.current = null;
      setInstalledYouTubeLyricsIdentity(null);
      setLyrics(demoLyrics);
      setLyricsLabel(`等待《${track.title}》的歌词`);
      setHasUserLyrics(false);
      setAutomaticLyrics({ status: "idle", candidates: [] });
      setShowVersionPicker(false);
      setManualSearchPending(false);
      setMessage("YouTube Music 已连接，正在准备自动搜索歌词。");
    }
  }, [source, youtubeMusic.snapshot]);

  useEffect(() => {
    if (source !== "youtubeMusic" || !youtubeMusic.snapshot) return undefined;
    const track = lyricsTrackFromSnapshot(youtubeMusic.snapshot);
    if (!track) return undefined;
    const trackIdentity = lyricsTrackIdentity(track);
    const generation = ++lyricsLookupGenerationRef.current;
    let cancelled = false;
    setAutomaticLyrics({
      status: "searching",
      trackID: track.trackID,
      trackIdentity,
      candidates: [],
    });
    setMessage("正在清洗歌名并从多源曲库搜索同步歌词……");

    void requestAutomaticLyrics(track).then((response) => {
      if (
        cancelled ||
        generation !== lyricsLookupGenerationRef.current ||
        manualLyricsIdentityRef.current === trackIdentity
      ) return;
      if (response.status === "match" && response.match) {
        if (installLyricsCandidate(track, response.match, response.source === "cache" ? "缓存歌词" : "自动歌词")) {
          setAutomaticLyrics({
            status: "matched",
            source: response.source,
            trackID: track.trackID,
            trackIdentity,
            candidates: response.candidates,
            selectedCandidateKey: lyricsCandidateKey(response.match),
          });
          setMessage(
            response.matchKind === "originalFallback"
              ? `${response.source === "cache" ? "已从缓存恢复" : response.assistance === "ai" ? "AI 已识别原曲并采用" : "未找到翻唱专用歌词，已采用"}原唱 ${response.match.artist || "版本"} 的同步歌词。`
              : response.source === "cache"
                ? "已从本地缓存恢复同步歌词，舞台正在跟随 YouTube Music。"
                : response.assistance === "ai" ? "AI 已清洗标题与歌手并自动匹配同步歌词。" : "已自动匹配同步歌词，舞台正在跟随 YouTube Music。",
          );
        }
        return;
      }
      if (response.status === "candidates") {
        setAutomaticLyrics({
          status: "candidates",
          source: response.source,
          trackID: track.trackID,
          trackIdentity,
          candidates: response.candidates,
        });
        setMessage(response.assistance === "ai" ? "本地规则与 AI 已完成清洗，但候选仍无法安全自动确认；请选择版本。" : "找到了歌词候选，但歌手或时长不足以自动确认。请选择版本或手动搜索。");
        return;
      }
      if (response.status === "miss") {
        setAutomaticLyrics({
          status: "miss",
          source: response.source,
          trackID: track.trackID,
          trackIdentity,
          candidates: [],
        });
        setMessage(response.assistance === "ai" ? "本地规则与 AI 已尝试清洗，多源歌词库仍没有同步歌词。" : "多源歌词库暂时没有匹配结果，可修改歌名或歌手后手动搜索。");
        return;
      }
      setAutomaticLyrics({
        status: "error",
        source: response.source,
        trackID: track.trackID,
        trackIdentity,
        candidates: [],
      });
      setMessage(response.message || "自动歌词搜索失败，可使用手动搜索重试。");
    }).catch((error) => {
      if (cancelled || generation !== lyricsLookupGenerationRef.current) return;
      setAutomaticLyrics({ status: "error", trackID: track.trackID, trackIdentity, candidates: [] });
      setMessage(error instanceof Error ? error.message : "自动歌词搜索失败");
    });

    return () => {
      cancelled = true;
    };
  }, [
    installLyricsCandidate,
    source,
    youtubeMusic.snapshot?.track.artist,
    youtubeMusic.snapshot?.track.title,
    youtubeMusic.snapshot?.track.trackID,
    youtubeMusic.snapshot?.playback.durationMs,
  ]);

  const selectSource = (next: PlaybackSource) => {
    if (next === source) return;
    if (next === "youtubeMusic") {
      audioRef.current?.pause();
      setPlaying(false);
      setSource(next);
      setMessage(
        youtubeMusic.available
          ? "正在等待 YouTube Music 当前歌曲。"
          : "YouTube Music 模式需要从 LyricStage 伴生扩展打开。",
      );
      return;
    }
    lyricsLookupGenerationRef.current += 1;
    setSource(next);
    setAutomaticLyrics({ status: "idle", candidates: [] });
    setMessage(audioRecordingID ? "已切回本地音频。" : "请导入本地音频和匹配歌词。");
  };

  const onAudioFile = (file?: File) => {
    if (!file) return;
    const audio = audioRef.current;
    if (!audio) return;
    lyricsLookupGenerationRef.current += 1;
    if (objectURLRef.current) URL.revokeObjectURL(objectURLRef.current);
    const url = URL.createObjectURL(file);
    objectURLRef.current = url;
    audio.src = url;
    audio.load();
    setSource("local");
    setAudioRecordingID(localRecordingID(file));
    setAudioLabel(file.name);
    setPlaying(false);
    setDisplayTimeMs(0);
    setMessage(hasUserLyrics ? "音频已更换，请确认歌词与当前录音匹配。" : "音频已载入；继续导入匹配歌词。");
  };

  const onLyricFile = async (file?: File) => {
    if (!file) return;
    if (!expectedRecordingID) {
      setMessage(source === "youtubeMusic" ? "请先在 YouTube Music 播放一首歌曲。" : "请先导入本地音频。");
      return;
    }
    const generation = ++lyricsLookupGenerationRef.current;
    const sourceAtStart = source;
    const recordingIDAtStart = expectedRecordingID;
    const youtubeTrackAtStart = sourceAtStart === "youtubeMusic" && youtubeMusic.snapshot
      ? lyricsTrackFromSnapshot(youtubeMusic.snapshot)
      : null;
    const manualIdentityAtStart = youtubeTrackAtStart ? lyricsTrackIdentity(youtubeTrackAtStart) : null;
    manualLyricsIdentityRef.current = manualIdentityAtStart;
    const rawLyrics = await file.text();
    if (generation !== lyricsLookupGenerationRef.current) return;
    const result = parseLyricSource(rawLyrics, file.name, recordingIDAtStart, durationMs);
    if (!result.ok) {
      setMessage(result.issues.map((issue) => issue.message).join("；"));
      return;
    }
    setLyrics(result.value);
    setLyricsLabel(file.name);
    setHasUserLyrics(true);
    setInstalledYouTubeLyricsIdentity(
      sourceAtStart === "youtubeMusic" && youtubeTrackAtStart
        ? manualIdentityAtStart
        : null,
    );
    setAutomaticLyrics({
      status: "manual",
      ...(youtubeTrackAtStart
        ? { trackID: youtubeTrackAtStart.trackID }
        : {}),
      candidates: [],
    });
    setDurationMs(Math.max(durationMs, result.value.durationMs));
    const initialTime = sourceAtStart === "youtubeMusic"
      ? youtubeMusic.clock.sample().timeMs
      : result.value.lines[0]?.fromMs ?? 0;
    setDisplayTimeMs(initialTime);
    setMessage(
      sourceAtStart === "youtubeMusic"
        ? "歌词已装入，正在保存到这首歌曲的本地歌词库。"
        : "歌词合同已通过，完整文本与时间轴已装入舞台。",
    );
    if (youtubeTrackAtStart && manualIdentityAtStart) {
      void rememberLocalLyrics(youtubeTrackAtStart, file.name, rawLyrics).then(() => {
          const identity = manualIdentityAtStart;
          if (currentYouTubeIdentityRef.current === identity) {
            setMessage("歌词已装入并保存；下次播放这首歌时会优先恢复本地版本。");
          }
        }).catch(() => {
          const identity = manualIdentityAtStart;
          if (currentYouTubeIdentityRef.current === identity) {
            setMessage("歌词已临时装入，但本地歌词库写入失败；刷新后可能需要重新匹配。");
          }
        });
    }
  };

  const chooseLyricsCandidate = (candidate: LyricsCandidateV0) => {
    const snapshot = youtubeMusic.snapshot;
    if (!snapshot) return;
    const track = lyricsTrackFromSnapshot(snapshot);
    if (!track) return;
    const trackIdentity = lyricsTrackIdentity(track);
    if (automaticLyrics.trackIdentity !== trackIdentity) {
      setMessage("歌曲已经切换，旧歌词候选已失效，请选择当前歌曲的版本。");
      setShowVersionPicker(false);
      return;
    }
    lyricsLookupGenerationRef.current += 1;
    manualLyricsIdentityRef.current = trackIdentity;
    if (!installLyricsCandidate(track, candidate, "已选歌词")) return;
    setAutomaticLyrics((previous) => ({
      status: "matched",
      source: "cache",
      trackID: track.trackID,
      trackIdentity,
      candidates: retainCandidatesAfterChoice(previous.candidates, candidate),
      selectedCandidateKey: lyricsCandidateKey(candidate),
    }));
    setShowVersionPicker(false);
    setMessage("已采用所选歌词版本，正在写入本地缓存。");
    void rememberLyricsCandidate(track, candidate).then(() => {
      if (currentYouTubeIdentityRef.current === trackIdentity) {
        setMessage("已采用所选歌词版本，并记住这首 YouTube Music 曲目。");
      }
    }).catch(() => {
      if (currentYouTubeIdentityRef.current === trackIdentity) {
        setMessage("已临时采用所选歌词，但本地缓存写入失败；刷新后可能需要重新选择。");
      }
    });
  };

  const searchLyricsManually = async (title: string, artist: string) => {
    const snapshot = youtubeMusic.snapshot;
    if (!snapshot) {
      setMessage("当前没有可搜索的 YouTube Music 曲目。");
      return;
    }
    const track = lyricsTrackFromSnapshot(snapshot);
    if (!track) {
      setMessage("歌曲时长尚未稳定，请稍后再搜索。");
      return;
    }
    const trackIdentity = lyricsTrackIdentity(track);
    const cleanTitle = title.normalize("NFKC").trim();
    const cleanArtist = artist.normalize("NFKC").trim();
    if (!cleanTitle) {
      setMessage("请输入歌名；歌手可以留空。");
      return;
    }
    const generation = ++lyricsLookupGenerationRef.current;
    manualLyricsIdentityRef.current = trackIdentity;
    setManualSearchPending(true);
    setShowVersionPicker(false);
    setAutomaticLyrics({
      status: "searching",
      trackID: track.trackID,
      trackIdentity,
      candidates: [],
    });
    setMessage(`正在手动搜索“${cleanTitle}”${cleanArtist ? ` / ${cleanArtist}` : ""}……`);
    try {
      const response = await requestManualLyrics(track, cleanTitle, cleanArtist);
      if (generation !== lyricsLookupGenerationRef.current || currentYouTubeIdentityRef.current !== trackIdentity) return;
      if (response.status === "candidates") {
        setAutomaticLyrics({
          status: "candidates",
          source: response.source,
          trackID: track.trackID,
          trackIdentity,
          candidates: response.candidates,
        });
        setMessage(response.message || `手动搜索返回 ${response.candidates.length} 个候选，请选择版本。`);
      } else if (response.status === "miss") {
        setAutomaticLyrics({
          status: "miss",
          source: response.source,
          trackID: track.trackID,
          trackIdentity,
          candidates: [],
        });
        setMessage(response.message || "手动搜索没有找到同步歌词，可修改条件后重试。");
      } else {
        setAutomaticLyrics({
          status: "error",
          source: response.source,
          trackID: track.trackID,
          trackIdentity,
          candidates: [],
        });
        setMessage(response.message || "手动歌词搜索失败。");
      }
    } catch (error) {
      if (generation !== lyricsLookupGenerationRef.current) return;
      setAutomaticLyrics({ status: "error", trackID: track.trackID, trackIdentity, candidates: [] });
      setMessage(error instanceof Error ? error.message : "手动歌词搜索失败");
    } finally {
      if (generation === lyricsLookupGenerationRef.current) setManualSearchPending(false);
    }
  };

  const togglePlayback = async () => {
    if (source === "youtubeMusic") {
      const opened = await youtubeMusic.openYouTubeMusic();
      setMessage(opened ? "播放控制仍由 YouTube Music 拥有。" : "请回到 YouTube Music 控制播放。");
      return;
    }
    const audio = audioRef.current;
    if (!audio?.src) {
      setMessage("请先导入本地音频。");
      return;
    }
    if (!hasMatchingLyrics) {
      setMessage("请再导入与这份音频匹配的 LRC 或规范歌词 JSON。");
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setMessage("浏览器没有开始播放，请再次点击播放。");
      }
    } else {
      audio.pause();
    }
  };

  const seek = (nextMs: number) => {
    if (source === "youtubeMusic") {
      setMessage("第一版由 YouTube Music 标签页负责 seek，舞台会自动重新对齐。");
      return;
    }
    const bounded = Math.min(durationMs, Math.max(0, nextMs));
    const audio = audioRef.current;
    if (audio?.src && hasMatchingLyrics) audio.currentTime = bounded / 1000;
    setDisplayTimeMs(bounded);
  };

  const seekStage = async (nextMs: number) => {
    if (source === "youtubeMusic") {
      const priorRollingState = rollingDirectorStateRef.current;
      const priorForceLocal = rollingForceLocal;
      let appliedSeekState: RollingDirectorRuntimeStateV1 | undefined;
      if (rollingDirectorRoute.generateRolling) {
        const lyricTargetMs = lyricsTimeForPlaybackMs(nextMs, effectiveLyricsOffsetMs, durationMs);
        rollingSeekTargetRef.current = lyricTargetMs;
        const seek = handleRollingSeekV1(rollingDirectorStateRef.current, localDirectorPlan, lyricTargetMs, lyrics);
        appliedSeekState = seek.state;
        rollingDirectorStateRef.current = seek.state;
        setRollingDirectorState(seek.state);
        setRollingForceLocal(seek.useLocalImmediately);
      }
      const expectedTrackID = youtubeMusic.snapshot?.track.trackID;
      const ok = expectedTrackID
        ? await seekYouTubeMusic(nextMs, expectedTrackID)
        : false;
      if (!ok) {
        rollingSeekTargetRef.current = undefined;
        if (appliedSeekState && rollingDirectorStateRef.current === appliedSeekState) {
          rollingDirectorStateRef.current = priorRollingState;
          setRollingDirectorState(priorRollingState);
          setRollingForceLocal(priorForceLocal);
        }
        const notice = "跳转失败：歌曲可能刚刚切换，请稍候重试。";
        setMessage(notice);
        interaction.show(notice);
      }
      return;
    }
    seek(nextMs);
  };

  const controlStageTransport = async (action: YouTubeMusicTransportActionV0) => {
    if (source === "youtubeMusic") {
      const expectedTrackID = youtubeMusic.snapshot?.track.trackID;
      const ok = expectedTrackID
        ? await controlYouTubeMusic(action, expectedTrackID)
        : false;
      if (!ok) {
        const notice = "播放控制暂时不可用：歌曲可能刚刚切换，请重试。";
        setMessage(notice);
        interaction.show(notice);
      }
      return;
    }
    if (action === "play" || action === "pause") await togglePlayback();
  };

  const { setStageLiked, selectStageQueueItem, setStagePlaybackMode } = createYouTubeMusicPlayerActions({
    expectedTrackID: source === "youtubeMusic" ? youtubeMusic.snapshot?.track.trackID : undefined,
    setLiked: setYouTubeMusicLiked,
    selectQueueItem: selectYouTubeMusicQueueItem,
    setMode: setYouTubeMusicPlaybackMode,
    notify: (notice) => { setMessage(notice); interaction.show(notice); },
  });

  const exitEmbeddedFullscreen = useCallback(async () => {
    stopStageAudioAnalysis();
    setPresentation("column");
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Column remains the source of truth even if exitFullscreen is denied.
      }
    }
    requestAnimationFrame(() => {
      const root = stageShellRef.current?.getRootNode();
      const trigger = root instanceof ShadowRoot
        ? root.querySelector<HTMLButtonElement>("[data-column-enter-fullscreen='true']")
        : document.querySelector<HTMLButtonElement>("[data-column-enter-fullscreen='true']");
      trigger?.focus();
    });
  }, [stopStageAudioAnalysis]);

  const setCurrentLyricsOffset = useCallback((nextOffsetMs: number) => {
    const boundedOffset = clampLyricsOffsetMs(nextOffsetMs);
    setLyricsOffsetMs(boundedOffset);
    setMessage(boundedOffset === 0
      ? "歌词时间轴已归零。"
      : `歌词时间轴已${formatLyricsOffset(boundedOffset)}。`);
    const recordingIdentity = source === "youtubeMusic" ? youtubeLyricsIdentity : null;
    if (recordingIdentity) {
      void saveLyricsOffset(recordingIdentity, boundedOffset).catch(() => {
        if (lyricsOffsetIdentityRef.current === recordingIdentity) {
          setMessage(`歌词已${formatLyricsOffset(boundedOffset)}，但本地偏移保存失败。`);
        }
      });
    }
  }, [source, youtubeLyricsIdentity]);

  const alignCurrentLyricsLine = useCallback((lineIndex: number) => {
    if (!hasMatchingLyrics) {
      setMessage("请先匹配当前歌曲的同步歌词。");
      return;
    }
    const line = lyrics.lines.find((candidate) => candidate.lineIndex === lineIndex);
    if (!line) {
      setMessage("当前没有可作为锚点的歌词句。");
      return;
    }
    const offsetMs = lyricsOffsetFromLineAnchor(displayTimeRef.current, line.fromMs);
    setCurrentLyricsOffset(offsetMs);
    const lineLabel = line.text.length > 18 ? `${line.text.slice(0, 18)}…` : line.text;
    setMessage(`已把“${lineLabel}”的开头对齐到当前播放位置；可用 0.1 秒按钮继续微调。`);
  }, [hasMatchingLyrics, lyrics.lines, setCurrentLyricsOffset]);

  useEffect(() => {
    if (!embeddedStage || presentation !== "fullscreen") return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void exitEmbeddedFullscreen();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [exitEmbeddedFullscreen, presentation]);

  const enterFullscreen = async () => {
    if (embeddedStage) {
      if (!canEnterEmbeddedFullscreen(hasMatchingLyrics)) {
        setMessage("请先匹配当前歌曲的同步歌词后再进入全屏舞台。");
        return;
      }
      const host = stageShellRef.current;
      if (!host) {
        setMessage("全屏容器尚未就绪，请重试。");
        return;
      }
      // Must stay in the user-gesture stack: reveal host then requestFullscreen.
      const snapshot = source === "youtubeMusic" ? youtubeMusic.snapshot : undefined;
      if (snapshot && audioAnalysisRef.current && audioAnalysisRef.current.trackID !== snapshot.track.trackID) stopStageAudioAnalysis();
      const audioGeneration = snapshot && audioAnalysisRef.current?.trackID !== snapshot.track.trackID
        ? ++audioAnalysisGenerationRef.current : audioAnalysisGenerationRef.current;
      const audioRequest = snapshot && audioAnalysisRef.current?.trackID !== snapshot.track.trackID
        ? startYouTubeMusicAudioAnalysis(snapshot.track.trackID, snapshot.playback.durationMs) : undefined;
      void loadStageCanvasModule();
      host.hidden = false;
      host.setAttribute("aria-hidden", "false");
      try {
        await host.requestFullscreen();
        const hostRoot = host.getRootNode();
        const shadowFullscreenElement = hostRoot instanceof ShadowRoot
          ? hostRoot.fullscreenElement
          : null;
        if (!fullscreenOwnershipConfirmed(
          host,
          document.fullscreenElement,
          shadowFullscreenElement,
          host.matches(":fullscreen"),
        )) {
          throw new Error("fullscreen-ownership-unconfirmed");
        }
        setPresentation("fullscreen");
        void audioRequest?.then((result) => {
          if (!result.ok) return;
          if (audioAnalysisGenerationRef.current === audioGeneration) {
            audioAnalysisRef.current = { trackID: snapshot!.track.trackID, captureID: result.captureID };
          } else void stopYouTubeMusicAudioAnalysis(snapshot!.track.trackID, result.captureID);
        });
      } catch {
        if (audioRequest) {
          audioAnalysisGenerationRef.current += 1;
          void audioRequest.then((result) => {
            if (result.ok) void stopYouTubeMusicAudioAnalysis(snapshot!.track.trackID, result.captureID);
          });
        }
        host.hidden = true;
        host.setAttribute("aria-hidden", "true");
        setPresentation("column");
        setMessage("浏览器未授权全屏，已留在侧栏 Column，不会把演出塞进窄栏。");
      }
      return;
    }
    try {
      await stageShellRef.current?.requestFullscreen();
    } catch {
      setMessage("浏览器没有进入全屏，请检查全屏权限后重试。");
    }
  };

  const resetDemo = () => {
    audioRef.current?.pause();
    setSource("local");
    setPlaying(false);
    setLyrics(demoLyrics);
    setLyricsLabel("内置无版权 Hook 样片");
    setHasUserLyrics(false);
    setInstalledYouTubeLyricsIdentity(null);
    lyricsLookupGenerationRef.current += 1;
    setAutomaticLyrics({ status: "idle", candidates: [] });
    setDisplayTimeMs(demoTimeMs);
    setDurationMs(demoLyrics.durationMs);
    setMessage("已恢复内置大屏样片。它只做视觉预览，不伪装成正在播放的歌曲。");
  };

  const familyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    plan.scenes.forEach((scene) => counts.set(scene.family, (counts.get(scene.family) ?? 0) + 1));
    return Array.from(counts.entries());
  }, [plan.scenes]);

  const stageTitle = source === "youtubeMusic" && youtubeMusic.snapshot
    ? youtubeMusic.snapshot.track.title
    : requestedDemoTitle || lyricsLabel;
  const stageSubtitle = source === "youtubeMusic" && youtubeMusic.snapshot
    ? youtubeMusic.snapshot.track.artist || "YouTube Music"
    : "LOCAL REHEARSAL";
  const stageArtworkURL = source === "youtubeMusic"
    ? youtubeMusic.snapshot?.track.artworkURL
    : requestedDemoArtwork || undefined;
  const stageControls = source === "youtubeMusic"
    ? youtubeMusic.snapshot?.controls
    : localStageControls;
  const stagePlaybackState = source === "youtubeMusic"
    ? youtubeMusic.snapshot?.playback.state
    : playing ? "playing" as const : "paused" as const;
  const disconnected = everConnectedRef.current && !youtubeMusic.connected;
  const columnTimeMs = stageReady
    ? displayTimeMs
    : youtubeMusic.snapshot?.playback.currentTimeMs ?? displayTimeMs;
  const columnTitle = youtubeMusic.snapshot?.track.title || lastTrackRef.current.title || "LyricStage";
  const columnArtist = youtubeMusic.snapshot?.track.artist || lastTrackRef.current.artist || "YouTube Music";
  const activeRollingCard = rollingDirectorState.cards.find((card) =>
    stageLyricTimeMs >= card.fromMs && stageLyricTimeMs < card.toMs);
  const columnDirectorSource = rollingDirectorRoute.renderRolling
    && rollingDirectorState.cards.some((card) => card.directives !== undefined)
    && activeRollingCard?.directives === undefined
    ? "continuity" as const
    : displayedRemoteDirectorPlan?.source === "cache"
    ? "cache" as const
    : displayedRemoteDirectorPlan?.source === "ai"
      ? "ai" as const
      : "local" as const;
  const columnHasQueuedDirectorPlan = !rollingDirectorRoute.renderRolling
    && Boolean(remoteDirectorPlan)
    && !displayedRemoteDirectorPlan;
  const fullscreenSurface = embeddedFullscreenSurface(presentation, hasMatchingLyrics);
  const devColumnPreview = import.meta.env.DEV && embeddedStage && Boolean(fixtureParameter);
  const fullscreenTransitionStatus = automaticLyrics.status === "candidates"
    ? "等待选择歌词版本"
    : automaticLyrics.status === "miss"
      ? "暂未找到同步歌词"
      : automaticLyrics.status === "error"
        ? "歌词匹配暂时失败"
        : "正在匹配歌词";

  if (embeddedStage) {
    return (
      <div className="column-app" data-presentation={presentation} data-dev-preview={devColumnPreview || undefined}>
        {presentation === "column" && ColumnStageView && (
          <Suspense fallback={<div className="column-stage" aria-busy="true" />}>
            <ColumnStageView
            bridgeAvailable={devColumnPreview || youtubeMusic.available}
            bridgeConnected={devColumnPreview || youtubeMusic.connected}
            hasSnapshot={devColumnPreview || Boolean(youtubeMusic.snapshot)}
            disconnected={devColumnPreview ? false : disconnected}
            title={columnTitle}
            artist={columnArtist}
            directorStatus={directorStatusLabel(directorLookupState, columnDirectorSource, columnHasQueuedDirectorPlan)}
            directorStatusReason={directorStatusDetail(directorLookupState)}
            automaticStatus={devColumnPreview ? "matched" : automaticLyrics.status}
            message={message}
            interactionNotice={interaction.notice}
            candidates={automaticLyrics.candidates}
            selectedCandidateKey={automaticLyrics.selectedCandidateKey}
            hasMatchingLyrics={devColumnPreview || hasMatchingLyrics}
            lyrics={lyrics}
            timeMs={devColumnPreview ? demoTimeMs : columnTimeMs}
            durationMs={durationMs}
            playbackState={youtubeMusic.snapshot?.playback.state}
            canEnterFullscreen={canEnterEmbeddedFullscreen(devColumnPreview || hasMatchingLyrics)}
            lightweight={lightweight}
            lyricsOffsetMs={effectiveLyricsOffsetMs}
            onSetLyricsOffset={setCurrentLyricsOffset}
            onAlignCurrentLine={alignCurrentLyricsLine}
            onSeekLine={(timeMs) => { void seekStage(timeMs); }}
            onReconnect={() => {
              interaction.show(youtubeMusic.retryConnection() ? "正在重新连接 YouTube Music…" : "连接已在恢复中。" );
            }}
            onReloadSource={() => window.location.reload()}
            onEnterFullscreen={() => void enterFullscreen()}
            onChooseCandidate={chooseLyricsCandidate}
            onShowVersions={() => setShowVersionPicker((value) => !value)}
            showVersionPicker={showVersionPicker}
            manualSearchPending={manualSearchPending}
            onManualSearch={(title, artist) => void searchLyricsManually(title, artist)}
            />
          </Suspense>
        )}
        <section
          ref={stageShellRef}
          className="fullscreen-runtime"
          data-fullscreen={isFullscreen || undefined}
          data-surface={fullscreenSurface}
          hidden={presentation !== "fullscreen"}
          aria-hidden={presentation !== "fullscreen"}
        >
          {fullscreenSurface === "transition" ? (
            <FullscreenTrackTransition
              active
              artworkURL={stageArtworkURL}
              title={columnTitle}
              artist={columnArtist}
              status={fullscreenTransitionStatus}
              timeMs={displayTimeMs}
              durationMs={durationMs}
            />
          ) : null}
          {fullscreenSurface === "stage" ? (
            <div className="fullscreen-stage-layer" key={lyrics.recordingID}>
              <Suspense fallback={stageCanvasFallback}>
                <StageCanvas
                  lyrics={lyrics}
                  localDirectorPlan={localDirectorPlan}
                  remoteDirectorPlan={displayedRemoteDirectorPlan}
                  directorLookupState={directorLookupState}
                  directorMode={rollingDirectorRoute.renderRolling ? "rolling" : "legacy"}
                  bibleSource={rollingDirectorState.bibleSource}
                  rollingCards={rollingDirectorRoute.renderRolling ? rollingDirectorState.cards : []}
                  reactiveBus={youtubeMusic.reactiveBus}
                  reactiveStatus={youtubeMusic.musicMapStatus}
                  reactiveFailure={youtubeMusic.musicMapError}
                  clock={youtubeMusic.clock}
                  continuous={selectedPlaying || benchmarkStage}
                  displayTimeMs={displayTimeMs}
                  lyricsOffsetMs={effectiveLyricsOffsetMs}
                  reduceMotion={reduceMotion || lightweight}
                  lightweight={lightweight}
                  vjMode={vjMode}
                  showGuides={false}
                  onMetrics={handleMetrics}
                  title={stageTitle}
                  artist={stageSubtitle}
                  artworkURL={stageArtworkURL}
                  durationMs={durationMs}
                  playbackState={stagePlaybackState}
                  playbackDetails={youtubeMusic.snapshot?.playback} controls={stageControls}
                  engagement={youtubeMusic.snapshot?.engagement}
                  queue={youtubeMusic.snapshot?.queue}
                  onSeek={seekStage}
                  onTransport={controlStageTransport}
                  onLike={setStageLiked}
                  onQueueSelect={selectStageQueueItem}
                  onPlaybackMode={setStagePlaybackMode}
                />
              </Suspense>
            </div>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {fullscreenSurface === "stage" ? activeLineText : ""}
          </p>
          {interaction.notice ? (
            <p className="fullscreen-interaction-notice" role="status">{interaction.notice}</p>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell" data-benchmark={benchmarkStage || undefined}>
      <header className="masthead">
        <div>
          <p className="eyebrow">PHASE 06 / YOUTUBE MUSIC COMPANION</p>
          <h1>LYRICSTAGE</h1>
        </div>
        <div className="masthead-note">
          <span>FULLSCREEN PERFORMANCE</span>
          <span>YOUTUBE MUSIC · LOCAL FALLBACK</span>
        </div>
      </header>

      <main className="workspace">
        <aside className="control-deck" aria-label="排练控制台">
          <section className="control-section intro-copy">
            <span className="section-index">00</span>
            <h2>音乐留在原处，歌词占满屏幕</h2>
            <p>YouTube Music 负责声音与播放时间；LyricStage 只接收当前曲目和时钟，普通文字落稳后保持静止。</p>
          </section>

          <section className="control-section">
            <span className="section-index">01 / SOURCE</span>
            <div className="source-switch" role="group" aria-label="音乐来源">
              <button
                type="button"
                aria-pressed={source === "youtubeMusic"}
                onClick={() => selectSource("youtubeMusic")}
              >
                YouTube Music
              </button>
              <button
                type="button"
                aria-pressed={source === "local"}
                onClick={() => selectSource("local")}
              >
                本地音频
              </button>
            </div>

            {source === "youtubeMusic" ? (
              <>
                <div className="companion-card" data-connected={youtubeMusic.connected || undefined}>
                  <div className="connection-line">
                    <b aria-hidden="true" />
                    <span>{youtubeMusic.connected ? "伴生连接正常" : "等待 YouTube Music"}</span>
                  </div>
                  <strong>{youtubeMusic.snapshot?.track.title ?? "请在 YouTube Music 播放一首歌曲"}</strong>
                  <small>{youtubeMusic.snapshot?.track.artist || (youtubeMusic.available ? "舞台会自动接入" : "请从已安装的扩展打开舞台")}</small>
                </div>
                <div className="automatic-lyrics-card" data-status={automaticLyrics.status}>
                  <div>
                    <span>AUTO LYRICS</span>
                    <strong>{
                      automaticLyrics.status === "searching" ? "搜索中"
                        : automaticLyrics.status === "matched" ? "已匹配"
                          : automaticLyrics.status === "candidates" ? "需要确认"
                            : automaticLyrics.status === "miss" ? "未找到"
                              : automaticLyrics.status === "error" ? "搜索失败"
                                : automaticLyrics.status === "manual" ? "手动歌词"
                                  : "等待歌曲"
                    }</strong>
                  </div>
                  {automaticLyrics.status === "candidates" && (
                    <div className="lyrics-candidate-list">
                      {automaticLyrics.candidates.map((candidate) => (
                        <button
                          type="button"
                          key={`${candidate.provider}:${candidate.id}`}
                          onClick={() => chooseLyricsCandidate(candidate)}
                        >
                          <span>{candidate.title}</span>
                          <small>{lyricsProviderLabel(candidate.provider)} · {candidate.artist || "未知歌手"} · {formatTime(candidate.durationMs)}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <label className="file-action">
                  <span>导入音频</span>
                  <strong>MP3 · M4A · WAV</strong>
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav"
                    onChange={(event) => onAudioFile(event.target.files?.[0])}
                  />
                </label>
                <p className="source-name">{audioLabel}</p>
              </>
            )}

            <label className="file-action secondary" data-disabled={!expectedRecordingID || undefined}>
              <span>导入匹配歌词</span>
              <strong>LRC · LYRIC JSON</strong>
              <input
                type="file"
                disabled={!expectedRecordingID}
                accept=".lrc,.json,text/plain,application/json"
                onChange={(event) => void onLyricFile(event.target.files?.[0])}
              />
            </label>
            <p className="source-name">{lyricsLabel}</p>
          </section>

          <section className="control-section transport-section">
            <span className="section-index">02 / CLOCK</span>
            <div className="transport-row">
              <button className="transport-button" type="button" onClick={() => void togglePlayback()}>
                {source === "youtubeMusic" ? "回到 YTM" : playing ? "暂停" : "播放"}
              </button>
              <button className="plain-button" type="button" onClick={resetDemo}>
                样片
              </button>
            </div>
            <input
              className="timeline"
              type="range"
              min="0"
              max={Math.max(1, durationMs)}
              value={Math.min(stageDisplayTimeMs, durationMs)}
              disabled={source === "youtubeMusic" || !stageReady}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="播放时间"
            />
            <div className="time-row">
              <span>{formatTime(stageDisplayTimeMs)}</span>
              <span>{formatTime(durationMs)}</span>
            </div>
          </section>

          <section className="control-section option-grid">
            <label>
              <input
                type="checkbox"
                checked={reduceMotion}
                onChange={(event) => setReduceMotion(event.target.checked)}
              />
              <span>减少动态</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={showGuides}
                onChange={(event) => setShowGuides(event.target.checked)}
              />
              <span>安全区</span>
            </label>
          </section>

          <section className="control-section status-block" aria-live="polite">
            <span className="section-index">STATUS</span>
            <p>{message}</p>
            <dl>
              <div><dt>场景</dt><dd>{plan.scenes.length}</dd></div>
              <div><dt>采样</dt><dd>{metrics.count}</dd></div>
              <div><dt>P95</dt><dd>{metrics.p95.toFixed(2)}ms</dd></div>
            </dl>
          </section>
        </aside>

        <section ref={stageShellRef} className="stage-shell" data-fullscreen={isFullscreen || undefined}>
          <Suspense fallback={stageCanvasFallback}>
            <StageCanvas
              lyrics={lyrics}
              localDirectorPlan={localDirectorPlan}
              remoteDirectorPlan={displayedRemoteDirectorPlan}
              directorLookupState={directorLookupState}
              directorMode={rollingDirectorRoute.renderRolling ? "rolling" : "legacy"}
              bibleSource={rollingDirectorState.bibleSource}
              rollingCards={rollingDirectorRoute.renderRolling ? rollingDirectorState.cards : []}
              reactiveBus={youtubeMusic.reactiveBus}
              reactiveStatus={youtubeMusic.musicMapStatus}
              reactiveFailure={youtubeMusic.musicMapError}
              clock={selectedClock}
              continuous={selectedPlaying || benchmarkStage}
              displayTimeMs={stageDisplayTimeMs}
              lyricsOffsetMs={effectiveLyricsOffsetMs}
              reduceMotion={reduceMotion}
              lightweight={lightweight}
              vjMode={vjMode}
              showGuides={showGuides}
              onMetrics={handleMetrics}
              title={stageTitle}
              artist={stageSubtitle}
              artworkURL={stageArtworkURL}
              durationMs={durationMs}
              playbackState={stagePlaybackState}
              playbackDetails={youtubeMusic.snapshot?.playback} controls={stageControls}
              engagement={youtubeMusic.snapshot?.engagement}
              queue={youtubeMusic.snapshot?.queue}
              onSeek={seekStage}
              onTransport={controlStageTransport}
              onLike={setStageLiked}
              onQueueSelect={selectStageQueueItem}
              onPlaybackMode={setStagePlaybackMode}
            />
          </Suspense>
          <div className="stage-header">
            <div>
              <span>{stageSubtitle}</span>
              <strong>{stageTitle}</strong>
            </div>
            <button type="button" className="fullscreen-button" onClick={() => void enterFullscreen()}>
              全屏舞台 ↗
            </button>
          </div>
          <div className="stage-footer">
            <div className="family-list" aria-label="场景分布">
              {familyCounts.map(([family, count]) => (
                <span key={family}>{family} × {count}</span>
              ))}
            </div>
            <span>{formatTime(stageDisplayTimeMs)}</span>
          </div>
          <p className="sr-only" aria-live="polite">{activeLineText}</p>
        </section>
      </main>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = Math.max(1, event.currentTarget.duration * 1000);
          setDurationMs(nextDuration);
          setDisplayTimeMs(0);
        }}
        onPlay={() => {
          setPlaying(true);
          setMessage("播放时钟已由本地音频接管。");
        }}
        onPause={(event) => {
          setPlaying(false);
          setDisplayTimeMs(event.currentTarget.currentTime * 1000);
        }}
        onTimeUpdate={(event) => setDisplayTimeMs(event.currentTarget.currentTime * 1000)}
        onSeeked={(event) => setDisplayTimeMs(event.currentTarget.currentTime * 1000)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
