import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { compilePerformancePlan } from "@lyricstage/core";
import { compileLocalDirectorPlanV1, type DirectorPlanV1 } from "@lyricstage/performance";
import { prepareStage } from "./prepare";
import { prepareDirectedStageV1 } from "./prepareDirected";
import { fitAnchoredLineV1, readingCompositionForV1, readingStackStateAtV1 } from "./drawDirected";

const measure = (text: string, font: string): number => {
  const size = Number(font.match(/([0-9.]+)px/)?.[1] ?? 48);
  return Array.from(text).length * size * 0.58;
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
    const composition = readingCompositionForV1(line, viewport);
    const fitted = fitAnchoredLineV1(
      viewport,
      line.bounds,
      composition.currentX,
      composition.currentY,
      composition.currentWidth,
      viewport.height * 0.48,
      0.84,
      "leading",
    );
    expect(line.glyphs.map((glyph) => glyph.text).join("")).toBe(lyrics.lines[0]!.text);
    expect(fitted.left).toBeGreaterThanOrEqual(viewport.width * 0.055 - 1);
    expect(fitted.right).toBeLessThanOrEqual(viewport.width * 0.945 + 1);
    expect(fitted.top).toBeGreaterThanOrEqual(viewport.height * 0.055 - 1);
    expect(fitted.bottom).toBeLessThanOrEqual(viewport.height * 0.945 + 1);
    expect(composition.currentX).toBeCloseTo(viewport.width * 0.09);
    expect(fitted.left).toBeCloseTo(composition.axisX, 1);
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
