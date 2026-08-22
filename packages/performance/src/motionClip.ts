export type MotionPropertyV1 =
  | "opacity"
  | "translateX"
  | "translateY"
  | "scale"
  | "rotation"
  | "blur"
  | "tracking"
  | "maskProgress";

export type MotionEaseV1 = "linear" | "easeOutCubic" | "easeInOutCubic" | "hold";

export interface MotionKeyframeV1 {
  atMs: number;
  value: number;
  ease?: MotionEaseV1;
}

export interface MotionTrackV1 {
  property: MotionPropertyV1;
  keys: MotionKeyframeV1[];
}

export interface MotionClipV1 {
  version: "motion-clip-v1";
  id: string;
  durationMs: number;
  tracks: MotionTrackV1[];
}

export type MotionSampleV1 = Partial<Record<MotionPropertyV1, number>>;

const ease = (value: number, kind: MotionEaseV1): number => {
  if (kind === "hold") return 0;
  if (kind === "easeOutCubic") return 1 - (1 - value) ** 3;
  if (kind === "easeInOutCubic") {
    return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
  }
  return value;
};

const sampleTrack = (track: MotionTrackV1, timeMs: number): number | undefined => {
  const keys = track.keys;
  if (keys.length === 0) return undefined;
  if (timeMs <= keys[0]!.atMs) return keys[0]!.value;
  if (timeMs >= keys[keys.length - 1]!.atMs) return keys[keys.length - 1]!.value;
  let low = 0;
  let high = keys.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (keys[middle]!.atMs <= timeMs) low = middle;
    else high = middle;
  }
  const left = keys[low]!;
  const right = keys[high]!;
  const fraction = (timeMs - left.atMs) / Math.max(1, right.atMs - left.atMs);
  const progress = ease(fraction, right.ease ?? "linear");
  return left.value + (right.value - left.value) * progress;
};

export const sampleMotionClipV1 = (clip: MotionClipV1, timeMs: number): MotionSampleV1 =>
  Object.fromEntries(
    clip.tracks.flatMap((track) => {
      const value = sampleTrack(track, Math.min(clip.durationMs, Math.max(0, timeMs)));
      return value === undefined ? [] : [[track.property, value]];
    }),
  );

export const motionClipsV1: MotionClipV1[] = [
  {
    version: "motion-clip-v1",
    id: "editorial-rise",
    durationMs: 900,
    tracks: [
      { property: "opacity", keys: [{ atMs: 0, value: 0 }, { atMs: 280, value: 1, ease: "easeOutCubic" }] },
      { property: "translateY", keys: [{ atMs: 0, value: 52 }, { atMs: 760, value: 0, ease: "easeOutCubic" }] },
      { property: "scale", keys: [{ atMs: 0, value: 0.94 }, { atMs: 900, value: 1, ease: "easeOutCubic" }] },
      { property: "tracking", keys: [{ atMs: 0, value: 0.08 }, { atMs: 900, value: -0.018, ease: "easeOutCubic" }] },
    ],
  },
  {
    version: "motion-clip-v1",
    id: "rail-cut",
    durationMs: 720,
    tracks: [
      { property: "opacity", keys: [{ atMs: 0, value: 0 }, { atMs: 180, value: 1, ease: "linear" }] },
      { property: "translateX", keys: [{ atMs: 0, value: -88 }, { atMs: 720, value: 0, ease: "easeOutCubic" }] },
      { property: "maskProgress", keys: [{ atMs: 0, value: 0 }, { atMs: 560, value: 1, ease: "easeInOutCubic" }] },
    ],
  },
  {
    version: "motion-clip-v1",
    id: "memory-bloom",
    durationMs: 1100,
    tracks: [
      { property: "opacity", keys: [{ atMs: 0, value: 0 }, { atMs: 440, value: 1, ease: "easeOutCubic" }] },
      { property: "scale", keys: [{ atMs: 0, value: 0.82 }, { atMs: 1100, value: 1, ease: "easeOutCubic" }] },
      { property: "blur", keys: [{ atMs: 0, value: 18 }, { atMs: 900, value: 0, ease: "easeOutCubic" }] },
    ],
  },
];
