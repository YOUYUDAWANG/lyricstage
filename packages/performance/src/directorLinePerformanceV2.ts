import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { lyricGraphemesV1, type LyricGestureV1 } from "./lyricChoreography";
import type { DirectorLineDirectiveV1 } from "./directorPlan";
import {
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
  type DirectorBibleV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
} from "./rollingDirector";

export type LineDramaticRoleV2 = "statement" | "confession" | "question" | "answer" | "refrain" | "rupture" | "release";
export type LineEntranceClipIDV2 = "line-rise" | "line-slide" | "line-reveal" | "line-break";
export type LineHoldClipIDV2 = "hold-breathe" | "hold-suspend" | "hold-echo" | "hold-tension";
export type LineExitClipIDV2 = "exit-dissolve" | "exit-recede" | "exit-handoff" | "exit-cut";
export type LineMotifRelationshipV2 = "introduce" | "approach" | "cross" | "break" | "echo" | "resolve";

export interface LinePerformanceV2 {
  lineIndex: number;
  dramaticRole: LineDramaticRoleV2;
  entrance: LineEntranceClipIDV2;
  hold: LineHoldClipIDV2;
  exit: LineExitClipIDV2;
  focus?: { fromGrapheme: number; toGrapheme: number; semanticRole: string };
  motifRelationship: LineMotifRelationshipV2;
  intensity: number;
}

export const lineDramaticRolesV2 = ["statement", "confession", "question", "answer", "refrain", "rupture", "release"] as const;
export const lineEntranceClipIDsV2 = ["line-rise", "line-slide", "line-reveal", "line-break"] as const;
export const lineHoldClipIDsV2 = ["hold-breathe", "hold-suspend", "hold-echo", "hold-tension"] as const;
export const lineExitClipIDsV2 = ["exit-dissolve", "exit-recede", "exit-handoff", "exit-cut"] as const;
export const lineMotifRelationshipsV2 = ["introduce", "approach", "cross", "break", "echo", "resolve"] as const;

const roles = new Set<LineDramaticRoleV2>(lineDramaticRolesV2);
const entrances = new Set<LineEntranceClipIDV2>(lineEntranceClipIDsV2);
const holds = new Set<LineHoldClipIDV2>(lineHoldClipIDsV2);
const exits = new Set<LineExitClipIDV2>(lineExitClipIDsV2);
const motifRelationships = new Set<LineMotifRelationshipV2>(lineMotifRelationshipsV2);
const keys = new Set(["lineIndex", "dramaticRole", "entrance", "hold", "exit", "focus", "motifRelationship", "intensity"]);
const focusKeys = new Set(["fromGrapheme", "toGrapheme", "semanticRole"]);

export const linePerformanceSchemaV2 = {
  type: "object",
  additionalProperties: false,
  required: ["lineIndex", "dramaticRole", "entrance", "hold", "exit", "motifRelationship", "intensity"],
  properties: {
    lineIndex: { type: "integer", minimum: 0 },
    dramaticRole: { enum: lineDramaticRolesV2 },
    entrance: { enum: lineEntranceClipIDsV2 },
    hold: { enum: lineHoldClipIDsV2 },
    exit: { enum: lineExitClipIDsV2 },
    focus: {
      type: "object", additionalProperties: false, required: ["fromGrapheme", "toGrapheme", "semanticRole"],
      properties: {
        fromGrapheme: { type: "integer", minimum: 0 },
        toGrapheme: { type: "integer", minimum: 1 },
        semanticRole: { type: "string", minLength: 1, maxLength: 40 },
      },
    },
    motifRelationship: { enum: lineMotifRelationshipsV2 },
    intensity: { type: "number", minimum: 0.35, maximum: 1 },
  },
};

const clean = (value: unknown, maximum: number): string => typeof value === "string" ? value.trim().slice(0, maximum) : "";

export const sanitizeLinePerformancesV2 = (
  lyrics: LyricDocumentV0,
  value: unknown,
  fromLineIndex: number,
  toLineIndex: number,
): LinePerformanceV2[] | null => {
  const expectedLines = lyrics.lines.filter((line) => line.lineIndex >= fromLineIndex && line.lineIndex <= toLineIndex);
  if (!Array.isArray(value) || value.length !== expectedLines.length || value.length === 0 || value.length > 6) return null;
  const expected = new Map(expectedLines.map((line) => [line.lineIndex, line]));
  const output: LinePerformanceV2[] = [];
  const seen = new Set<number>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    if (Object.keys(item).some((key) => !keys.has(key))) return null;
    const lineIndex = Number.isInteger(item.lineIndex) ? item.lineIndex as number : -1;
    const line = expected.get(lineIndex);
    const intensity = typeof item.intensity === "number" && Number.isFinite(item.intensity) ? item.intensity : -1;
    if (!line || seen.has(lineIndex) || !roles.has(item.dramaticRole as LineDramaticRoleV2)
      || !entrances.has(item.entrance as LineEntranceClipIDV2) || !holds.has(item.hold as LineHoldClipIDV2)
      || !exits.has(item.exit as LineExitClipIDV2) || !motifRelationships.has(item.motifRelationship as LineMotifRelationshipV2)
      || intensity < 0.35 || intensity > 1) return null;
    let focus: LinePerformanceV2["focus"];
    if (item.focus !== undefined) {
      if (!item.focus || typeof item.focus !== "object" || Array.isArray(item.focus)) return null;
      const wire = item.focus as Record<string, unknown>;
      if (Object.keys(wire).some((key) => !focusKeys.has(key))) return null;
      const pieces = lyricGraphemesV1(line.text);
      const fromGrapheme = Number.isInteger(wire.fromGrapheme) ? wire.fromGrapheme as number : -1;
      const toGrapheme = Number.isInteger(wire.toGrapheme) ? wire.toGrapheme as number : -1;
      const semanticRole = clean(wire.semanticRole, 40);
      if (fromGrapheme < 0 || toGrapheme <= fromGrapheme || toGrapheme > pieces.length || !semanticRole) return null;
      focus = { fromGrapheme, toGrapheme, semanticRole };
    }
    output.push({
      lineIndex, dramaticRole: item.dramaticRole as LineDramaticRoleV2,
      entrance: item.entrance as LineEntranceClipIDV2, hold: item.hold as LineHoldClipIDV2,
      exit: item.exit as LineExitClipIDV2, ...(focus ? { focus } : {}),
      motifRelationship: item.motifRelationship as LineMotifRelationshipV2, intensity,
    });
    seen.add(lineIndex);
  }
  return output.sort((left, right) => left.lineIndex - right.lineIndex);
};

