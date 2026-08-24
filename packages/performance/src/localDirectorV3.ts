import type { LyricDocumentV0, LyricLineV0 } from "@lyricstage/contracts";
import type { LinePerformanceV2, LineDramaticRoleV2 } from "./directorLinePerformanceV2";
import type { PerformanceTriggerV1 } from "./effectGrammar";
import { lyricGraphemesV1 } from "./lyricChoreography";
import type { MusicMapLandmarkTypeV1, MusicMapV1 } from "./musicMap";
import type { DirectorBibleV1, RollingPerformanceStateV1, SceneCardV1 } from "./rollingDirector";
import type { SemanticSceneDirectionV2 } from "./semanticSceneDirectionV2";
import {
  signatureChoreographyClipIDsV2,
  type SignatureChoreographySelectionV2,
} from "./signatureChoreographyV2";

export interface LocalLineEvidenceV3 {
  lineIndex: number;
  normalizedText: string;
  repetitionCount: number;
  repetitionOrdinal: number;
  gapBeforeMs: number;
  gapAfterMs: number;
  overlapping: boolean;
  duetVoice: boolean;
  voiceHandoff: boolean;
  question: boolean;
  contrast: boolean;
  confession: boolean;
  release: boolean;
  energy: number | null;
  triggers: PerformanceTriggerV1[];
  audioLandmarkIDs: string[];
}

export interface LocalSceneRangeV3 {
  fromLineIndex: number;
  toLineIndex: number;
}

export interface LocalSceneTreatmentV3 {
  semanticScene: SemanticSceneDirectionV2;
  linePerformances: LinePerformanceV2[];
  signatureClip: SignatureChoreographySelectionV2;
  triggers: PerformanceTriggerV1[];
  audioLandmarkIDs: string[];
  evidenceLineIndices: number[];
  rationale: string;
  confidence: number;
}

