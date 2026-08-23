import type { MusicFeatureFrameV1, MusicMapV1 } from "./musicMap";

export interface ReactiveBusV1 {
  version: "reactive-bus-v1";
  source: "tab-capture";
  atMs: number;
  beatPhase: number | null;
  energy: number;
  bass: number;
  brightness: number;
  onset: number;
  stereoWidth: number;
  silence: number;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const unit = (value: number): number => Math.min(1, Math.max(0, value));
const rounded = (value: number): number => Math.round(value * 10_000) / 10_000;

export const compileReactiveBusV1 = (
  frame: MusicFeatureFrameV1,
  tempo: MusicMapV1["tempo"] = null,
): ReactiveBusV1 | undefined => {
  if (!finite(frame.atMs) || frame.atMs < 0
    || [frame.energy, frame.bass, frame.brightness, frame.onset, frame.stereoWidth].some((value) => !finite(value) || value < 0 || value > 1)) return undefined;
  const reliableTempo = tempo && tempo.confidence >= 0.78 ? tempo : null;
  const beatPhase = reliableTempo
    ? ((frame.atMs / (60_000 / reliableTempo.bpm)) % 1 + 1) % 1
    : null;
  return {
    version: "reactive-bus-v1",
    source: "tab-capture",
    atMs: Math.round(frame.atMs),
    beatPhase: beatPhase === null ? null : rounded(beatPhase),
    energy: rounded(frame.energy),
    bass: rounded(frame.bass),
    brightness: rounded(frame.brightness),
    onset: rounded(frame.onset),
    stereoWidth: rounded(frame.stereoWidth),
    silence: rounded(unit(1 - frame.energy / 0.075)),
  };
};

export const sanitizeReactiveBusV1 = (value: unknown): ReactiveBusV1 | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const bus = value as Partial<ReactiveBusV1>;
  const values = [bus.energy, bus.bass, bus.brightness, bus.onset, bus.stereoWidth, bus.silence];
  if (bus.version !== "reactive-bus-v1" || bus.source !== "tab-capture" || !finite(bus.atMs) || bus.atMs < 0
    || values.some((item) => !finite(item) || item < 0 || item > 1)
    || bus.beatPhase !== null && (!finite(bus.beatPhase) || bus.beatPhase < 0 || bus.beatPhase > 1)) return undefined;
  return {
    version: "reactive-bus-v1", source: "tab-capture", atMs: Math.round(bus.atMs),
    beatPhase: bus.beatPhase === null ? null : rounded(bus.beatPhase),
    energy: rounded(bus.energy!), bass: rounded(bus.bass!), brightness: rounded(bus.brightness!),
    onset: rounded(bus.onset!), stereoWidth: rounded(bus.stereoWidth!), silence: rounded(bus.silence!),
  };
};

export const reactiveBusAtTimeV1 = (
  bus: ReactiveBusV1 | undefined,
  timeMs: number,
  toleranceMs = 750,
): ReactiveBusV1 | undefined => bus && Number.isFinite(timeMs) && Math.abs(bus.atMs - timeMs) <= toleranceMs ? bus : undefined;
