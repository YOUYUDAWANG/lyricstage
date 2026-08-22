import type { MotifActorFamilyV1 } from "@lyricstage/performance";

export interface VectorActorPathV1 {
  d: string;
  mode: "fill" | "stroke";
  opacity: number;
}

export interface VectorActorAssetV1 {
  viewBox: [number, number, number, number];
  paths: VectorActorPathV1[];
}

export const vectorActorRegistryV1: Record<MotifActorFamilyV1, VectorActorAssetV1> = {
  thread: {
    viewBox: [0, 0, 100, 100],
    paths: [{ d: "M4 58 C24 16 49 84 96 38", mode: "stroke", opacity: 1 }],
  },
  window: {
    viewBox: [0, 0, 100, 100],
    paths: [
      { d: "M12 10 H88 V90 H12 Z", mode: "stroke", opacity: 1 },
      { d: "M50 10 V90 M12 50 H88", mode: "stroke", opacity: 0.54 },
    ],
  },
  silhouette: {
    viewBox: [0, 0, 100, 100],
    paths: [{ d: "M50 8 C38 8 32 18 32 30 C32 40 38 47 42 50 C27 58 20 73 20 92 H80 C80 73 73 58 58 50 C62 47 68 40 68 30 C68 18 62 8 50 8 Z", mode: "stroke", opacity: 1 }],
  },
  horizon: {
    viewBox: [0, 0, 100, 100],
    paths: [
      { d: "M2 55 C24 49 39 61 55 54 C72 47 83 53 98 48", mode: "stroke", opacity: 1 },
      { d: "M2 66 C22 62 39 71 58 65 C76 60 87 63 98 58", mode: "stroke", opacity: 0.42 },
    ],
  },
  fold: {
    viewBox: [0, 0, 100, 100],
    paths: [
      { d: "M10 12 L74 8 L92 72 L31 91 Z", mode: "stroke", opacity: 1 },
      { d: "M10 12 L57 50 L92 72 M57 50 L31 91", mode: "stroke", opacity: 0.48 },
    ],
  },
  firework: {
    viewBox: [0, 0, 100, 100],
    paths: [
      { d: "M50 46 L50 4 M50 46 L80 14 M50 46 L96 46 M50 46 L82 78 M50 46 L50 96 M50 46 L18 78 M50 46 L4 46 M50 46 L20 14", mode: "stroke", opacity: 1 },
      { d: "M50 46 C47 59 47 72 50 92", mode: "stroke", opacity: 0.6 },
    ],
  },
  fish: {
    viewBox: [0, 0, 100, 100],
    paths: [
      { d: "M12 50 C27 26 61 24 78 50 C61 76 27 74 12 50 Z", mode: "stroke", opacity: 1 },
      { d: "M78 50 L96 31 L92 69 Z", mode: "stroke", opacity: 0.86 },
      { d: "M30 45 A3 3 0 1 0 30 51", mode: "fill", opacity: 1 },
    ],
  },
  petal: {
    viewBox: [0, 0, 100, 100],
    paths: [
      { d: "M50 6 C83 21 91 53 50 94 C9 53 17 21 50 6 Z", mode: "stroke", opacity: 1 },
      { d: "M50 8 C46 34 47 63 50 92", mode: "stroke", opacity: 0.48 },
    ],
  },
  snow: {
    viewBox: [0, 0, 100, 100],
    paths: [
      { d: "M50 4 V96 M10 27 L90 73 M10 73 L90 27", mode: "stroke", opacity: 1 },
      { d: "M50 20 L39 10 M50 20 L61 10 M50 80 L39 90 M50 80 L61 90 M24 35 L10 37 M24 35 L18 22 M76 65 L90 63 M76 65 L82 78 M24 65 L10 63 M24 65 L18 78 M76 35 L90 37 M76 35 L82 22", mode: "stroke", opacity: 0.68 },
    ],
  },
};
