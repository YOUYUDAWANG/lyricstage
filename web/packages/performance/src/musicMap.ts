export type MusicMapLandmarkTypeV1 =
  | "silence"
  | "onset_cluster"
  | "energy_lift"
  | "energy_release"
  | "section_boundary";

export interface MusicMapSegmentV1 {
  fromMs: number;
  toMs: number;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  brightness: number;
  flux: number;
  onsetDensity: number;
  stereoWidth: number;
}

export interface MusicMapLandmarkV1 {
  atMs: number;
  type: MusicMapLandmarkTypeV1;
  strength: number;
}

export interface MusicMapV1 {
  version: "music-map-v1";
  source: "tab-capture";
  durationMs: number;
  analyzedMs: number;
  featureRateHz: number;
  tempo: { bpm: number; confidence: number } | null;
  summary: {
    dynamicRange: number;
    meanEnergy: number;
    peakEnergy: number;
    silenceRatio: number;
  };
  segments: MusicMapSegmentV1[];
  landmarks: MusicMapLandmarkV1[];
}

export interface MusicFeatureFrameV1 {
  atMs: number;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  brightness: number;
  flux: number;
  onset: number;
  stereoWidth: number;
}

const landmarkTypes = new Set<MusicMapLandmarkTypeV1>([
  "silence",
  "onset_cluster",
  "energy_lift",
  "energy_release",
  "section_boundary",
]);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const unit = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1;
const rounded = (value: number): number => Math.round(value * 10_000) / 10_000;
const mean = (values: number[]): number => values.length === 0
  ? 0
  : values.reduce((total, value) => total + value, 0) / values.length;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const compileMusicMapV1 = (
  durationMs: number,
  frames: MusicFeatureFrameV1[],
  tempo: MusicMapV1["tempo"] = null,
): MusicMapV1 | undefined => {
  if (!finite(durationMs) || durationMs <= 0 || durationMs > 7_200_000 || frames.length === 0 || frames.length > 300_000) {
    return undefined;
  }
  let previousAt = -1;
  for (const frame of frames) {
    if (
      !finite(frame.atMs) || frame.atMs < previousAt || frame.atMs < 0 || frame.atMs > durationMs + 1_000
      || !unit(frame.energy) || !unit(frame.bass) || !unit(frame.mid) || !unit(frame.treble)
      || !unit(frame.brightness) || !unit(frame.flux) || !unit(frame.onset) || !unit(frame.stereoWidth)
    ) return undefined;
    previousAt = frame.atMs;
  }
  const deltas = frames.slice(1).map((frame, index) => frame.atMs - frames[index]!.atMs).filter((value) => value > 0);
  const sortedDeltas = [...deltas].sort((left, right) => left - right);
  const medianDelta = sortedDeltas[Math.floor(sortedDeltas.length / 2)] ?? 1000 / 30;
  const featureRateHz = clamp(1000 / medianDelta, 8, 60);
  const bucketMs = clamp(Math.ceil(durationMs / 48 / 250) * 250, 2_000, 8_000);
  const segments: MusicMapSegmentV1[] = [];
  for (let fromMs = 0; fromMs < durationMs && segments.length < 96; fromMs += bucketMs) {
    const toMs = Math.min(durationMs, fromMs + bucketMs);
    const bucket = frames.filter((frame) => frame.atMs >= fromMs && frame.atMs < toMs);
    if (bucket.length === 0) continue;
    segments.push({
      fromMs,
      toMs,
      energy: mean(bucket.map((frame) => frame.energy)),
      bass: mean(bucket.map((frame) => frame.bass)),
      mid: mean(bucket.map((frame) => frame.mid)),
      treble: mean(bucket.map((frame) => frame.treble)),
      brightness: mean(bucket.map((frame) => frame.brightness)),
      flux: mean(bucket.map((frame) => frame.flux)),
      onsetDensity: mean(bucket.map((frame) => frame.onset)),
      stereoWidth: mean(bucket.map((frame) => frame.stereoWidth)),
    });
  }
  const landmarks: MusicMapLandmarkV1[] = [];
  segments.forEach((segment, index) => {
    const previous = segments[index - 1];
    if (segment.energy < 0.075) {
      landmarks.push({ atMs: segment.fromMs, type: "silence", strength: clamp(1 - segment.energy / 0.075, 0, 1) });
    }
    if (segment.onsetDensity > 0.64 || segment.flux > 0.72) {
      landmarks.push({ atMs: segment.fromMs, type: "onset_cluster", strength: Math.max(segment.onsetDensity, segment.flux) });
    }
    if (!previous) return;
    const energyDelta = segment.energy - previous.energy;
    if (energyDelta > 0.16) landmarks.push({ atMs: segment.fromMs, type: "energy_lift", strength: clamp(energyDelta * 2.6, 0, 1) });
    if (energyDelta < -0.16) landmarks.push({ atMs: segment.fromMs, type: "energy_release", strength: clamp(-energyDelta * 2.6, 0, 1) });
    const spectralDelta = Math.abs(segment.brightness - previous.brightness)
      + Math.abs(segment.bass - previous.bass)
      + Math.abs(segment.stereoWidth - previous.stereoWidth);
    if (spectralDelta > 0.52) landmarks.push({ atMs: segment.fromMs, type: "section_boundary", strength: clamp(spectralDelta / 1.2, 0, 1) });
  });
  const energies = frames.map((frame) => frame.energy).sort((left, right) => left - right);
  const percentile = (position: number): number => energies[Math.min(energies.length - 1, Math.floor((energies.length - 1) * position))] ?? 0;
  return sanitizeMusicMapV1({
    version: "music-map-v1",
    source: "tab-capture",
    durationMs,
    // This is analyzed coverage, not the absolute playback position of the
    // newest frame. Capture can begin halfway through a song or revisit an
    // earlier section after a seek.
    analyzedMs: Math.min(durationMs, Math.round(frames.length / featureRateHz * 1000)),
    featureRateHz,
    tempo,
    summary: {
      dynamicRange: clamp(percentile(0.9) - percentile(0.1), 0, 1),
      meanEnergy: mean(energies),
      peakEnergy: percentile(0.98),
      silenceRatio: frames.filter((frame) => frame.energy < 0.06).length / frames.length,
    },
    segments,
    landmarks: landmarks.sort((left, right) => left.atMs - right.atMs).slice(0, 256),
  });
};