const normalizeText = (value: string): string => value
  .normalize("NFKC")
  .toLocaleLowerCase()
  .replace(/[\p{P}\p{S}\s]+/gu, "")
  .trim();

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const questionPattern = /[?？]|(?:吗|呢|为何|为什么|怎么|誰|何|なぜ|どうして|だろう|でしょう)\s*$/iu;
const contrastPattern = /(?:但是|可是|却|然而|反而|只是|改变|变化|but|yet|however|although|change|でも|けれど|なのに|それでも|変わ)/iu;
const confessionPattern = /(?:我|我的|心|爱|喜欢|想念|害怕|孤独|i\b|i'm\b|my\b|love\b|miss\b|僕|私|心|好き|怖|寂し)/iu;
const releasePattern = /(?:终于|放下|离开|再见|结束|回家|释怀|finally|goodbye|let go|home|終わ|さよなら|帰ろ|解き放)/iu;
const distancePattern = /(?:远|近|距离|靠近|离开|far|near|distance|away|遠く|近く|離れ)/iu;
const motionPattern = /(?:走|跑|飞|坠|追|流动|旋转|run|fly|fall|chase|move|歩|走|飛|落ち|巡)/iu;
const collectivePattern = /(?:我们|一起|所有人|we\b|together|everyone|僕ら|みんな)/iu;

const landmarkTriggers: Record<MusicMapLandmarkTypeV1, PerformanceTriggerV1[]> = {
  silence: ["silence_gap", "density_release"],
  onset_cluster: ["density_lift"],
  energy_lift: ["density_lift"],
  energy_release: ["density_release"],
  section_boundary: ["section_boundary"],
};

const segmentEnergyForLine = (line: LyricLineV0, musicMap?: MusicMapV1): number | null => {
  if (!musicMap?.segments.length) return null;
  let weighted = 0;
  let overlapTotal = 0;
  for (const segment of musicMap.segments) {
    const overlap = Math.max(0, Math.min(line.toMs, segment.toMs) - Math.max(line.fromMs, segment.fromMs));
    if (overlap <= 0) continue;
    weighted += segment.energy * overlap;
    overlapTotal += overlap;
  }
  return overlapTotal > 0 ? weighted / overlapTotal : null;
};

const landmarksForLine = (line: LyricLineV0, musicMap?: MusicMapV1) =>
  (musicMap?.landmarks ?? []).filter((landmark) =>
    landmark.atMs >= line.fromMs - 700 && landmark.atMs <= line.toMs + 700);

export const compileLocalLineEvidenceV3 = (
  lyrics: LyricDocumentV0,
  musicMap?: MusicMapV1,
): LocalLineEvidenceV3[] => {
  const normalized = lyrics.lines.map((line) => normalizeText(line.text));
  const counts = new Map<string, number>();
  normalized.forEach((text) => counts.set(text, (counts.get(text) ?? 0) + 1));
  const ordinals = new Map<string, number>();

  return lyrics.lines.map((line, position) => {
    const text = normalized[position]!;
    const repetitionOrdinal = (ordinals.get(text) ?? 0) + 1;
    ordinals.set(text, repetitionOrdinal);
    const previous = lyrics.lines[position - 1];
    const next = lyrics.lines[position + 1];
    const gapBeforeMs = previous ? Math.max(0, line.fromMs - previous.toMs) : Math.max(0, line.fromMs);
    const gapAfterMs = next ? Math.max(0, next.fromMs - line.toMs) : Math.max(0, lyrics.durationMs - line.toMs);
    const overlapping = lyrics.lines.some((candidate) => candidate.lineIndex !== line.lineIndex
      && line.fromMs < candidate.toMs && candidate.fromMs < line.toMs);
    const duetVoice = line.voiceRole === "duetA" || line.voiceRole === "duetB";
    const voiceHandoff = Boolean(previous?.voiceRole && line.voiceRole && previous.voiceRole !== line.voiceRole);
    const landmarks = landmarksForLine(line, musicMap);
    const triggers: PerformanceTriggerV1[] = landmarks.flatMap((landmark) => landmarkTriggers[landmark.type]);
    const repetitionCount = counts.get(text) ?? 1;
    const question = questionPattern.test(line.text.trim());
    const contrast = contrastPattern.test(line.text);
    const confession = confessionPattern.test(line.text);
    const release = releasePattern.test(line.text) || gapBeforeMs >= 1_800 || gapAfterMs >= 1_800
      || position === lyrics.lines.length - 1;
    if (repetitionCount > 1) triggers.push("repeated_hook");
    if (overlapping) triggers.push("duet_overlap");
    if (voiceHandoff) triggers.push("voice_handoff");
    if (gapBeforeMs >= 1_800) triggers.push("silence_gap", "density_release");
    if (gapAfterMs >= 1_800) triggers.push("silence_gap", "density_release");
    if (question) triggers.push("question_suspension");
    if (contrast) triggers.push("semantic_contrast");
    if (distancePattern.test(line.text)) triggers.push("semantic_distance");
    if (motionPattern.test(line.text)) triggers.push("semantic_motion");
    if (collectivePattern.test(line.text)) triggers.push("collective_chorus");
    if (position === lyrics.lines.length - 1) triggers.push("final_resolution");
    return {
      lineIndex: line.lineIndex,
      normalizedText: text,
      repetitionCount,
      repetitionOrdinal,
      gapBeforeMs,
      gapAfterMs,
      overlapping,
      duetVoice,
      voiceHandoff,
      question,
      contrast,
      confession,
      release,
      energy: segmentEnergyForLine(line, musicMap),
      triggers: unique(triggers),
      audioLandmarkIDs: landmarks.map((landmark) => `${landmark.type}:${Math.round(landmark.atMs)}`),
    };
  });
};

const rangeCrossesBoundary = (
  fromLineIndex: number,
  toLineIndex: number,
  boundaryAfterLineIndex: number,
): boolean => fromLineIndex <= boundaryAfterLineIndex && toLineIndex > boundaryAfterLineIndex;

const boundaryStrength = (
  current: LyricLineV0,
  next: LyricLineV0,
  evidence: ReadonlyMap<number, LocalLineEvidenceV3>,
  musicMap?: MusicMapV1,
): number => {
  const currentEvidence = evidence.get(current.lineIndex);
  const nextEvidence = evidence.get(next.lineIndex);
  const gap = Math.max(0, next.fromMs - current.toMs);
  let score = Math.min(2.8, gap / 1_200);
  if (nextEvidence?.repetitionCount && nextEvidence.repetitionCount > 1
    && currentEvidence?.normalizedText !== nextEvidence.normalizedText) score += 1.35;
  if (nextEvidence?.voiceHandoff) score += 1.1;
  if (currentEvidence?.question) score += 0.45;
  if (currentEvidence?.contrast || nextEvidence?.contrast) score += 0.7;
  for (const landmark of musicMap?.landmarks ?? []) {
    if (Math.abs(landmark.atMs - next.fromMs) > 2_000) continue;
    const weight = landmark.type === "section_boundary" ? 2.5
      : landmark.type === "silence" || landmark.type === "energy_release" ? 2.1
        : landmark.type === "energy_lift" ? 1.8 : 1.15;
    score += weight * landmark.strength;
  }
  return score;
};

export const compileLocalSceneRangesV3 = (
  lyrics: LyricDocumentV0,
  bible: DirectorBibleV1,
  fromLineIndex: number,
  toLineIndex: number,
  musicMap?: MusicMapV1,
): LocalSceneRangeV3[] => {
  const lines = lyrics.lines.filter((line) => line.lineIndex >= fromLineIndex && line.lineIndex <= toLineIndex);
  if (lines.length === 0) return [];
  const spanMs = Math.max(...lines.map((line) => line.toMs)) - lines[0]!.fromMs;
  const evidence = new Map(compileLocalLineEvidenceV3(lyrics, musicMap).map((item) => [item.lineIndex, item]));
  const protectedRanges = bible.signatureAnchors.map((anchor) => ({
    fromLineIndex: anchor.fromLineIndex,
    toLineIndex: anchor.toLineIndex,
  }));
  const allowedCuts = lines.slice(0, -1).filter((line) =>
    !protectedRanges.some((range) => rangeCrossesBoundary(range.fromLineIndex, range.toLineIndex, line.lineIndex)));
  const desiredByTime = Math.max(1, Math.round(spanMs / 14_000));
  const requiredByLineLimit = Math.ceil(lines.length / 6);
  const desiredCount = Math.min(
    6,
    lines.length,
    allowedCuts.length + 1,
    Math.max(requiredByLineLimit, Math.min(desiredByTime, lines.length)),
  );
  if (desiredCount <= 1) return [{ fromLineIndex: lines[0]!.lineIndex, toLineIndex: lines.at(-1)!.lineIndex }];

  const positions = new Map(lines.map((line, position) => [line.lineIndex, position]));
  const selectedCuts: number[] = [];
  let priorPosition = -1;
  for (let part = 1; part < desiredCount; part += 1) {
    const targetMs = lines[0]!.fromMs + spanMs * part / desiredCount;
    const remainingGroups = desiredCount - part;
    const candidates = allowedCuts.filter((line) => {
      const position = positions.get(line.lineIndex) ?? -1;
      const groupSize = position - priorPosition;
      const remainingLines = lines.length - position - 1;
      return position > priorPosition && groupSize <= 6
        && remainingLines >= remainingGroups
        && remainingLines <= remainingGroups * 6;
    });
    const selected = candidates.sort((left, right) => {
      const leftPosition = positions.get(left.lineIndex)!;
      const rightPosition = positions.get(right.lineIndex)!;
      const leftScore = Math.abs(left.toMs - targetMs)
        - boundaryStrength(left, lines[leftPosition + 1]!, evidence, musicMap) * 3_500;
      const rightScore = Math.abs(right.toMs - targetMs)
        - boundaryStrength(right, lines[rightPosition + 1]!, evidence, musicMap) * 3_500;
      return leftScore - rightScore || left.lineIndex - right.lineIndex;
    })[0];
    if (!selected) break;
    selectedCuts.push(selected.lineIndex);
    priorPosition = positions.get(selected.lineIndex)!;
  }
  const ranges: LocalSceneRangeV3[] = [];
  let rangeFrom = lines[0]!.lineIndex;
  selectedCuts.forEach((rangeTo) => {
    ranges.push({ fromLineIndex: rangeFrom, toLineIndex: rangeTo });
    rangeFrom = lines[(positions.get(rangeTo) ?? -1) + 1]!.lineIndex;
  });
  ranges.push({ fromLineIndex: rangeFrom, toLineIndex: lines.at(-1)!.lineIndex });
  return ranges;
};

const signatureClipForCard = (card: SceneCardV1): SignatureChoreographySelectionV2 =>
  signatureChoreographyClipIDsV2.find((clip) => card.effects.some((effect) =>
    effect.id.startsWith(`signature-clip-v2:${clip}:`))) ?? "none";

const selectLocalSignatureClipV3 = (
  lyrics: LyricDocumentV0,
  range: LocalSceneRangeV3,
  evidence: LocalLineEvidenceV3[],
  acceptedCards: readonly SceneCardV1[],
): SignatureChoreographySelectionV2 => {
  const used = new Set(acceptedCards.map(signatureClipForCard).filter((clip) => clip !== "none"));
  const firstLine = lyrics.lines.find((line) => line.lineIndex === range.fromLineIndex)!;
  const lastLine = lyrics.lines.find((line) => line.lineIndex === range.toLineIndex)!;
  const progress = ((firstLine.fromMs + lastLine.toMs) / 2) / Math.max(1, lyrics.durationMs);
  const final = range.toLineIndex === lyrics.lines.at(-1)?.lineIndex;
  const repeated = evidence.some((item) => item.repetitionCount > 1);
  const returnedRefrain = evidence.some((item) => item.repetitionOrdinal > 1);
  const duet = evidence.some((item) => item.overlapping || item.duetVoice);
  const release = evidence.some((item) => item.gapBeforeMs >= 1_800
    || item.audioLandmarkIDs.some((id) => id.startsWith("silence:") || id.startsWith("energy_release:")));
  const contrast = evidence.some((item) => item.contrast);
  if (final && !used.has("final-resolve")) return "final-resolve";
  if (range.fromLineIndex === lyrics.lines[0]?.lineIndex && !used.has("motif-introduce")) return "motif-introduce";
  if (used.size >= 5) return "none";
  if (duet && progress < 0.72 && !used.has("duet-handoff")) return "duet-handoff";
  if (returnedRefrain && progress >= 0.48 && !used.has("refrain-upgrade")) return "refrain-upgrade";
  if (repeated && progress >= 0.14 && progress < 0.48 && !used.has("chorus-lift")) return "chorus-lift";
  if (release && progress >= 0.2 && !used.has("silence-vacuum")) return "silence-vacuum";
  if (contrast && progress < 0.72 && !used.has("bridge-fracture")) return "bridge-fracture";
  if (returnedRefrain && progress >= 0.7 && used.has("chorus-lift") && !used.has("motif-recall")) return "motif-recall";
  return "none";
};

const semanticSceneFor = (
  lyrics: LyricDocumentV0,
  range: LocalSceneRangeV3,
  evidence: LocalLineEvidenceV3[],
  state: RollingPerformanceStateV1,
  acceptedCards: readonly SceneCardV1[],
  signatureClip: SignatureChoreographySelectionV2,
): SemanticSceneDirectionV2 => {
  const first = range.fromLineIndex === lyrics.lines[0]?.lineIndex;
  const final = range.toLineIndex === lyrics.lines.at(-1)?.lineIndex;
  const line = lyrics.lines.find((candidate) => candidate.lineIndex === range.fromLineIndex)!;
  const toLine = lyrics.lines.find((candidate) => candidate.lineIndex === range.toLineIndex)!;
  const progress = ((line.fromMs + toLine.toMs) / 2) / Math.max(1, lyrics.durationMs);
  if (signatureClip === "motif-introduce") return { version: "semantic-scene-direction-v2", purpose: first ? "establish" : "develop", spatialIntent: "hold" };
  if (signatureClip === "duet-handoff") return {
    version: "semantic-scene-direction-v2",
    purpose: state.layoutTransitionsUsed >= 3 ? "develop" : "turn",
    spatialIntent: "split",
  };
  if (signatureClip === "bridge-fracture") return { version: "semantic-scene-direction-v2", purpose: "turn", spatialIntent: "hold" };
  if (signatureClip === "silence-vacuum") return {
    version: "semantic-scene-direction-v2",
    purpose: "aftermath",
    spatialIntent: "hold",
  };
  if (signatureClip === "refrain-upgrade") return {
    version: "semantic-scene-direction-v2",
    purpose: "develop",
    spatialIntent: "hold",
  };
  if (signatureClip === "motif-recall") return { version: "semantic-scene-direction-v2", purpose: "aftermath", spatialIntent: "hold" };
  if (signatureClip === "final-resolve" || final) return { version: "semantic-scene-direction-v2", purpose: "resolve", spatialIntent: "open" };
  if (signatureClip === "chorus-lift") return { version: "semantic-scene-direction-v2", purpose: "develop", spatialIntent: "hold" };
  if (first) return { version: "semantic-scene-direction-v2", purpose: "establish", spatialIntent: "hold" };
  if (acceptedCards.at(-1)?.semanticScene?.purpose === "turn") {
    return { version: "semantic-scene-direction-v2", purpose: "aftermath", spatialIntent: "hold" };
  }
  if (evidence.some((item) => item.overlapping)) return { version: "semantic-scene-direction-v2", purpose: "turn", spatialIntent: "split" };
  if (evidence.some((item) => item.triggers.includes("density_release"))) {
    return { version: "semantic-scene-direction-v2", purpose: "aftermath", spatialIntent: "hold" };
  }
  if (state.layoutTransitionsUsed < 2 && evidence.some((item) => item.contrast)) {
    return { version: "semantic-scene-direction-v2", purpose: "turn", spatialIntent: "open" };
  }
  return { version: "semantic-scene-direction-v2", purpose: "develop", spatialIntent: "hold" };
};

const roleFor = (
  evidence: LocalLineEvidenceV3,
  previous: LocalLineEvidenceV3 | undefined,
  semanticScene: SemanticSceneDirectionV2,
  signatureClip: SignatureChoreographySelectionV2,
  primary: boolean,
): LineDramaticRoleV2 => {
  if (signatureClip === "final-resolve" && primary) return "release";
  if (signatureClip === "bridge-fracture" && primary) return "rupture";
  if ((signatureClip === "chorus-lift" || signatureClip === "refrain-upgrade") && evidence.repetitionCount > 1) return "refrain";
  if (evidence.repetitionCount > 1) return "refrain";
  if (evidence.question) return "question";
  if (previous?.question) return "answer";
  if (evidence.contrast || semanticScene.purpose === "turn" && primary) return "rupture";
  if (evidence.release || semanticScene.purpose === "resolve" && primary) return "release";
  if (evidence.confession) return "confession";
  return "statement";
};

const focusFor = (line: LyricLineV0, role: LineDramaticRoleV2): LinePerformanceV2["focus"] => {
  if (!["question", "refrain", "rupture"].includes(role) || !line.words?.length) return undefined;
  const word = role === "question" ? line.words.at(-1)! : line.words[0]!;
  const pieces = lyricGraphemesV1(line.text);
  const wordPieces = lyricGraphemesV1(word.text);
  const fromGrapheme = pieces.findIndex((piece, index) =>
    wordPieces.every((wordPiece, offset) => pieces[index + offset] === wordPiece));
  if (fromGrapheme < 0 || wordPieces.length === 0) return undefined;
  return {
    fromGrapheme,
    toGrapheme: fromGrapheme + wordPieces.length,
    semanticRole: role,
  };
};

const clipByRole: Record<LineDramaticRoleV2, Pick<LinePerformanceV2, "entrance" | "hold" | "exit">> = {
  statement: { entrance: "line-rise", hold: "hold-breathe", exit: "exit-dissolve" },
  confession: { entrance: "line-reveal", hold: "hold-suspend", exit: "exit-recede" },
  question: { entrance: "line-slide", hold: "hold-suspend", exit: "exit-handoff" },
  answer: { entrance: "line-rise", hold: "hold-breathe", exit: "exit-handoff" },
  refrain: { entrance: "line-slide", hold: "hold-echo", exit: "exit-dissolve" },
  rupture: { entrance: "line-break", hold: "hold-tension", exit: "exit-cut" },
  release: { entrance: "line-reveal", hold: "hold-breathe", exit: "exit-recede" },
};

const intensityFor = (
  role: LineDramaticRoleV2,
  evidence: LocalLineEvidenceV3,
  semanticScene: SemanticSceneDirectionV2,
): number => {
  const roleBase: Record<LineDramaticRoleV2, number> = {
    statement: 0.38, confession: 0.48, question: 0.58, answer: 0.52,
    refrain: evidence.repetitionOrdinal > 1 ? 0.8 : 0.72, rupture: 0.82, release: 0.64,
  };
  const purposeLift = semanticScene.purpose === "turn" ? 0.04
    : semanticScene.purpose === "resolve" ? 0.05
      : semanticScene.purpose === "aftermath" ? -0.04 : 0;
  const audioLift = evidence.energy === null ? 0 : (evidence.energy - 0.5) * 0.06;
  return Math.round(clamp(roleBase[role] + purposeLift + audioLift, 0.35, 0.9) * 1000) / 1000;
};

const compileLinePerformances = (
  lyrics: LyricDocumentV0,
  range: LocalSceneRangeV3,
  evidence: LocalLineEvidenceV3[],
  semanticScene: SemanticSceneDirectionV2,
  signatureClip: SignatureChoreographySelectionV2,
): LinePerformanceV2[] => {
  const lines = lyrics.lines.filter((line) => line.lineIndex >= range.fromLineIndex && line.lineIndex <= range.toLineIndex);
  const strongest = signatureClip === "final-resolve" ? evidence.at(-1)
    : [...evidence].sort((left, right) =>
      Number(right.contrast) - Number(left.contrast)
      || right.repetitionCount - left.repetitionCount
      || (right.energy ?? 0.5) - (left.energy ?? 0.5)
      || right.lineIndex - left.lineIndex)[0];
  return lines.map((line, position) => {
    const item = evidence[position]!;
    const role = roleFor(item, evidence[position - 1], semanticScene, signatureClip, item.lineIndex === strongest?.lineIndex);
    const focus = focusFor(line, role);
    const motifRelationship: LinePerformanceV2["motifRelationship"] = role === "rupture" ? "break"
      : role === "release" || semanticScene.purpose === "resolve" ? "resolve"
        : role === "refrain" && item.repetitionOrdinal > 1 ? "echo"
          : range.fromLineIndex === lyrics.lines[0]?.lineIndex && position === 0 ? "introduce"
            : role === "question" ? "approach" : "cross";
    return {
      lineIndex: line.lineIndex,
      dramaticRole: role,
      ...clipByRole[role],
      ...(focus ? { focus } : {}),
      motifRelationship,
      intensity: intensityFor(role, item, semanticScene),
    };
  });
};

export const compileLocalSceneTreatmentV3 = (
  lyrics: LyricDocumentV0,
  state: RollingPerformanceStateV1,
  acceptedCards: readonly SceneCardV1[],
  range: LocalSceneRangeV3,
  musicMap?: MusicMapV1,
): LocalSceneTreatmentV3 => {
  const evidence = compileLocalLineEvidenceV3(lyrics, musicMap)
    .filter((item) => item.lineIndex >= range.fromLineIndex && item.lineIndex <= range.toLineIndex);
  const signatureClip = selectLocalSignatureClipV3(lyrics, range, evidence, acceptedCards);
  const semanticScene = semanticSceneFor(lyrics, range, evidence, state, acceptedCards, signatureClip);
  const triggers = unique(evidence.flatMap((item) => item.triggers));
  const evidenceLineIndices = evidence
    .filter((item) => item.triggers.length > 0)
    .map((item) => item.lineIndex)
    .slice(0, 8);
  return {
    semanticScene,
    linePerformances: compileLinePerformances(lyrics, range, evidence, semanticScene, signatureClip),
    signatureClip,
    triggers: triggers.length > 0 ? triggers : ["section_boundary"],
    audioLandmarkIDs: unique(evidence.flatMap((item) => item.audioLandmarkIDs)).slice(0, 8),
    evidenceLineIndices: evidenceLineIndices.length > 0 ? evidenceLineIndices : [range.fromLineIndex],
    rationale: `Local-first ${semanticScene.purpose} scene uses lyric structure${musicMap ? " and bounded MusicMap landmarks" : ""} instead of scene-index rotation.`,
    confidence: musicMap ? 0.86 : 0.8,
  };
};
