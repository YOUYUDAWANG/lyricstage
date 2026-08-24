import type { LyricDocumentV0 } from "@lyricstage/contracts";
import type { DirectorRequestProfileV1 } from "./directorProviders";
import { windowIntentRequestProfileV2 } from "./directorV2Provider";
import type {
  ManualArcIntentV2,
  ManualSemanticCueV2,
  ManualSpatialIntentV2,
  WindowIntentV2,
} from "./directorV2Fixtures";
import { compileWindowIntentV2ToSceneCardV1 } from "./directorV2Rolling";
import { compactScenePackPromptInputV1 } from "./rollingDirectorPrompt";
import {
  advanceRollingPerformanceStateV1,
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
  type DirectorBibleV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
} from "./rollingDirector";
import type { DramaticCoverRoleV1 } from "./dramaticScore";
import {
  applyLinePerformancesV2,
  linePerformanceSchemaV2,
  sanitizeLinePerformancesV2,
  type LinePerformanceV2,
} from "./directorLinePerformanceV2";
import {
  applySignatureChoreographyV2,
  signatureChoreographyClipIDsV2,
  signatureChoreographyFitsV2,
  type SignatureChoreographySelectionV2,
} from "./signatureChoreographyV2";
import { layoutForSemanticSceneV2, type SemanticSceneDirectionV2 } from "./semanticSceneDirectionV2";

export type SceneDramaticPurposeV2 = "establish" | "develop" | "turn" | "aftermath" | "resolve";
export type ScenePreserveV2 = "motif" | "visualWorld" | "spatialAxis" | "voiceOwnership";
export type SceneChangeV2 = "focus" | "scale" | "spacing" | "energy" | "voiceOwnership";
export type SceneLeaveV2 = "trace" | "absence" | "displacement" | "connection" | "question" | "resolution";

export interface SceneContinuityV2 {
  preserve: ScenePreserveV2[];
  change: SceneChangeV2;
  leave: SceneLeaveV2;
}

export interface SceneIntentV2 {
  id: string;
  fromLineIndex: number;
  toLineIndex: number;
  purpose: SceneDramaticPurposeV2;
  spatialIntent: ManualSpatialIntentV2;
  coverRole: DramaticCoverRoleV1;
  arcIntent: ManualArcIntentV2;
  continuity: SceneContinuityV2;
  cues: ManualSemanticCueV2[];
  linePerformances: LinePerformanceV2[];
  signatureClip: SignatureChoreographySelectionV2;
}

export interface ScenePackV2 {
  version: "scene-pack-v2";
  bibleIdentity: string;
  entryStateHash: string;
  fromLineIndex: number;
  toLineIndex: number;
  scenes: SceneIntentV2[];
}

interface ScenePackProfileInputV2 {
  lyrics: LyricDocumentV0;
  bible: DirectorBibleV1;
  state: RollingPerformanceStateV1;
  promptInput: unknown;
}

const purposes = new Set<SceneDramaticPurposeV2>(["establish", "develop", "turn", "aftermath", "resolve"]);
const spatialIntents = new Set<ManualSpatialIntentV2>(["hold", "split", "open", "stack"]);
const arcIntents = new Set<ManualArcIntentV2>(["hold", "lift", "break", "recall"]);
const coverRoles = new Set<DramaticCoverRoleV1>(["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"]);
const cueRoles = new Set<ManualSemanticCueV2["role"]>(["refrain", "rupture", "release", "hold", "handoff", "recall"]);
const preserves = new Set<ScenePreserveV2>(["motif", "visualWorld", "spatialAxis", "voiceOwnership"]);
const changes = new Set<SceneChangeV2>(["focus", "scale", "spacing", "energy", "voiceOwnership"]);
const leaves = new Set<SceneLeaveV2>(["trace", "absence", "displacement", "connection", "question", "resolution"]);
const packKeys = new Set(["version", "scenes"]);
const sceneKeys = new Set(["fromLineIndex", "toLineIndex", "purpose", "spatialIntent", "coverRole", "arcIntent", "continuity", "cues", "linePerformances", "signatureClip"]);
const continuityKeys = new Set(["preserve", "change", "leave"]);
const cueKeys = new Set(["role", "fromLineIndex", "toLineIndex", "evidenceLineIndices", "confidence"]);