export const sanitizeMusicMapV1 = (value: unknown): MusicMapV1 | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const wire = value as Partial<MusicMapV1>;
  if (wire.version !== "music-map-v1" || wire.source !== "tab-capture") return undefined;
  if (
    !finite(wire.durationMs) || wire.durationMs <= 0 || wire.durationMs > 7_200_000
    || !finite(wire.analyzedMs) || wire.analyzedMs < 0 || wire.analyzedMs > wire.durationMs + 1_000
    || !finite(wire.featureRateHz) || wire.featureRateHz < 8 || wire.featureRateHz > 60
    || !wire.summary || typeof wire.summary !== "object" || Array.isArray(wire.summary)
    || !unit(wire.summary.dynamicRange)
    || !unit(wire.summary.meanEnergy)
    || !unit(wire.summary.peakEnergy)
    || !unit(wire.summary.silenceRatio)
    || !Array.isArray(wire.segments) || wire.segments.length > 96
    || !Array.isArray(wire.landmarks) || wire.landmarks.length > 256
  ) return undefined;
  let previousSegmentFrom = -1;
  const segments: MusicMapSegmentV1[] = [];
  for (const candidate of wire.segments) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const segment = candidate as Partial<MusicMapSegmentV1>;
    if (
      !finite(segment.fromMs) || !finite(segment.toMs)
      || segment.fromMs < previousSegmentFrom || segment.fromMs < 0
      || segment.toMs <= segment.fromMs || segment.toMs > wire.durationMs + 1_000
      || !unit(segment.energy) || !unit(segment.bass) || !unit(segment.mid)
      || !unit(segment.treble) || !unit(segment.brightness) || !unit(segment.flux)
      || !unit(segment.onsetDensity) || !unit(segment.stereoWidth)
    ) return undefined;
    previousSegmentFrom = segment.fromMs;
    segments.push({
      fromMs: Math.round(segment.fromMs),
      toMs: Math.round(segment.toMs),
      energy: rounded(segment.energy),
      bass: rounded(segment.bass),
      mid: rounded(segment.mid),
      treble: rounded(segment.treble),
      brightness: rounded(segment.brightness),
      flux: rounded(segment.flux),
      onsetDensity: rounded(segment.onsetDensity),
      stereoWidth: rounded(segment.stereoWidth),
    });
  }
  let previousLandmarkAt = -1;
  const landmarks: MusicMapLandmarkV1[] = [];
  for (const candidate of wire.landmarks) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const landmark = candidate as Partial<MusicMapLandmarkV1>;
    if (
      !finite(landmark.atMs) || landmark.atMs < previousLandmarkAt
      || landmark.atMs < 0 || landmark.atMs > wire.durationMs + 1_000
      || !landmarkTypes.has(landmark.type as MusicMapLandmarkTypeV1)
      || !unit(landmark.strength)
    ) return undefined;
    previousLandmarkAt = landmark.atMs;
    landmarks.push({
      atMs: Math.round(landmark.atMs),
      type: landmark.type as MusicMapLandmarkTypeV1,
      strength: rounded(landmark.strength),
    });
  }
  const tempo = wire.tempo === null
    ? null
    : wire.tempo && typeof wire.tempo === "object" && !Array.isArray(wire.tempo)
      && finite(wire.tempo.bpm) && wire.tempo.bpm >= 40 && wire.tempo.bpm <= 240
      && unit(wire.tempo.confidence)
      ? { bpm: rounded(wire.tempo.bpm), confidence: rounded(wire.tempo.confidence) }
      : undefined;
  if (tempo === undefined) return undefined;
  return {
    version: "music-map-v1",
    source: "tab-capture",
    durationMs: Math.round(wire.durationMs),
    analyzedMs: Math.round(wire.analyzedMs),
    featureRateHz: rounded(wire.featureRateHz),
    tempo,
    summary: {
      dynamicRange: rounded(wire.summary.dynamicRange),
      meanEnergy: rounded(wire.summary.meanEnergy),
      peakEnergy: rounded(wire.summary.peakEnergy),
      silenceRatio: rounded(wire.summary.silenceRatio),
    },
    segments,
    landmarks,
  };
};
