import {
  buildFullscreenPromptInput,
  directorVersion,
  finalizeFullscreenResponse,
  sanitizeFullscreenRequest,
} from "./directorContract.generated";
import {
  compactDirectorPromptInputV1,
  directorIntentSchemaV1,
  directorIntentSystemPromptV1,
  expandDirectorIntentV1,
  repairDirectorIntentV1,
} from "./directorIntent";
import {
  compactDirectorBiblePromptInputV1,
  compactScenePackPromptInputV1,
  directorBibleSchemaV1,
  directorBibleSystemPromptV1,
  scenePackSchemaV1,
  scenePackSystemPromptV1,
} from "./rollingDirectorPrompt";
import {
  advanceRollingPerformanceStateV1,
  compileLocalDirectorBibleV1,
  compileLocalSceneCardForWindowV1,
  directorBibleIdentityV1,
  sanitizeDirectorBibleV1,
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
  type DirectorBibleV1,
  type RollingPerformanceStateV1,
  type SceneCardV1,
} from "./rollingDirector";
import { stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import type { DirectorAttemptTimingV1 } from "./directorPlan";
import { isLocalProviderHostV1, sanitizeProviderEndpointV1 } from "./providerEndpoint";

export interface DirectorRequestProfileV1<TResponse = unknown> {
  version: "director-request-profile-v1";
  kind: "legacy" | "bible" | "scene-pack";
  schemaName: string;
  systemPrompt: string;
  schema: Record<string, unknown>;
  promptSchema?: Record<string, unknown>;
  compactInput(requestValue: unknown): unknown;
  adapt(requestValue: unknown, aiValue: unknown): { response?: TResponse; reason?: string };
  repair?(requestValue: unknown, aiValue: unknown, reason: string): { response?: TResponse; reason?: string };
}

export const legacyDirectorRequestProfileV1: DirectorRequestProfileV1 = {
  version: "director-request-profile-v1",
  kind: "legacy",
  schemaName: "lyricstage_director_intent",
  systemPrompt: directorIntentSystemPromptV1,
  schema: directorIntentSchemaV1,
  compactInput(requestValue) {
    const input = sanitizeFullscreenRequest(requestValue);
    return compactDirectorPromptInputV1(buildFullscreenPromptInput(input));
  },
  adapt(requestValue, aiValue) {
    const input = sanitizeFullscreenRequest(requestValue);
    const expanded = expandDirectorIntentV1(input, aiValue);
    const response = finalizeFullscreenResponse(input, expanded, `${directorVersion}-byok-intent-v1`) as { degraded?: unknown; degradedReason?: unknown };
    return response.degraded === true
      ? { reason: String(response.degradedReason ?? "invalid").slice(0, 260) }
      : { response };
  },
  repair(requestValue, aiValue, reason) {
    const input = sanitizeFullscreenRequest(requestValue);
    const expanded = expandDirectorIntentV1(input, aiValue);
    const repaired = repairDirectorIntentV1(input, expanded, reason);
    const response = finalizeFullscreenResponse(input, repaired, `${directorVersion}-byok-intent-v1`) as { degraded?: unknown; degradedReason?: unknown };
    return response.degraded === true
      ? { reason: String(response.degradedReason ?? reason).slice(0, 260) }
      : { response };
  },
};

interface BibleProfileInputV1 {
  lyrics: LyricDocumentV0;
  promptInput: unknown;
}

const rollingWorldSpatialModes = ["anchored", "panoramic", "cinematic", "orbital", "splitStage", "chorusWall"] as const;
const rollingWorldMotionLaws = ["drift", "flow", "pulse", "fall", "orbit", "converge", "suspend", "fracture"] as const;
const rollingArtworkRoles = ["anchor", "portal", "memory", "counterpoint", "atmosphere"] as const;
const rollingTextures = ["silk", "ink", "mist", "glass", "paper", "light"] as const;
const rollingMotifFamilies = ["thread", "window", "silhouette", "horizon", "fold", "firework", "fish", "petal", "snow"] as const;
const rollingMotifOrigins = ["lyric", "artwork", "silence", "voice", "structure"] as const;
const rollingLayouts = ["monument", "editorialSplit", "railLeading", "railTrailing", "duetDivide"] as const;
const rollingStageActions = ["thread.connect", "thread.snap", "window.reveal", "silhouette.trace", "sentence.horizon", "phrase.cascade", "memory.imprint", "duet.tension", "stage.fold", "motif.recall", "silence.vacuum"] as const;
const rollingCoverRoles = ["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"] as const;
const rollingConsequences = ["trace", "afterimage", "accumulation", "absence", "reframe", "return"] as const;
const rollingArtDirections = ["editorialKinetic", "neonRail", "paperCut", "liquidMemory", "monoImpact", "celestialGrid"] as const;
const rollingTypographies = ["jpGothic", "jpMincho", "cjkGrotesk", "latinDisplay", "monoEditorial"] as const;
const rollingPresentations = ["reading", "section", "hero", "duet", "aperture"] as const;

const directorBibleIntentPromptSchemaV1: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["premise", "emotionalArc", "world", "motifActor", "layoutBudget"],
  properties: {
    premise: { type: "string", minLength: 1, maxLength: 360 },
    emotionalArc: { type: "string", minLength: 1, maxLength: 480 },
    world: {
      type: "object",
      additionalProperties: false,
      required: ["spatialMode", "motionLaw", "artworkRole", "texture", "rationale"],
      properties: {
        spatialMode: { enum: [...rollingWorldSpatialModes] },
        motionLaw: { enum: [...rollingWorldMotionLaws] },
        artworkRole: { enum: [...rollingArtworkRoles] },
        texture: { enum: [...rollingTextures] },
        rationale: { type: "string", minLength: 1, maxLength: 360 },
      },
    },
    motifActor: {
      type: "object",
      additionalProperties: false,
      required: ["family", "origin", "relationship"],
      properties: {
        family: { enum: [...rollingMotifFamilies] },
        origin: { enum: [...rollingMotifOrigins] },
        relationship: { type: "string", minLength: 1, maxLength: 360 },
      },
    },
    layoutBudget: {
      type: "object",
      additionalProperties: false,
      required: ["baseLayout"],
      properties: { baseLayout: { enum: [...rollingLayouts] } },
    },
  },
};

