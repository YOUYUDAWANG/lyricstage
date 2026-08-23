import { sanitizeDirectorCacheSummaryV1, type DirectorCacheSummaryV1 } from "@lyricstage/performance";

export type DirectorReviewStateV1 =
  | { status: "loading"; summaries: [] }
  | { status: "empty"; summaries: [] }
  | { status: "ready"; summaries: DirectorCacheSummaryV1[] }
  | { status: "error"; summaries: []; reason: string };

export const directorReviewStateFromResponseV1 = (value: unknown): DirectorReviewStateV1 => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "error", summaries: [], reason: "审片摘要不可用" };
  const response = value as { type?: unknown; summaries?: unknown; reason?: unknown };
  if (response.type !== "director-cache-summaries-v1" || !Array.isArray(response.summaries)) {
    return { status: "error", summaries: [], reason: "审片摘要格式无效" };
  }
  if (response.reason && response.summaries.length === 0) {
    return { status: "error", summaries: [], reason: String(response.reason).slice(0, 120) };
  }
  const summaries = response.summaries.map(sanitizeDirectorCacheSummaryV1)
    .filter((summary): summary is DirectorCacheSummaryV1 => Boolean(summary));
  if (summaries.length !== response.summaries.length) return { status: "error", summaries: [], reason: "审片摘要格式无效" };
  return summaries.length === 0 ? { status: "empty", summaries: [] } : { status: "ready", summaries: summaries.slice(0, 100) };
};

export const directorReviewAggregateV1 = (state: DirectorReviewStateV1): string => {
  if (state.status === "loading") return "正在读取本机摘要…";
  if (state.status === "error") return state.reason;
  if (state.status === "empty") return "尚无可审片的 Rolling Director 缓存";
  const warned = state.summaries.filter((summary) => summary.warnings.length > 0).length;
  return `${state.summaries.length} 首 · ${warned} 首有审片提醒`;
};
