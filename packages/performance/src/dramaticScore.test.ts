import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1 } from "./directorPlan";
import { sanitizeDramaticScoreV1 } from "./dramaticScore";

describe("DramaticScoreV1", () => {
  it("compiles one evolving motif with authored setup and return moments", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const plan = compileLocalDirectorPlanV1(lyrics);
    const score = plan.dramaticScore;
    expect(score.acts[0]?.fromLineIndex).toBe(lyrics.lines[0]?.lineIndex);
    expect(score.acts.at(-1)?.toLineIndex).toBe(lyrics.lines.at(-1)?.lineIndex);
    expect(score.signatureMoments).toHaveLength(2);
    expect(score.signatureMoments[0]?.motifState).toBe("seed");
    expect(score.signatureMoments[1]?.recallOf).toBe(score.signatureMoments[0]?.id);
    expect(score.motifActor.states.map((state) => state.state)).toEqual(["seed", "transform", "return"]);
    expect(sanitizeDramaticScoreV1(lyrics, score)).toEqual(score);
  });

  it("rejects a theme-pack moment that changes actor family mid-song", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const score = compileLocalDirectorPlanV1(lyrics).dramaticScore;
    expect(sanitizeDramaticScoreV1(lyrics, {
      ...score,
      signatureMoments: score.signatureMoments.map((moment, index) => index === 1
        ? { ...moment, actorFamily: "firework" }
        : moment),
    })).toBeNull();
  });

  it("normalizes prose recall references to the accepted setup moment", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const score = compileLocalDirectorPlanV1(lyrics).dramaticScore;
    const sanitized = sanitizeDramaticScoreV1(lyrics, {
      ...score,
      signatureMoments: score.signatureMoments.map((moment) => ({
        ...moment,
        recallOf: "the image established earlier",
      })),
    });
    expect(sanitized?.signatureMoments[0]?.recallOf).toBe("");
    expect(sanitized?.signatureMoments.at(-1)?.recallOf).toBe(sanitized?.signatureMoments[0]?.id);
  });

  it("uses anchored duet evidence for the overlapping local fallback", () => {
    const lyrics = lyricFixtures.duetOverlap;
    const score = compileLocalDirectorPlanV1(lyrics).dramaticScore;
    const first = score.signatureMoments[0]!;
    expect(first.purpose).toBe("connection");
    expect(first.evidence.sectionTriggers).toEqual(["duet_overlap"]);
    expect(first.anchorLineIndices.some((lineIndex) => lyrics.lines.some((line) => line.lineIndex === lineIndex
      && lyrics.lines.some((other) => other.lineIndex !== line.lineIndex
        && line.fromMs < other.toMs && other.fromMs < line.toMs)))).toBe(true);
    expect(sanitizeDramaticScoreV1(lyrics, score)).toEqual(score);
  });

  it("keeps every deterministic local fallback inside the same public contract", () => {
    for (const [name, lyrics] of Object.entries(lyricFixtures)) {
      const score = compileLocalDirectorPlanV1(lyrics).dramaticScore;
      expect(sanitizeDramaticScoreV1(lyrics, score), name).toEqual(score);
    }
  });

  it("requires the accepted score to start with seed or emerge and end with an earlier return", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const score = compileLocalDirectorPlanV1(lyrics).dramaticScore;
    expect(sanitizeDramaticScoreV1(lyrics, {
      ...score,
      signatureMoments: score.signatureMoments.map((moment, index) => index === 0
        ? { ...moment, motifState: "transform" }
        : moment),
    })).toBeNull();
    expect(sanitizeDramaticScoreV1(lyrics, {
      ...score,
      signatureMoments: score.signatureMoments.map((moment, index) => index === score.signatureMoments.length - 1
        ? { ...moment, motifState: "transform" }
        : moment),
    })).toBeNull();
  });

  it("rejects undeclared, purpose-mismatched, strong-action-mismatched, and family-mismatched evidence", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const score = compileLocalDirectorPlanV1(lyrics).dramaticScore;
    const replaceLast = (changes: Record<string, unknown>) => ({
      ...score,
      signatureMoments: score.signatureMoments.map((moment, index) => index === score.signatureMoments.length - 1
        ? { ...moment, ...changes }
        : moment),
    });
    expect(sanitizeDramaticScoreV1(lyrics, replaceLast({
      evidence: { ...score.signatureMoments.at(-1)!.evidence, sectionTriggers: ["invented_trigger"] },
    }))).toBeNull();
    expect(sanitizeDramaticScoreV1(lyrics, replaceLast({ purpose: "connection" }))).toBeNull();
    expect(sanitizeDramaticScoreV1(lyrics, replaceLast({ stageAction: "duet.tension" }))).toBeNull();
    expect(sanitizeDramaticScoreV1(lyrics, {
      ...score,
      signatureMoments: score.signatureMoments.map((moment, index) => index === 0
        ? { ...moment, stageAction: "window.reveal" }
        : moment),
    })).toBeNull();
  });

  it("requires lyric-local triggers to be supported by an anchor line", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const score = compileLocalDirectorPlanV1(lyrics).dramaticScore;
    const first = score.signatureMoments[0]!;
    expect(first.evidence.sectionTriggers).toEqual(["duet_overlap"]);
    expect(sanitizeDramaticScoreV1(lyrics, {
      ...score,
      signatureMoments: score.signatureMoments.map((moment, index) => index === 0
        ? { ...moment, anchorLineIndices: [first.fromLineIndex] }
        : moment),
    })).toBeNull();
  });
});
