import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { compilePerformancePlan } from "@lyricstage/core";
import { compileLocalDirectorPlanV1, type DirectorPlanV1 } from "@lyricstage/performance";
import { prepareStage } from "./prepare";
import { directedPaletteForIndexV1, prepareDirectedStageV1 } from "./prepareDirected";
import { drawDramaticScenesV1 } from "./drawDramatic";
import {
  clearCanvasBackingStoreV1,
  directedFieldOpacityV1,
  duplicateLyricTextPrimitiveV1,
  dissolveEnvelopeAtV1,
  fitAnchoredLineV1,
  readingCompositionForV1,
  readingContextLinesV1,
  readingStackStateAtV1,
  reducedMotionPrimitiveUseV1,
} from "./drawDirected";

const measure = (text: string, font: string): number => {
  const size = Number(font.match(/([0-9.]+)px/)?.[1] ?? 48);
  return Array.from(text).length * size * 0.58;
};

const recordingContext = (): { context: CanvasRenderingContext2D; operations: unknown[][] } => {
  const operations: unknown[][] = [];
  const values: Record<string | symbol, unknown> = {
    canvas: { width: 1920, height: 1080 },
    globalAlpha: 1,
    lineWidth: 1,
  };
  const context = new Proxy(values, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args: unknown[]) => operations.push([String(property), ...args]);
    },
    set(target, property, value) {
      target[property] = value;
      operations.push([`set:${String(property)}`, value]);
      return true;
    },
  });
  return { context: context as unknown as CanvasRenderingContext2D, operations };
};

describe("PreparedStageV0", () => {
  it("keeps a long line inside the fullscreen safe width", () => {
    const lyrics = lyricFixtures.longLine;
    const stage = prepareStage(
      lyrics,
      compilePerformancePlan(lyrics),
      { width: 1920, height: 1080, fontFamily: "TestSans", rendererVersion: "test" },
      measure,
    );
    for (const line of stage.lines) {
      expect(line.bounds.x).toBeGreaterThanOrEqual(1920 * 0.06);
      expect(line.bounds.x + line.bounds.width).toBeLessThanOrEqual(1920 * 0.94 + 1);
      expect(line.glyphs.map((glyph) => glyph.text).join("")).toBe(lyrics.lines[line.lineIndex].text);
    }
  });

  it("does not manufacture staged glyph timing for a line-only fixture", () => {
    const lyrics = lyricFixtures.lineOnlyJA;
    const stage = prepareStage(
      lyrics,
      compilePerformancePlan(lyrics),
      { width: 1280, height: 720, fontFamily: "TestSans", rendererVersion: "test" },
      measure,
    );
    for (const line of stage.lines) {
      expect(new Set(line.glyphs.map((glyph) => glyph.revealMs))).toEqual(new Set([lyrics.lines[line.lineIndex].fromMs]));
    }
  });

  it("preserves real word entry times for matched word glyphs", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const stage = prepareStage(
      lyrics,
      compilePerformancePlan(lyrics),
      { width: 1920, height: 1080, fontFamily: "TestSans", rendererVersion: "test" },
      measure,
    );
    const firstLine = stage.lines[0];
    const lightGlyph = firstLine.glyphs.find((glyph) => glyph.text === "光");
    const traceGlyph = firstLine.glyphs.find((glyph) => glyph.text === "t");
    expect(lightGlyph?.revealMs).toBe(1000);
    expect(traceGlyph?.revealMs).toBe(2500);
  });

  it("invalidates prepared identity when the viewport changes", () => {
    const lyrics = lyricFixtures.repeatedHook;
    const plan = compilePerformancePlan(lyrics);
    const first = prepareStage(
      lyrics,
      plan,
      { width: 1920, height: 1080, fontFamily: "TestSans", rendererVersion: "test" },
      measure,
    );
    const second = prepareStage(
      lyrics,
      plan,
      { width: 1280, height: 720, fontFamily: "TestSans", rendererVersion: "test" },
      measure,
    );
    expect(first.identity).not.toBe(second.identity);
    expect(first.plan.planIdentity).toBe(second.plan.planIdentity);
  });
});