const stringEnumArray = (values: readonly string[], maximum: number) => ({
  type: "array", minItems: 1, maxItems: maximum, uniqueItems: true, items: { enum: values },
});

const semanticCueSchemaV2 = {
  type: "object",
  additionalProperties: false,
  required: ["role", "fromLineIndex", "toLineIndex", "evidenceLineIndices", "confidence"],
  properties: {
    role: { enum: [...cueRoles] },
    fromLineIndex: { type: "integer", minimum: 0 },
    toLineIndex: { type: "integer", minimum: 0 },
    evidenceLineIndices: { type: "array", minItems: 1, maxItems: 4, uniqueItems: true, items: { type: "integer", minimum: 0 } },
    confidence: { type: "number", minimum: 0.7, maximum: 1 },
  },
};

export const scenePackSchemaV2: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["version", "scenes"],
  properties: {
    version: { const: "scene-pack-v2" },
    scenes: {
      type: "array", minItems: 1, maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fromLineIndex", "toLineIndex", "purpose", "spatialIntent", "coverRole", "arcIntent", "continuity", "cues", "linePerformances", "signatureClip"],
        properties: {
          fromLineIndex: { type: "integer", minimum: 0 },
          toLineIndex: { type: "integer", minimum: 0 },
          purpose: { enum: [...purposes] },
          spatialIntent: { enum: [...spatialIntents] },
          coverRole: { enum: [...coverRoles] },
          arcIntent: { enum: [...arcIntents] },
          continuity: {
            type: "object", additionalProperties: false, required: ["preserve", "change", "leave"],
            properties: {
              preserve: stringEnumArray([...preserves], 2),
              change: { enum: [...changes] },
              leave: { enum: [...leaves] },
            },
          },
          cues: { type: "array", maxItems: 6, items: semanticCueSchemaV2 },
          linePerformances: { type: "array", minItems: 1, maxItems: 6, items: linePerformanceSchemaV2 },
          signatureClip: { enum: ["none", ...signatureChoreographyClipIDsV2] },
        },
      },
    },
  },
};

export const scenePackSystemPromptV2 = `You are LyricStage's scene and lyric performance director. Return one ScenePackV2 JSON object matching the supplied schema and covering the exact requested lyric window.

Split a normal window into three to five contiguous scenes, usually eight to twenty seconds and two to six lyric lines each. Use fewer only when the requested window contains fewer than three lyric lines. Cut at real dramatic turns: section boundaries, silence, energy changes, repeated hooks, questions and answers, or voice handoffs. Do not cut only to reach a scene count.

Each scene declares its dramatic purpose, spatial intent, cover role and arc intent. continuity.preserve says what visibly survives from the prior scene; continuity.change names the main change; continuity.leave names the observable fact left for the next scene. Adjacent scenes must preserve at least one thing, change one thing, and leave one thing. The final scene should resolve or deliberately leave a question.

Within each scene, author exactly one LinePerformanceV2 entry for every lyric line. dramaticRole explains the line's narrative job. entrance, hold and exit select only from the registered clip ids in the schema. motifRelationship explains how the shared whole-song motif changes. A focus range is optional and must point to exact grapheme indices in that line. Repeated adjacent lines should not mechanically receive the same entrance/hold/exit tuple unless repetition is the intended motif action.

Select zero or one signatureClip per scene. Across a normal multi-scene window select one or two distinct clips, and select two when the window contains ten or more lyric lines, only where the lyric structure earns a staged anticipation, event and visible consequence. chorus-lift and refrain-upgrade require a refrain line; bridge-fracture requires a rupture line; final-resolve is only for the final lyric of the song. Use none for connective scenes. The clip name is semantic choreography selection, not permission to invent visual parameters.

Also mark only evidenced refrain, rupture, release, hold, handoff or recall cues. Cues are semantic direction, not animation instructions. Do not output renderer primitives, gestures, effects, arbitrary parameters, duration, coordinates, paths, SVG, CSS, JavaScript, colors, keyframes, rewritten lyrics, translations, audio instructions, provider diagnostics or secrets. Do not echo Bible identity, entry state identity or the outer requested envelope. Output JSON only.`;