const rollingEnum = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  typeof value === "string" && values.includes(value as T) ? value as T : fallback;
const rollingUnit = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
const rollingText = (value: unknown, maximum: number, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : fallback;

const repairDirectorBibleCandidateV1 = (lyrics: LyricDocumentV0, aiValue: unknown): DirectorBibleV1 | null => {
  if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) return null;
  const outer = aiValue as Record<string, unknown>;
  const wrapped = [outer.directorBible, outer.bible, outer.stageBible].find((value) =>
    value && typeof value === "object" && !Array.isArray(value));
  const raw = (wrapped ?? outer) as Record<string, unknown>;
  const rawWorld = raw.world && typeof raw.world === "object" && !Array.isArray(raw.world)
    ? raw.world as Record<string, unknown>
    : {};
  const rawMotif = raw.motifActor && typeof raw.motifActor === "object" && !Array.isArray(raw.motifActor)
    ? raw.motifActor as Record<string, unknown>
    : typeof raw.motif === "string" ? { relationship: raw.motif } : {};
  const layoutValue = raw.layoutBudget ?? raw.blocking;
  const rawLayout = layoutValue && typeof layoutValue === "object" && !Array.isArray(layoutValue)
    ? layoutValue as Record<string, unknown>
    : {};
  const premiseValue = raw.premise ?? raw.concept;
  const emotionalArcValue = raw.emotionalArc ?? raw.intensityArc;
  const meaningfulCategories = [
    typeof premiseValue === "string" && Boolean(premiseValue.trim()),
    typeof emotionalArcValue === "string" && Boolean(emotionalArcValue.trim()),
    Object.keys(rawWorld).length > 0,
    Object.keys(rawMotif).length > 0,
    Object.keys(rawLayout).length > 0,
  ].filter(Boolean).length;
  if (meaningfulCategories < 2) return null;

  // Keep the model's safe art/narrative choices, but use the deterministic local
  // dramaturgy as the structural repair spine. This prevents one invented trigger
  // or malformed partition from discarding an otherwise useful HTTP 200 response.
  const local = compileLocalDirectorBibleV1(lyrics);
  const motifFamily = rollingEnum(rawMotif.family, rollingMotifFamilies, local.motifActor.family);
  const withoutIdentity: Omit<DirectorBibleV1, "bibleIdentity"> = {
    ...local,
    premise: rollingText(premiseValue, 240, local.premise),
    emotionalArc: rollingText(emotionalArcValue, 320, local.emotionalArc),
    world: {
      ...local.world,
      spatialMode: rollingEnum(rawWorld.spatialMode, rollingWorldSpatialModes, local.world.spatialMode),
      motionLaw: rollingEnum(rawWorld.motionLaw, rollingWorldMotionLaws, local.world.motionLaw),
      artworkRole: rollingEnum(rawWorld.artworkRole, rollingArtworkRoles, local.world.artworkRole),
      texture: rollingEnum(rawWorld.texture, rollingTextures, local.world.texture),
      depth: rollingUnit(rawWorld.depth, local.world.depth),
      fluidity: rollingUnit(rawWorld.fluidity, local.world.fluidity),
      elasticity: rollingUnit(rawWorld.elasticity, local.world.elasticity),
      atmosphere: rollingUnit(rawWorld.atmosphere, local.world.atmosphere),
      rationale: rollingText(rawWorld.rationale, 320, local.world.rationale),
    },
    motifActor: {
      ...local.motifActor,
      family: motifFamily,
      origin: rollingEnum(rawMotif.origin, rollingMotifOrigins, local.motifActor.origin),
      relationship: rollingText(rawMotif.relationship, 360, local.motifActor.relationship),
    },
    signatureAnchors: local.signatureAnchors.map((anchor) => ({ ...anchor, actorFamily: motifFamily })),
    layoutBudget: {
      ...local.layoutBudget,
      baseLayout: rollingEnum(rawLayout.baseLayout, rollingLayouts, local.layoutBudget.baseLayout),
    },
  };
  const candidate: DirectorBibleV1 = { ...withoutIdentity, bibleIdentity: directorBibleIdentityV1(withoutIdentity) };
  return sanitizeDirectorBibleV1(lyrics, candidate);
};

export const directorBibleRequestProfileV1: DirectorRequestProfileV1<DirectorBibleV1> = {
  version: "director-request-profile-v1",
  kind: "bible",
  schemaName: "lyricstage_director_bible_v1",
  systemPrompt: directorBibleSystemPromptV1,
  schema: directorBibleSchemaV1,
  promptSchema: directorBibleIntentPromptSchemaV1,
  compactInput(value) {
    return compactDirectorBiblePromptInputV1((value as BibleProfileInputV1).promptInput);
  },
  adapt(value, aiValue) {
    const { lyrics } = value as BibleProfileInputV1;
    if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) return { reason: "director-bible-not-object" };
    const withoutIdentity = {
      ...(aiValue as Record<string, unknown>),
      version: "director-bible-v1" as const,
      recordingID: lyrics.recordingID,
      lyricsIdentity: stableHash32(lyrics),
    } as Omit<DirectorBibleV1, "bibleIdentity">;
    const candidate: DirectorBibleV1 = { ...withoutIdentity, bibleIdentity: directorBibleIdentityV1(withoutIdentity) };
    const response = sanitizeDirectorBibleV1(lyrics, candidate);
    return response ? { response } : { reason: "director-bible-contract-invalid" };
  },
  repair(value, aiValue) {
    const { lyrics } = value as BibleProfileInputV1;
    const response = repairDirectorBibleCandidateV1(lyrics, aiValue);
    return response ? { response } : { reason: "director-bible-local-repair-insufficient" };
  },
};

interface ScenePackProfileInputV1 {
  lyrics: LyricDocumentV0;
  bible: DirectorBibleV1;
  state: RollingPerformanceStateV1;
  promptInput: unknown;
}

