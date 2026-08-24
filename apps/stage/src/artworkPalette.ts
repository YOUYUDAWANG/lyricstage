import type { DirectedStagePaletteV1 } from "@lyricstage/renderer";

export interface ArtworkPixelBufferV1 {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface HueBucket {
  weight: number;
  lightness: number;
  chroma: number;
  hueX: number;
  hueY: number;
}

interface Oklch {
  l: number;
  c: number;
  h: number;
}

export type ArtworkPaletteToneV1 = "light" | "dusk" | "dark";

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(maximum, Math.max(minimum, value));

const srgbToLinear = (value: number): number => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const rgbToOklch = (red: number, green: number, blue: number): Oklch => {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const labL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const labA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(labB, labA) * 180 / Math.PI + 360) % 360;
  return { l: labL, c: Math.hypot(labA, labB), h: hue };
};

const linearToSrgb = (value: number): number => {
  const channel = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return channel;
};

const oklchToRgb = ({ l, c, h }: Oklch): [number, number, number] => {
  const radians = h * Math.PI / 180;
  const a = Math.cos(radians) * c;
  const b = Math.sin(radians) * c;
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;
  const lCube = lPrime ** 3;
  const mCube = mPrime ** 3;
  const sCube = sPrime ** 3;
  return [
    linearToSrgb(4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube),
    linearToSrgb(-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube),
    linearToSrgb(-0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube),
  ];
};

const inGamut = (channels: readonly number[]): boolean =>
  channels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1);

const toHex = (color: Oklch): string => {
  let chroma = color.c;
  let channels = oklchToRgb({ ...color, c: chroma });
  for (let attempt = 0; attempt < 18 && !inGamut(channels); attempt += 1) {
    chroma *= 0.86;
    channels = oklchToRgb({ ...color, c: chroma });
  }
  return `#${channels.map((channel) => Math.round(clamp(channel) * 255).toString(16).padStart(2, "0")).join("")}`;
};

const rgba = (hex: string, alpha: number): string => {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
};

