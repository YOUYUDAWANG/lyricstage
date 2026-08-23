import type { DirectorV2ExperimentVariantID } from "./directorV2Experiment";

export const directorV2ReviewProtocolVersionV1 = "director-v2-art-gate-v1" as const;
export const directorV2FrozenCandidateV1 = "990e364" as const;
export const directorV2BlindLabelsV1 = ["K", "M", "R", "T"] as const;

export type DirectorV2BlindLabelV1 = (typeof directorV2BlindLabelsV1)[number];
export type DirectorV2ReviewScoreV1 = 1 | 2 | 3 | 4 | 5;
export type DirectorV2ReviewMarkV1 = "unrated" | "pass" | "fail";
export type DirectorV2HardGateStatusV1 = "unverified" | "pass" | "fail";
export type DirectorV2ArtGateStatusV1 = "awaiting-review" | "pass" | "conditional-pass" | "fail";

export const directorV2ReviewDimensionsV1 = [
  { id: "readability", label: "Readability", question: "是否始终能够毫不费力地阅读歌词？" },
  { id: "semanticFit", label: "Semantic fit", question: "动作是否发生在正确歌词与语义位置？" },
  { id: "structuralFit", label: "Structural fit", question: "副歌、转折、声部交接和结尾是否被正确处理？" },
  { id: "coherence", label: "Coherence", question: "是否像同一场演出，而不是多个 preset 拼接？" },
  { id: "distinctiveness", label: "Distinctiveness", question: "这首歌是否具有自己的演出轮廓？" },
  { id: "eventClarity", label: "Event clarity", question: "是否能辨认不同事件在做不同的事？" },
  { id: "contrast", label: "Contrast", question: "关键事件前后是否有克制、预备和后果？" },
  { id: "fatigue", label: "Fatigue resistance", question: "5 分表示克制耐看，1 分表示全程强调、明显疲劳。" },
  { id: "ambientLife", label: "Ambient life", question: "非事件区域和 instrumental gap 是否仍有生命？" },
  { id: "recall", label: "Recall", question: "结束后是否能复述母题和具体事件？" },
] as const;

export type DirectorV2ReviewDimensionIDV1 = (typeof directorV2ReviewDimensionsV1)[number]["id"];

export const directorV2HardGatesV1 = [
  { id: "surfaceSeek", label: "任意 seek 后 Canvas、Pixi 和 DOM 一致" },
  { id: "pauseClock", label: "pause 后没有墙钟运动继续推进" },
  { id: "hiddenResume", label: "hidden resume 不继承旧积分状态" },
  { id: "replayDeterminism", label: "相同 timeMs replay 得到相同基础状态" },
  { id: "canvasFallback", label: "Canvas2D fallback 不改变事件时间" },
  { id: "localFallback", label: "local fallback 完整" },
  { id: "cachePrefix", label: "已接受 cache 前缀不会被后到结果改写" },
  { id: "lyricOcclusion", label: "A/B 没有歌词遮挡、消失或明显难读" },
  { id: "runtimeError", label: "Lab 与 Stage 没有 runtime error" },
] as const;

export type DirectorV2HardGateIDV1 = (typeof directorV2HardGatesV1)[number]["id"];

export const directorV2LocalizedFailureCausesV1 = [
  "line-only-timing",
  "long-instrumental",
  "duet-boundary",
  "primitive-insufficient",
] as const;

export type DirectorV2LocalizedFailureCauseV1 = (typeof directorV2LocalizedFailureCausesV1)[number];

export interface DirectorV2BlindAssignmentV1 {
  fixtureID: string;
  playbackOrder: readonly DirectorV2BlindLabelV1[];
  variantByLabel: Readonly<Record<DirectorV2BlindLabelV1, DirectorV2ExperimentVariantID>>;
  labelByVariant: Readonly<Record<DirectorV2ExperimentVariantID, DirectorV2BlindLabelV1>>;
}

export interface DirectorV2BlindReviewSessionV1 {
  version: typeof directorV2ReviewProtocolVersionV1;
  candidateCommit: typeof directorV2FrozenCandidateV1;
  reviewerID: string;
  reviewerSeed: string;
  fixtureOrder: readonly string[];
  assignments: readonly DirectorV2BlindAssignmentV1[];
}

export interface DirectorV2RecallReviewV1 {
  motif: string;
  eventOne: string;
  eventTwo: string;
  returnOrResolution: string;
  chorusDifference: string;
  restrainedSegment: string;
  wrongPositionAction: string;
  motifConfirmed: DirectorV2ReviewMarkV1;
  twoEventsConfirmed: DirectorV2ReviewMarkV1;
}