export const scenePackRequestProfileV1: DirectorRequestProfileV1<SceneCardV1[]> = {
  version: "director-request-profile-v1",
  kind: "scene-pack",
  schemaName: "lyricstage_scene_pack_v1",
  systemPrompt: scenePackSystemPromptV1,
  schema: scenePackSchemaV1,
  compactInput(value) {
    return compactScenePackPromptInputV1((value as ScenePackProfileInputV1).promptInput);
  },
  adapt(value, aiValue) {
    const input = value as ScenePackProfileInputV1;
    const requestedWindow = input.promptInput as { fromLineIndex?: unknown; toLineIndex?: unknown };
    const requestedFrom = Number.isInteger(requestedWindow.fromLineIndex) ? requestedWindow.fromLineIndex as number : -1;
    const requestedTo = Number.isInteger(requestedWindow.toLineIndex) ? requestedWindow.toLineIndex as number : -1;
    const pack = aiValue && typeof aiValue === "object" && !Array.isArray(aiValue)
      ? aiValue as { version?: unknown; bibleIdentity?: unknown; entryStateHash?: unknown; scenes?: unknown }
      : undefined;
    if (!pack || pack.version !== "scene-pack-v1"
      || pack.bibleIdentity !== input.bible.bibleIdentity
      || pack.entryStateHash !== input.state.stateHash) {
      return { reason: "scene-pack-identity-invalid" };
    }
    const rawScenes = Array.isArray(pack.scenes)
      ? pack.scenes
      : [];
    if (rawScenes.length !== 1) return { reason: "scene-pack-count-invalid" };
    const cards: SceneCardV1[] = [];
    let state = input.state;
    for (const raw of rawScenes) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "scene-card-not-object" };
      const item = raw as Record<string, unknown>;
      const fromLineIndex = Number.isInteger(item.fromLineIndex) ? item.fromLineIndex as number : -1;
      const toLineIndex = Number.isInteger(item.toLineIndex) ? item.toLineIndex as number : -1;
      if (fromLineIndex < requestedFrom || toLineIndex > requestedTo) return { reason: "scene-card-outside-requested-window" };
      if (fromLineIndex !== requestedFrom || toLineIndex !== requestedTo) return { reason: "scene-card-window-incomplete" };
      const lines = input.lyrics.lines.filter((line) => line.lineIndex >= fromLineIndex && line.lineIndex <= toLineIndex);
      if (lines.length === 0) return { reason: "scene-card-range-invalid" };
      const anchor = input.bible.signatureAnchors.find((candidate) =>
        candidate.fromLineIndex >= fromLineIndex && candidate.toLineIndex <= toLineIndex);
      const rawSignature = item.signatureMoment && typeof item.signatureMoment === "object" && !Array.isArray(item.signatureMoment)
        ? item.signatureMoment as Record<string, unknown>
        : undefined;
      if (Boolean(anchor) !== Boolean(rawSignature)
        || (anchor && rawSignature?.anchorID !== undefined && rawSignature.anchorID !== anchor.id)) {
        return { reason: "scene-card-signature-anchor-invalid" };
      }
      const signatureMoment = anchor && rawSignature ? {
        ...anchor,
        stageAction: rawSignature.stageAction,
        coverRole: rawSignature.coverRole,
        consequence: rawSignature.consequence,
      } : undefined;
      const fromMs = lines[0]!.fromMs;
      const toMs = Math.max(...lines.map((line) => line.toMs));
      const gestures = Array.isArray(item.gestures) ? item.gestures.map((gesture) =>
        gesture && typeof gesture === "object" && !Array.isArray(gesture)
          ? { ...(gesture as Record<string, unknown>), version: "lyric-gesture-v1" }
          : gesture) : [];
      const effects = Array.isArray(item.effects) ? item.effects.map((effect, effectIndex) => {
        if (!effect || typeof effect !== "object" || Array.isArray(effect)) return effect;
        const rawEffect = effect as Record<string, unknown>;
        const rawEvidence = rawEffect.evidence && typeof rawEffect.evidence === "object" && !Array.isArray(rawEffect.evidence)
          ? rawEffect.evidence as Record<string, unknown>
          : {};
        return {
          ...rawEffect,
          version: "effect-recipe-v1",
          id: `rolling-ai-effect:${state.nextSceneIndex}:${effectIndex}`,
          sectionID: "$pending",
          fromMs,
          toMs,
          evidence: {
            songMotif: input.bible.motifActor.relationship,
            sectionTriggers: rawEvidence.sectionTriggers,
            lineIndices: rawEvidence.lineIndices,
            rationale: rawEvidence.rationale,
            confidence: rawEvidence.confidence,
          },
        };
      }) : [];
      const withoutID = {
        ...item,
        version: "scene-card-v1" as const,
        recordingID: input.lyrics.recordingID,
        lyricsIdentity: input.bible.lyricsIdentity,
        bibleIdentity: input.bible.bibleIdentity,
        sceneIndex: state.nextSceneIndex,
        fromLineIndex,
        toLineIndex,
        fromMs,
        toMs,
        entryStateHash: state.stateHash,
        entryMotifState: state.motifState,
        gestures,
        effects,
        ...(signatureMoment ? { signatureMoment } : { signatureMoment: undefined }),
      } as Omit<SceneCardV1, "sceneID">;
      const candidate: SceneCardV1 = { ...withoutID, sceneID: sceneCardIdentityV1(withoutID) };
      candidate.effects = candidate.effects?.map((effect) => ({ ...effect, sectionID: candidate.sceneID })) ?? [];
      const card = sanitizeSceneCardV1(input.lyrics, input.bible, state, candidate);
      if (!card) return { reason: "scene-card-contract-invalid" };
      cards.push(card);
      state = advanceRollingPerformanceStateV1(state, card);
    }
    return { response: cards };
  },
  repair(value, aiValue, reason) {
    const input = value as ScenePackProfileInputV1;
    if (!aiValue || typeof aiValue !== "object" || Array.isArray(aiValue)) return { reason };
    const outer = aiValue as Record<string, unknown>;
    const wrapped = [outer.scenePack, outer.pack, outer.stageScenes].find((candidate) =>
      candidate && typeof candidate === "object" && !Array.isArray(candidate));
    const raw = (wrapped ?? outer) as Record<string, unknown>;
    const rawScenes = Array.isArray(raw.scenes) ? raw.scenes
      : Array.isArray(raw.sceneCards) ? raw.sceneCards
        : Array.isArray(raw.sections) ? raw.sections
        : undefined;
    if (!rawScenes) return { reason: "scene-pack-local-repair-insufficient" };
    const repairedScenes = rawScenes.map((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
      const scene = candidate as Record<string, unknown>;
      const fromLineIndex = Number.isInteger(scene.fromLineIndex) ? scene.fromLineIndex as number : -1;
      const toLineIndex = Number.isInteger(scene.toLineIndex) ? scene.toLineIndex as number : -1;
      const anchor = input.bible.signatureAnchors.find((item) =>
        item.fromLineIndex >= fromLineIndex && item.toLineIndex <= toLineIndex);
      if (!anchor) return { ...scene, signatureMoment: undefined };
      const rawSignature = scene.signatureMoment && typeof scene.signatureMoment === "object" && !Array.isArray(scene.signatureMoment)
        ? scene.signatureMoment as Record<string, unknown>
        : {};
      const finalAnchor = anchor.id === input.bible.signatureAnchors.at(-1)?.id;
      const defaultAction = finalAnchor ? "motif.recall"
        : anchor.actorFamily === "thread" ? "thread.connect"
          : anchor.actorFamily === "window" ? "window.reveal"
            : anchor.actorFamily === "silhouette" ? "silhouette.trace"
              : anchor.actorFamily === "horizon" ? "sentence.horizon"
                : anchor.actorFamily === "fold" ? "stage.fold" : "phrase.cascade";
      return {
        ...scene,
        signatureMoment: {
          ...rawSignature,
          anchorID: anchor.id,
          stageAction: rollingEnum(rawSignature.stageAction, rollingStageActions, defaultAction),
          coverRole: rollingEnum(rawSignature.coverRole, rollingCoverRoles, finalAnchor ? "memory" : "origin"),
          consequence: rollingEnum(rawSignature.consequence, rollingConsequences, finalAnchor ? "return" : "trace"),
        },
      };
    });
    const normalized = scenePackRequestProfileV1.adapt(value, {
      ...raw,
      version: "scene-pack-v1",
      bibleIdentity: input.bible.bibleIdentity,
      entryStateHash: input.state.stateHash,
      scenes: repairedScenes,
    });
    if (normalized.response) return normalized;

    const requestedWindow = input.promptInput as { fromLineIndex?: unknown; toLineIndex?: unknown };
    const requestedFrom = Number.isInteger(requestedWindow.fromLineIndex) ? requestedWindow.fromLineIndex as number : -1;
    const requestedTo = Number.isInteger(requestedWindow.toLineIndex) ? requestedWindow.toLineIndex as number : -1;
    const localCard = compileLocalSceneCardForWindowV1(input.lyrics, input.bible, input.state, requestedFrom, requestedTo);
    const rawScene = repairedScenes.find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) as Record<string, unknown> | undefined;
    if (!localCard || !rawScene) return { reason: normalized.reason ?? "scene-pack-local-repair-insufficient" };
    const meaningfulCategories = [
      typeof rawScene.intention === "string" && Boolean(rawScene.intention.trim()),
      typeof rawScene.artDirection === "string",
      typeof rawScene.typography === "string",
      typeof rawScene.presentation === "string",
    ].filter(Boolean).length;
    if (meaningfulCategories < 2) return { reason: normalized.reason ?? "scene-pack-local-repair-insufficient" };
    const withoutID: Omit<SceneCardV1, "sceneID"> = {
      ...localCard,
      intention: rollingText(rawScene.intention, 320, localCard.intention),
      artDirection: rollingEnum(rawScene.artDirection, rollingArtDirections, localCard.artDirection),
      typography: rollingEnum(rawScene.typography, rollingTypographies, localCard.typography),
      presentation: rollingEnum(rawScene.presentation, rollingPresentations, localCard.presentation),
    };
    const sceneID = sceneCardIdentityV1(withoutID);
    const candidate: SceneCardV1 = {
      ...withoutID,
      sceneID,
      effects: withoutID.effects.map((effect) => ({ ...effect, sectionID: sceneID })),
    };
    const response = sanitizeSceneCardV1(input.lyrics, input.bible, input.state, candidate);
    return response ? { response: [response] } : { reason: normalized.reason ?? "scene-pack-local-repair-invalid" };
  },
};

