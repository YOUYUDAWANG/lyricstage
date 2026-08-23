import type { LyricDocumentV0 } from "@lyricstage/contracts";
import type { DirectorRequestProfileV1 } from "./directorProviders";
import { compileWindowIntentV2ToSceneCardV1 } from "./directorV2Rolling";
import type { WindowIntentV2 } from "./directorV2Fixtures";
import {
  compactScenePackPromptInputV1,
  windowIntentSchemaV2,
  windowIntentSystemPromptV2,
} from "./rollingDirectorPrompt";
import type { DirectorBibleV1, RollingPerformanceStateV1, SceneCardV1 } from "./rollingDirector";

interface WindowIntentProfileInputV2 {
  lyrics: LyricDocumentV0;
  bible: DirectorBibleV1;
  state: RollingPerformanceStateV1;
  promptInput: unknown;
}

const spatialIntents = new Set(["hold", "split", "open", "stack"] as const);
const arcIntents = new Set(["hold", "lift", "break", "recall"] as const);
const coverRoles = new Set(["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"] as const);
const cueRoles = new Set(["refrain", "rupture", "release", "hold", "handoff", "recall"] as const);
const intentKeys = new Set([
  "version", "bibleIdentity", "entryStateHash", "fromLineIndex", "toLineIndex",
  "spatialIntent", "coverRole", "arcIntent", "cues",
]);
const cueKeys = new Set(["role", "fromLineIndex", "toLineIndex", "evidenceLineIndices", "confidence"]);

export const windowIntentRequestProfileV2: DirectorRequestProfileV1<SceneCardV1[]> = {
  version: "director-request-profile-v1",
  kind: "scene-pack",
  schemaName: "lyricstage_window_intent_v2",
  systemPrompt: windowIntentSystemPromptV2,
  schema: windowIntentSchemaV2,
  compactInput(value) {
    return compactScenePackPromptInputV1((value as WindowIntentProfileInputV2).promptInput);
  },
  adapt(value, aiValue) {
    const input = value as WindowIntentProfileInputV2;
    if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) {
      return { reason: "window-intent-not-object" };
    }
    const raw = aiValue as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !intentKeys.has(key))) {
      return { reason: "window-intent-concrete-visual-field" };
    }
    const requested = input.promptInput as { fromLineIndex?: unknown; toLineIndex?: unknown };
    const requestedFrom = Number.isInteger(requested.fromLineIndex) ? requested.fromLineIndex as number : -1;
    const requestedTo = Number.isInteger(requested.toLineIndex) ? requested.toLineIndex as number : -1;
    if (raw.version !== "window-intent-v2"
      || raw.bibleIdentity !== input.bible.bibleIdentity
      || raw.entryStateHash !== input.state.stateHash
      || raw.fromLineIndex !== requestedFrom
      || raw.toLineIndex !== requestedTo
      || !spatialIntents.has(raw.spatialIntent as never)
      || !coverRoles.has(raw.coverRole as never)
      || !arcIntents.has(raw.arcIntent as never)
      || !Array.isArray(raw.cues)
      || raw.cues.length > 3) return { reason: "window-intent-contract-invalid" };
    const validLineIndices = new Set(input.lyrics.lines
      .filter((line) => line.lineIndex >= requestedFrom && line.lineIndex <= requestedTo)
      .map((line) => line.lineIndex));
    const priorAndWindowLineIndices = new Set(input.lyrics.lines
      .filter((line) => line.lineIndex <= requestedTo)
      .map((line) => line.lineIndex));
    const cues: WindowIntentV2["cues"] = [];
    for (const [cueIndex, candidate] of raw.cues.entries()) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return { reason: "window-intent-cue-not-object" };
      }
      const cue = candidate as Record<string, unknown>;
      if (Object.keys(cue).some((key) => !cueKeys.has(key))) {
        return { reason: "window-intent-cue-concrete-visual-field" };
      }
      const fromLineIndex = Number.isInteger(cue.fromLineIndex) ? cue.fromLineIndex as number : -1;
      const toLineIndex = Number.isInteger(cue.toLineIndex) ? cue.toLineIndex as number : -1;
      const evidenceLineIndices = Array.isArray(cue.evidenceLineIndices)
        ? [...new Set(cue.evidenceLineIndices.filter((lineIndex): lineIndex is number => Number.isInteger(lineIndex)))]
        : [];
      const confidence = typeof cue.confidence === "number" && Number.isFinite(cue.confidence) ? cue.confidence : -1;
      const isRecall = cue.role === "recall";
      const evidenceAllowed = isRecall ? priorAndWindowLineIndices : validLineIndices;
      if (!cueRoles.has(cue.role as never)
        || fromLineIndex > toLineIndex
        || !validLineIndices.has(fromLineIndex)
        || !validLineIndices.has(toLineIndex)
        || evidenceLineIndices.length === 0
        || evidenceLineIndices.length > 4
        || evidenceLineIndices.some((lineIndex) => !evidenceAllowed.has(lineIndex))
        || isRecall && !evidenceLineIndices.some((lineIndex) => lineIndex < fromLineIndex)
        || confidence < 0.7 || confidence > 1) return { reason: "window-intent-cue-invalid" };
      cues.push({
        id: `rolling-v2-cue:${input.state.nextSceneIndex}:${cueIndex}:${String(cue.role)}:${fromLineIndex}-${toLineIndex}`,
        version: "semantic-cue-v2",
        role: cue.role as WindowIntentV2["cues"][number]["role"],
        fromLineIndex,
        ...(toLineIndex === fromLineIndex ? {} : { toLineIndex }),
        evidenceLineIndices,
        confidence,
      });
    }
    const intent: WindowIntentV2 = {
      version: "window-intent-v2",
      bibleIdentity: input.bible.bibleIdentity,
      entryStateHash: input.state.stateHash,
      id: `rolling-v2-window:${input.state.nextSceneIndex}:${requestedFrom}-${requestedTo}`,
      fromLineIndex: requestedFrom,
      toLineIndex: requestedTo,
      spatialIntent: raw.spatialIntent as WindowIntentV2["spatialIntent"],
      coverRole: raw.coverRole as WindowIntentV2["coverRole"],
      arcIntent: raw.arcIntent as WindowIntentV2["arcIntent"],
      cues,
    };
    const card = compileWindowIntentV2ToSceneCardV1(input.lyrics, input.bible, input.state, intent);
    return card ? { response: [card] } : { reason: "window-intent-local-compile-invalid" };
  },
  repair(value, aiValue, reason) {
    if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) return { reason };
    const outer = aiValue as Record<string, unknown>;
    const nested = [outer.windowIntent, outer.intent].find((candidate) =>
      candidate && typeof candidate === "object" && !Array.isArray(candidate));
    if (!nested) return { reason };
    return windowIntentRequestProfileV2.adapt(value, nested);
  },
};
