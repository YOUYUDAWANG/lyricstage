import { stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import { sanitizeDirectorBibleV1, type DirectorBibleV1, type SceneCardV1 } from "./rollingDirector";
import { signatureChoreographyClipIDsV2, type SignatureChoreographyClipIDV2 } from "./signatureChoreographyV2";

export type DirectorDiversityWarningV1 =
  | "minimum-budget"
  | "single-scale"
  | "static-without-evidence"
  | "repeated-tuple"
  | "coverage-gap"
  | "local-repair-heavy"
  | "scene-density-low"
  | "line-direction-low"
  | "signature-choreography-low";

export interface DirectorSceneReviewBeatV2 {
  fromMs: number;
  toMs: number;
  purpose: "establish" | "develop" | "turn" | "aftermath" | "resolve" | "local";
  presentation: string;
  lineActionCount: number;
  gestureCount: number;
  effectCount: number;
  signatureClip?: SignatureChoreographyClipIDV2;
  consequence: string;
}

export type DirectorLocalRepairCategoryV1 = "bible" | "blocking" | "gestures" | "effects" | "dramatic-score";

export interface DirectorCacheSummaryV1 {
  version: "director-cache-summary-v1";
  trackTitle: string;
  trackArtist: string;
  trackIDDisplay: string;
  durationMs: number;
  lineCount: number;
  cacheVersion: "rolling-v1";
  compilerVersion: "scene-pack-v1" | "window-intent-v2" | "scene-pack-v2";
  semanticDirectiveCount: number;
  cacheEpoch: string;
  source: "cache" | "network" | "local";
  createdAtUnixMs: number;
  expiresAtUnixMs: number;
  bibleIdentityPrefix: string;
  biblePresent: boolean;
  sceneCardCount: number;
  coveragePercent: number;
  missingRanges: Array<{ fromMs: number; toMs: number }>;
  baseLayout: string;
  layoutTransitionCount: number;
  continuityJustificationAccepted: boolean;
  motifFamily: string;
  actCount: number;
  signatureMomentCount: number;
  signatureChoreographyCount?: number;
  sceneTimeline?: DirectorSceneReviewBeatV2[];
  gestureCounts: { glyph: number; token: number; phrase: number; total: number };
  effectCount: number;
  effectPrimitiveCounts: Record<string, number>;
  artDirections: string[];
  world: { spatialMode: string; artworkRole: string; motionLaw: string };
  quietSharePercent: number;
  localRepairFlags: DirectorLocalRepairCategoryV1[];
  reachedFinalWindow: boolean;
  timing?: { cache: "hit" | "miss" | "disabled"; totalMs: number; providerMs: number; attempts: number; outcome?: string };
  warnings: DirectorDiversityWarningV1[];
}

export interface DirectorCacheSummaryInputV1 {
  lyrics: LyricDocumentV0;
  track: { trackID: string; title: string; artist: string };
  cacheEpoch: string;
  source: "cache" | "network" | "local";
  createdAtUnixMs: number;
  expiresAtUnixMs: number;
  bible: DirectorBibleV1;
  cards: readonly SceneCardV1[];
  localRepairFlags?: readonly DirectorLocalRepairCategoryV1[];
  reachedFinalWindow?: boolean;
  timing?: unknown;
}

const clean = (value: unknown, max: number): string => typeof value === "string" ? value.trim().slice(0, max) : "";
const boundedNumber = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
const repairCategories = new Set<DirectorLocalRepairCategoryV1>(["bible", "blocking", "gestures", "effects", "dramatic-score"]);
const summaryLayouts = new Set(["monument", "editorialSplit", "railLeading", "railTrailing", "duetDivide"]);
const summaryMotifs = new Set(["thread", "window", "silhouette", "horizon", "fold", "firework", "fish", "petal", "snow"]);
const summarySpatialModes = new Set(["anchored", "panoramic", "cinematic", "orbital", "splitStage", "chorusWall"]);
const summaryArtworkRoles = new Set(["anchor", "portal", "memory", "counterpoint", "atmosphere"]);
const summaryMotionLaws = new Set(["drift", "flow", "pulse", "fall", "orbit", "converge", "suspend", "fracture"]);
const summaryArtDirections = new Set(["editorialKinetic", "neonRail", "paperCut", "liquidMemory", "monoImpact", "celestialGrid"]);
const summaryEffectCategories = new Set(["field", "geometry", "memory", "density", "motif", "cover", "transition"]);
const summaryOutcomes = new Set(["ready", "http-error", "parse-error", "contract-degraded", "timeout", "network-error"]);
const summaryCacheEpochs = new Set([
  "rolling-director-generation-v1.1",
  "rolling-director-generation-v1.2-window-intent-v2",
  "rolling-director-generation-v1.3-window-intent-v2",
  "rolling-director-generation-v1.4-window-intent-density-v2",
  "rolling-director-generation-v1.5-narrative-density-v2",
  "rolling-director-generation-v1.6-local-repair-provenance-v2",
  "rolling-director-generation-v1.7-window-recovery-v2",
  "rolling-director-generation-v1.8-spatial-support-v2",
  "rolling-director-generation-v1.9-scene-pack-v2",
]);
const warningOrder: readonly DirectorDiversityWarningV1[] = [
  "minimum-budget", "scene-density-low", "line-direction-low", "signature-choreography-low", "single-scale",
  "static-without-evidence", "repeated-tuple", "coverage-gap", "local-repair-heavy",
];
const signatureClipIDs = new Set<string>(signatureChoreographyClipIDsV2);
const scenePurposes = new Set<DirectorSceneReviewBeatV2["purpose"]>(["establish", "develop", "turn", "aftermath", "resolve", "local"]);

const mergedCoverage = (durationMs: number, cards: readonly SceneCardV1[]) => {
  const ranges = cards.map((card) => ({ fromMs: Math.max(0, card.fromMs), toMs: Math.min(durationMs, card.toMs) }))
    .filter((range) => range.fromMs < range.toMs).sort((a, b) => a.fromMs - b.fromMs);
  const merged: Array<{ fromMs: number; toMs: number }> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.fromMs <= last.toMs) last.toMs = Math.max(last.toMs, range.toMs);
    else merged.push({ ...range });
  }
  const missing: Array<{ fromMs: number; toMs: number }> = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.fromMs > cursor) missing.push({ fromMs: cursor, toMs: range.fromMs });
    cursor = Math.max(cursor, range.toMs);
  }
  if (cursor < durationMs) missing.push({ fromMs: cursor, toMs: durationMs });
  const coveredMs = merged.reduce((total, range) => total + range.toMs - range.fromMs, 0);
  return { missing: missing.slice(0, 24), percent: durationMs > 0 ? Math.round(coveredMs / durationMs * 10_000) / 100 : 0 };
};