export type DirectorProviderProtocolV1 =
  | "openai-compatible"
  | "openai-responses"
  | "gemini"
  | "anthropic";

export interface DirectorProviderConnectionV1 {
  protocol: DirectorProviderProtocolV1;
  endpoint: string;
  apiKey: string;
}

export interface DirectorProviderConfigurationV1 extends DirectorProviderConnectionV1 {
  model: string;
}

export interface DirectorBYOKConfigurationV1 {
  version: "lyricstage-director-byok-v1";
  primary: DirectorProviderConfigurationV1;
  fallback?: DirectorProviderConfigurationV1;
}

export interface PublicDirectorProviderConfigurationV1 {
  protocol: DirectorProviderProtocolV1;
  endpoint: string;
  model: string;
  hasApiKey: boolean;
}

export interface PublicDirectorBYOKConfigurationV1 {
  version: "lyricstage-director-byok-v1";
  configured: boolean;
  primary: PublicDirectorProviderConfigurationV1;
  fallback?: PublicDirectorProviderConfigurationV1;
}

export interface DirectorProviderDiagnosticsV1 {
  providerMs: number;
  contractMs: number;
  inputBytes: number;
  outputBytes: number;
  attempts: DirectorAttemptTimingV1[];
}

export interface DirectorProviderExecutionV1 {
  response: unknown;
  provider: PublicDirectorProviderConfigurationV1;
  diagnostics: DirectorProviderDiagnosticsV1;
}

const protocols = new Set<DirectorProviderProtocolV1>([
  "openai-compatible",
  "openai-responses",
  "gemini",
  "anthropic",
]);

export const defaultDirectorProviderEndpointV1 = (protocol: DirectorProviderProtocolV1): string => {
  if (protocol === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  if (protocol === "anthropic") return "https://api.anthropic.com/v1";
  return "https://api.openai.com/v1";
};

export const sanitizeDirectorProviderConnectionV1 = (value: unknown): DirectorProviderConnectionV1 | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const protocol = typeof candidate.protocol === "string" && protocols.has(candidate.protocol as DirectorProviderProtocolV1)
    ? candidate.protocol as DirectorProviderProtocolV1
    : undefined;
  if (!protocol) return undefined;
  const endpoint = sanitizeProviderEndpointV1(candidate.endpoint);
  const apiKey = typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "";
  if (!endpoint || apiKey.length > 4096) return undefined;
  const url = new URL(endpoint);
  if (!apiKey && url.protocol === "https:" && !isLocalProviderHostV1(url.hostname)) return undefined;
  return { protocol, endpoint, apiKey };
};

