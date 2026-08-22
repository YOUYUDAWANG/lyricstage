import { stableHash32, type LyricDocumentV0 } from "@lyricstage/contracts";
import type { DirectorSectionV1 } from "./directorPlan";

export type DramaticActRoleV1 = "setup" | "development" | "reversal" | "climax" | "coda";
export type MotifActorFamilyV1 =
  | "thread"
  | "window"
  | "silhouette"
  | "horizon"
  | "fold"
  | "firework"
  | "fish"
  | "petal"
  | "snow";
export type MotifStateV1 = "seed" | "emerge" | "transform" | "fracture" | "return" | "resolve";
export type SignatureMomentPurposeV1 =
  | "reveal"
  | "connection"
  | "rupture"
  | "release"
  | "distance"
  | "collective"
  | "resolution";
export type DramaticStageActionV1 =
  | "thread.connect"
  | "thread.snap"
  | "window.reveal"
  | "silhouette.trace"
  | "sentence.horizon"
  | "phrase.cascade"
  | "memory.imprint"
  | "duet.tension"
  | "stage.fold"
  | "motif.recall"
  | "silence.vacuum";
export type DramaticCoverRoleV1 = "anchor" | "origin" | "destination" | "boundary" | "memory" | "portal" | "absent";

export interface DramaticActV1 {
  id: string;
  role: DramaticActRoleV1;
  fromLineIndex: number;
  toLineIndex: number;
  tension: number;
  visualDensity: number;
  motifState: MotifStateV1;
  intention: string;
}

export interface MotifActorV1 {
  family: MotifActorFamilyV1;
  origin: "lyric" | "artwork" | "silence" | "voice" | "structure";
  relationship: string;
  states: Array<{
    state: MotifStateV1;
    meaning: string;
  }>;
}

export interface SignatureMomentV1 {
  id: string;
  fromLineIndex: number;
  toLineIndex: number;
  anchorLineIndices: number[];
  purpose: SignatureMomentPurposeV1;
  motifState: MotifStateV1;
  actorFamily: MotifActorFamilyV1;
  stageAction: DramaticStageActionV1;
  coverRole: DramaticCoverRoleV1;
  consequence: "trace" | "afterimage" | "accumulation" | "absence" | "reframe" | "return";
  recallOf: string;
  intensity: number;
  evidence: {
    sectionTriggers: string[];
    rationale: string;
    confidence: number;
  };
}

export interface DramaticQuietWindowV1 {
  fromLineIndex: number;
  toLineIndex: number;
  reason: string;
}

export interface DramaticScoreV1 {
  version: "dramatic-score-v1";
  premise: string;
  emotionalArc: string;
  acts: DramaticActV1[];
  motifActor: MotifActorV1;
  signatureMoments: SignatureMomentV1[];
  quietWindows: DramaticQuietWindowV1[];
}