export interface DirectorV2VariantReviewV1 {
  scores: Partial<Record<DirectorV2ReviewDimensionIDV1, DirectorV2ReviewScoreV1>>;
  recall: DirectorV2RecallReviewV1;
}

export interface DirectorV2TimestampCommentV1 {
  id: string;
  variantID: DirectorV2ExperimentVariantID;
  timeMs: number;
  kind: "comment" | "anomaly";
  text: string;
}

export interface DirectorV2FixtureReviewV1 {
  fixtureID: string;
  variants: Record<DirectorV2ExperimentVariantID, DirectorV2VariantReviewV1>;
  comparisons: {
    bOverA: DirectorV2BlindLabelV1 | "same" | "unrated";
    bOverC: DirectorV2BlindLabelV1 | "same" | "unrated";
    bOverD: DirectorV2BlindLabelV1 | "same" | "unrated";
  };
  grayscaleDistinct: DirectorV2ReviewMarkV1;
  chorusEscalationAndResolution: DirectorV2ReviewMarkV1;
  instrumentalGapAlive: DirectorV2ReviewMarkV1;
  localizedFailureCause?: DirectorV2LocalizedFailureCauseV1;
  comments: DirectorV2TimestampCommentV1[];
}

export interface DirectorV2ArtGateReviewV1 {
  version: typeof directorV2ReviewProtocolVersionV1;
  candidateCommit: typeof directorV2FrozenCandidateV1;
  reviewerID: string;
  fixtures: Record<string, DirectorV2FixtureReviewV1>;
  hardGates: Record<DirectorV2HardGateIDV1, DirectorV2HardGateStatusV1>;
}

export interface DirectorV2FixtureGateRowV1 {
  fixtureID: string;
  bOverA: boolean | null;
  bOverC: boolean | null;
  bOverD: boolean | null;
  motifRecalled: boolean | null;
  twoEventsRecalled: boolean | null;
  readability: "pass" | "fail" | "unrated";
  gapSeek: "pass" | "fail" | "unrated" | "n/a";
  verdict: "pass" | "conditional" | "fail" | "awaiting-review";
}

export interface DirectorV2GateReportV1 {
  version: typeof directorV2ReviewProtocolVersionV1;
  candidateCommit: typeof directorV2FrozenCandidateV1;
  reviewerID: string;
  artGate: DirectorV2ArtGateStatusV1;
  aiShadow: "allowed" | "blocked";
  rows: DirectorV2FixtureGateRowV1[];
  counts: {
    bOverA: number;
    bOverC: number;
    bOverD: number;
    recall: number;
    total: number;
  };
  requiredFixes: string[];
}

export interface DirectorV2CombinedGateReportV1 {
  version: typeof directorV2ReviewProtocolVersionV1;
  candidateCommit: typeof directorV2FrozenCandidateV1;
  reviewerIDs: string[];
  artGate: DirectorV2ArtGateStatusV1;
  aiShadow: "allowed" | "blocked";
  requiredFixes: string[];
}

const emptyRecall = (): DirectorV2RecallReviewV1 => ({
  motif: "",
  eventOne: "",
  eventTwo: "",
  returnOrResolution: "",
  chorusDifference: "",
  restrainedSegment: "",
  wrongPositionAction: "",
  motifConfirmed: "unrated",
  twoEventsConfirmed: "unrated",
});

export const createEmptyDirectorV2FixtureReviewV1 = (fixtureID: string): DirectorV2FixtureReviewV1 => ({
  fixtureID,
  variants: {
    A: { scores: {}, recall: emptyRecall() },
    B: { scores: {}, recall: emptyRecall() },
    C: { scores: {}, recall: emptyRecall() },
    D: { scores: {}, recall: emptyRecall() },
  },
  comparisons: { bOverA: "unrated", bOverC: "unrated", bOverD: "unrated" },
  grayscaleDistinct: "unrated",
  chorusEscalationAndResolution: "unrated",
  instrumentalGapAlive: "unrated",
  comments: [],
});

export const createEmptyDirectorV2ArtGateReviewV1 = (
  fixtureIDs: readonly string[],
  reviewerID: string,
): DirectorV2ArtGateReviewV1 => ({
  version: directorV2ReviewProtocolVersionV1,
  candidateCommit: directorV2FrozenCandidateV1,
  reviewerID,
  fixtures: Object.fromEntries(fixtureIDs.map((fixtureID) => [fixtureID, createEmptyDirectorV2FixtureReviewV1(fixtureID)])),
  hardGates: Object.fromEntries(directorV2HardGatesV1.map(({ id }) => [id, "unverified"])) as Record<
    DirectorV2HardGateIDV1,
    DirectorV2HardGateStatusV1
  >,
});