const normalizeProvider = (value: unknown): DirectorProviderConfigurationV1 | undefined => {
  const connection = sanitizeDirectorProviderConnectionV1(value);
  if (!connection || !value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
  if (!model || model.length > 180) return undefined;
  return { ...connection, model };
};

export const sanitizeDirectorBYOKConfigurationV1 = (value: unknown): DirectorBYOKConfigurationV1 | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== "lyricstage-director-byok-v1") return undefined;
  const primary = normalizeProvider(candidate.primary);
  if (!primary) return undefined;
  const fallback = candidate.fallback === undefined || candidate.fallback === null
    ? undefined
    : normalizeProvider(candidate.fallback);
  if (candidate.fallback && !fallback) return undefined;
  return { version: "lyricstage-director-byok-v1", primary, ...(fallback ? { fallback } : {}) };
};

const publicProvider = (provider: DirectorProviderConfigurationV1): PublicDirectorProviderConfigurationV1 => ({
  protocol: provider.protocol,
  endpoint: provider.endpoint,
  model: provider.model,
  hasApiKey: Boolean(provider.apiKey),
});

export const publicDirectorBYOKConfigurationV1 = (
  configuration: DirectorBYOKConfigurationV1,
): PublicDirectorBYOKConfigurationV1 => ({
  version: configuration.version,
  configured: true,
  primary: publicProvider(configuration.primary),
  ...(configuration.fallback ? { fallback: publicProvider(configuration.fallback) } : {}),
});

export const directorBYOKCacheIdentityV1 = (configuration: DirectorBYOKConfigurationV1): unknown => ({
  version: "director-byok-cache-identity-v2",
  contract: `${directorVersion}-byok-intent-v1`,
  providers: [configuration.primary, configuration.fallback].filter(Boolean).map((provider) => {
    const item = provider as DirectorProviderConfigurationV1;
    return { protocol: item.protocol, endpoint: item.endpoint, model: item.model };
  }),
});

class ProviderHTTPError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

class DirectorAttemptBudgetError extends Error {}

interface AttemptContext {
  deadlineUnixMs: number;
  maxAttempts: number;
  signal?: AbortSignal;
  attempts: DirectorAttemptTimingV1[];
  inputBytes: number;
  outputBytes: number;
  unsupportedFormatKeys: Set<string>;
}

export class DirectorBYOKExecutionErrorV1 extends Error {
  constructor(message: string, readonly diagnostics: DirectorProviderDiagnosticsV1) {
    super(message);
  }
}

export const directorBYOKDiagnosticsFromErrorV1 = (error: unknown): DirectorProviderDiagnosticsV1 | undefined =>
  error instanceof DirectorBYOKExecutionErrorV1 ? error.diagnostics : undefined;

const textBytes = (value: string): number => new TextEncoder().encode(value).byteLength;
const remainingBudgetMs = (context: AttemptContext): number => Math.max(0, context.deadlineUnixMs - Date.now());

const markLastAttempt = (
  context: AttemptContext,
  outcome: DirectorAttemptTimingV1["outcome"],
): void => {
  const last = context.attempts.at(-1);
  if (last) last.outcome = outcome;
};

const diagnostics = (context: AttemptContext, contractMs: number): DirectorProviderDiagnosticsV1 => ({
  providerMs: Math.round(context.attempts.reduce((sum, attempt) => sum + attempt.elapsedMs, 0)),
  contractMs: Math.round(contractMs),
  inputBytes: context.inputBytes,
  outputBytes: context.outputBytes,
  attempts: context.attempts.map((attempt) => ({ ...attempt })),
});

const providerHTTPErrorDetail = (text: string): string => {
  const compact = text.trim().replace(/\s+/gu, " ");
  if (!compact) return "";
  try {
    const payload = JSON.parse(text) as {
      error?: {
        status?: unknown;
        message?: unknown;
        details?: Array<{ reason?: unknown }>;
      };
    };
    const status = typeof payload.error?.status === "string" ? payload.error.status.trim() : "";
    const message = typeof payload.error?.message === "string" ? payload.error.message.trim() : "";
    const reason = payload.error?.details?.find((detail) => typeof detail?.reason === "string")?.reason;
    const parts = [status, message, typeof reason === "string" ? reason.trim() : ""]
      .filter((value, index, values) => value && values.indexOf(value) === index);
    if (parts.length > 0) return parts.join(" · ").replace(/\s+/gu, " ").slice(0, 360);
  } catch {
    // Non-JSON providers still get a bounded single-line diagnostic below.
  }
  return compact.slice(0, 360);
};

