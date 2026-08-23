import { describe, expect, it } from "vitest";
import { compileReactiveBusV1, reactiveBusAtTimeV1, sanitizeReactiveBusV1 } from "./reactiveBus";

const frame = { atMs: 750, energy: 0.5, bass: 0.7, mid: 0.4, treble: 0.3, brightness: 0.6, flux: 0.2, onset: 0.8, stereoWidth: 0.55 };

describe("ReactiveBusV1", () => {
  it("keeps beat phase null unless tempo confidence is reliable", () => {
    expect(compileReactiveBusV1(frame)?.beatPhase).toBeNull();
    expect(compileReactiveBusV1(frame, { bpm: 120, confidence: 0.6 })?.beatPhase).toBeNull();
    expect(compileReactiveBusV1(frame, { bpm: 120, confidence: 0.9 })?.beatPhase).toBe(0.5);
  });

  it("is a bounded deterministic snapshot rather than an integrated wall-clock phase", () => {
    expect(compileReactiveBusV1(frame)).toEqual(compileReactiveBusV1(frame));
    expect(sanitizeReactiveBusV1(compileReactiveBusV1(frame))).toEqual(compileReactiveBusV1(frame));
    expect(reactiveBusAtTimeV1(compileReactiveBusV1(frame), 1_400)).toBeDefined();
    expect(reactiveBusAtTimeV1(compileReactiveBusV1(frame), 1_600)).toBeUndefined();
  });
});