const hashSeed = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const seededRandom = (seed: number): (() => number) => {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = <T>(items: readonly T[], random: () => number): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
};

const sameOrder = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const createDirectorV2BlindReviewSessionV1 = (
  fixtureIDs: readonly string[],
  reviewerID: string,
): DirectorV2BlindReviewSessionV1 => {
  const normalizedReviewerID = reviewerID.trim() || "reviewer-1";
  const reviewerSeed = `${directorV2ReviewProtocolVersionV1}:${directorV2FrozenCandidateV1}:${normalizedReviewerID}`;
  const fixtureOrder = shuffle(fixtureIDs, seededRandom(hashSeed(`${reviewerSeed}:fixtures`)));
  let previousMapping: readonly DirectorV2ExperimentVariantID[] | undefined;
  const assignments = fixtureIDs.map((fixtureID) => {
    const random = seededRandom(hashSeed(`${reviewerSeed}:${fixtureID}`));
    let mappedVariants = shuffle<DirectorV2ExperimentVariantID>(["A", "B", "C", "D"], random);
    if (previousMapping && sameOrder(previousMapping, mappedVariants)) {
      mappedVariants = [...mappedVariants.slice(1), mappedVariants[0]!];
    }
    previousMapping = mappedVariants;
    const playbackOrder = shuffle(directorV2BlindLabelsV1, random);
    const variantByLabel = Object.fromEntries(
      directorV2BlindLabelsV1.map((label, index) => [label, mappedVariants[index]!]),
    ) as Record<DirectorV2BlindLabelV1, DirectorV2ExperimentVariantID>;
    const labelByVariant = Object.fromEntries(
      Object.entries(variantByLabel).map(([label, variant]) => [variant, label]),
    ) as Record<DirectorV2ExperimentVariantID, DirectorV2BlindLabelV1>;
    return { fixtureID, playbackOrder, variantByLabel, labelByVariant };
  });
  return {
    version: directorV2ReviewProtocolVersionV1,
    candidateCommit: directorV2FrozenCandidateV1,
    reviewerID: normalizedReviewerID,
    reviewerSeed,
    fixtureOrder,
    assignments,
  };
};

const completeVariantReview = (review: DirectorV2VariantReviewV1): boolean =>
  directorV2ReviewDimensionsV1.every(({ id }) => review.scores[id] !== undefined)
  && review.recall.motifConfirmed !== "unrated"
  && review.recall.twoEventsConfirmed !== "unrated"
  && [
    review.recall.motif,
    review.recall.eventOne,
    review.recall.eventTwo,
    review.recall.returnOrResolution,
    review.recall.chorusDifference,
    review.recall.restrainedSegment,
    review.recall.wrongPositionAction,
  ].every((value) => value.trim().length > 0);

const scoreFor = (
  fixture: DirectorV2FixtureReviewV1,
  variantID: DirectorV2ExperimentVariantID,
  dimension: DirectorV2ReviewDimensionIDV1,
): DirectorV2ReviewScoreV1 | undefined => fixture.variants[variantID].scores[dimension];

const booleanFromMark = (mark: DirectorV2ReviewMarkV1): boolean | null =>
  mark === "unrated" ? null : mark === "pass";

const completeFixture = (fixture: DirectorV2FixtureReviewV1): boolean =>
  (["A", "B", "C", "D"] as const).every((variantID) => completeVariantReview(fixture.variants[variantID]))
  && Object.values(fixture.comparisons).every((value) => value !== "unrated")
  && fixture.grayscaleDistinct !== "unrated";

const comparisonResult = (
  assignment: DirectorV2BlindAssignmentV1,
  choice: DirectorV2BlindLabelV1 | "same" | "unrated",
): boolean | null => choice === "unrated" ? null : choice !== "same" && assignment.variantByLabel[choice] === "B";

const uniqueFixes = (fixes: string[]): string[] => [...new Set(fixes)];