const integer = (value: unknown): number => Number.isInteger(value) ? value as number : -1;
const boundedConfidence = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : -1;

const parseCues = (
  candidates: unknown,
  input: ScenePackProfileInputV2,
  sceneIndex: number,
  fromLineIndex: number,
  toLineIndex: number,
): ManualSemanticCueV2[] | null => {
  if (!Array.isArray(candidates) || candidates.length > 6) return null;
  const valid = new Set(input.lyrics.lines.filter((line) => line.lineIndex >= fromLineIndex && line.lineIndex <= toLineIndex).map((line) => line.lineIndex));
  const prior = new Set(input.lyrics.lines.filter((line) => line.lineIndex <= toLineIndex).map((line) => line.lineIndex));
  const output: ManualSemanticCueV2[] = [];
  for (const [cueIndex, candidate] of candidates.entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const cue = candidate as Record<string, unknown>;
    if (Object.keys(cue).some((key) => !cueKeys.has(key))) return null;
    const cueFrom = integer(cue.fromLineIndex);
    const cueTo = integer(cue.toLineIndex);
    const evidence = Array.isArray(cue.evidenceLineIndices)
      ? [...new Set(cue.evidenceLineIndices.filter((line): line is number => Number.isInteger(line)))] : [];
    const confidence = boundedConfidence(cue.confidence);
    const recall = cue.role === "recall";
    if (!cueRoles.has(cue.role as ManualSemanticCueV2["role"]) || cueFrom > cueTo || !valid.has(cueFrom) || !valid.has(cueTo)
      || evidence.length === 0 || evidence.length > 4 || evidence.some((line) => !(recall ? prior : valid).has(line))
      || recall && !evidence.some((line) => line < cueFrom) || confidence < 0.7 || confidence > 1) return null;
    output.push({
      id: `scene-pack-v2-cue:${input.state.nextSceneIndex}:${sceneIndex}:${cueIndex}:${String(cue.role)}:${cueFrom}-${cueTo}`,
      version: "semantic-cue-v2", role: cue.role as ManualSemanticCueV2["role"], fromLineIndex: cueFrom,
      ...(cueTo === cueFrom ? {} : { toLineIndex: cueTo }), evidenceLineIndices: evidence, confidence,
    });
  }
  return output;
};

const requestedRange = (input: ScenePackProfileInputV2) => {
  const prompt = input.promptInput as { fromLineIndex?: unknown; toLineIndex?: unknown };
  return { fromLineIndex: integer(prompt.fromLineIndex), toLineIndex: integer(prompt.toLineIndex) };
};