const actRoles = new Set<DramaticActRoleV1>(["setup", "development", "reversal", "climax", "coda"]);
const actorFamilies = new Set<MotifActorFamilyV1>(["thread", "window", "silhouette", "horizon", "fold", "firework", "fish", "petal", "snow"]);
const motifStates = new Set<MotifStateV1>(["seed", "emerge", "transform", "fracture", "return", "resolve"]);
const purposes = new Set<SignatureMomentPurposeV1>(["reveal", "connection", "rupture", "release", "distance", "collective", "resolution"]);
const stageActions = new Set<DramaticStageActionV1>(["thread.connect", "thread.snap", "window.reveal", "silhouette.trace", "sentence.horizon", "phrase.cascade", "memory.imprint", "duet.tension", "stage.fold", "motif.recall", "silence.vacuum"]);
const coverRoles = new Set<DramaticCoverRoleV1>(["anchor", "origin", "destination", "boundary", "memory", "portal", "absent"]);
const consequences = new Set<SignatureMomentV1["consequence"]>(["trace", "afterimage", "accumulation", "absence", "reframe", "return"]);
const origins = new Set<MotifActorV1["origin"]>(["lyric", "artwork", "silence", "voice", "structure"]);
const declaredTriggers = new Set([
  "repeated_hook", "section_boundary", "silence_gap", "duet_overlap", "voice_handoff",
  "density_lift", "density_release", "semantic_distance", "semantic_motion", "semantic_contrast",
  "question_suspension", "collective_chorus", "final_resolution",
]);
const lyricLocalTriggers = new Set([
  "repeated_hook", "duet_overlap", "voice_handoff", "collective_chorus",
  "semantic_distance", "semantic_motion", "semantic_contrast",
]);
const purposeTriggerMatrix: Record<SignatureMomentPurposeV1, ReadonlySet<string>> = {
  reveal: new Set(["section_boundary", "silence_gap", "density_release", "repeated_hook"]),
  connection: new Set(["duet_overlap", "voice_handoff", "collective_chorus", "repeated_hook", "semantic_distance"]),
  rupture: new Set(["semantic_contrast", "semantic_motion", "density_lift", "duet_overlap"]),
  release: new Set(["density_release", "silence_gap", "final_resolution"]),
  distance: new Set(["semantic_distance", "silence_gap", "density_release"]),
  collective: new Set(["collective_chorus", "duet_overlap", "voice_handoff"]),
  resolution: new Set(["final_resolution", "repeated_hook", "density_release"]),
};
const actionTriggerMatrix = new Map<DramaticStageActionV1, ReadonlySet<string>>([
  ["duet.tension", new Set(["duet_overlap", "voice_handoff", "collective_chorus"])],
  ["silence.vacuum", new Set(["silence_gap", "density_release"])],
  ["motif.recall", new Set(["repeated_hook", "final_resolution", "density_release"])],
  ["thread.snap", new Set(["semantic_contrast", "semantic_motion", "density_lift", "duet_overlap"])],
  ["phrase.cascade", new Set(["repeated_hook", "density_lift", "collective_chorus", "voice_handoff"])],
  ["memory.imprint", new Set(["repeated_hook", "final_resolution", "semantic_distance", "density_release"])],
]);

const clean = (value: unknown, maximum: number): string => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const finite = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const normalizeLyricText = (value: string): string => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
const hasAnyTrigger = (triggers: string[], accepted: ReadonlySet<string>): boolean => triggers.some((trigger) => accepted.has(trigger));

const requiredFamilyForAction = (action: DramaticStageActionV1): MotifActorFamilyV1 | null => {
  if (action.startsWith("thread.")) return "thread";
  if (action === "window.reveal") return "window";
  if (action === "silhouette.trace") return "silhouette";
  if (action === "sentence.horizon") return "horizon";
  if (action === "stage.fold") return "fold";
  return null;
};

const lineRangeValid = (lyrics: LyricDocumentV0, fromLineIndex: number, toLineIndex: number): boolean => {
  const lines = new Set(lyrics.lines.map((line) => line.lineIndex));
  return lines.has(fromLineIndex) && lines.has(toLineIndex) && fromLineIndex <= toLineIndex;
};

