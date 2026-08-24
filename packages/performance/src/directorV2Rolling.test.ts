import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1 } from "./directorPlan";
import {
  compileDirectorPlanFromRollingV1,
  advanceRollingPerformanceStateV1,
  compileLocalDirectorBibleV1,
  compileLocalSceneCardsV1,
  checkpointRollingPerformanceStateV1,
  initialRollingPerformanceStateV1,
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
} from "./rollingDirector";
import {
  compileLocalContinuitySceneCardV2,
  compileLocalContinuitySceneCardsV2,
  compileWindowIntentV2ToSceneCardV1,
  compileWindowIntentV2ToSceneCardsV1,
} from "./directorV2Rolling";
import type { WindowIntentV2 } from "./directorV2Fixtures";

const lyrics = lyricFixtures.wordTimedMixed;
const bible = compileLocalDirectorBibleV1(lyrics);
const state = initialRollingPerformanceStateV1(bible);

const intent = (changes: Partial<WindowIntentV2> = {}): WindowIntentV2 => ({
  version: "window-intent-v2",
  bibleIdentity: bible.bibleIdentity,
  entryStateHash: state.stateHash,
  id: "live-v2:0-3",
  fromLineIndex: 0,
  toLineIndex: 3,
  spatialIntent: "open",
  coverRole: "portal",
  arcIntent: "break",
  cues: [{
    id: "live-v2:rupture",
    version: "semantic-cue-v2",
    role: "rupture",
    fromLineIndex: 1,
    evidenceLineIndices: [1],
    confidence: 0.92,
  }],
  ...changes,
});