export const compileScenePackV2 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  state: RollingPerformanceStateV1,
  pack: ScenePackV2,
): SceneCardV1[] => {
  if (pack.version !== "scene-pack-v2" || pack.bibleIdentity !== bible.bibleIdentity || pack.entryStateHash !== state.stateHash) return [];
  const cards: SceneCardV1[] = [];
  let current = state;
  for (const scene of pack.scenes) {
    const intent: WindowIntentV2 = {
      version: "window-intent-v2", bibleIdentity: bible.bibleIdentity, entryStateHash: current.stateHash,
      id: scene.id, fromLineIndex: scene.fromLineIndex, toLineIndex: scene.toLineIndex,
      spatialIntent: scene.spatialIntent, coverRole: scene.coverRole, arcIntent: scene.arcIntent, cues: scene.cues,
    };
    const compiled = compileWindowIntentV2ToSceneCardV1(lyrics, bible, current, intent);
    if (!compiled) return [];
    const { sceneID: _oldSceneID, ...withoutSceneID } = compiled;
    const semanticScene: SemanticSceneDirectionV2 = { version: "semantic-scene-direction-v2", purpose: scene.purpose, spatialIntent: scene.spatialIntent };
    const intended = { ...withoutSceneID, semanticScene, layout: layoutForSemanticSceneV2(current.layout, current.layoutTransitionsUsed, semanticScene), intention: `${scene.purpose}: preserve ${scene.continuity.preserve.join("+")}; change ${scene.continuity.change}; leave ${scene.continuity.leave}.` };
    const sceneID = sceneCardIdentityV1(intended);
    const candidate: SceneCardV1 = { ...intended, sceneID, effects: intended.effects.map((effect) => ({ ...effect, sectionID: sceneID })) };
    const accepted = sanitizeSceneCardV1(lyrics, bible, current, candidate);
    const performed = accepted && applyLinePerformancesV2(lyrics, bible, current, accepted, scene.linePerformances);
    const choreographed = performed && applySignatureChoreographyV2(
      lyrics, bible, current, performed,
      { purpose: scene.purpose, linePerformances: scene.linePerformances }, scene.signatureClip,
    );
    if (!choreographed) return [];
    cards.push(choreographed);
    current = advanceRollingPerformanceStateV1(current, choreographed);
  }
  return cards;
};

