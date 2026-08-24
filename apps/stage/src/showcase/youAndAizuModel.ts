export const YOU_AND_AIZU_DURATION_MS = 159_195;

export interface YouAndAizuCue {
  id: string;
  fromMs: number;
  toMs: number;
  label: string;
  description: string;
  accent: string;
}

export const YOU_AND_AIZU_CUES: readonly YouAndAizuCue[] = [
  {
    id: "wake-signal",
    fromMs: 0,
    toMs: 21_890,
    label: "WAKE / SIGNAL",
    description: "晨间提示把静止的世界推到第一拍。",
    accent: "#ff8f74",
  },
  {
    id: "concert-a",
    fromMs: 21_890,
    toMs: 31_540,
    label: "A = 440 HZ",
    description: "两道频率寻找同一个音高基准。",
    accent: "#ffd272",
  },
  {
    id: "legato-step",
    fromMs: 31_540,
    toMs: 51_470,
    label: "LEGATO / STEP",
    description: "呼吸与迈步把离散的日常连成一条线。",
    accent: "#90d9ef",
  },
  {
    id: "shared-cue",
    fromMs: 51_470,
    toMs: 77_180,
    label: "YOU + ME / CUE",
    description: "两组信号在副歌里对齐，并反复确认彼此。",
    accent: "#ff7399",
  },
  {
    id: "week-loop",
    fromMs: 77_180,
    toMs: 114_130,
    label: "WEEK / LOOP",
    description: "七天的刻度越过周末，重新回到约定。",
    accent: "#bca5ff",
  },
  {
    id: "da-capo",
    fromMs: 114_130,
    toMs: YOU_AND_AIZU_DURATION_MS,
    label: "DA CAPO / TOGETHER",
    description: "晨光、频率与脚步回归，最终汇成同一个合图。",
    accent: "#ffe0a8",
  },
] as const;

export const boundedYouAndAizuTime = (timeMs: number): number => {
  if (!Number.isFinite(timeMs)) return 0;
  return Math.min(YOU_AND_AIZU_DURATION_MS, Math.max(0, timeMs));
};

export const youAndAizuProgress = (timeMs: number): number =>
  boundedYouAndAizuTime(timeMs) / YOU_AND_AIZU_DURATION_MS;

export const youAndAizuCueAt = (timeMs: number): YouAndAizuCue => {
  const bounded = boundedYouAndAizuTime(timeMs);
  return YOU_AND_AIZU_CUES.find((cue) => bounded >= cue.fromMs && bounded < cue.toMs)
    ?? YOU_AND_AIZU_CUES[YOU_AND_AIZU_CUES.length - 1]!;
};