describe("rolling Director V2 compiler", () => {
  it("turns sparse semantic intent into a valid existing-runtime card", () => {
    const card = compileWindowIntentV2ToSceneCardV1(lyrics, bible, state, intent());
    expect(card).not.toBeNull();
    expect(card?.directives).toHaveLength(lyrics.lines.length);
    expect(card?.directives).not.toEqual(compileLocalDirectorPlanV1(lyrics).directives);
    expect(card?.intention).toContain("Director V2 sparse cues");
    expect(card?.effects.some((effect) => effect.id.startsWith("director-v2-effect:"))).toBe(true);
    const plan = compileDirectorPlanFromRollingV1(lyrics, bible, [card!]);
    expect(plan.source).toBe("ai");
    expect(plan.directorVersion).toBe("lyricstage-rolling-director-v2");
    expect(plan.directives).toEqual(card?.directives);
  });

  it("accepts a restrained zero-cue window while keeping local execution", () => {
    const card = compileWindowIntentV2ToSceneCardV1(lyrics, bible, state, intent({
      spatialIntent: "hold",
      arcIntent: "hold",
      cues: [],
    }));
    expect(card).not.toBeNull();
    expect(card?.intention).toContain("restrained hold window");
    expect(card?.directives).toHaveLength(lyrics.lines.length);
    expect(card?.gestures.length).toBeGreaterThan(0);
    expect(card?.effects.length).toBeLessThanOrEqual(1);
    expect(card?.effects.some((effect) => effect.id.startsWith("rolling-v2-support-effect:"))).toBe(false);
  });

  it("preserves three separated cue events inside an ordinary rolling window", () => {
    const longLyrics = {
      ...lyricFixtures.longSongStructure,
      recordingID: "fixture:director-v2-density",
      durationMs: 120_000,
      lines: Array.from({ length: 30 }, (_, lineIndex) => ({
        lineIndex,
        fromMs: lineIndex * 4_000,
        toMs: lineIndex * 4_000 + 3_500,
        text: `bounded performance phrase ${lineIndex}`,
        voiceRole: "lead" as const,
      })),
    };
    const longBible = compileLocalDirectorBibleV1(longLyrics);
    const anchorLines = new Set(longBible.signatureAnchors.flatMap((anchor) => anchor.anchorLineIndices));
    const fromLineIndex = longLyrics.lines.find((line) => [line.lineIndex, line.lineIndex + 1, line.lineIndex + 2]
      .every((lineIndex) => lineIndex < longLyrics.lines.length && !anchorLines.has(lineIndex)))!.lineIndex;
    const toLineIndex = fromLineIndex + 2;
    const targetState = checkpointRollingPerformanceStateV1(longLyrics, longBible, fromLineIndex)!;
    const cueLines = [fromLineIndex, fromLineIndex + 1, toLineIndex];
    const directed = compileWindowIntentV2ToSceneCardV1(longLyrics, longBible, targetState, {
      version: "window-intent-v2",
      bibleIdentity: longBible.bibleIdentity,
      entryStateHash: targetState.stateHash,
      id: `density:${fromLineIndex}-${toLineIndex}`,
      fromLineIndex,
      toLineIndex,
      spatialIntent: "open",
      coverRole: "portal",
      arcIntent: "lift",
      cues: [
        { id: "density:rupture", version: "semantic-cue-v2", role: "rupture", fromLineIndex: cueLines[0]!, evidenceLineIndices: [cueLines[0]!], confidence: 0.92 },
        { id: "density:release", version: "semantic-cue-v2", role: "release", fromLineIndex: cueLines[1]!, evidenceLineIndices: [cueLines[1]!], confidence: 0.9 },
        { id: "density:refrain", version: "semantic-cue-v2", role: "refrain", fromLineIndex: cueLines[2]!, evidenceLineIndices: [cueLines[2]!], confidence: 0.88 },
      ],
    });
    expect(directed).not.toBeNull();
    expect(directed?.semanticCueCount).toBe(3);
    expect(directed?.gestures.length).toBeGreaterThanOrEqual(3);
    expect(directed?.effects.length).toBe(2);

    const plan = compileDirectorPlanFromRollingV1(longLyrics, longBible, [directed!]);
    directed!.effects.forEach((effect) => {
      expect(plan.effects.find((candidate) => candidate.id === effect.id)).toMatchObject({
        fromMs: effect.fromMs,
        toMs: effect.toMs,
      });
    });
  });

  it("turns one dense semantic window into a contiguous multi-scene performance", () => {
    const longLyrics = {
      ...lyricFixtures.longSongStructure,
      recordingID: "fixture:director-v2-multi-scene",
      durationMs: 60_000,
      lines: Array.from({ length: 15 }, (_, lineIndex) => ({
        lineIndex,
        fromMs: lineIndex * 4_000,
        toMs: lineIndex * 4_000 + 3_600,
        text: `narrative phrase ${lineIndex}`,
        voiceRole: "lead" as const,
      })),
    };
    const longBible = compileLocalDirectorBibleV1(longLyrics);
    const initial = initialRollingPerformanceStateV1(longBible);
    const cueLines = [1, 4, 7, 10, 13];
    const cards = compileWindowIntentV2ToSceneCardsV1(longLyrics, longBible, initial, {
      version: "window-intent-v2",
      bibleIdentity: longBible.bibleIdentity,
      entryStateHash: initial.stateHash,
      id: "dense:0-14",
      fromLineIndex: 0,
      toLineIndex: 14,
      spatialIntent: "open",
      coverRole: "portal",
      arcIntent: "lift",
      cues: cueLines.map((lineIndex, index) => ({
        id: `dense:${index}`,
        version: "semantic-cue-v2" as const,
        role: (["release", "rupture", "refrain", "handoff", "release"] as const)[index]!,
        fromLineIndex: lineIndex,
        evidenceLineIndices: [lineIndex],
        confidence: 0.9,
      })),
    });

    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect(cards[0]?.fromLineIndex).toBe(0);
    expect(cards.at(-1)?.toLineIndex).toBe(14);
    expect(cards.reduce((total, card) => total + (card.semanticCueCount ?? 0), 0)).toBe(5);
    cards.forEach((card, index) => {
      if (index > 0) expect(card.fromLineIndex).toBe(cards[index - 1]!.toLineIndex + 1);
      expect(card.gestures.length).toBeGreaterThan(0);
    });

    const localCards = compileLocalContinuitySceneCardsV2(longLyrics, longBible, initial, [], 0, 14);
    expect(localCards.length).toBeGreaterThanOrEqual(4);
    expect(localCards.every((card) => card.semanticScene?.version === "semantic-scene-direction-v2")).toBe(true);
    expect(new Set(localCards.map((card) => card.layout)).size).toBeLessThanOrEqual(2);
    expect(localCards.every((card) => card.gestures.length > 0)).toBe(true);
    expect(localCards.some((card) => card.effects.length === 0)).toBe(true);
    expect(new Set(localCards.flatMap((card) => card.gestures.map((gesture) => gesture.primitive))).size).toBeGreaterThanOrEqual(3);
    expect(localCards.flatMap((card) => card.gestures).some((gesture) => gesture.primitive === "phrase.contour")).toBe(false);
  });

  it("keeps one visible support gesture per Scene across a full dense song", () => {
    const songLyrics = {
      ...lyricFixtures.longSongStructure,
      recordingID: "fixture:director-v2-full-song-gestures",
      durationMs: 240_000,
      lines: Array.from({ length: 60 }, (_, lineIndex) => ({
        lineIndex, fromMs: lineIndex * 4_000, toMs: lineIndex * 4_000 + 3_600,
        text: `full song narrative phrase ${lineIndex}`, voiceRole: "lead" as const,
      })),
    };
    const songBible = compileLocalDirectorBibleV1(songLyrics);
    let songState = initialRollingPerformanceStateV1(songBible);
    const cards: ReturnType<typeof compileLocalContinuitySceneCardsV2> = [];
    for (let fromLineIndex = 0; fromLineIndex < songLyrics.lines.length; fromLineIndex += 15) {
      const windowCards = compileLocalContinuitySceneCardsV2(
        songLyrics, songBible, songState, cards, fromLineIndex, Math.min(fromLineIndex + 14, songLyrics.lines.length - 1),
      );
      cards.push(...windowCards);
      windowCards.forEach((card) => { songState = advanceRollingPerformanceStateV1(songState, card); });
    }
    expect(cards.length).toBeGreaterThan(8);
    expect(cards.every((card) => card.gestures.length > 0)).toBe(true);
    const plan = compileDirectorPlanFromRollingV1(songLyrics, songBible, cards);
    expect(plan.gestures.length).toBeGreaterThanOrEqual(cards.length);
    expect(plan.blocking.transitions.length).toBeLessThanOrEqual(3);
  });

  it("keeps the prior visual world when local continuity follows an AI window", () => {
    const longLyrics = lyricFixtures.longSongStructure;
    const longBible = compileLocalDirectorBibleV1(longLyrics);
    const initial = initialRollingPerformanceStateV1(longBible);
    const firstRange = compileLocalSceneCardsV1(longLyrics, longBible)[0]!;
    const directed = compileWindowIntentV2ToSceneCardV1(longLyrics, longBible, initial, {
      version: "window-intent-v2",
      bibleIdentity: longBible.bibleIdentity,
      entryStateHash: initial.stateHash,
      id: "continuity:directed",
      fromLineIndex: firstRange.fromLineIndex,
      toLineIndex: firstRange.toLineIndex,
      spatialIntent: "open",
      coverRole: "portal",
      arcIntent: "hold",
      cues: [],
    })!;
    const styledWithoutID = {
      ...directed,
      artDirection: "liquidMemory" as const,
      typography: "jpGothic" as const,
      coverRole: "portal" as const,
      presentation: "section" as const,
    };
    const styledID = sceneCardIdentityV1(styledWithoutID);
    const styled = {
      ...styledWithoutID,
      sceneID: styledID,
      effects: styledWithoutID.effects.map((effect) => ({ ...effect, sectionID: styledID })),
    };
    expect(sanitizeSceneCardV1(longLyrics, longBible, initial, styled)).not.toBeNull();
    const nextState = advanceRollingPerformanceStateV1(initial, styled);
    const nextRange = compileLocalSceneCardsV1(longLyrics, longBible)
      .find((card) => card.fromLineIndex === styled.toLineIndex + 1)!;
    const continuity = compileLocalContinuitySceneCardV2(
      longLyrics, longBible, nextState, [styled], nextRange.fromLineIndex, nextRange.toLineIndex,
    );
    expect(continuity).toMatchObject({
      artDirection: "liquidMemory",
      typography: "jpGothic",
      coverRole: "portal",
      presentation: "section",
    });
    expect(continuity?.directives).toBeUndefined();
  });

  it("fails closed on stale Bible or state identity", () => {
    expect(compileWindowIntentV2ToSceneCardV1(lyrics, bible, state, intent({ bibleIdentity: "stale" }))).toBeNull();
    expect(compileWindowIntentV2ToSceneCardV1(lyrics, bible, state, intent({ entryStateHash: "stale" }))).toBeNull();
  });

  it("turns an unresolved prior rolling promise into an observable recall", () => {
    const recallLyrics = lyricFixtures.repeatedHook;
    const recallBible = compileLocalDirectorBibleV1(recallLyrics);
    const cards = compileLocalSceneCardsV1(recallLyrics, recallBible);
    let recallState = initialRollingPerformanceStateV1(recallBible);
    let target = cards[1]!;
    let earlierEvidenceLine = cards[0]!.fromLineIndex;
    for (let index = 0; index < cards.length - 1; index += 1) {
      recallState = advanceRollingPerformanceStateV1(recallState, cards[index]!);
      if (recallState.unresolvedPromiseIDs.length > 0) {
        target = cards[index + 1]!;
        earlierEvidenceLine = cards[index]!.fromLineIndex;
        break;
      }
    }
    expect(recallState.unresolvedPromiseIDs.length).toBeGreaterThan(0);
    const recalled = compileWindowIntentV2ToSceneCardV1(recallLyrics, recallBible, recallState, {
      version: "window-intent-v2",
      bibleIdentity: recallBible.bibleIdentity,
      entryStateHash: recallState.stateHash,
      id: "live-v2:recall-window",
      fromLineIndex: target.fromLineIndex,
      toLineIndex: target.toLineIndex,
      spatialIntent: "hold",
      coverRole: "memory",
      arcIntent: "recall",
      cues: [{
        id: "live-v2:recall",
        version: "semantic-cue-v2",
        role: "recall",
        fromLineIndex: target.fromLineIndex,
        evidenceLineIndices: [earlierEvidenceLine],
        confidence: 0.94,
      }],
    });
    expect(recalled).not.toBeNull();
    expect(recalled?.effects.some((effect) => effect.id.includes(":recall:"))).toBe(true);
  });
});