const timingSummary = (value: unknown): DirectorCacheSummaryV1["timing"] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const timing = value as Record<string, unknown>;
  if (!["hit", "miss", "disabled"].includes(String(timing.cache))) return undefined;
  const attempts = Array.isArray(timing.attempts) ? timing.attempts : [];
  const last = attempts.at(-1) as Record<string, unknown> | undefined;
  return {
    cache: timing.cache as "hit" | "miss" | "disabled",
    totalMs: Math.round(boundedNumber(timing.totalMs, 0, 90_000) ?? 0),
    providerMs: Math.round(boundedNumber(timing.providerMs, 0, 90_000) ?? 0),
    attempts: Math.min(6, attempts.length),
    ...(last && typeof last.outcome === "string" ? { outcome: clean(last.outcome, 40) } : {}),
  };
};

const warningsFor = (summary: DirectorCacheSummaryV1): DirectorDiversityWarningV1[] => {
  const normal = summary.durationMs >= 150_000 && summary.lineCount >= 24;
  const scopes = [summary.gestureCounts.glyph, summary.gestureCounts.token, summary.gestureCounts.phrase].filter((count) => count > 0).length;
  return warningOrder.filter((warning) => {
    if (warning === "minimum-budget") return normal && (summary.signatureMomentCount <= 2 || summary.gestureCounts.total <= 1 || summary.effectCount <= 1);
    if (warning === "scene-density-low") return normal && summary.reachedFinalWindow && summary.sceneCardCount < 12;
    if (warning === "line-direction-low") return normal && summary.reachedFinalWindow && summary.semanticDirectiveCount < summary.lineCount * 0.75;
    if (warning === "signature-choreography-low") return normal && summary.reachedFinalWindow && (summary.signatureChoreographyCount ?? 0) < 6;
    if (warning === "single-scale") return summary.signatureMomentCount > 0 && scopes < 2;
    if (warning === "static-without-evidence") return summary.layoutTransitionCount === 0 && !summary.continuityJustificationAccepted;
    if (warning === "coverage-gap") return summary.reachedFinalWindow && summary.coveragePercent < 80;
    if (warning === "local-repair-heavy") return summary.localRepairFlags.length >= 2;
    return false;
  });
};

