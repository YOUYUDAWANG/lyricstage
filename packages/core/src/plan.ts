import {
  stableHash32,
  type DirectorRecipeV0,
  type LyricDocumentV0,
  type SceneFamilyV0,
} from "@lyricstage/contracts";

export interface PerformanceSceneV0 {
  lineIndex: number;
  fromMs: number;
  toMs: number;
  family: SceneFamilyV0;
  intensity: number;
  repetitionIndex: number;
  repetitionCount: number;
}

export interface PerformancePlanV0 {
  version: "performance-plan-v0";
  recordingID: string;
  lyricsIdentity: string;
  planIdentity: string;
  durationMs: number;
  scenes: PerformanceSceneV0[];
}

export interface TimelineBoundaryV0 {
  atMs: number;
  activeSceneIndices: number[];
}

export interface PreparedTimelineV0 {
  boundaries: TimelineBoundaryV0[];
}

const normalizeText = (text: string): string =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();

const localFamily = (
  lineIndex: number,
  repetitionCount: number,
): SceneFamilyV0 => {
  if (repetitionCount > 1) return "chorusMemory";
  if (lineIndex % 4 === 1) return "railHandoff";
  return "fallback";
};

export const compilePerformancePlan = (
  lyrics: LyricDocumentV0,
  direction?: DirectorRecipeV0,
): PerformancePlanV0 => {
  const recipeByLine = new Map(
    direction?.recordingID === lyrics.recordingID
      ? direction.recipes.map((recipe) => [recipe.lineIndex, recipe] as const)
      : [],
  );
  const counts = new Map<string, number>();
  const positions = new Map<string, number>();
  for (const line of lyrics.lines) {
    const key = normalizeText(line.text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const scenes = lyrics.lines.map<PerformanceSceneV0>((line) => {
    const key = normalizeText(line.text);
    const repetitionCount = counts.get(key) ?? 1;
    const repetitionIndex = positions.get(key) ?? 0;
    positions.set(key, repetitionIndex + 1);
    const recipe = recipeByLine.get(line.lineIndex);
    return {
      lineIndex: line.lineIndex,
      fromMs: line.fromMs,
      toMs: line.toMs,
      family: recipe?.family ?? localFamily(line.lineIndex, repetitionCount),
      intensity: recipe?.intensity ?? (repetitionCount > 1 ? 0.72 : 0.42),
      repetitionIndex,
      repetitionCount,
    };
  });
  const lyricsIdentity = stableHash32(lyrics);
  const planIdentity = stableHash32({
    version: "performance-plan-v0",
    lyricsIdentity,
    direction: direction ?? null,
    scenes,
  });

  return {
    version: "performance-plan-v0",
    recordingID: lyrics.recordingID,
    lyricsIdentity,
    planIdentity,
    durationMs: lyrics.durationMs,
    scenes,
  };
};

export const prepareTimeline = (plan: PerformancePlanV0): PreparedTimelineV0 => {
  const events = new Map<number, { starts: number[]; ends: number[] }>();
  plan.scenes.forEach((scene, sceneIndex) => {
    const start = events.get(scene.fromMs) ?? { starts: [], ends: [] };
    start.starts.push(sceneIndex);
    events.set(scene.fromMs, start);
    const end = events.get(scene.toMs) ?? { starts: [], ends: [] };
    end.ends.push(sceneIndex);
    events.set(scene.toMs, end);
  });

  const active = new Set<number>();
  const boundaries: TimelineBoundaryV0[] = [];
  for (const atMs of Array.from(events.keys()).sort((left, right) => left - right)) {
    const event = events.get(atMs)!;
    event.ends.forEach((sceneIndex) => active.delete(sceneIndex));
    event.starts.forEach((sceneIndex) => active.add(sceneIndex));
    boundaries.push({
      atMs,
      activeSceneIndices: Array.from(active).sort((left, right) => left - right),
    });
  }
  return { boundaries };
};

export const sampleTimeline = (
  timeline: PreparedTimelineV0,
  timeMs: number,
): number[] => {
  let low = 0;
  let high = timeline.boundaries.length - 1;
  let match = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (timeline.boundaries[middle].atMs <= timeMs) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match >= 0 ? timeline.boundaries[match].activeSceneIndices : [];
};