const lyricLocalTriggerSupported = (
  lyrics: LyricDocumentV0,
  anchorLineIndices: number[],
  trigger: string,
): boolean => {
  const anchors = lyrics.lines.filter((line) => anchorLineIndices.includes(line.lineIndex));
  if (anchors.length === 0) return false;
  if (trigger === "repeated_hook") {
    const counts = new Map<string, number>();
    lyrics.lines.forEach((line) => {
      const key = normalizeLyricText(line.text);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return anchors.some((line) => (counts.get(normalizeLyricText(line.text)) ?? 0) > 1);
  }
  if (trigger === "duet_overlap") {
    return anchors.some((line) => lyrics.lines.some((other) => line.lineIndex !== other.lineIndex
      && line.fromMs < other.toMs && other.fromMs < line.toMs));
  }
  if (trigger === "voice_handoff") {
    return anchors.some((line) => ["harmony", "duetA", "duetB", "choir"].includes(line.voiceRole ?? ""));
  }
  const body = normalizeLyricText(anchors.map((line) => line.text).join(" "));
  if (trigger === "collective_chorus") return /(我们|一起|所有|we|together|everyone|僕ら|みんな)/iu.test(body);
  if (trigger === "semantic_distance") return /(远|近|距离|靠近|离开|far|near|distance|closer|away|遠く|近く)/iu.test(body);
  if (trigger === "semantic_contrast") return /(但是|却|相反|明暗|黑白|but|yet|however|opposite|光と影|でも)/iu.test(body);
  if (trigger === "semantic_motion") return /(走|跑|飞|坠|追|流动|run|fly|fall|chase|move|歩|走|飛|落ち)/iu.test(body);
  return true;
};

export const sanitizeDramaticScoreV1 = (
  lyrics: LyricDocumentV0,
  value: unknown,
): DramaticScoreV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wire = value as Record<string, unknown>;
  if (wire.version !== "dramatic-score-v1" || !Array.isArray(wire.acts) || !Array.isArray(wire.signatureMoments) || !Array.isArray(wire.quietWindows)) return null;
  const premise = clean(wire.premise, 240);
  const emotionalArc = clean(wire.emotionalArc, 320);
  if (!premise || !emotionalArc || wire.acts.length < 2 || wire.acts.length > 5 || wire.signatureMoments.length < 2 || wire.signatureMoments.length > 4) return null;

  const acts: DramaticActV1[] = [];
  for (const candidate of wire.acts) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const raw = candidate as Record<string, unknown>;
    const role = clean(raw.role, 24) as DramaticActRoleV1;
    const motifState = clean(raw.motifState, 24) as MotifStateV1;
    const fromLineIndex = Number.isInteger(raw.fromLineIndex) ? raw.fromLineIndex as number : -1;
    const toLineIndex = Number.isInteger(raw.toLineIndex) ? raw.toLineIndex as number : -1;
    const intention = clean(raw.intention, 320);
    if (!actRoles.has(role) || !motifStates.has(motifState) || !lineRangeValid(lyrics, fromLineIndex, toLineIndex) || !intention) return null;
    if (acts.length > 0 && fromLineIndex !== acts.at(-1)!.toLineIndex + 1) return null;
    acts.push({
      id: clean(raw.id, 120) || `act:${acts.length}:${fromLineIndex}-${toLineIndex}`,
      role,
      fromLineIndex,
      toLineIndex,
      tension: clamp(finite(raw.tension, 0.5), 0, 1),
      visualDensity: clamp(finite(raw.visualDensity, 0.4), 0, 1),
      motifState,
      intention,
    });
  }
  if (acts[0]!.fromLineIndex !== lyrics.lines[0]?.lineIndex || acts.at(-1)!.toLineIndex !== lyrics.lines.at(-1)?.lineIndex) return null;

  const motifWire = wire.motifActor && typeof wire.motifActor === "object" && !Array.isArray(wire.motifActor)
    ? wire.motifActor as Record<string, unknown>
    : null;
  if (!motifWire || !Array.isArray(motifWire.states)) return null;
  const family = clean(motifWire.family, 24) as MotifActorFamilyV1;
  const origin = clean(motifWire.origin, 24) as MotifActorV1["origin"];
  const relationship = clean(motifWire.relationship, 360);
  const states = motifWire.states.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const raw = candidate as Record<string, unknown>;
    const state = clean(raw.state, 24) as MotifStateV1;
    const meaning = clean(raw.meaning, 240);
    return motifStates.has(state) && meaning ? { state, meaning } : null;
  });
  if (!actorFamilies.has(family) || !origins.has(origin) || !relationship || states.some((state) => !state) || states.length < 3 || states.length > 6) return null;
  const typedStates = states as MotifActorV1["states"];
  if (!typedStates.some((state) => state.state === "seed")
    || !typedStates.some((state) => state.state === "transform" || state.state === "fracture")
    || !typedStates.some((state) => state.state === "return" || state.state === "resolve")) return null;

  const signatureMoments: SignatureMomentV1[] = [];
  const ids = new Set<string>();
  const lyricLineIndices = new Set(lyrics.lines.map((line) => line.lineIndex));
  for (const candidate of wire.signatureMoments) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const raw = candidate as Record<string, unknown>;
    const id = clean(raw.id, 120);
    const fromLineIndex = Number.isInteger(raw.fromLineIndex) ? raw.fromLineIndex as number : -1;
    const toLineIndex = Number.isInteger(raw.toLineIndex) ? raw.toLineIndex as number : -1;
    const purpose = clean(raw.purpose, 24) as SignatureMomentPurposeV1;
    const motifState = clean(raw.motifState, 24) as MotifStateV1;
    const actorFamily = clean(raw.actorFamily, 24) as MotifActorFamilyV1;
    const stageAction = clean(raw.stageAction, 40) as DramaticStageActionV1;
    const coverRole = clean(raw.coverRole, 24) as DramaticCoverRoleV1;
    const consequence = clean(raw.consequence, 24) as SignatureMomentV1["consequence"];
    const requestedRecallOf = clean(raw.recallOf, 120);
    const evidence = raw.evidence && typeof raw.evidence === "object" && !Array.isArray(raw.evidence)
      ? raw.evidence as Record<string, unknown>
      : null;
    const anchorLineIndices = Array.isArray(raw.anchorLineIndices)
      ? [...new Set(raw.anchorLineIndices.filter((line): line is number => Number.isInteger(line)
        && line >= fromLineIndex && line <= toLineIndex && lyricLineIndices.has(line)))]
      : [];
    if (!id || ids.has(id) || !lineRangeValid(lyrics, fromLineIndex, toLineIndex) || !purposes.has(purpose)
      || !motifStates.has(motifState) || !actorFamilies.has(actorFamily) || actorFamily !== family
      || !stageActions.has(stageAction) || !coverRoles.has(coverRole) || !consequences.has(consequence)
      || anchorLineIndices.length === 0 || !evidence) continue;
    const triggers = Array.isArray(evidence.sectionTriggers)
      ? [...new Set(evidence.sectionTriggers.map((trigger) => clean(trigger, 48))
        .filter((trigger) => declaredTriggers.has(trigger)
          && (!lyricLocalTriggers.has(trigger) || lyricLocalTriggerSupported(lyrics, anchorLineIndices, trigger))))].slice(0, 8)
      : [];
    const rationale = clean(evidence.rationale, 420);
    const confidence = clamp(finite(evidence.confidence, 0), 0, 1);
    if (triggers.length === 0 || !rationale || confidence < 0.7) continue;
    const previous = signatureMoments.at(-1);
    if (previous && fromLineIndex <= previous.toLineIndex) continue;
    const returns = motifState === "return" || motifState === "resolve";
    const recallOf = returns
      ? ids.has(requestedRecallOf)
        ? requestedRecallOf
        : signatureMoments[0]?.id ?? ""
      : "";
    if (!hasAnyTrigger(triggers, purposeTriggerMatrix[purpose])) continue;
    const requiredFamily = requiredFamilyForAction(stageAction);
    if (requiredFamily && actorFamily !== requiredFamily) continue;
    const actionTriggers = actionTriggerMatrix.get(stageAction);
    if ((actionTriggers && !hasAnyTrigger(triggers, actionTriggers))
      || (stageAction === "motif.recall" && !recallOf)) continue;
    signatureMoments.push({
      id, fromLineIndex, toLineIndex, anchorLineIndices, purpose, motifState, actorFamily, stageAction, coverRole,
      consequence, recallOf, intensity: clamp(finite(raw.intensity, 0.72), 0.35, 1),
      evidence: { sectionTriggers: triggers, rationale, confidence },
    });
    ids.add(id);
  }
  if (signatureMoments.length < 2) return null;
  const firstMoment = signatureMoments[0]!;
  const lastMoment = signatureMoments.at(-1)!;
  if (!(["seed", "emerge"] as MotifStateV1[]).includes(firstMoment.motifState) || firstMoment.recallOf) return null;
  if (!(["return", "resolve"] as MotifStateV1[]).includes(lastMoment.motifState)
    || !signatureMoments.slice(0, -1).some((moment) => moment.id === lastMoment.recallOf)) return null;

  const quietWindows: DramaticQuietWindowV1[] = [];
  for (const candidate of wire.quietWindows.slice(0, 8)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const raw = candidate as Record<string, unknown>;
    const fromLineIndex = Number.isInteger(raw.fromLineIndex) ? raw.fromLineIndex as number : -1;
    const toLineIndex = Number.isInteger(raw.toLineIndex) ? raw.toLineIndex as number : -1;
    const reason = clean(raw.reason, 240);
    if (!lineRangeValid(lyrics, fromLineIndex, toLineIndex) || !reason) continue;
    quietWindows.push({ fromLineIndex, toLineIndex, reason });
  }

  return {
    version: "dramatic-score-v1",
    premise,
    emotionalArc,
    acts,
    motifActor: { family, origin, relationship, states: typedStates },
    signatureMoments,
    quietWindows,
  };
};