export const createDirectorV2GateReportV1 = (
  session: DirectorV2BlindReviewSessionV1,
  review: DirectorV2ArtGateReviewV1,
): DirectorV2GateReportV1 => {
  const rows = session.fixtureOrder.map((fixtureID): DirectorV2FixtureGateRowV1 => {
    const fixture = review.fixtures[fixtureID];
    const assignment = session.assignments.find((candidate) => candidate.fixtureID === fixtureID);
    if (!fixture || !assignment) {
      return {
        fixtureID,
        bOverA: null,
        bOverC: null,
        bOverD: null,
        motifRecalled: null,
        twoEventsRecalled: null,
        readability: "unrated",
        gapSeek: "unrated",
        verdict: "awaiting-review",
      };
    }
    const bOverA = comparisonResult(assignment, fixture.comparisons.bOverA);
    const bOverC = comparisonResult(assignment, fixture.comparisons.bOverC);
    const bOverD = comparisonResult(assignment, fixture.comparisons.bOverD);
    const motifRecalled = booleanFromMark(fixture.variants.B.recall.motifConfirmed);
    const twoEventsRecalled = booleanFromMark(fixture.variants.B.recall.twoEventsConfirmed);
    const readabilityB = scoreFor(fixture, "B", "readability");
    const readabilityA = scoreFor(fixture, "A", "readability");
    const readability = readabilityB === undefined || readabilityA === undefined
      ? "unrated"
      : readabilityB >= readabilityA ? "pass" : "fail";
    const isGap = fixtureID.includes("slow-gap");
    const gapSeek = isGap
      ? fixture.instrumentalGapAlive === "unrated" ? "unrated" : fixture.instrumentalGapAlive
      : "n/a";
    const isRepeatedChorus = fixtureID.includes("repeated-chorus");
    const specialPass = (!isGap || fixture.instrumentalGapAlive === "pass")
      && (!isRepeatedChorus || fixture.chorusEscalationAndResolution === "pass");
    const complete = completeFixture(fixture)
      && (!isGap || fixture.instrumentalGapAlive !== "unrated")
      && (!isRepeatedChorus || fixture.chorusEscalationAndResolution !== "unrated");
    const rowPass = complete
      && bOverA === true
      && bOverC === true
      && bOverD === true
      && motifRecalled === true
      && twoEventsRecalled === true
      && readability === "pass"
      && fixture.grayscaleDistinct === "pass"
      && (scoreFor(fixture, "B", "fatigue") ?? 0) >= 3
      && specialPass;
    const conditionallyLocal = Boolean(fixture.localizedFailureCause)
      && readability === "pass"
      && (scoreFor(fixture, "B", "fatigue") ?? 0) >= 3;
    return {
      fixtureID,
      bOverA,
      bOverC,
      bOverD,
      motifRecalled,
      twoEventsRecalled,
      readability,
      gapSeek,
      verdict: !complete ? "awaiting-review" : rowPass ? "pass" : conditionallyLocal ? "conditional" : "fail",
    };
  });

  const count = (key: "bOverA" | "bOverC" | "bOverD"): number => rows.filter((row) => row[key] === true).length;
  const counts = {
    bOverA: count("bOverA"),
    bOverC: count("bOverC"),
    bOverD: count("bOverD"),
    recall: rows.filter((row) => row.motifRecalled === true && row.twoEventsRecalled === true).length,
    total: rows.length,
  };
  const hardGateValues = Object.values(review.hardGates);
  const anyHardGateFailed = hardGateValues.includes("fail");
  const hardGatesComplete = hardGateValues.every((value) => value === "pass");
  const allRowsComplete = rows.every((row) => row.verdict !== "awaiting-review");
  const fixtureReviews = Object.values(review.fixtures);
  const repeatedChorusPass = fixtureReviews
    .filter((fixture) => fixture.fixtureID.includes("repeated-chorus"))
    .every((fixture) => fixture.chorusEscalationAndResolution === "pass");
  const slowGapPass = fixtureReviews
    .filter((fixture) => fixture.fixtureID.includes("slow-gap"))
    .every((fixture) => fixture.instrumentalGapAlive === "pass");
  const grayscalePass = fixtureReviews.length === rows.length
    && fixtureReviews.every((fixture) => fixture.grayscaleDistinct === "pass");
  const readabilityPass = rows.every((row) => row.readability === "pass");
  const fatiguePass = fixtureReviews.length === rows.length
    && fixtureReviews.every((fixture) => (scoreFor(fixture, "B", "fatigue") ?? 0) >= 3);
  const strictPass = hardGatesComplete
    && allRowsComplete
    && counts.bOverA >= 4
    && counts.bOverC >= 4
    && counts.bOverD === rows.length
    && counts.recall >= 4
    && repeatedChorusPass
    && slowGapPass
    && grayscalePass
    && readabilityPass
    && fatiguePass;
  const localizedFailures = rows.filter((row) => row.verdict === "conditional");
  const conditional = hardGatesComplete
    && allRowsComplete
    && !strictPass
    && localizedFailures.length === 1
    && counts.bOverA >= 4
    && counts.bOverC >= 4
    && counts.recall >= 4
    && readabilityPass
    && fatiguePass;
  const artGate: DirectorV2ArtGateStatusV1 = anyHardGateFailed
    ? "fail"
    : !allRowsComplete || !hardGatesComplete
      ? "awaiting-review"
      : strictPass ? "pass" : conditional ? "conditional-pass" : "fail";
  const requiredFixes: string[] = [];
  if (!allRowsComplete) requiredFixes.push("完成所有四个盲测版本的 1–5 分评分、即时回忆和三组比较。");
  if (!hardGatesComplete && !anyHardGateFailed) requiredFixes.push("补齐全部工程硬门证据；未验证不能放行 AI shadow。");
  if (anyHardGateFailed) requiredFixes.push("停止艺术调试，先修复失败的确定性、fallback、cache、可读性或 runtime 硬门。");
  if (allRowsComplete && counts.bOverA < 4) requiredFixes.push("增强 observable consequence 或现有原语组合；当前导演增量不足。");
  if (allRowsComplete && counts.bOverC < 4) requiredFixes.push("修 Cue role、边界推导与 influence envelope；语义位置尚未建立因果。");
  if (allRowsComplete && counts.bOverD < rows.length) requiredFixes.push("修 Recipe 分支选择和动作历史约束；上下文差异不足。");
  if (allRowsComplete && counts.recall < 4) requiredFixes.push("强化可观察的视觉承诺、后果与回收；逻辑 ID 尚未成为观众记忆。");
  if (allRowsComplete && !repeatedChorusPass) requiredFixes.push("让重复副歌明确包含一次升级与一次最终回收。");
  if (allRowsComplete && !slowGapPass) requiredFixes.push("增强 section、quiet 与 motif 驱动的持续舞台生命。");
  if (allRowsComplete && !grayscalePass) requiredFixes.push("用空间、层级、遮蔽、缺席和方向拉开 Recipe 分支，而不是依赖颜色。");
  if (allRowsComplete && !readabilityPass) requiredFixes.push("降低 override、遮挡与并发层数，恢复 B 不低于 A 的歌词可读性。");
  if (allRowsComplete && !fatiguePass) requiredFixes.push("降低事件密度与持续强调，恢复克制、预备和休息段。");
  return {
    version: directorV2ReviewProtocolVersionV1,
    candidateCommit: directorV2FrozenCandidateV1,
    reviewerID: review.reviewerID,
    artGate,
    aiShadow: "blocked",
    rows,
    counts,
    requiredFixes: uniqueFixes(requiredFixes),
  };
};

