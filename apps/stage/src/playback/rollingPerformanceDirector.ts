import { stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import {
  advanceRollingPerformanceStateV1,
  applyMusicMapToDirectorPlanV1,
  checkpointRollingPerformanceStateV1,
  compileDirectorPlanFromRollingV1,
  initialRollingPerformanceStateV1,
  sanitizeSceneCardV1,
  type DirectorBibleV1,
  type DirectorPlanHandoffV1,
  type DirectorPlanV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
  type MusicMapV1,
} from "@lyricstage/performance";

export type RollingDirectorRuntimeStatusV1 =
  | "local"
  | "bible-requesting"
  | "coverage-requesting"
  | "ready"
  | "degraded";

export interface RollingDirectorWindowV1 {
  fromMs: number;
  toMs: number;
  fromLineIndex: number;
  toLineIndex: number;
  identity: string;
}

export interface RollingDirectorRuntimeStateV1 {
  generation: number;
  recordingID: string;
  lyricsIdentity: string;
  status: RollingDirectorRuntimeStatusV1;
  bible?: DirectorBibleV1;
  bibleSource?: "cache" | "network" | "local";
  cards: SceneCardV1[];
  coverageFromMs: number;
  coverageToMs: number;
  pendingWindow?: RollingDirectorWindowV1;
  consecutiveFailures: number;
  compiledPlan: DirectorPlanV1;
}

export interface RollingCoverageResultV1 {
  status: "ready" | "unavailable" | "error" | "stale";
  source: "cache" | "network" | "local";
  cards: SceneCardV1[];
  reason?: string;
}

export const createRollingDirectorRuntimeStateV1 = (
  localPlan: DirectorPlanV1,
  generation: number,
): RollingDirectorRuntimeStateV1 => ({
  generation,
  recordingID: localPlan.recordingID,
  lyricsIdentity: localPlan.lyricsIdentity,
  status: "local",
  cards: [],
  coverageFromMs: 0,
  coverageToMs: 0,
  consecutiveFailures: 0,
  compiledPlan: localPlan,
});

const acceptedCardsAndState = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  candidates: readonly SceneCardV1[],
): { cards: SceneCardV1[]; state: RollingPerformanceStateV1 } => {
  const cards: SceneCardV1[] = [];
  let state = initialRollingPerformanceStateV1(bible);
  for (const candidate of [...candidates].sort((a, b) => a.fromLineIndex - b.fromLineIndex || a.sceneIndex - b.sceneIndex)) {
    if (cards.some((card) => card.sceneID === candidate.sceneID)) continue;
    let valid = sanitizeSceneCardV1(lyrics, bible, state, candidate);
    if (!valid && (state.lastToLineIndex === null || candidate.fromLineIndex > state.lastToLineIndex + 1)) {
      const checkpoint = checkpointRollingPerformanceStateV1(lyrics, bible, candidate.fromLineIndex);
      if (checkpoint?.stateHash === candidate.entryStateHash) {
        valid = sanitizeSceneCardV1(lyrics, bible, checkpoint, candidate);
        if (valid) state = checkpoint;
      }
    }
    if (!valid) continue;
    cards.push(valid);
    state = advanceRollingPerformanceStateV1(state, valid);
  }
  return { cards, state };
};

export const rollingRequestStateV1 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  cards: readonly SceneCardV1[],
  targetLineIndex: number,
): RollingPerformanceStateV1 => {
  const accepted = acceptedCardsAndState(lyrics, bible, cards);
  if (accepted.state.lastToLineIndex === null || targetLineIndex > accepted.state.lastToLineIndex + 1) {
    return checkpointRollingPerformanceStateV1(lyrics, bible, targetLineIndex) ?? accepted.state;
  }
  return accepted.state;
};

export const normalizeRollingCoverageV1 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  candidates: readonly SceneCardV1[],
): SceneCardV1[] => acceptedCardsAndState(lyrics, bible, candidates).cards;

export const rollingCoverageAtV1 = (cards: readonly SceneCardV1[], timeMs: number) => {
  const ordered = [...cards].sort((a, b) => a.fromLineIndex - b.fromLineIndex);
  const containing = ordered.find((card) => timeMs >= card.fromMs && timeMs < card.toMs);
  if (!containing) return { fromMs: timeMs, toMs: timeMs, aheadMs: 0 };
  let toMs = containing.toMs;
  let toLineIndex = containing.toLineIndex;
  for (const card of ordered) {
    if (card.fromLineIndex <= containing.fromLineIndex) continue;
    if (card.fromLineIndex !== toLineIndex + 1) break;
    toLineIndex = card.toLineIndex;
    toMs = card.toMs;
  }
  return { fromMs: containing.fromMs, toMs, aheadMs: Math.max(0, toMs - timeMs) };
};