const lineGroups = (lyrics: LyricDocumentV0, target: number): LyricDocumentV0["lines"][] => {
  const count = Math.max(1, Math.min(target, lyrics.lines.length));
  const groups: LyricDocumentV0["lines"][] = [];
  for (let index = 0; index < count; index += 1) {
    const from = Math.floor(index * lyrics.lines.length / count);
    const to = Math.floor((index + 1) * lyrics.lines.length / count);
    groups.push(lyrics.lines.slice(from, Math.max(from + 1, to)));
  }
  return groups.filter((group) => group.length > 0);
};

export const compileLocalDramaticScoreV1 = (
  lyrics: LyricDocumentV0,
  sections: DirectorSectionV1[],
): DramaticScoreV1 => {
  const seed = Number.parseInt(stableHash32([lyrics.recordingID, lyrics.lines.map((line) => line.text)]), 16) >>> 0;
  const repeated = new Map<string, number>();
  lyrics.lines.forEach((line) => repeated.set(line.text, (repeated.get(line.text) ?? 0) + 1));
  const overlapLineIndices = new Set(lyrics.lines.filter((line, index) => lyrics.lines.some((other, otherIndex) => index !== otherIndex
    && line.fromMs < other.toMs && other.fromMs < line.toMs)).map((line) => line.lineIndex));
  const overlapping = overlapLineIndices.size > 0;
  const groups = lineGroups(lyrics, sections.length >= 5 || lyrics.lines.length >= 18 ? 4 : 3);
  const roles: DramaticActRoleV1[] = groups.length === 2
    ? ["setup", "coda"]
    : groups.length === 3
      ? ["setup", "development", "coda"]
      : ["setup", "development", "climax", "coda"];
  const stateByRole: Record<DramaticActRoleV1, MotifStateV1> = {
    setup: "seed", development: "emerge", reversal: "fracture", climax: "transform", coda: "return",
  };
  const acts = groups.map<DramaticActV1>((group, index) => ({
    id: `local-act:${index}`,
    role: roles[index] ?? "development",
    fromLineIndex: group[0]!.lineIndex,
    toLineIndex: group.at(-1)!.lineIndex,
    tension: clamp(0.28 + index * 0.2, 0, 0.92),
    visualDensity: index === groups.length - 1 ? 0.34 : clamp(0.26 + index * 0.16, 0.2, 0.78),
    motifState: stateByRole[roles[index] ?? "development"],
    intention: index === 0 ? "Establish one restrained visual promise." : index === groups.length - 1 ? "Return the established image in a changed, quieter state." : "Develop the promise without replacing its visual language.",
  }));
  const family: MotifActorFamilyV1 = overlapping
    ? "thread"
    : (["thread", "window", "horizon", "fold"] as const)[seed % 4]!;
  const actionFor = (state: MotifStateV1, final: boolean): DramaticStageActionV1 => {
    if (final) return "motif.recall";
    if (family === "window") return "window.reveal";
    if (family === "horizon") return "sentence.horizon";
    if (family === "fold") return "stage.fold";
    return state === "transform" ? "thread.snap" : overlapping ? "duet.tension" : "thread.connect";
  };
  const candidateLines = lyrics.lines.filter((line) => (repeated.get(line.text) ?? 0) > 1);
  const firstAnchor = overlapping
    ? lyrics.lines.find((line) => overlapLineIndices.has(line.lineIndex))!
    : candidateLines[0] ?? lyrics.lines[Math.min(2, Math.max(0, Math.floor(lyrics.lines.length * 0.22)))] ?? lyrics.lines[0]!;
  const firstPosition = lyrics.lines.findIndex((line) => line.lineIndex === firstAnchor.lineIndex);
  const finalPosition = lyrics.lines.length > 1
    ? Math.min(lyrics.lines.length - 1, Math.max(firstPosition + 1, Math.floor(lyrics.lines.length * 0.78)))
    : 0;
  const finalAnchor = lyrics.lines[finalPosition] ?? lyrics.lines.at(-1)!;
  const firstWindow: [number, number] = [
    lyrics.lines[overlapping ? Math.max(0, firstPosition - 1) : 0]!.lineIndex,
    firstAnchor.lineIndex,
  ];
  const finalWindow: [number, number] = [
    lyrics.lines[lyrics.lines.length > 1 ? Math.max(firstPosition + 1, finalPosition - 1) : 0]!.lineIndex,
    lyrics.lines.at(-1)!.lineIndex,
  ];
  const signatureMoments: SignatureMomentV1[] = [{
    id: "local-moment:seed",
    fromLineIndex: firstWindow[0],
    toLineIndex: firstWindow[1],
    anchorLineIndices: [firstAnchor.lineIndex],
    purpose: overlapping ? "connection" : "reveal",
    motifState: "seed",
    actorFamily: family,
    stageAction: actionFor("seed", false),
    coverRole: "origin",
    consequence: "trace",
    recallOf: "",
    intensity: 0.58,
    evidence: { sectionTriggers: [overlapping ? "duet_overlap" : (repeated.get(firstAnchor.text) ?? 0) > 1 ? "repeated_hook" : "section_boundary"], rationale: "The local fallback establishes one quiet visual promise without inventing evidence outside its lyric anchor.", confidence: 0.76 },
  }, {
    id: "local-moment:return",
    fromLineIndex: finalWindow[0],
    toLineIndex: finalWindow[1],
    anchorLineIndices: [finalAnchor.lineIndex],
    purpose: "resolution",
    motifState: "return",
    actorFamily: family,
    stageAction: actionFor("return", true),
    coverRole: "memory",
    consequence: "return",
    recallOf: "local-moment:seed",
    intensity: 0.64,
    evidence: { sectionTriggers: ["final_resolution"], rationale: "The closing third recalls the opening promise instead of introducing a new effect.", confidence: 0.8 },
  }];
  const quietWindows = acts.slice(0, -1).map((act) => ({
    fromLineIndex: Math.min(act.toLineIndex, act.fromLineIndex + 1),
    toLineIndex: Math.max(act.fromLineIndex, act.toLineIndex - 1),
    reason: "Stable reading gives the next signature moment contrast.",
  })).filter((window) => window.fromLineIndex <= window.toLineIndex);
  return {
    version: "dramatic-score-v1",
    premise: "A restrained image is established, tested by the song, and returned with changed meaning.",
    emotionalArc: "The stage begins legible and quiet, opens around one structural promise, then resolves by recalling rather than replacing it.",
    acts,
    motifActor: {
      family,
      origin: overlapping ? "voice" : "structure",
      relationship: "The motif begins at the artwork-reading boundary, enters the lyric space, and returns as a memory trace.",
      states: [
        { state: "seed", meaning: "A small promise appears without competing with the lyric." },
        { state: "transform", meaning: "The same promise gains tension or scale at the structural turn." },
        { state: "return", meaning: "The image comes back quieter and carries the history of the song." },
      ],
    },
    signatureMoments,
    quietWindows,
  };
};