const hexToOklch = (hex: string): Oklch | undefined => {
  const match = hex.match(/^#([\da-f]{6})$/iu);
  if (!match) return undefined;
  const value = match[1]!;
  return rgbToOklch(
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  );
};

export const paletteToneForV1 = (palette: DirectedStagePaletteV1): ArtworkPaletteToneV1 => {
  const lightness = hexToOklch(palette.ground)?.l ?? 0;
  if (lightness >= 0.29) return "light";
  if (lightness >= 0.20) return "dusk";
  return "dark";
};

const mixHue = (left: number, right: number, amount: number): number => {
  const delta = ((right - left + 540) % 360) - 180;
  return (left + delta * amount + 360) % 360;
};

const mixHexOklch = (
  left: string,
  right: string,
  amount: number,
  lightnessAmount = amount,
): string => {
  const from = hexToOklch(left);
  const to = hexToOklch(right);
  if (!from || !to) return left;
  const bounded = clamp(amount);
  return toHex({
    l: from.l + (to.l - from.l) * clamp(lightnessAmount),
    c: from.c + (to.c - from.c) * bounded,
    h: mixHue(from.h, to.h, bounded),
  });
};

export const mergeArtworkDirectorPaletteV1 = (
  artwork: DirectedStagePaletteV1,
  directed: DirectedStagePaletteV1,
  sectionIntensity: number,
): DirectedStagePaletteV1 => {
  const intensity = clamp(sectionIntensity);
  const signalAmount = 0.30 + intensity * 0.34;
  const groundAmount = 0.16 + intensity * 0.14;
  const ground = mixHexOklch(artwork.ground, directed.ground, groundAmount, groundAmount * 0.20);
  const groundLift = mixHexOklch(artwork.groundLift, directed.groundLift, groundAmount + 0.10, groundAmount * 0.26);
  const ink = mixHexOklch(artwork.ink, directed.ink, 0.08 + intensity * 0.05, 0.04);
  const signal = mixHexOklch(artwork.signal, directed.signal, signalAmount, signalAmount * 0.28);
  const signalAlt = mixHexOklch(artwork.signalAlt, directed.signalAlt, signalAmount + 0.08, signalAmount * 0.32);
  const warm = mixHexOklch(artwork.warm, directed.warm, signalAmount + 0.02, signalAmount * 0.26);
  const secondary = mixHexOklch(artwork.secondary, directed.secondary, signalAmount + 0.06, signalAmount * 0.30);
  const tone = paletteToneForV1({ ...artwork, ground });
  return {
    ground,
    groundLift,
    ink,
    inkMuted: rgba(ink, tone === "light" ? 0.45 : tone === "dusk" ? 0.40 : 0.35),
    signal,
    signalAlt,
    warm,
    secondary,
    veil: rgba(signal, 0.13 + intensity * 0.04),
  };
};

const circularDistance = (left: number, right: number): number => {
  const distance = Math.abs(left - right) % 360;
  return Math.min(distance, 360 - distance);
};

const bucketColor = (bucket: HueBucket): Oklch => ({
  l: bucket.lightness / Math.max(bucket.weight, 0.0001),
  c: bucket.chroma / Math.max(bucket.weight, 0.0001),
  h: (Math.atan2(bucket.hueY, bucket.hueX) * 180 / Math.PI + 360) % 360,
});

const toneForArtwork = (
  averageLightness: number,
  brightRatio: number,
  shadowRatio: number,
): ArtworkPaletteToneV1 => {
  if (averageLightness >= 0.66 || (averageLightness >= 0.56 && brightRatio >= 0.42)) return "light";
  if (averageLightness >= 0.38 && shadowRatio < 0.72) return "dusk";
  return "dark";
};

const neutralPalette = (averageLightness: number, tone: ArtworkPaletteToneV1): DirectedStagePaletteV1 => {
  const cool = averageLightness < 0.42 ? 252 : 232;
  const light = tone === "light";
  const dusk = tone === "dusk";
  const ink = toHex({ l: light ? 0.97 : 0.95, c: 0.012, h: cool });
  const signal = toHex({ l: light ? 0.68 : dusk ? 0.68 : 0.72, c: 0.075, h: cool });
  const signalAlt = toHex({ l: light ? 0.72 : dusk ? 0.73 : 0.78, c: 0.06, h: (cool + 28) % 360 });
  return {
    ground: toHex({ l: light ? 0.30 : dusk ? 0.27 : 0.12, c: light ? 0.055 : 0.026, h: cool }),
    groundLift: toHex({ l: light ? 0.43 : dusk ? 0.42 : 0.24, c: light ? 0.075 : 0.04, h: cool }),
    ink,
    inkMuted: rgba(ink, light ? 0.43 : 0.34),
    signal,
    signalAlt,
    warm: toHex({ l: light ? 0.72 : 0.76, c: 0.065, h: 58 }),
    secondary: signalAlt,
    veil: rgba(signal, 0.1),
  };
};

export const extractArtworkPaletteV1 = (
  buffer: ArtworkPixelBufferV1,
): DirectedStagePaletteV1 | undefined => {
  if (buffer.width <= 0 || buffer.height <= 0 || buffer.data.length < buffer.width * buffer.height * 4) {
    return undefined;
  }
  const buckets: HueBucket[] = Array.from({ length: 24 }, () => ({
    weight: 0,
    lightness: 0,
    chroma: 0,
    hueX: 0,
    hueY: 0,
  }));
  let lightnessTotal = 0;
  let opaquePixels = 0;
  let backgroundPixels = 0;
  let brightPixels = 0;
  let shadowPixels = 0;
  for (let offset = 0; offset < buffer.data.length; offset += 4) {
    const alpha = buffer.data[offset + 3]! / 255;
    if (alpha < 0.55) continue;
    const color = rgbToOklch(buffer.data[offset]!, buffer.data[offset + 1]!, buffer.data[offset + 2]!);
    const pixel = offset / 4;
    const x = (pixel % buffer.width + 0.5) / buffer.width;
    const y = (Math.floor(pixel / buffer.width) + 0.5) / buffer.height;
    const edgeDistance = Math.min(1, Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2);
    const backgroundWeight = alpha * (0.68 + edgeDistance * 0.82);
    lightnessTotal += color.l * backgroundWeight;
    backgroundPixels += backgroundWeight;
    opaquePixels += alpha;
    if (color.l >= 0.72) brightPixels += backgroundWeight;
    if (color.l <= 0.28) shadowPixels += backgroundWeight;
    if (color.c < 0.025 || color.l < 0.035 || color.l > 0.97) continue;
    const vividness = clamp(color.c / 0.28);
    const midtone = 0.34 + Math.sin(clamp(color.l) * Math.PI) * 0.66;
    const weight = alpha * (0.22 + vividness * 1.78) * midtone;
    const index = Math.floor(color.h / 15) % buckets.length;
    const bucket = buckets[index]!;
    const radians = color.h * Math.PI / 180;
    bucket.weight += weight;
    bucket.lightness += color.l * weight;
    bucket.chroma += color.c * weight;
    bucket.hueX += Math.cos(radians) * weight;
    bucket.hueY += Math.sin(radians) * weight;
  }
  if (opaquePixels === 0) return undefined;
  const averageLightness = lightnessTotal / Math.max(0.0001, backgroundPixels);
  const tone = toneForArtwork(averageLightness, brightPixels / backgroundPixels, shadowPixels / backgroundPixels);
  const ranked = buckets
    .map((bucket, index) => ({ bucket, index }))
    .filter(({ bucket }) => bucket.weight > 0)
    .sort((left, right) => right.bucket.weight - left.bucket.weight);
  if (ranked.length === 0 || ranked[0]!.bucket.weight < opaquePixels * 0.012) {
    return neutralPalette(averageLightness, tone);
  }
  const primary = bucketColor(ranked[0]!.bucket);
  const secondaryCandidate = ranked
    .slice(1)
    .map(({ bucket }) => ({ bucket, color: bucketColor(bucket) }))
    .filter(({ color }) => circularDistance(primary.h, color.h) >= 32)
    .sort((left, right) => (
      right.bucket.weight * (0.55 + circularDistance(primary.h, right.color.h) / 180 * 0.45)
      - left.bucket.weight * (0.55 + circularDistance(primary.h, left.color.h) / 180 * 0.45)
    ))[0];
  const secondary = secondaryCandidate?.color ?? {
    l: primary.l,
    c: primary.c * 0.72,
    h: (primary.h + 30) % 360,
  };
  const light = tone === "light";
  const dusk = tone === "dusk";
  const signal = toHex({ l: light ? clamp(primary.l, 0.64, 0.75) : dusk ? clamp(primary.l, 0.62, 0.72) : clamp(primary.l, 0.62, 0.78), c: clamp(primary.c, 0.085, 0.20), h: primary.h });
  const signalAlt = toHex({ l: light ? clamp(secondary.l, 0.66, 0.78) : dusk ? clamp(secondary.l, 0.66, 0.76) : clamp(secondary.l, 0.67, 0.82), c: clamp(secondary.c, 0.07, 0.17), h: secondary.h });
  const ink = toHex({ l: light ? 0.975 : 0.955, c: Math.min(0.018, primary.c * 0.1), h: primary.h });
  return {
    ground: toHex({ l: light ? 0.30 : dusk ? 0.28 : 0.12, c: Math.min(light ? 0.075 : 0.05, Math.max(0.035, primary.c * 0.38)), h: primary.h }),
    groundLift: toHex({ l: light ? 0.43 : dusk ? 0.43 : 0.25, c: Math.min(light ? 0.11 : 0.08, Math.max(0.045, primary.c * 0.58)), h: primary.h }),
    ink,
    inkMuted: rgba(ink, light ? 0.43 : dusk ? 0.39 : 0.34),
    signal,
    signalAlt,
    warm: toHex({ l: light ? 0.72 : 0.75, c: Math.min(0.14, Math.max(0.065, primary.c * 0.72)), h: circularDistance(primary.h, 55) < 80 ? primary.h : 55 }),
    secondary: signalAlt,
    veil: rgba(signal, 0.105),
  };
};