export const rollingHasRemainingDirectionV1 = (
  cards: readonly SceneCardV1[],
  timeMs: number,
): boolean => cards.some((card) => card.toMs > timeMs);

export interface RollingClockObservationV1 {
  lyricTimeMs: number;
  observedAtMs: number;
  playing: boolean;
}

export const detectRollingSeekTargetV1 = (
  previous: RollingClockObservationV1 | undefined,
  current: RollingClockObservationV1,
): number | undefined => {
  if (!previous) return undefined;
  const wallDelta = Math.max(0, current.observedAtMs - previous.observedAtMs);
  const expected = previous.playing ? wallDelta : 0;
  const mediaDelta = current.lyricTimeMs - previous.lyricTimeMs;
  return mediaDelta < -500 || mediaDelta > expected + 2_000 ? current.lyricTimeMs : undefined;
};

export const selectRollingRequestedWindowV1 = (
  lyrics: LyricDocumentV0,
  targetMs: number,
  horizonMs = 60_000,
): RollingDirectorWindowV1 | null => {
  if (lyrics.lines.length === 0) return null;
  const bounded = Math.max(0, Math.min(lyrics.durationMs, targetMs));
  const first = lyrics.lines.find((line) => line.toMs > bounded) ?? lyrics.lines.at(-1)!;
  const targetEnd = Math.min(lyrics.durationMs, bounded + Math.max(1, Math.min(75_000, horizonMs)));
  let last = first;
  for (const line of lyrics.lines) {
    if (line.lineIndex < first.lineIndex) continue;
    last = line;
    if (line.toMs >= targetEnd || line.toMs - first.fromMs >= 75_000) break;
  }
  const value = {
    fromMs: first.fromMs,
    toMs: Math.max(first.toMs, last.toMs),
    fromLineIndex: first.lineIndex,
    toLineIndex: last.lineIndex,
  };
  return { ...value, identity: `rolling-window:${stableHash32(value)}` };
};

export const shouldRefillRollingCoverageV1 = (
  state: RollingDirectorRuntimeStateV1,
  timeMs: number,
  durationMs: number,
  paused: boolean,
  seekTargetMs?: number,
): boolean => {
  if (!state.bible || state.status === "bible-requesting" || state.status === "coverage-requesting") return false;
  if (state.consecutiveFailures >= 3) return false;
  const target = seekTargetMs ?? timeMs;
  const coverage = rollingCoverageAtV1(state.cards, target);
  if (paused && seekTargetMs === undefined) return false;
  if (durationMs - target <= 20_000 && seekTargetMs === undefined) return false;
  return coverage.aheadMs < 35_000;
};

export const rollingRefillTargetV1 = (
  state: RollingDirectorRuntimeStateV1,
  timeMs: number,
  durationMs: number,
  seekTargetMs?: number,
): number => {
  const bounded = (value: number) => Math.max(0, Math.min(durationMs, value));
  if (seekTargetMs !== undefined) return bounded(seekTargetMs);
  const coverage = rollingCoverageAtV1(state.cards, timeMs);
  // Normal horizon expansion starts where accepted coverage ends. Starting at
  // the playhead would overlap the active card, produce an incompatible entry
  // checkpoint, and spend the rolling request budget without extending it.
  return coverage.aheadMs > 0 ? bounded(coverage.toMs) : bounded(timeMs);
};

export const reduceRollingCoverageResultV1 = (
  lyrics: LyricDocumentV0,
  state: RollingDirectorRuntimeStateV1,
  result: RollingCoverageResultV1,
  currentLyricMs: number,
  generation: number,
): RollingDirectorRuntimeStateV1 => {
  if (generation !== state.generation || !state.bible || result.status === "stale") return state;
  if (result.status !== "ready") return {
    ...state,
    status: "degraded",
    pendingWindow: undefined,
    consecutiveFailures: state.consecutiveFailures + 1,
  };
  const immutable = state.cards.filter((card) => card.toMs <= currentLyricMs);
  const allowEntrySnapshot = state.cards.length === 0;
  const existingIDs = new Set(state.cards.map((card) => card.sceneID));
  const incoming = result.cards.filter((card) => existingIDs.has(card.sceneID)
    || (card.toMs > currentLyricMs && (
      allowEntrySnapshot
      || card.fromMs > currentLyricMs + 80
      // A refill can finish after its first lyric line has started. Keep the
      // still-live card so the complete compiled plan can become authoritative
      // immediately; dropping it here would request the same gap forever.
      || card.fromMs <= currentLyricMs
    )));
  const normalized = normalizeRollingCoverageV1(lyrics, state.bible, [...state.cards, ...incoming]);
  if (immutable.some((old) => !normalized.some((card) => card.sceneID === old.sceneID))) return {
    ...state, status: "degraded", pendingWindow: undefined, consecutiveFailures: state.consecutiveFailures + 1,
  };
  const coverage = rollingCoverageAtV1(normalized, currentLyricMs);
  const compiledSource = result.source === "cache"
    ? "cache" as const
    : result.source === "local" && state.bibleSource === "local"
      ? "local" as const
      : "ai" as const;
  const compiledPlan = compileDirectorPlanFromRollingV1(lyrics, state.bible, normalized, compiledSource);
  return {
    ...state,
    status: normalized.length > 0 ? "ready" : "degraded",
    cards: normalized,
    coverageFromMs: coverage.fromMs,
    coverageToMs: coverage.toMs,
    pendingWindow: undefined,
    consecutiveFailures: normalized.length > 0 ? 0 : state.consecutiveFailures + 1,
    compiledPlan,
  };
};

