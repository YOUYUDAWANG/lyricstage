import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { parseLRC } from "./lrc";
import { compilePerformancePlan, prepareTimeline, sampleTimeline } from "./plan";

describe("LyricStage core", () => {
  it("parses line-timed LRC without inventing word timing", () => {
    const document = parseLRC(
      "[00:01.00]first line\n[00:04.50]second line",
      "fixture:lrc",
      9000,
    );
    expect(document.lines.map((line) => [line.fromMs, line.toMs])).toEqual([
      [1000, 4500],
      [4500, 9000],
    ]);
    expect(document.lines.every((line) => line.words === undefined)).toBe(true);
  });

  it("normalizes fractional media duration into the integer lyric contract", () => {
    const document = parseLRC("[00:01.00]line", "fixture:fractional", 9000.437);
    expect(document.durationMs).toBe(9000);
    expect(document.lines[0]?.toMs).toBe(9000);
  });

  it("compiles a deterministic semantic plan", () => {
    const first = compilePerformancePlan(lyricFixtures.repeatedHook);
    const second = compilePerformancePlan(structuredClone(lyricFixtures.repeatedHook));
    expect(first).toEqual(second);
    expect(first.planIdentity).toBe(second.planIdentity);
  });

  it("uses chorus memory only for repeated text", () => {
    const plan = compilePerformancePlan(lyricFixtures.repeatedHook);
    expect(plan.scenes[2].family).toBe("chorusMemory");
    expect(plan.scenes[3].repetitionIndex).toBe(1);
    expect(plan.scenes[0].family).not.toBe("chorusMemory");
  });

  it("samples simultaneous duet scenes from a prebuilt boundary index", () => {
    const plan = compilePerformancePlan(lyricFixtures.duetOverlap);
    const timeline = prepareTimeline(plan);
    expect(sampleTimeline(timeline, 14000)).toEqual([2, 3]);
    expect(sampleTimeline(timeline, 19500)).toEqual([4]);
  });

  it("returns an empty stage during a real instrumental gap", () => {
    const plan = compilePerformancePlan(lyricFixtures.longSongStructure);
    expect(sampleTimeline(prepareTimeline(plan), 116000)).toEqual([]);
  });
});
