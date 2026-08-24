import type { DirectorSectionV1, PerformanceLayoutV1 } from "./directorPlan";
import {
  blockingFromSectionsV1,
  sanitizeSongBlockingV1,
  type LayoutTransitionV1,
  type SongBlockingV1,
} from "./lyricChoreography";

export type SemanticScenePurposeV2 = "establish" | "develop" | "turn" | "aftermath" | "resolve";
export type SemanticSpatialIntentV2 = "hold" | "split" | "open" | "stack";

export interface SemanticSceneDirectionV2 {
  version: "semantic-scene-direction-v2";
  purpose: SemanticScenePurposeV2;
  spatialIntent: SemanticSpatialIntentV2;
}

const purposes = new Set<SemanticScenePurposeV2>(["establish", "develop", "turn", "aftermath", "resolve"]);
const spatialIntents = new Set<SemanticSpatialIntentV2>(["hold", "split", "open", "stack"]);

export const sanitizeSemanticSceneDirectionV2 = (value: unknown): SemanticSceneDirectionV2 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Partial<SemanticSceneDirectionV2>;
  return Object.keys(wire).length === 3 && wire.version === "semantic-scene-direction-v2"
    && purposes.has(wire.purpose as SemanticScenePurposeV2)
    && spatialIntents.has(wire.spatialIntent as SemanticSpatialIntentV2)
    ? wire as SemanticSceneDirectionV2
    : null;
};

const alternateRail = (prior: PerformanceLayoutV1): PerformanceLayoutV1 =>
  prior === "railLeading" ? "railTrailing" : "railLeading";

export const layoutForSemanticSceneV2 = (
  prior: PerformanceLayoutV1,
  transitionsUsed: number,
  direction: SemanticSceneDirectionV2,
): PerformanceLayoutV1 => {
  if (transitionsUsed >= 4 || direction.purpose === "establish") return prior;
  if (direction.spatialIntent === "split") return prior === "duetDivide" ? prior : "duetDivide";
  if (direction.purpose === "resolve") return "monument";
  if (direction.purpose === "turn") {
    if (direction.spatialIntent === "open") return prior === "editorialSplit" ? alternateRail(prior) : "editorialSplit";
    return alternateRail(prior);
  }
  if (direction.purpose === "aftermath" && direction.spatialIntent === "open") {
    return prior === "editorialSplit" ? "railTrailing" : "editorialSplit";
  }
  return prior;
};

export const localSemanticSceneDirectionV2 = (sceneIndex: number): SemanticSceneDirectionV2 => {
  const patterns: Array<Omit<SemanticSceneDirectionV2, "version">> = [
    { purpose: "establish", spatialIntent: "hold" },
    { purpose: "develop", spatialIntent: "stack" },
    { purpose: "turn", spatialIntent: "open" },
    { purpose: "aftermath", spatialIntent: "hold" },
    { purpose: "develop", spatialIntent: "stack" },
    { purpose: "resolve", spatialIntent: "open" },
  ];
  return { version: "semantic-scene-direction-v2", ...patterns[Math.abs(sceneIndex) % patterns.length]! };
};

export const sceneIntensityForDirectionV2 = (direction?: SemanticSceneDirectionV2): number => {
  if (direction?.purpose === "turn") return 0.88;
  if (direction?.purpose === "resolve") return 0.92;
  if (direction?.purpose === "develop") return 0.7;
  if (direction?.purpose === "aftermath") return 0.56;
  return 0.6;
};

interface BibleBlockingShapeV2 {
  acts: Array<{ fromLineIndex: number }>;
  layoutBudget: { baseLayout: PerformanceLayoutV1; proposedTransitions: LayoutTransitionV1[] };
}

export const blockingForRollingSectionsV2 = (
  bible: BibleBlockingShapeV2,
  sections: DirectorSectionV1[],
  useSemanticBlocking: boolean,
  fallback: SongBlockingV1,
): SongBlockingV1 => {
  if (useSemanticBlocking) return blockingFromSectionsV1(sections);
  const actSectionIndex = (actIndex: number): number => {
    const lineIndex = bible.acts[actIndex]?.fromLineIndex;
    return Math.max(0, sections.findIndex((section) => lineIndex !== undefined
      && lineIndex >= section.fromLineIndex && lineIndex <= section.toLineIndex));
  };
  const proposed: SongBlockingV1 = {
    version: "song-blocking-v1",
    baseLayout: bible.layoutBudget.baseLayout,
    transitions: bible.layoutBudget.proposedTransitions.map((transition) => {
      const sectionIndex = actSectionIndex(transition.atSectionIndex);
      const section = sections[sectionIndex];
      return {
        ...transition,
        atSectionIndex: sectionIndex,
        evidence: {
          ...transition.evidence,
          lineIndices: transition.evidence.lineIndices.filter((lineIndex) => section
            && lineIndex >= section.fromLineIndex && lineIndex <= section.toLineIndex),
        },
      };
    }),
  };
  return sanitizeSongBlockingV1(proposed, sections) ?? fallback;
};