const requestJSON = async (
  provider: DirectorProviderConfigurationV1,
  format: string,
  url: string,
  init: RequestInit & { body: string },
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  if (context.attempts.length >= context.maxAttempts) throw new DirectorAttemptBudgetError("导演网络尝试已达到本次上限");
  const remaining = remainingBudgetMs(context);
  if (remaining <= 0) throw new DirectorAttemptBudgetError("导演生成超过 45 秒总预算");
  if (context.signal?.aborted) throw new DOMException("导演请求已取消", "AbortError");
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  context.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), Math.min(35_000, remaining));
  const startedAt = Date.now();
  const attempt: DirectorAttemptTimingV1 = {
    sequence: context.attempts.length + 1,
    protocol: provider.protocol,
    model: provider.model,
    format,
    elapsedMs: 0,
    responseBytes: 0,
    outcome: "parse-error",
  };
  context.inputBytes += textBytes(init.body);
  context.attempts.push(attempt);
  try {
    const response = await fetchImplementation(url, { ...init, signal: controller.signal });
    attempt.firstByteMs = Date.now() - startedAt;
    attempt.status = response.status;
    const text = await response.text();
    attempt.responseBytes = textBytes(text);
    const trimmedText = text.trim();
    attempt.responseShape = !trimmedText ? "empty"
      : /<(?:!doctype|html|body)\b/iu.test(trimmedText) ? "html"
        : trimmedText.startsWith("data:") || /(?:^|\n)data:/u.test(trimmedText) ? "sse"
          : /(?:^|\n)0:/u.test(trimmedText) ? "data-stream"
            : trimmedText.split(/\r?\n/u).filter(Boolean).every((line) => {
              try { JSON.parse(line); return true; } catch { return false; }
            }) ? "ndjson"
              : "plain-text";
    context.outputBytes += attempt.responseBytes;
    attempt.elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      attempt.outcome = "http-error";
      const detail = providerHTTPErrorDetail(text);
      throw new ProviderHTTPError(response.status, `HTTP ${response.status}${detail ? ` · ${detail}` : ""}`);
    }
    try {
      const value = JSON.parse(text) as unknown;
      attempt.responseShape = "json";
      attempt.outcome = "ready";
      return value;
    } catch {
      const eventValues = text.split(/\r?\n/u).flatMap((line) => {
        const trimmed = line.trim();
        const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim()
          : trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed : "";
        if (!payload || payload === "[DONE]") return [];
        try {
          return [JSON.parse(payload) as unknown];
        } catch {
          return [];
        }
      });
      if (eventValues.length > 0) {
        attempt.outcome = "ready";
        return { sseEvents: eventValues };
      }
      const dataStreamText = text.split(/\r?\n/u).flatMap((line) => {
        const match = line.trim().match(/^0:(.+)$/u);
        if (!match?.[1]) return [];
        try {
          const value = JSON.parse(match[1]) as unknown;
          return typeof value === "string" ? [value] : [];
        } catch {
          return [];
        }
      }).join("");
      if (dataStreamText) {
        attempt.responseShape = "data-stream";
        attempt.outcome = "ready";
        return { rawText: dataStreamText };
      }
      if (!/<(?:!doctype|html|body)\b/iu.test(text) && /\{[\s\S]*\}/u.test(text)) {
        attempt.outcome = "ready";
        return { rawText: text };
      }
      attempt.outcome = "parse-error";
      throw new Error("供应商没有返回有效 JSON");
    }
  } catch (error) {
    attempt.elapsedMs = Date.now() - startedAt;
    if (context.signal?.aborted) {
      attempt.outcome = "network-error";
      throw new DOMException("导演请求已取消", "AbortError");
    }
    if (error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))) {
      attempt.outcome = "timeout";
      throw new Error("导演供应商请求超时");
    }
    if (attempt.status === undefined && !(error instanceof ProviderHTTPError) && attempt.outcome === "parse-error") {
      attempt.outcome = "network-error";
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    context.signal?.removeEventListener("abort", abortFromCaller);
  }
};

const parseJSONObject = (text: string): unknown => {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const withoutReasoning = trimmed
    .replace(/<think>[\s\S]*?<\/think>/giu, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/giu, "")
    .trim();
  if (withoutReasoning && withoutReasoning !== trimmed) candidates.push(withoutReasoning);
  const fenced = [...withoutReasoning.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)].map((match) => match[1]?.trim() ?? "").filter(Boolean);
  candidates.push(...fenced);
  const scan = (value: string): string[] => {
    const output: string[] = [];
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index]!;
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') {
        quoted = true;
        continue;
      }
      if (character === "{") {
        if (depth === 0) start = index;
        depth += 1;
      } else if (character === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          output.push(value.slice(start, index + 1));
          start = -1;
        }
      }
    }
    return output;
  };
  candidates.push(...scan(withoutReasoning));
  for (const candidate of [...new Set(candidates)]) {
    try {
      const direct = JSON.parse(candidate) as unknown;
      if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;
    } catch {
      // Try the next bounded object candidate.
    }
  }
  throw new Error("模型没有返回 JSON 对象");
};