export const summarizeDirectorCacheEntryV1 = (input: DirectorCacheSummaryInputV1): DirectorCacheSummaryV1 | null => {
  const bible = sanitizeDirectorBibleV1(input.lyrics, input.bible);
  if (!bible || !clean(input.track.trackID, 256) || !Number.isFinite(input.createdAtUnixMs)
    || !Number.isFinite(input.expiresAtUnixMs) || input.expiresAtUnixMs <= input.createdAtUnixMs) return null;
  const cards = input.cards.filter((card) => card.recordingID === input.lyrics.recordingID
    && card.lyricsIdentity === bible.lyricsIdentity && card.bibleIdentity === bible.bibleIdentity);
  if (cards.length !== input.cards.length) return null;
  const coverage = mergedCoverage(input.lyrics.durationMs, cards);
  const gestures = cards.flatMap((card) => card.gestures);
  const effects = cards.flatMap((card) => card.effects);
  const semanticDirectiveCount = cards.reduce((total, card) => total + (card.directives?.length ?? 0), 0);
  const sceneTimeline: DirectorSceneReviewBeatV2[] = cards.slice(0, 40).map((card) => {
    const purpose = card.intention.match(/^(establish|develop|turn|aftermath|resolve):/u)?.[1] as DirectorSceneReviewBeatV2["purpose"] | undefined;
    const signatureClip = card.effects.map((effect) => effect.id.match(/^signature-clip-v2:([^:]+):/u)?.[1])
      .find((value): value is string => Boolean(value) && signatureClipIDs.has(value!)) as SignatureChoreographyClipIDV2 | undefined;
    return {
      fromMs: card.fromMs, toMs: card.toMs, purpose: purpose ?? "local", presentation: card.presentation,
      lineActionCount: card.directives?.length ?? 0, gestureCount: card.gestures.length, effectCount: card.effects.length,
      ...(signatureClip ? { signatureClip } : {}), consequence: card.consequence.kind,
    };
  });
  const gestureCounts = {
    glyph: gestures.filter((gesture) => gesture.scope === "glyph").length,
    token: gestures.filter((gesture) => gesture.scope === "token").length,
    phrase: gestures.filter((gesture) => gesture.scope === "phrase").length,
    total: gestures.length,
  };
  const effectPrimitiveCounts: Record<string, number> = {};
  effects.forEach((effect) => [effect.primary, ...effect.support].forEach((use) => {
    const category = use.primitive.split(".")[0]!.slice(0, 32);
    effectPrimitiveCounts[category] = (effectPrimitiveCounts[category] ?? 0) + 1;
  }));
  const lineByIndex = new Map(input.lyrics.lines.map((line) => [line.lineIndex, line]));
  const quietMs = bible.quietWindows.reduce((total, quiet) => {
    const first = lineByIndex.get(quiet.fromLineIndex);
    const last = lineByIndex.get(quiet.toLineIndex);
    return total + (first && last ? Math.max(0, last.toMs - first.fromMs) : 0);
  }, 0);
  const repairs = [...new Set((input.localRepairFlags ?? []).filter((flag) => repairCategories.has(flag)))].sort();
  const summary: DirectorCacheSummaryV1 = {
    version: "director-cache-summary-v1",
    trackTitle: clean(input.track.title, 120) || "Untitled",
    trackArtist: clean(input.track.artist, 160) || "Unknown artist",
    trackIDDisplay: stableHash32(input.track.trackID).slice(0, 10),
    durationMs: input.lyrics.durationMs,
    lineCount: input.lyrics.lines.length,
    cacheVersion: "rolling-v1",
    compilerVersion: input.cacheEpoch.includes("scene-pack-v2")
      ? "scene-pack-v2" : semanticDirectiveCount > 0 ? "window-intent-v2" : "scene-pack-v1",
    semanticDirectiveCount,
    cacheEpoch: clean(input.cacheEpoch, 80),
    source: input.source,
    createdAtUnixMs: Math.round(input.createdAtUnixMs),
    expiresAtUnixMs: Math.round(input.expiresAtUnixMs),
    bibleIdentityPrefix: bible.bibleIdentity.slice(0, 12),
    biblePresent: true,
    sceneCardCount: cards.length,
    coveragePercent: coverage.percent,
    missingRanges: coverage.missing,
    baseLayout: bible.layoutBudget.baseLayout,
    layoutTransitionCount: bible.layoutBudget.proposedTransitions.length,
    continuityJustificationAccepted: Boolean(bible.layoutBudget.continuityJustification),
    motifFamily: bible.motifActor.family,
    actCount: bible.acts.length,
    signatureMomentCount: cards.filter((card) => Boolean(card.signatureMoment)).length,
    signatureChoreographyCount: sceneTimeline.filter((scene) => Boolean(scene.signatureClip)).length,
    sceneTimeline,
    gestureCounts,
    effectCount: effects.length,
    effectPrimitiveCounts,
    artDirections: [...new Set(cards.map((card) => card.artDirection))].slice(0, 8),
    world: { spatialMode: bible.world.spatialMode, artworkRole: bible.world.artworkRole, motionLaw: bible.world.motionLaw },
    quietSharePercent: input.lyrics.durationMs > 0 ? Math.round(quietMs / input.lyrics.durationMs * 10_000) / 100 : 0,
    localRepairFlags: repairs,
    reachedFinalWindow: input.reachedFinalWindow === true,
    ...(timingSummary(input.timing) ? { timing: timingSummary(input.timing) } : {}),
    warnings: [],
  };
  return { ...summary, warnings: warningsFor(summary) };
};