export const isDirectorV2GateReportV1 = (value: unknown): value is DirectorV2GateReportV1 => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DirectorV2GateReportV1>;
  return candidate.version === directorV2ReviewProtocolVersionV1
    && candidate.candidateCommit === directorV2FrozenCandidateV1
    && typeof candidate.reviewerID === "string"
    && ["awaiting-review", "pass", "conditional-pass", "fail"].includes(candidate.artGate ?? "")
    && Array.isArray(candidate.rows)
    && Array.isArray(candidate.requiredFixes);
};

export const createDirectorV2CombinedGateReportV1 = (
  reports: readonly DirectorV2GateReportV1[],
): DirectorV2CombinedGateReportV1 => {
  const uniqueReports = [...new Map(reports.map((report) => [report.reviewerID, report])).values()];
  const reviewerIDs = uniqueReports.map(({ reviewerID }) => reviewerID);
  const requiredFixes = uniqueFixes(uniqueReports.flatMap(({ requiredFixes: fixes }) => fixes));
  let artGate: DirectorV2ArtGateStatusV1;
  if (uniqueReports.length < 2) {
    artGate = "awaiting-review";
    requiredFixes.unshift("至少还需要一位不了解实现细节的外部观看者完成独立盲测。");
  } else if (uniqueReports.some((report) => report.artGate === "fail")) {
    artGate = "fail";
  } else if (uniqueReports.some((report) => report.artGate === "awaiting-review")) {
    artGate = "awaiting-review";
  } else if (uniqueReports.some((report) => report.artGate === "conditional-pass")) {
    artGate = "conditional-pass";
  } else {
    artGate = "pass";
  }
  return {
    version: directorV2ReviewProtocolVersionV1,
    candidateCommit: directorV2FrozenCandidateV1,
    reviewerIDs,
    artGate,
    aiShadow: artGate === "pass" && uniqueReports.length >= 2 ? "allowed" : "blocked",
    requiredFixes: uniqueFixes(requiredFixes),
  };
};