const extractProviderText = (value: unknown, depth = 0): string => {
  if (depth > 8 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => extractProviderText(item, depth + 1)).filter(Boolean).join("");
  if (typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  for (const key of ["text", "output_text", "value", "content", "arguments", "reasoning_content", "rawText"] as const) {
    const extracted = extractProviderText(object[key], depth + 1);
    if (extracted) return extracted;
  }
  if (["version", "premise", "concept", "scenes", "sections", "directorBible", "scenePack"].some((key) => key in object)) {
    return JSON.stringify(object);
  }
  for (const key of ["parsed", "response", "result", "data", "message", "delta", "function", "tool_calls", "choices", "output", "steps", "candidates", "parts", "sseEvents"] as const) {
    const extracted = extractProviderText(object[key], depth + 1);
    if (extracted) return extracted;
  }
  return "";
};

const findProviderJSONText = (value: unknown, depth = 0): string => {
  if (depth > 10 || value === null || value === undefined) return "";
  if (typeof value === "string") {
    return /(?:\{|```|<think>|<analysis>)/iu.test(value) ? value : "";
  }
  if (Array.isArray(value)) return value.map((item) => findProviderJSONText(item, depth + 1)).filter(Boolean).join("");
  if (typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  if (["version", "premise", "concept", "scenes", "sections", "directorBible", "scenePack"].some((key) => key in object)) {
    return JSON.stringify(object);
  }
  for (const nested of Object.values(object)) {
    const extracted = findProviderJSONText(nested, depth + 1);
    if (extracted) return extracted;
  }
  return "";
};

const parseProviderObject = (text: string, context: AttemptContext, missingMessage: string): unknown => {
  if (!text) {
    markLastAttempt(context, "parse-error");
    throw new Error(missingMessage);
  }
  try {
    return parseJSONObject(text);
  } catch (error) {
    markLastAttempt(context, "parse-error");
    throw error;
  }
};

const joinURL = (endpoint: string, suffix: string, fullSuffix: RegExp): string =>
  fullSuffix.test(endpoint) ? endpoint : `${endpoint}${suffix}`;

const formatCapabilityKey = (provider: DirectorProviderConfigurationV1, format: string): string =>
  `${provider.protocol}:${provider.endpoint}:${provider.model}:${format}`;

const promptWithOutputContract = (userPrompt: string, profile: DirectorRequestProfileV1): string => {
  let request: unknown = userPrompt;
  try { request = JSON.parse(userPrompt) as unknown; } catch { /* keep the bounded prompt text */ }
  return JSON.stringify({ request, outputContract: profile.promptSchema ?? profile.schema });
};

const openAIChat = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  profile: DirectorRequestProfileV1,
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/chat/completions", /\/chat\/completions$/u);
  const formats: Array<{ name: string; value: unknown }> = [
    { name: "json-schema", value: { type: "json_schema", json_schema: { name: profile.schemaName, strict: false, schema: profile.schema } } },
    { name: "json-object", value: { type: "json_object" } },
  ];
  let lastError: unknown;
  for (const format of formats) {
    if (context.attempts.length >= context.maxAttempts) break;
    const capabilityKey = formatCapabilityKey(provider, format.name);
    if (context.unsupportedFormatKeys.has(capabilityKey)) continue;
    try {
      const body = JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: profile.systemPrompt },
          { role: "user", content: format.name === "json-object" ? promptWithOutputContract(userPrompt, profile) : userPrompt },
        ],
        max_tokens: 8_192,
        response_format: format.value,
      });
      const raw = await requestJSON(provider, format.name, url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body,
      }, context, fetchImplementation) as {
        choices?: Array<{ message?: { content?: unknown; parsed?: unknown; reasoning_content?: unknown; tool_calls?: unknown } }>;
      };
      const message = raw.choices?.[0]?.message;
      const text = extractProviderText(message?.content)
        || extractProviderText(message?.parsed)
        || extractProviderText(message?.reasoning_content)
        || extractProviderText(message?.tool_calls)
        || extractProviderText(raw)
        || findProviderJSONText(raw);
      return parseProviderObject(text, context, "模型响应缺少文本");
    } catch (error) {
      lastError = error;
      if (format.name === "json-schema" && error instanceof ProviderHTTPError && [400, 404, 422].includes(error.status)) {
        context.unsupportedFormatKeys.add(capabilityKey);
      }
      if (!(error instanceof ProviderHTTPError) || ![400, 404, 422].includes(error.status)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI-compatible 请求失败");
};

const openAIResponses = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  profile: DirectorRequestProfileV1,
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/responses", /\/responses$/u);
  const formats: Array<{ name: string; value: unknown }> = [
    { name: "json-schema", value: { type: "json_schema", name: profile.schemaName, strict: false, schema: profile.schema } },
    { name: "json-object", value: { type: "json_object" } },
  ];
  let lastError: unknown;
  for (const format of formats) {
    if (context.attempts.length >= context.maxAttempts) break;
    const capabilityKey = formatCapabilityKey(provider, format.name);
    if (context.unsupportedFormatKeys.has(capabilityKey)) continue;
    try {
      const body = JSON.stringify({
        model: provider.model,
        instructions: profile.systemPrompt,
        input: [{ role: "user", content: [{ type: "input_text", text: format.name === "json-object" ? promptWithOutputContract(userPrompt, profile) : userPrompt }] }],
        max_output_tokens: 8_192,
        store: false,
        text: { format: format.value },
      });
      const raw = await requestJSON(provider, format.name, url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body,
      }, context, fetchImplementation) as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
      };
      const text = typeof raw.output_text === "string"
        ? raw.output_text
        : raw.output?.flatMap((item) => item.content ?? []).flatMap((part) =>
          (part.type === "output_text" || part.type === "text") && typeof part.text === "string" ? [part.text] : []).join("")
          || extractProviderText(raw);
      return parseProviderObject(text, context, "模型响应缺少 output_text");
    } catch (error) {
      lastError = error;
      if (format.name === "json-schema" && error instanceof ProviderHTTPError && [400, 404, 422].includes(error.status)) {
        context.unsupportedFormatKeys.add(capabilityKey);
      }
      if (!(error instanceof ProviderHTTPError) || ![400, 404, 422].includes(error.status)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI Responses 请求失败");
};

const gemini = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  profile: DirectorRequestProfileV1,
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const model = provider.model.replace(/^models\//u, "");
  const endpointURL = new URL(provider.endpoint);
  const vertexExpress = endpointURL.hostname === "aiplatform.googleapis.com"
    && /\/publishers\/google(?:\/|$)/u.test(endpointURL.pathname);
  if (!vertexExpress && !/:generateContent$/u.test(provider.endpoint)) {
    const interactionsURL = `${provider.endpoint}/interactions`;
    try {
      const body = JSON.stringify({
        model,
        input: userPrompt,
        system_instruction: profile.systemPrompt,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: profile.schema,
        },
        store: false,
        generation_config: {
          max_output_tokens: 8_192,
          thinking_level: "low",
        },
      });
      const raw = await requestJSON(provider, "interactions-json-schema", interactionsURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { "x-goog-api-key": provider.apiKey } : {}),
        },
        body,
      }, context, fetchImplementation) as {
        output_text?: unknown;
        steps?: Array<{ type?: unknown; content?: Array<{ type?: unknown; text?: unknown }> }>;
      };
      const text = typeof raw.output_text === "string"
        ? raw.output_text
        : raw.steps?.flatMap((step) => step.type === "model_output" ? step.content ?? [] : [])
          .flatMap((part) => part.type === "text" && typeof part.text === "string" ? [part.text] : [])
          .join("") || extractProviderText(raw);
      return parseProviderObject(text, context, "Gemini Interactions 响应缺少文本");
    } catch (error) {
      if (!(error instanceof ProviderHTTPError) || ![400, 404, 405, 422].includes(error.status)) throw error;
    }
  }
  const url = /:generateContent$/u.test(provider.endpoint)
    ? provider.endpoint
    : `${provider.endpoint}/models/${encodeURIComponent(model)}:generateContent`;
  const generationConfigs: Array<{ name: string; value: Record<string, unknown> }> = vertexExpress
    ? [{
      name: "json-object",
      value: {
        temperature: 0.45,
        maxOutputTokens: 8_192,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }]
    : [
      {
        name: "json-schema",
        value: {
          temperature: 0.45,
          maxOutputTokens: 8_192,
          responseFormat: {
            text: {
              mimeType: "application/json",
              schema: profile.schema,
            },
          },
        },
      },
      { name: "legacy-json-schema", value: { temperature: 0.45, maxOutputTokens: 8_192, responseMimeType: "application/json", responseJsonSchema: profile.schema } },
      { name: "json-object", value: { temperature: 0.45, maxOutputTokens: 8_192, responseMimeType: "application/json" } },
    ];
  let lastError: unknown;
  for (const generationConfig of generationConfigs) {
    if (context.attempts.length >= context.maxAttempts) break;
    try {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: profile.systemPrompt }] },
        contents: [{
          role: "user",
          parts: [{ text: generationConfig.name === "json-object" ? promptWithOutputContract(userPrompt, profile) : userPrompt }],
        }],
        generationConfig: generationConfig.value,
      });
      const raw = await requestJSON(provider, generationConfig.name, url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { "x-goog-api-key": provider.apiKey } : {}),
        },
        body,
      }, context, fetchImplementation) as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
      const text = raw.candidates?.[0]?.content?.parts?.flatMap((part) => typeof part.text === "string" ? [part.text] : []).join("")
        || extractProviderText(raw);
      return parseProviderObject(text, context, "Gemini 响应缺少文本");
    } catch (error) {
      lastError = error;
      if (!(error instanceof ProviderHTTPError) || ![400, 404, 422].includes(error.status)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini 请求失败");
};

const anthropic = async (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  profile: DirectorRequestProfileV1,
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  const url = joinURL(provider.endpoint, "/messages", /\/messages$/u);
  const body = JSON.stringify({
    model: provider.model,
    system: profile.systemPrompt,
    messages: [{ role: "user", content: `${userPrompt}\n\nReturn exactly one JSON object and no markdown fence.` }],
    max_tokens: 8_192,
    temperature: 0.45,
  });
  const raw = await requestJSON(provider, "json-prompt", url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      ...(provider.apiKey ? { "x-api-key": provider.apiKey } : {}),
    },
    body,
  }, context, fetchImplementation) as { content?: Array<{ type?: string; text?: unknown }> };
  const text = raw.content?.flatMap((part) => part.type === "text" && typeof part.text === "string" ? [part.text] : []).join("")
    || extractProviderText(raw);
  return parseProviderObject(text, context, "Anthropic 响应缺少文本");
};

const generate = (
  provider: DirectorProviderConfigurationV1,
  userPrompt: string,
  profile: DirectorRequestProfileV1,
  context: AttemptContext,
  fetchImplementation: typeof fetch,
): Promise<unknown> => {
  if (provider.protocol === "gemini") return gemini(provider, userPrompt, profile, context, fetchImplementation);
  if (provider.protocol === "anthropic") return anthropic(provider, userPrompt, profile, context, fetchImplementation);
  if (provider.protocol === "openai-responses") return openAIResponses(provider, userPrompt, profile, context, fetchImplementation);
  return openAIChat(provider, userPrompt, profile, context, fetchImplementation);
};

export const executeDirectorBYOKProfileV1 = async <TResponse>(
  configuration: DirectorBYOKConfigurationV1,
  requestValue: unknown,
  profile: DirectorRequestProfileV1<TResponse>,
  fetchImplementation: typeof fetch = fetch,
  budgetMs = 45_000,
  maxAttempts = 3,
  signal?: AbortSignal,
): Promise<DirectorProviderExecutionV1 & { response: TResponse }> => {
  const providerPromptInput = profile.compactInput(requestValue) as Record<string, unknown>;
  const context: AttemptContext = {
    deadlineUnixMs: Date.now() + Math.max(1, Math.min(45_000, budgetMs)),
    maxAttempts: Math.max(1, Math.min(3, Math.floor(maxAttempts))),
    signal,
    attempts: [],
    inputBytes: 0,
    outputBytes: 0,
    unsupportedFormatKeys: new Set<string>(),
  };
  const providers = [configuration.primary, configuration.fallback].filter(Boolean) as DirectorProviderConfigurationV1[];
  const failures: string[] = [];
  let contractMs = 0;
  for (const [providerIndex, provider] of providers.entries()) {
    let retryContext = "";
    for (let generationAttempt = 0; generationAttempt < 2; generationAttempt += 1) {
      const reservedForFallback = providers.length - providerIndex - 1;
      if (
        context.attempts.length >= context.maxAttempts
        || context.maxAttempts - context.attempts.length <= reservedForFallback
        || remainingBudgetMs(context) <= reservedForFallback * 10_000
      ) break;
      try {
        const userPrompt = JSON.stringify({
          ...providerPromptInput,
          ...(retryContext ? { retryContext } : {}),
        });
        const aiValue = await generate(provider, userPrompt, profile, context, fetchImplementation);
        const contractStartedAt = performance.now();
        let adapted = profile.adapt(requestValue, aiValue);
        if (adapted.response === undefined && profile.repair) {
          adapted = profile.repair(requestValue, aiValue, String(adapted.reason ?? "invalid"));
        }
        contractMs += performance.now() - contractStartedAt;
        if (adapted.response !== undefined) {
          return { response: adapted.response, provider: publicProvider(provider), diagnostics: diagnostics(context, contractMs) };
        }
        markLastAttempt(context, "contract-degraded");
        retryContext = `The previous response failed the local ${profile.kind} contract: ${String(adapted.reason ?? "unknown").slice(0, 260)}. Return one complete corrected JSON object.`;
        failures.push(`${provider.protocol}:${provider.model}:contract:${String(adapted.reason ?? "invalid").slice(0, 120)}`);
      } catch (error) {
        if (signal?.aborted) {
          throw new DirectorBYOKExecutionErrorV1("导演请求已取消", diagnostics(context, contractMs));
        }
        failures.push(`${provider.protocol}:${provider.model}:${error instanceof Error ? error.message : "request failed"}`);
        const retryable = !(error instanceof ProviderHTTPError)
          || error.status === 408
          || error.status === 429
          || error.status >= 500;
        if (!retryable || error instanceof DirectorAttemptBudgetError) break;
        retryContext = "The previous provider response could not be parsed or was temporarily unavailable. Return one complete JSON object only.";
      }
    }
  }
  throw new DirectorBYOKExecutionErrorV1(
    failures.join(" | ").slice(0, 500) || "所有导演供应商均失败",
    diagnostics(context, contractMs),
  );
};

export const executeDirectorBYOKV1 = (
  configuration: DirectorBYOKConfigurationV1,
  requestValue: unknown,
  fetchImplementation: typeof fetch = fetch,
  budgetMs = 45_000,
): Promise<DirectorProviderExecutionV1> => executeDirectorBYOKProfileV1(
  configuration,
  requestValue,
  legacyDirectorRequestProfileV1,
  fetchImplementation,
  budgetMs,
);