const tuple = (summary: DirectorCacheSummaryV1): string => [
  summary.baseLayout, summary.world.spatialMode, summary.world.artworkRole, summary.world.motionLaw, summary.motifFamily,
].join("|");

export const analyzeDirectorCacheSummariesV1 = (values: readonly DirectorCacheSummaryV1[]): DirectorCacheSummaryV1[] => {
  const summaries = values.map((summary) => ({ ...summary, warnings: warningsFor({ ...summary, warnings: [] }) }))
    .sort((left, right) => right.createdAtUnixMs - left.createdAtUnixMs || left.trackIDDisplay.localeCompare(right.trackIDDisplay));
  for (let index = 0; index + 2 < summaries.length; index += 1) {
    const current = summaries[index]!;
    const older = summaries[index + 1]!;
    const oldest = summaries[index + 2]!;
    if (current.biblePresent && older.biblePresent && oldest.biblePresent
      && tuple(current) === tuple(older) && tuple(current) === tuple(oldest)) {
      current.warnings = warningOrder.filter((warning) => warning === "repeated-tuple" || current.warnings.includes(warning));
    }
  }
  return summaries;
};

export const sanitizeDirectorCacheSummaryV1 = (value: unknown): DirectorCacheSummaryV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<DirectorCacheSummaryV1>;
  const allowed = new Set([
    "version", "trackTitle", "trackArtist", "trackIDDisplay", "durationMs", "lineCount", "cacheVersion", "compilerVersion", "semanticDirectiveCount", "cacheEpoch",
    "source", "createdAtUnixMs", "expiresAtUnixMs", "bibleIdentityPrefix", "biblePresent", "sceneCardCount",
    "coveragePercent", "missingRanges", "baseLayout", "layoutTransitionCount", "continuityJustificationAccepted",
    "motifFamily", "actCount", "signatureMomentCount", "signatureChoreographyCount", "sceneTimeline", "gestureCounts", "effectCount", "effectPrimitiveCounts",
    "artDirections", "world", "quietSharePercent", "localRepairFlags", "reachedFinalWindow", "timing", "warnings",
  ]);
  if (Object.keys(item).some((key) => !allowed.has(key))) return null;
  if (item.version !== "director-cache-summary-v1" || !clean(item.trackTitle, 120) || !clean(item.trackArtist, 160)
    || !/^[a-f0-9]{8,12}$/u.test(item.trackIDDisplay ?? "") || item.cacheVersion !== "rolling-v1"
    || !["scene-pack-v1", "window-intent-v2", "scene-pack-v2"].includes(item.compilerVersion ?? "")
    || !summaryCacheEpochs.has(item.cacheEpoch ?? "") || !/^[a-f0-9]{8,12}$/u.test(item.bibleIdentityPrefix ?? "")
    || !Array.isArray(item.warnings) || item.warnings.some((warning) => !warningOrder.includes(warning))
    || !item.gestureCounts || !item.world || !Array.isArray(item.missingRanges) || !Array.isArray(item.artDirections)
    || !Array.isArray(item.localRepairFlags) || !item.effectPrimitiveCounts) return null;
  const numbers = [item.durationMs, item.lineCount, item.semanticDirectiveCount, item.createdAtUnixMs, item.expiresAtUnixMs, item.sceneCardCount,
    item.coveragePercent, item.layoutTransitionCount, item.actCount, item.signatureMomentCount, item.effectCount, item.quietSharePercent,
    item.gestureCounts.glyph, item.gestureCounts.token, item.gestureCounts.phrase, item.gestureCounts.total,
    ...(item.signatureChoreographyCount === undefined ? [] : [item.signatureChoreographyCount])];
  if (numbers.some((number) => typeof number !== "number" || !Number.isFinite(number) || number < 0)
    || item.coveragePercent! > 100 || item.quietSharePercent! > 100 || item.layoutTransitionCount! > 4
    || item.source !== "cache" && item.source !== "network" && item.source !== "local" || item.biblePresent !== true
    || typeof item.continuityJustificationAccepted !== "boolean" || typeof item.reachedFinalWindow !== "boolean"
    || item.localRepairFlags.some((flag) => !repairCategories.has(flag))
    || !summaryLayouts.has(item.baseLayout ?? "") || !summaryMotifs.has(item.motifFamily ?? "")
    || typeof item.world.spatialMode !== "string" || item.world.spatialMode.length > 32
    || typeof item.world.artworkRole !== "string" || item.world.artworkRole.length > 32
    || typeof item.world.motionLaw !== "string" || item.world.motionLaw.length > 32
    || !summarySpatialModes.has(item.world.spatialMode) || !summaryArtworkRoles.has(item.world.artworkRole)
    || !summaryMotionLaws.has(item.world.motionLaw) || item.artDirections.some((value) =>
      typeof value !== "string" || value.length > 40 || !summaryArtDirections.has(value))
    || item.missingRanges.length > 24 || item.missingRanges.some((range) => !range
      || Object.keys(range).some((key) => key !== "fromMs" && key !== "toMs")
      || !Number.isFinite(range.fromMs) || !Number.isFinite(range.toMs) || range.fromMs < 0
      || range.toMs < range.fromMs || range.toMs > item.durationMs!)
    || Object.keys(item.gestureCounts).some((key) => !["glyph", "token", "phrase", "total"].includes(key))
    || Object.keys(item.world).some((key) => !["spatialMode", "artworkRole", "motionLaw"].includes(key))
    || Object.entries(item.effectPrimitiveCounts).some(([key, count]) => key.length > 32 || !summaryEffectCategories.has(key)
      || !Number.isInteger(count) || count < 0)) return null;
  if (item.sceneTimeline !== undefined && (!Array.isArray(item.sceneTimeline) || item.sceneTimeline.length > 40
    || item.sceneTimeline.some((scene) => !scene || Object.keys(scene).some((key) => ![
      "fromMs", "toMs", "purpose", "presentation", "lineActionCount", "gestureCount", "effectCount", "signatureClip", "consequence",
    ].includes(key)) || !Number.isFinite(scene.fromMs) || !Number.isFinite(scene.toMs) || scene.fromMs < 0 || scene.toMs <= scene.fromMs
      || scene.toMs > item.durationMs! || !scenePurposes.has(scene.purpose) || typeof scene.presentation !== "string" || scene.presentation.length > 24
      || !Number.isInteger(scene.lineActionCount) || scene.lineActionCount < 0 || scene.lineActionCount > 8
      || !Number.isInteger(scene.gestureCount) || scene.gestureCount < 0 || scene.gestureCount > 6
      || !Number.isInteger(scene.effectCount) || scene.effectCount < 0 || scene.effectCount > 4
      || scene.signatureClip !== undefined && !signatureClipIDs.has(scene.signatureClip)
      || typeof scene.consequence !== "string" || scene.consequence.length > 24))) return null;
  if (item.timing && (Object.keys(item.timing).some((key) => !["cache", "totalMs", "providerMs", "attempts", "outcome"].includes(key))
    || !["hit", "miss", "disabled"].includes(item.timing.cache)
    || !Number.isFinite(item.timing.totalMs) || !Number.isFinite(item.timing.providerMs)
    || !Number.isInteger(item.timing.attempts) || item.timing.attempts < 0 || item.timing.attempts > 6
    || item.timing.outcome !== undefined && (typeof item.timing.outcome !== "string"
      || item.timing.outcome.length > 40 || !summaryOutcomes.has(item.timing.outcome)))) return null;
  return {
    ...(item as DirectorCacheSummaryV1),
    trackTitle: clean(item.trackTitle, 120), trackArtist: clean(item.trackArtist, 160),
    cacheEpoch: clean(item.cacheEpoch, 80), bibleIdentityPrefix: clean(item.bibleIdentityPrefix, 12),
    baseLayout: clean(item.baseLayout, 32), motifFamily: clean(item.motifFamily, 32),
    artDirections: item.artDirections.map((value) => clean(value, 40)).filter(Boolean).slice(0, 8),
    warnings: warningOrder.filter((warning) => item.warnings!.includes(warning)),
  };
};