export const scenePackRequestProfileV2: DirectorRequestProfileV1<SceneCardV1[]> = {
  version: "director-request-profile-v1",
  kind: "scene-pack",
  schemaName: "lyricstage_scene_pack_v2",
  systemPrompt: scenePackSystemPromptV2,
  schema: scenePackSchemaV2,
  compactInput(value) { return compactScenePackPromptInputV1((value as ScenePackProfileInputV2).promptInput); },
  adapt(value, aiValue) {
    const input = value as ScenePackProfileInputV2;
    if (aiValue && typeof aiValue === "object" && !Array.isArray(aiValue)
      && (aiValue as Record<string, unknown>).version === "window-intent-v2") {
      return windowIntentRequestProfileV2.adapt(value, aiValue);
    }
    if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) return { reason: "scene-pack-v2-not-object" };
    const raw = aiValue as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !packKeys.has(key)) || raw.version !== "scene-pack-v2" || !Array.isArray(raw.scenes)) {
      return { reason: "scene-pack-v2-contract-invalid" };
    }
    const requested = requestedRange(input);
    const lineCount = input.lyrics.lines.filter((line) => line.lineIndex >= requested.fromLineIndex && line.lineIndex <= requested.toLineIndex).length;
    const minimumScenes = Math.min(3, lineCount);
    if (requested.fromLineIndex < 0 || requested.toLineIndex < requested.fromLineIndex
      || raw.scenes.length < minimumScenes || raw.scenes.length > Math.min(5, lineCount)) return { reason: "scene-pack-v2-scene-count-invalid" };
    const scenes: SceneIntentV2[] = [];
    for (const [sceneIndex, candidate] of raw.scenes.entries()) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { reason: "scene-pack-v2-scene-not-object" };
      const scene = candidate as Record<string, unknown>;
      if (Object.keys(scene).some((key) => !sceneKeys.has(key))) return { reason: "scene-pack-v2-concrete-visual-field" };
      const fromLineIndex = integer(scene.fromLineIndex);
      const toLineIndex = integer(scene.toLineIndex);
      const expectedFrom = sceneIndex === 0 ? requested.fromLineIndex : scenes.at(-1)!.toLineIndex + 1;
      const continuity = scene.continuity && typeof scene.continuity === "object" && !Array.isArray(scene.continuity)
        ? scene.continuity as Record<string, unknown> : null;
      if (fromLineIndex !== expectedFrom || toLineIndex < fromLineIndex || toLineIndex > requested.toLineIndex
        || !purposes.has(scene.purpose as SceneDramaticPurposeV2) || !spatialIntents.has(scene.spatialIntent as ManualSpatialIntentV2)
        || !coverRoles.has(scene.coverRole as DramaticCoverRoleV1) || !arcIntents.has(scene.arcIntent as ManualArcIntentV2)
        || !continuity || Object.keys(continuity).some((key) => !continuityKeys.has(key))) return { reason: "scene-pack-v2-scene-invalid" };
      const preserve = Array.isArray(continuity.preserve)
        ? [...new Set(continuity.preserve.filter((item): item is ScenePreserveV2 => preserves.has(item as ScenePreserveV2)))] : [];
      const cues = parseCues(scene.cues, input, sceneIndex, fromLineIndex, toLineIndex);
      const linePerformances = sanitizeLinePerformancesV2(input.lyrics, scene.linePerformances, fromLineIndex, toLineIndex);
      const signatureClip = scene.signatureClip as SignatureChoreographySelectionV2;
      if (preserve.length === 0 || preserve.length > 2 || !changes.has(continuity.change as SceneChangeV2)
        || !leaves.has(continuity.leave as SceneLeaveV2) || !cues || !linePerformances
        || !["none", ...signatureChoreographyClipIDsV2].includes(signatureClip)
        || !signatureChoreographyFitsV2(input.lyrics, { toLineIndex, purpose: scene.purpose as SceneDramaticPurposeV2, linePerformances }, signatureClip)) {
        return { reason: "scene-pack-v2-continuity-invalid" };
      }
      scenes.push({
        id: `scene-pack-v2:${input.state.nextSceneIndex}:${sceneIndex}:${fromLineIndex}-${toLineIndex}`,
        fromLineIndex, toLineIndex, purpose: scene.purpose as SceneDramaticPurposeV2,
        spatialIntent: scene.spatialIntent as ManualSpatialIntentV2, coverRole: scene.coverRole as DramaticCoverRoleV1,
        arcIntent: scene.arcIntent as ManualArcIntentV2,
        continuity: { preserve, change: continuity.change as SceneChangeV2, leave: continuity.leave as SceneLeaveV2 }, cues, linePerformances, signatureClip,
      });
    }
    if (scenes.at(-1)?.toLineIndex !== requested.toLineIndex) return { reason: "scene-pack-v2-coverage-invalid" };
    const selectedSignatureClips = scenes.map((scene) => scene.signatureClip).filter((clip) => clip !== "none");
    const minimumSignatureClips = lineCount >= 10 ? 2 : lineCount >= 6 ? 1 : 0;
    if (selectedSignatureClips.length < minimumSignatureClips || selectedSignatureClips.length > 2
      || new Set(selectedSignatureClips).size !== selectedSignatureClips.length) return { reason: "scene-pack-v2-signature-clip-count-invalid" };
    const pack: ScenePackV2 = {
      version: "scene-pack-v2", bibleIdentity: input.bible.bibleIdentity, entryStateHash: input.state.stateHash,
      fromLineIndex: requested.fromLineIndex, toLineIndex: requested.toLineIndex, scenes,
    };
    const cards = compileScenePackV2(input.lyrics, input.bible, input.state, pack);
    return cards.length === scenes.length ? { response: cards } : { reason: "scene-pack-v2-local-compile-invalid" };
  },
  repair(value, aiValue, reason) {
    if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) return { reason };
    const outer = aiValue as Record<string, unknown>;
    const nested = [outer.scenePack, outer.pack, outer.windowIntent, outer.intent].find((candidate) =>
      candidate && typeof candidate === "object" && !Array.isArray(candidate));
    return nested ? scenePackRequestProfileV2.adapt(value, nested) : { reason };
  },
};