const behaviorByRole: Record<LineDramaticRoleV2, DirectorLineDirectiveV1["behavior"]> = {
  statement: "assemble", confession: "drift", question: "focus", answer: "converge",
  refrain: "echo", rupture: "gravityDrop", release: "stretch",
};
const phrasePrimitiveByEntrance: Record<LineEntranceClipIDV2, LyricGestureV1["primitive"]> = {
  "line-rise": "phrase.arc", "line-slide": "phrase.handoff", "line-reveal": "phrase.breathe", "line-break": "phrase.breakReform",
};
const tokenPrimitiveByRole: Record<LineDramaticRoleV2, LyricGestureV1["primitive"]> = {
  statement: "token.underlinePath", confession: "token.halo", question: "token.elasticFocus", answer: "token.underlinePath",
  refrain: "token.echo", rupture: "token.elasticFocus", release: "token.halo",
};

const gestureForLine = (lyrics: LyricDocumentV0, performance: LinePerformanceV2): LyricGestureV1 | null => {
  const line = lyrics.lines.find((candidate) => candidate.lineIndex === performance.lineIndex);
  if (!line) return null;
  const pieces = lyricGraphemesV1(line.text);
  const focus = performance.focus;
  const scope = focus ? "token" as const : "phrase" as const;
  const primitive = focus ? tokenPrimitiveByRole[performance.dramaticRole] : phrasePrimitiveByEntrance[performance.entrance];
  const fromGrapheme = focus?.fromGrapheme ?? 0;
  const toGrapheme = focus?.toGrapheme ?? pieces.length;
  return {
    version: "lyric-gesture-v1",
    id: `line-performance-v2:${performance.lineIndex}:${performance.entrance}:${performance.hold}:${performance.exit}`,
    lineIndex: performance.lineIndex, scope,
    target: { fromGrapheme, toGrapheme, expectedText: pieces.slice(fromGrapheme, toGrapheme).join("") },
    primitive, driver: "lineEnter",
    space: performance.entrance === "line-slide" ? "lyricToArtwork" : "lyricLocal",
    envelope: { attackMs: 280, holdMs: 420, releaseMs: 640 },
    intensity: performance.intensity,
    direction: performance.exit === "exit-recede" || performance.exit === "exit-cut" ? -1 : 1,
    paletteRole: performance.motifRelationship === "break" ? "accent" : performance.motifRelationship === "resolve" ? "warm" : "primary",
    evidence: {
      semanticRole: performance.dramaticRole === "refrain" ? "repetition"
        : performance.dramaticRole === "rupture" ? "rupture"
          : performance.dramaticRole === "release" || performance.dramaticRole === "answer" ? "resolution"
            : performance.dramaticRole === "question" ? "question" : "motion",
      rationale: `The bounded ${performance.entrance}/${performance.hold}/${performance.exit} choreography expresses this line's ${performance.dramaticRole} role.`,
      confidence: 0.78,
    },
  };
};

export const applyLinePerformancesV2 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  card: SceneCardV1,
  performances: readonly LinePerformanceV2[],
): SceneCardV1 | null => {
  const byLine = new Map(performances.map((performance) => [performance.lineIndex, performance]));
  const directives = (card.directives ?? []).map((directive) => {
    const performance = byLine.get(directive.lineIndex);
    if (!performance) return directive;
    return {
      ...directive,
      behavior: behaviorByRole[performance.dramaticRole],
      intensity: Math.min(1, Math.max(0.35, performance.intensity)),
      alignment: performance.dramaticRole === "question" ? "center" as const : directive.alignment,
      direction: performance.exit === "exit-recede" || performance.exit === "exit-cut" ? -1 as const : 1 as const,
      fontScale: Math.min(1.22, Math.max(0.78, directive.fontScale + (performance.dramaticRole === "release" ? 0.025 : 0))),
    };
  });
  const lineGestures = performances.map((performance) => gestureForLine(lyrics, performance));
  if (lineGestures.some((gesture) => !gesture)) return null;
  const uniqueGestures = [...new Map([
    ...(card.signatureMoment ? card.gestures : []),
    ...(lineGestures as LyricGestureV1[]),
  ].map((gesture) => [gesture.id, gesture])).values()];
  const perLine = new Map<number, number>();
  const gestures = uniqueGestures.filter((gesture) => {
    const count = perLine.get(gesture.lineIndex) ?? 0;
    if (count >= 2) return false;
    perLine.set(gesture.lineIndex, count + 1);
    return true;
  }).slice(0, 6);
  const { sceneID: _oldSceneID, ...withoutSceneID } = card;
  const value = { ...withoutSceneID, directives, gestures };
  const sceneID = sceneCardIdentityV1(value);
  const candidate: SceneCardV1 = { ...value, sceneID, effects: value.effects.map((effect) => ({ ...effect, sectionID: sceneID })) };
  return sanitizeSceneCardV1(lyrics, bible, state, candidate);
};