export const handleRollingSeekV1 = (
  state: RollingDirectorRuntimeStateV1,
  localPlan: DirectorPlanV1,
  targetMs: number,
): { state: RollingDirectorRuntimeStateV1; useLocalImmediately: boolean } => {
  const covered = rollingCoverageAtV1(state.cards, targetMs).aheadMs > 0;
  const current = state.status === "coverage-requesting"
    ? { ...state, status: "ready" as const, pendingWindow: undefined }
    : state;
  return covered
    ? { state: current, useLocalImmediately: false }
    : { state: { ...current, compiledPlan: localPlan, coverageFromMs: targetMs, coverageToMs: targetMs }, useLocalImmediately: true };
};

export const rollingDirectorStatusCopyV1 = (state: RollingDirectorRuntimeStateV1): string => {
  if (state.status === "bible-requesting") return "正在准备滚动导演圣经";
  if (state.status === "coverage-requesting") return "正在补充下一幕";
  if (state.status === "ready") return `滚动导演 · ${state.cards.length} 幕`;
  if (state.status === "degraded") return "滚动导演已降级为本地演出";
  return "本地导演已就绪";
};

export const rollingPlanNeedsPreparedRebuildV1 = (
  previousPlanIdentity: string | undefined,
  nextPlanIdentity: string,
): boolean => previousPlanIdentity !== nextPlanIdentity;

export const rollingPreparedRendererIdentityV1 = (
  recordingID: string,
  planIdentity: string,
): string => `${recordingID}:${planIdentity}`;

export const applyMusicMapToRollingDirectorPlanV1 = (
  plan: DirectorPlanV1,
  musicMap: MusicMapV1 | undefined,
  cards: readonly SceneCardV1[],
): DirectorPlanV1 => {
  const adapted = applyMusicMapToDirectorPlanV1(plan, musicMap);
  if (adapted === plan) return plan;
  const acceptedSections = new Map(cards.map((card) => [`rolling:${card.sceneID}`, plan.sections.find((section) => section.id === `rolling:${card.sceneID}`)]));
  const sections = adapted.sections.map((section) => acceptedSections.get(section.id) ?? section);
  const value = { ...adapted, sections, planIdentity: undefined };
  return { ...adapted, sections, planIdentity: stableHash32(value) };
};

const elapsedPlanFingerprint = (lyrics: LyricDocumentV0, plan: DirectorPlanV1, timeMs: number): string => {
  const elapsedLines = new Set(lyrics.lines.filter((line) => line.toMs <= timeMs).map((line) => line.lineIndex));
  return stableHash32({
    sections: plan.sections.filter((section) => section.toMs <= timeMs),
    directives: plan.directives.filter((directive) => elapsedLines.has(directive.lineIndex)),
    effects: plan.effects.filter((effect) => effect.toMs <= timeMs),
    gestures: plan.gestures.filter((gesture) => elapsedLines.has(gesture.lineIndex)),
    moments: plan.dramaticScore.signatureMoments.filter((moment) => moment.anchorLineIndices.every((line) => elapsedLines.has(line))),
  });
};

export const queueRollingDirectorPlanV1 = (
  lyrics: LyricDocumentV0,
  state: DirectorPlanHandoffV1,
  next: DirectorPlanV1,
  currentLyricMs: number,
): DirectorPlanHandoffV1 => {
  if (
    next.recordingID !== state.active.recordingID
    || next.lyricsIdentity !== state.active.lyricsIdentity
    || next.planIdentity === state.active.planIdentity
  ) return state;
  const elapsedCompatible = elapsedPlanFingerprint(lyrics, state.active, currentLyricMs)
    === elapsedPlanFingerprint(lyrics, next, currentLyricMs);
  const recoversLocalGap = state.active.source === "local" && next.sections.some((section) =>
    section.id.startsWith("rolling:") && section.toMs > currentLyricMs);
  // Rolling plans already contain their local safety sections. Once current or
  // future direction exists, adopting the compiled plan immediately does not
  // play a future Scene early; it only makes that future Scene authoritative.
  return elapsedCompatible || recoversLocalGap ? { active: next } : state;
};
