import { describe, expect, it } from "vitest";
import { lyricFixtures } from "@lyricstage/contracts";
import { compileLocalDirectorPlanV1 } from "./directorPlan";
import {
  compileDirectorPlanFromRollingV1,
  advanceRollingPerformanceStateV1,
  compileLocalDirectorBibleV1,
  compileLocalSceneCardsV1,
  initialRollingPerformanceStateV1,
} from "./rollingDirector";
import { compileWindowIntentV2ToSceneCardV1 } from "./directorV2Rolling";
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
