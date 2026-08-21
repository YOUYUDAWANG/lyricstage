export interface VocalTimingSampleV1 {
  atMs: number;
  presence: number;
  attack: number;
  confidence: number;
}

export interface VocalTimingMapV1 {
  version: "vocal-timing-map-v1";
  source: "tab-capture";
  durationMs: number;
  fromMs: number;
  toMs: number;
  featureRateHz: number;
  samples: VocalTimingSampleV1[];
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const unit = (value: unknown): value is number =>
  finite(value) && value >= 0 && value <= 1;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
const rounded = (value: number): number => Math.round(value * 10_000) / 10_000;

export interface VocalTimingFeatureInputV1 {
  atMs: number;
  energy: number;
  centerBass: number;
  centerMid: number;
  centerTreble: number;
  sideMid: number;
  centerFlux: number;
}

export const compileVocalTimingSampleV1 = (
  input: VocalTimingFeatureInputV1,
): VocalTimingSampleV1 | undefined => {
  if (
    !finite(input.atMs) || input.atMs < 0
    || !unit(input.energy) || !unit(input.centerBass) || !unit(input.centerMid)
    || !unit(input.centerTreble) || !unit(input.sideMid) || !unit(input.centerFlux)
  ) return undefined;
  const centeredness = clamp((input.centerMid - input.sideMid + 0.08) / 0.34, 0, 1);
  const vocalBand = clamp(
    (input.centerMid - input.centerBass * 0.32 - input.centerTreble * 0.16) * 1.9 + 0.16,
    0,
    1,
  );
  const presence = clamp(
    (centeredness * 0.46 + vocalBand * 0.54) * clamp(input.energy * 3.4, 0, 1),
    0,
    1,
  );
  const attack = presence > 0.1
    ? clamp(input.centerFlux * 2.8 + Math.max(0, presence - 0.55) * 0.35, 0, 1)
    : 0;
  const confidence = clamp(
    centeredness * 0.45 + vocalBand * 0.35 + clamp(input.energy * 2.2, 0, 1) * 0.2,
    0,
    1,
  );
  return { atMs: input.atMs, presence, attack, confidence };
};

export const compileVocalTimingMapV1 = (
  durationMs: number,
  samples: VocalTimingSampleV1[],
  windowMs = 20_000,
): VocalTimingMapV1 | undefined => {
  if (!finite(durationMs) || durationMs <= 0 || durationMs > 7_200_000 || samples.length === 0) {
    return undefined;
  }
  const ordered = [...samples].sort((left, right) => left.atMs - right.atMs);
  const latestMs = ordered.at(-1)!.atMs;
  const fromMs = Math.max(0, latestMs - clamp(windowMs, 4_000, 30_000));
  const windowed = ordered.filter((sample) => sample.atMs >= fromMs).slice(-640);
  if (windowed.length === 0) return undefined;
  const deltas = windowed.slice(1)
    .map((sample, index) => sample.atMs - windowed[index]!.atMs)
    .filter((value) => value > 0 && value <= 250)
    .sort((left, right) => left - right);
  const medianDelta = deltas[Math.floor(deltas.length / 2)] ?? 50;
  return sanitizeVocalTimingMapV1({
    version: "vocal-timing-map-v1",
    source: "tab-capture",
    durationMs,
    fromMs: windowed[0]!.atMs,
    toMs: windowed.at(-1)!.atMs,
    featureRateHz: clamp(1000 / medianDelta, 4, 30),
    samples: windowed,
  });
};

export const sanitizeVocalTimingMapV1 = (value: unknown): VocalTimingMapV1 | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const wire = value as Partial<VocalTimingMapV1>;
  if (
    wire.version !== "vocal-timing-map-v1"
    || wire.source !== "tab-capture"
    || !finite(wire.durationMs) || wire.durationMs <= 0 || wire.durationMs > 7_200_000
    || !finite(wire.fromMs) || !finite(wire.toMs)
    || wire.fromMs < 0 || wire.toMs < wire.fromMs || wire.toMs > wire.durationMs + 1_000
    || !finite(wire.featureRateHz) || wire.featureRateHz < 4 || wire.featureRateHz > 30
    || !Array.isArray(wire.samples) || wire.samples.length === 0 || wire.samples.length > 640
  ) return undefined;
  let previousAtMs = -1;
  const samples: VocalTimingSampleV1[] = [];
  for (const candidate of wire.samples) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const sample = candidate as Partial<VocalTimingSampleV1>;
    if (
      !finite(sample.atMs) || sample.atMs <= previousAtMs
      || sample.atMs < wire.fromMs - 1 || sample.atMs > wire.toMs + 1
      || !unit(sample.presence) || !unit(sample.attack) || !unit(sample.confidence)
    ) return undefined;
    previousAtMs = sample.atMs;
    samples.push({
      atMs: Math.round(sample.atMs),
      presence: rounded(sample.presence),
      attack: rounded(sample.attack),
      confidence: rounded(sample.confidence),
    });
  }
  return {
    version: "vocal-timing-map-v1",
    source: "tab-capture",
    durationMs: Math.round(wire.durationMs),
    fromMs: Math.round(wire.fromMs),
    toMs: Math.round(wire.toMs),
    featureRateHz: rounded(wire.featureRateHz),
    samples,
  };
};

/**
 * Warp the text-only estimate with a bounded, local acoustic clock.
 * The map is deliberately rolling and low confidence: it may change pacing,
 * but it never becomes a persisted/native word timestamp source.
 */
export const vocalAwareVirtualTimeMs = (
  lineFromMs: number,
  estimatedEndMs: number,
  timeMs: number,
  map?: VocalTimingMapV1,
): number => {
  const spanMs = estimatedEndMs - lineFromMs;
  if (!map || spanMs < 400 || timeMs <= lineFromMs || timeMs >= estimatedEndMs) return timeMs;
  const elapsedMs = timeMs - lineFromMs;
  const relevant = map.samples.filter((sample) => sample.atMs >= lineFromMs && sample.atMs <= timeMs);
  if (relevant.length < 6 || relevant.at(-1)!.atMs - relevant[0]!.atMs < 260) return timeMs;

  let coveredMs = 0;
  let confidenceTime = 0;
  let deviationMs = 0;
  for (let index = 0; index < relevant.length; index += 1) {
    const sample = relevant[index]!;
    const nextAtMs = Math.min(timeMs, relevant[index + 1]?.atMs ?? timeMs);
    const deltaMs = clamp(nextAtMs - sample.atMs, 0, 120);
    if (deltaMs <= 0) continue;
    const acousticPace = clamp(0.22 + sample.presence * 1.15 + sample.attack * 0.72, 0.18, 1.95);
    const trustedPace = 1 + (acousticPace - 1) * sample.confidence;
    deviationMs += (trustedPace - 1) * deltaMs;
    confidenceTime += sample.confidence * deltaMs;
    coveredMs += deltaMs;
  }
  const coverage = coveredMs / Math.max(1, elapsedMs);
  const meanConfidence = confidenceTime / Math.max(1, coveredMs);
  if (coverage < 0.52 || meanConfidence < 0.28) return timeMs;

  const baselineProgress = clamp(elapsedMs / spanMs, 0, 1);
  const endpointEnvelope = Math.sin(Math.PI * baselineProgress);
  const normalizedShift = clamp(deviationMs / spanMs, -0.14, 0.14) * endpointEnvelope;
  const enhancedProgress = clamp(baselineProgress + normalizedShift, 0, 1);
  return lineFromMs + enhancedProgress * spanMs;
};