describe("PreparedDirectedStageV1", () => {
  it("expands a directed lyric phrase into a seven-line narrative field", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const local = compileLocalDirectorPlanV1(lyrics);
    const plan: DirectorPlanV1 = {
      ...local,
      source: "ai",
      planIdentity: `${local.planIdentity}:dense-reading`,
      sections: local.sections.map((section) => ({ ...section, intensity: 0.86 })),
    };
    const stage = prepareDirectedStageV1(
      lyrics,
      plan,
      { width: 1920, height: 1080, rendererVersion: "test-dense-reading" },
      measure,
    );
    const current = stage.lines[Math.floor(stage.lines.length / 2)]!;
    const context = readingContextLinesV1(stage, current);

    expect(context.map((line) => line.lineIndex)).toHaveLength(7);
    expect(context.map((line) => line.lineIndex)).toContain(current.lineIndex);
  });

  it("gives final dissolution a bounded clock envelope instead of persistent hard strips", () => {
    expect(dissolveEnvelopeAtV1(10_000, 20_000, 9_999, false)).toBe(0);
    expect(dissolveEnvelopeAtV1(10_000, 20_000, 10_000, false)).toBe(0);
    expect(dissolveEnvelopeAtV1(10_000, 20_000, 12_000, false)).toBeCloseTo(1);
    expect(dissolveEnvelopeAtV1(10_000, 20_000, 19_500, false)).toBeGreaterThan(0);
    expect(dissolveEnvelopeAtV1(10_000, 20_000, 19_500, false)).toBeLessThan(0.7);
    expect(dissolveEnvelopeAtV1(10_000, 20_000, 20_000, false)).toBe(0);
    expect(dissolveEnvelopeAtV1(10_000, 20_000, 15_000, true)).toBe(0.28);
  });

  it("consumes primitive reduced-motion fallbacks while preserving static primitives", () => {
    expect(reducedMotionPrimitiveUseV1({
      primitive: "transition.dissolve",
      intensity: 0.7,
      direction: -1,
    })).toEqual({
      primitive: "density.release",
      intensity: 0.7,
    });
    const staticUse = { primitive: "field.aperture", intensity: 0.4 } as const;
    expect(reducedMotionPrimitiveUseV1(staticUse)).toBe(staticUse);
  });

  it("clears the entire physical backing store before drawing the next frame", () => {
    const operations: unknown[][] = [];
    clearCanvasBackingStoreV1({
      canvas: { width: 1943, height: 1570 },
      save: () => operations.push(["save"]),
      setTransform: (...values: number[]) => operations.push(["setTransform", ...values]),
      clearRect: (...values: number[]) => operations.push(["clearRect", ...values]),
      restore: () => operations.push(["restore"]),
    } as unknown as CanvasRenderingContext2D);

    expect(operations).toEqual([
      ["save"],
      ["setTransform", 1, 0, 0, 1, 0, 0],
      ["clearRect", 0, 0, 1943, 1570],
      ["restore"],
    ]);
  });

  it("keeps the full-stage field dim and rejects duplicate lyric text primitives", () => {
    expect(directedFieldOpacityV1()).toBe(0.42);
    expect([
      "glyph.weightPulse",
      "glyph.offsetSnap",
      "token.echo",
      "phrase.breathe",
    ].every((primitive) => duplicateLyricTextPrimitiveV1(primitive as never))).toBe(true);
    expect(duplicateLyricTextPrimitiveV1("token.underlinePath")).toBe(false);
  });

  it("prepares deterministic 8-20s dramatic scenes with one recurring motif", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const plan = compileLocalDirectorPlanV1(lyrics);
    const viewport = { width: 1920, height: 1080, rendererVersion: "test-dramatic-score" };
    const first = prepareDirectedStageV1(lyrics, plan, viewport, measure);
    const second = prepareDirectedStageV1(lyrics, plan, viewport, measure);
    expect(first.dramaticMoments).toHaveLength(2);
    expect(first.dramaticMoments).toEqual(second.dramaticMoments);
    expect(first.dramaticMoments[0]?.moment.motifState).toBe("seed");
    expect(first.dramaticMoments[1]?.moment.purpose).toBe("resolution");
    expect(new Set(first.dramaticMoments.map((moment) => moment.moment.actorFamily))).toEqual(
      new Set([plan.dramaticScore.motifActor.family]),
    );
    first.dramaticMoments.forEach((moment) => {
      expect(moment.toMs - moment.fromMs).toBeGreaterThanOrEqual(8_000);
      expect(moment.toMs - moment.fromMs).toBeLessThanOrEqual(20_000);
      expect(moment.fromMs).toBeLessThan(moment.anticipationEndMs);
      expect(moment.anticipationEndMs).toBeLessThan(moment.eventEndMs);
      expect(moment.eventEndMs).toBeLessThan(moment.consequenceEndMs);
      expect(moment.consequenceEndMs).toBeLessThanOrEqual(moment.toMs);
      expect(moment.memoryToMs).toBeGreaterThanOrEqual(moment.toMs);
      expect(moment.memoryToMs - moment.toMs).toBeLessThanOrEqual(18_000);
    });
  });

  it("precomputes bounded lyric gestures without changing the readable lyric glyphs", () => {
    const lyrics = lyricFixtures.repeatedHook;
    const plan = compileLocalDirectorPlanV1(lyrics);
    const viewport = { width: 1920, height: 1080, rendererVersion: "test-lyric-gestures" };
    const first = prepareDirectedStageV1(lyrics, plan, viewport, measure);
    const second = prepareDirectedStageV1(lyrics, plan, viewport, measure);
    expect(first.gestures.length).toBeGreaterThan(0);
    expect(first.gestures).toEqual(second.gestures);
    first.gestures.forEach((gesture) => {
      const line = first.linesByIndex.get(gesture.lineIndex)!;
      expect(gesture.bounds.width).toBeGreaterThan(0);
      expect(gesture.bounds.height).toBeGreaterThan(0);
      expect(gesture.fromMs).toBeGreaterThanOrEqual(line.fromMs);
      expect(gesture.toMs).toBeLessThanOrEqual(line.toMs);
      expect(gesture.targetGlyphIndices.length).toBeGreaterThan(0);
      expect(line.glyphs.map((glyph) => glyph.text).join("")).toBe(lyrics.lines[line.lineIndex]!.text);
    });
  });

  it("keeps a reduced-motion dramatic scene static between structural boundaries", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const plan = compileLocalDirectorPlanV1(lyrics);
    const viewport = { width: 1920, height: 1080, rendererVersion: "test-static-dramatic" };
    const stage = prepareDirectedStageV1(lyrics, plan, viewport, measure);
    const moment = stage.dramaticMoments[0]!;
    const palette = directedPaletteForIndexV1(0);
    const sample = (timeMs: number, reduceMotion: boolean) => {
      const { context, operations } = recordingContext();
      drawDramaticScenesV1(context, stage, timeMs, reduceMotion, palette, "scenic");
      return operations;
    };
    const firstTime = moment.fromMs + 1_000;
    const secondTime = moment.fromMs + 2_000;
    expect(sample(firstTime, true)).toEqual(sample(secondTime, true));
    expect(sample(firstTime, false)).not.toEqual(sample(secondTime, false));
  });

  it("keeps compact Japanese reading lines on one row before reducing the whole composition", () => {
    const lyrics = lyricFixtures.lineOnlyJA;
    const plan = compileLocalDirectorPlanV1(lyrics);
    const stage = prepareDirectedStageV1(
      lyrics,
      plan,
      { width: 1920, height: 1080, rendererVersion: "test-compact-ja" },
      measure,
    );
    stage.lines.forEach((line) => {
      expect(new Set(line.glyphs.map((glyph) => glyph.row))).toEqual(new Set([0]));
      expect(line.glyphs.map((glyph) => glyph.text).join("")).toBe(lyrics.lines[line.lineIndex]!.text);
    });
  });

  it("keeps a long AI-directed Japanese line complete inside the final anchored safe area", () => {
    const lyrics = structuredClone(lyricFixtures.longLine);
    lyrics.lines[0]!.text = "生きるための呪いをそこに残したままでもう一度あなたの声を聴かせて";
    const local = compileLocalDirectorPlanV1(lyrics);
    const plan: DirectorPlanV1 = {
      ...local,
      source: "ai",
      planIdentity: "long-ai-safe-area",
      sections: local.sections.map((section) => ({ ...section, layout: "editorialSplit", typography: "jpMincho", intensity: 1 })),
      directives: local.directives.map((directive) => ({ ...directive, alignment: "trailing", fontScale: 1.22, behavior: "drift", paletteRole: "warm" })),
    };
    const viewport = { width: 1280, height: 900, rendererVersion: "test-directed-long" };
    const stage = prepareDirectedStageV1(lyrics, plan, viewport, measure);
    const line = stage.lines[0]!;
    const composition = readingCompositionForV1(line, viewport, plan.source);
    const fitted = fitAnchoredLineV1(
      viewport,
      line.bounds,
      composition.currentX,
      composition.currentY,
      composition.currentWidth,
      viewport.height * 0.48,
      0.84,
      composition.horizontalAnchor,
    );
    expect(line.glyphs.map((glyph) => glyph.text).join("")).toBe(lyrics.lines[0]!.text);
    expect(fitted.left).toBeGreaterThanOrEqual(viewport.width * 0.055 - 1);
    expect(fitted.right).toBeLessThanOrEqual(viewport.width * 0.945 + 1);
    expect(fitted.top).toBeGreaterThanOrEqual(viewport.height * 0.055 - 1);
    expect(fitted.bottom).toBeLessThanOrEqual(viewport.height * 0.945 + 1);
    expect(composition.horizontalAnchor).toBe("trailing");
    expect(composition.currentX).toBeCloseTo(viewport.width * 0.91);
  });

  it("moves the reading stack along one stable leading axis and settles within 760ms", () => {
    const lyrics = lyricFixtures.repeatedHook;
    const plan = compileLocalDirectorPlanV1(lyrics);
    const viewport = { width: 1920, height: 1080, rendererVersion: "test-reading-stack" };
    const stage = prepareDirectedStageV1(lyrics, plan, viewport, measure);
    const current = stage.lines[1]!;
    const composition = readingCompositionForV1(current, viewport);
    const entering = readingStackStateAtV1(current, composition, current.fromMs, true, false);
    const settled = readingStackStateAtV1(current, composition, current.fromMs + 760, true, false);
    const reduced = readingStackStateAtV1(current, composition, current.fromMs, true, true);
    expect(composition.previousX).toBe(composition.axisX);
    expect(composition.currentX).toBe(composition.axisX);
    expect(composition.nextX).toBe(composition.axisX);
    expect(entering.previousY).toBeCloseTo(composition.currentY);
    expect(entering.currentY).toBeCloseTo(composition.nextY);
    expect(entering.currentOpacity).toBeCloseTo(0.34);
    expect(settled.previousY).toBeCloseTo(composition.previousY);
    expect(settled.currentY).toBeCloseTo(composition.currentY);
    expect(settled.currentOpacity).toBe(1);
    expect(reduced).toEqual(settled);
  });

  it("turns director layouts into visibly distinct but stable reading axes", () => {
    const lyrics = lyricFixtures.repeatedHook;
    const local = compileLocalDirectorPlanV1(lyrics);
    const viewport = { width: 1600, height: 900, rendererVersion: "test-reading-layouts" };
    const build = (layout: DirectorPlanV1["sections"][number]["layout"], alignment: "leading" | "center" | "trailing") => {
      const plan: DirectorPlanV1 = {
        ...local,
        source: "ai",
        planIdentity: `layout:${layout}:${alignment}`,
        sections: local.sections.map((section) => ({ ...section, layout })),
        directives: local.directives.map((directive) => ({ ...directive, alignment })),
      };
      return readingCompositionForV1(prepareDirectedStageV1(lyrics, plan, viewport, measure).lines[0]!, viewport, plan.source);
    };
    const monument = build("monument", "center");
    const leading = build("railLeading", "leading");
    const trailing = build("railTrailing", "trailing");
    expect(monument.horizontalAnchor).toBe("center");
    expect(monument.axisX).toBeCloseTo(viewport.width * 0.50);
    expect(leading.horizontalAnchor).toBe("leading");
    expect(leading.axisX).toBeCloseTo(viewport.width * 0.09);
    expect(trailing.horizontalAnchor).toBe("trailing");
    expect(trailing.axisX).toBeCloseTo(viewport.width * 0.91);
  });

  it("preserves the complete per-line directive instead of collapsing it to a legacy family", () => {
    const lyrics = lyricFixtures.repeatedHook;
    const local = compileLocalDirectorPlanV1(lyrics);
    const behaviors = ["settle", "assemble", "gravityDrop", "ripple", "stretch", "echo", "drift", "focus", "converge"] as const;
    const plan: DirectorPlanV1 = {
      ...local,
      planIdentity: "directed-test",
      directives: local.directives.map((directive, index) => ({
        ...directive,
        behavior: behaviors[index % behaviors.length]!,
        alignment: index % 2 ? "trailing" : "leading",
        direction: index % 2 ? -1 : 1,
        intensity: 0.73,
        fontScale: 1.17,
        glyphStagger: 0.11,
        paletteRole: index % 2 ? "warm" : "secondary",
      })),
    };
    const stage = prepareDirectedStageV1(
      lyrics,
      plan,
      { width: 1920, height: 1080, rendererVersion: "test-directed" },
      measure,
    );
    stage.lines.forEach((line, index) => {
      expect(line.directive).toEqual(plan.directives[index]);
      expect(line.section).toBe(plan.sections.find((section) => line.lineIndex >= section.fromLineIndex && line.lineIndex <= section.toLineIndex));
      expect(line.bounds.x).toBeGreaterThanOrEqual(1920 * 0.06 - 1);
      expect(line.bounds.x + line.bounds.width).toBeLessThanOrEqual(1920 * 0.94 + 1);
    });
  });

  it("uses section typography and layout while preserving real lyric reveal times", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const local = compileLocalDirectorPlanV1(lyrics);
    const plan: DirectorPlanV1 = {
      ...local,
      planIdentity: "section-aware-test",
      sections: lyrics.lines.map((line, index) => ({
        ...local.sections[0]!,
        id: `test:${index}`,
        fromLineIndex: line.lineIndex,
        toLineIndex: line.lineIndex,
        fromMs: line.fromMs,
        toMs: line.toMs,
        layout: index % 2 ? "railTrailing" : "editorialSplit",
        typography: index % 2 ? "monoEditorial" : "jpMincho",
        paletteIndex: index % 12,
      })),
    };
    const stage = prepareDirectedStageV1(
      lyrics,
      plan,
      { width: 1920, height: 1080, rendererVersion: "test-directed" },
      measure,
    );
    expect(stage.lines[0]!.font).toContain("Mincho");
    if (stage.lines[1]) expect(stage.lines[1].font).toContain("Mono");
    const lightGlyph = stage.lines[0]!.glyphs.find((glyph) => glyph.text === "光");
    const traceGlyph = stage.lines[0]!.glyphs.find((glyph) => glyph.text === "t");
    expect(lightGlyph?.revealMs).toBe(1000);
    expect(traceGlyph?.revealMs).toBe(2500);
  });
});
