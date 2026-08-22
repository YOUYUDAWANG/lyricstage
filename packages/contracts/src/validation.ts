import type { ErrorObject, ValidateFunction } from "ajv";
import {
  validateDirectorRecipeShape,
  validateLyricDocumentShape,
  validateManifestShape,
  validateRecordingIdentity,
} from "./generated/validators.mjs";
import type {
  ContractIssue,
  DirectorRecipeV0,
  LyricDocumentV0,
  LyricStageManifestV0,
  RecordingIdentityV0,
  ValidationResult,
} from "./types";

const schemaIssues = (errors: ErrorObject[] | null | undefined): ContractIssue[] =>
  (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? "合同格式无效",
  }));

const validateShape = <T>(
  validator: ValidateFunction,
  value: unknown,
): ValidationResult<T> => {
  if (!validator(value)) {
    return { ok: false, issues: schemaIssues(validator.errors) };
  }
  return { ok: true, value: value as T, issues: [] };
};

export const parseRecordingIdentityV0 = (
  value: unknown,
): ValidationResult<RecordingIdentityV0> =>
  validateShape(validateRecordingIdentity, value);

export const parseLyricDocumentV0 = (
  value: unknown,
): ValidationResult<LyricDocumentV0> => {
  const shape = validateShape<LyricDocumentV0>(validateLyricDocumentShape, value);
  if (!shape.ok) return shape;

  const issues: ContractIssue[] = [];
  let previousFrom = -1;
  shape.value.lines.forEach((line, expectedIndex) => {
    const base = `/lines/${expectedIndex}`;
    if (line.lineIndex !== expectedIndex) {
      issues.push({ path: `${base}/lineIndex`, message: "lineIndex 必须连续并从 0 开始" });
    }
    if (line.fromMs < previousFrom) {
      issues.push({ path: `${base}/fromMs`, message: "歌词行必须按开始时间排序" });
    }
    if (line.toMs <= line.fromMs || line.toMs > shape.value.durationMs) {
      issues.push({ path: `${base}/toMs`, message: "歌词行时间范围无效" });
    }
    previousFrom = line.fromMs;

    let previousWordFrom = -1;
    (line.words ?? []).forEach((word, wordIndex) => {
      const wordBase = `${base}/words/${wordIndex}`;
      if (word.wordIndex !== wordIndex) {
        issues.push({ path: `${wordBase}/wordIndex`, message: "wordIndex 必须连续" });
      }
      if (
        word.fromMs < line.fromMs ||
        word.toMs > line.toMs ||
        word.toMs <= word.fromMs ||
        word.fromMs < previousWordFrom
      ) {
        issues.push({ path: wordBase, message: "逐字时间必须单调并位于所属歌词行内" });
      }
      previousWordFrom = word.fromMs;
    });
  });

  return issues.length > 0 ? { ok: false, issues } : shape;
};

export const parseDirectorRecipeV0 = (
  value: unknown,
  lineCount?: number,
): ValidationResult<DirectorRecipeV0> => {
  const shape = validateShape<DirectorRecipeV0>(validateDirectorRecipeShape, value);
  if (!shape.ok || lineCount === undefined) return shape;

  const issues: ContractIssue[] = [];
  const seen = new Set<number>();
  shape.value.recipes.forEach((recipe, index) => {
    const base = `/recipes/${index}`;
    if (recipe.lineIndex >= lineCount) {
      issues.push({ path: `${base}/lineIndex`, message: "scene 引用了不存在的歌词行" });
    }
    if (seen.has(recipe.lineIndex)) {
      issues.push({ path: `${base}/lineIndex`, message: "同一歌词行只能有一个 scene recipe" });
    }
    seen.add(recipe.lineIndex);
    for (const companion of recipe.companionLineIndices ?? []) {
      if (companion >= lineCount) {
        issues.push({ path: `${base}/companionLineIndices`, message: "companion 越界" });
      }
    }
  });
  return issues.length > 0 ? { ok: false, issues } : shape;
};

export const parseLyricStageManifestV0 = (
  value: unknown,
): ValidationResult<LyricStageManifestV0> =>
  validateShape(validateManifestShape, value);
