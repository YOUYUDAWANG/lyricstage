import { describe, expect, it } from "vitest";
import { lyricFixtures, type LyricDocumentV0 } from "@lyricstage/contracts";
import { isDirectorPlanV1ForLyrics } from "./directorPlan";
import {
  analyzeDirectorCacheSummariesV1,
  sanitizeDirectorCacheSummaryV1,
  summarizeDirectorCacheEntryV1,
} from "./directorCacheReview";
import {
  advanceRollingPerformanceStateV1,
  checkpointRollingPerformanceStateV1,
  compileDirectorPlanFromRollingV1,
  compileLocalDirectorBibleV1,
  compileLocalSceneCardForWindowV1,
  compileLocalSceneCardsV1,
  directorBibleIdentityV1,
  initialRollingPerformanceStateV1,
  rollingPerformanceStateIdentityV1,
  sanitizeDirectorBibleV1,
  sanitizeSceneCardV1,
  sceneCardIdentityV1,
  type DirectorBibleV1,
  type SceneCardV1,
} from "./rollingDirector";

const normalLongLyrics = (): LyricDocumentV0 => ({
  version: "lyric-document-v0",
  recordingID: "rolling-normal-long",
  durationMs: 180_000,
  lines: Array.from({ length: 24 }, (_, lineIndex) => ({
    lineIndex,
    fromMs: lineIndex * 7_500,
    toMs: lineIndex * 7_500 + 6_500,
    text: `fixture line ${lineIndex}`,
    voiceRole: "lead" as const,
  })),
});

const reidentifyBible = (value: DirectorBibleV1): DirectorBibleV1 => ({
  ...value,
  bibleIdentity: directorBibleIdentityV1(value),
});

const reidentifyCard = (value: SceneCardV1): SceneCardV1 => {
  const sceneID = sceneCardIdentityV1(value);
  return { ...value, sceneID, effects: value.effects.map((effect) => ({ ...effect, sectionID: sceneID })) };
};

describe("rolling director core", () => {
  it("keeps every fixture inside deterministic local rolling contracts", () => {
    for (const [name, lyrics] of Object.entries(lyricFixtures)) {
      const bible = compileLocalDirectorBibleV1(lyrics);
      expect(sanitizeDirectorBibleV1(lyrics, bible), name).toEqual(bible);
      expect(() => compileLocalSceneCardsV1(lyrics, bible), name).not.toThrow();
    }
  });

  it("keeps a final-anchor checkpoint readable when no prior promise was observed", () => {
    const lyrics = lyricFixtures.repeatedHook;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const finalAnchor = bible.signatureAnchors.at(-1)!;
    const state = checkpointRollingPerformanceStateV1(lyrics, bible, finalAnchor.fromLineIndex)!;
    const card = compileLocalSceneCardForWindowV1(
      lyrics, bible, state, finalAnchor.fromLineIndex, finalAnchor.toLineIndex,
    );
    expect(card).not.toBeNull();
    expect(card?.signatureMoment).toBeUndefined();
    expect(card?.promiseConsumes).toEqual([]);
  });

  it("creates a strictly allowlisted, truncated cache summary without private artifact text", () => {
    const lyrics = normalLongLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const cards = compileLocalSceneCardsV1(lyrics, bible);
    const summary = summarizeDirectorCacheEntryV1({
      lyrics,
      track: { trackID: "private-track-id", title: "T".repeat(180), artist: "A".repeat(220) },
      cacheEpoch: "rolling-director-generation-v1.1", source: "network", createdAtUnixMs: 1_000, expiresAtUnixMs: 2_000,
      bible, cards, localRepairFlags: ["effects", "gestures"], reachedFinalWindow: true,
      timing: { cache: "miss", totalMs: 100, providerMs: 80, attempts: [{ outcome: "ready", endpoint: "https://secret.invalid", response: "raw" }] },
    })!;
    expect(summary.trackTitle).toHaveLength(120);
    expect(summary.trackArtist).toHaveLength(160);
    expect(summary.trackIDDisplay).not.toContain("private");
    expect(sanitizeDirectorCacheSummaryV1(summary)).toEqual(summary);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/fixture line|secret\.invalid|raw|rationale|apiKey|prompt|cookie/ui);
    expect(Object.keys(summary).sort()).toEqual([
      "actCount", "artDirections", "baseLayout", "bibleIdentityPrefix", "biblePresent", "cacheEpoch", "cacheVersion", "compilerVersion",
      "continuityJustificationAccepted", "coveragePercent", "createdAtUnixMs", "durationMs", "effectCount",
      "effectPrimitiveCounts", "expiresAtUnixMs", "gestureCounts", "layoutTransitionCount", "lineCount",
      "localRepairFlags", "missingRanges", "motifFamily", "quietSharePercent", "reachedFinalWindow", "sceneCardCount", "semanticDirectiveCount",
      "signatureMomentCount", "source", "timing", "trackArtist", "trackIDDisplay", "trackTitle", "version", "warnings", "world",
    ]);
    const malformed = [
      { ...summary, world: { ...summary.world, spatialMode: { endpoint: "https://secret.invalid" } } },
      { ...summary, timing: { ...summary.timing!, outcome: { responseBody: "secret" } } },
      { ...summary, timing: { ...summary.timing!, outcome: "x".repeat(41) } },
      { ...summary, effectPrimitiveCounts: { ["x".repeat(33)]: 1 } },
      { ...summary, artDirections: [{ apiKey: "secret" }] },
      { ...summary, cacheEpoch: "" },
      { ...summary, bibleIdentityPrefix: "not-a-hash" },
      { ...summary, baseLayout: "" },
      { ...summary, motifFamily: "" },
    ];
    malformed.forEach((value) => expect(sanitizeDirectorCacheSummaryV1(value)).toBeNull());
  });

  it("computes every V1 diversity warning deterministically", () => {
    const lyrics = normalLongLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    const base = summarizeDirectorCacheEntryV1({
      lyrics, track: { trackID: "warning-track", title: "Warning", artist: "Fixture" }, cacheEpoch: "rolling-director-generation-v1.1",
      source: "network", createdAtUnixMs: 1_000, expiresAtUnixMs: 2_000, bible,
      cards: compileLocalSceneCardsV1(lyrics, bible), reachedFinalWindow: true,
    })!;
    const sparse = {
      ...base,
      signatureMomentCount: 2,
      gestureCounts: { glyph: 1, token: 0, phrase: 0, total: 1 },
      effectCount: 1,
      layoutTransitionCount: 0,
      continuityJustificationAccepted: false,
      coveragePercent: 79,
      localRepairFlags: ["effects", "gestures"] as Array<"effects" | "gestures">,
    };
    const entries = [0, 1, 2].map((offset) => ({ ...sparse, createdAtUnixMs: 3_000 - offset, trackIDDisplay: `abcdef0${offset}` }));
    const analyzed = analyzeDirectorCacheSummariesV1(entries);
    expect(analyzed[0]!.warnings).toEqual([
      "minimum-budget", "single-scale", "static-without-evidence", "repeated-tuple", "coverage-gap", "local-repair-heavy",
    ]);
    expect(analyzeDirectorCacheSummariesV1(entries)).toEqual(analyzed);
    expect(sanitizeDirectorCacheSummaryV1({ version: "director-cache-summary-v1", apiKey: "secret" })).toBeNull();
  });

  it("builds deterministic local Bible and independently valid scene cards", () => {
    const lyrics = lyricFixtures.repeatedHook;
    const bible = compileLocalDirectorBibleV1(lyrics);
    expect(sanitizeDirectorBibleV1(lyrics, bible)).toEqual(bible);
    expect(directorBibleIdentityV1(JSON.parse(JSON.stringify(bible)))).toBe(bible.bibleIdentity);

    const cards = compileLocalSceneCardsV1(lyrics, bible);
    expect(cards.length).toBeGreaterThan(0);
    let state = initialRollingPerformanceStateV1(bible);
    for (const card of cards) {
      expect(sceneCardIdentityV1(JSON.parse(JSON.stringify(card)))).toBe(card.sceneID);
      const accepted = sanitizeSceneCardV1(lyrics, bible, state, card);
      expect(accepted).toEqual(card);
      state = advanceRollingPerformanceStateV1(state, accepted!);
    }
    expect(rollingPerformanceStateIdentityV1(JSON.parse(JSON.stringify(state)))).toBe(state.stateHash);
    expect(bible.signatureAnchors.every((anchor) => !("stageAction" in anchor)
      && !("coverRole" in anchor) && !("consequence" in anchor))).toBe(true);
  });

  it("requires the long-song anchor count exception and rejects a third layout transition", () => {
    const lyrics = normalLongLyrics();
    const bible = compileLocalDirectorBibleV1(lyrics);
    expect(bible.signatureAnchors.length).toBeGreaterThanOrEqual(3);
    const twoAnchors = reidentifyBible({
      ...bible,
      signatureAnchors: [bible.signatureAnchors[0]!, bible.signatureAnchors.at(-1)!],
      layoutBudget: {
        ...bible.layoutBudget,
        continuityJustification: { ...bible.layoutBudget.continuityJustification!, confidence: 0.82 },
      },
    });
    expect(sanitizeDirectorBibleV1(lyrics, twoAnchors)).toBeNull();

    const transition = (atSectionIndex: number, toLayout: "editorialSplit" | "railLeading" | "railTrailing") => ({
      atSectionIndex,
      toLayout,
      purpose: "perspectiveShift" as const,
      strength: "major" as const,
      evidence: {
        sectionTriggers: ["section_boundary", "density_lift"],
        lineIndices: [bible.acts[atSectionIndex]!.fromLineIndex],
        audioLandmarkIDs: [],
        rationale: "A fixture boundary and density lift ground this spatial change.",
        confidence: 0.84,
      },
    });
    const thirdTransition = reidentifyBible({
      ...bible,
      layoutBudget: {
        ...bible.layoutBudget,
        proposedTransitions: [transition(1, "editorialSplit"), transition(2, "railLeading"), transition(3, "railTrailing")],
      },
    });
    expect(sanitizeDirectorBibleV1(lyrics, thirdTransition)).toBeNull();
  });

  it("rejects a signature card that uses only one gesture scale", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const cards = compileLocalSceneCardsV1(lyrics, bible);
    let state = initialRollingPerformanceStateV1(bible);
    const signatureCard = cards.find((card) => {
      if (card.signatureMoment) return true;
      state = advanceRollingPerformanceStateV1(state, card);
      return false;
    });
    expect(signatureCard).toBeDefined();
    const oneScale = reidentifyCard({ ...signatureCard!, gestures: [signatureCard!.gestures[0]!] });
    expect(sanitizeSceneCardV1(lyrics, bible, state, oneScale)).toBeNull();
  });

  it("renders one accepted early action while later anchors stay deterministic local fallbacks", () => {
    const lyrics = lyricFixtures.duetOverlap;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const localCards = compileLocalSceneCardsV1(lyrics, bible);
    const earlyIndex = localCards.findIndex((card) => card.signatureMoment?.evidence.sectionTriggers.includes("duet_overlap"));
    expect(earlyIndex).toBeGreaterThanOrEqual(0);
    const early = localCards[earlyIndex]!;
    const directedEarly = reidentifyCard({
      ...early,
      signatureMoment: { ...early.signatureMoment!, stageAction: "duet.tension" },
    });
    const acceptedPrefix = [...localCards.slice(0, earlyIndex), directedEarly];
    const plan = compileDirectorPlanFromRollingV1(lyrics, bible, acceptedPrefix, "ai");
    expect(plan.dramaticScore.signatureMoments.find((moment) => moment.id === directedEarly.signatureMoment!.id)?.stageAction)
      .toBe("duet.tension");

    const finalLocalMoment = localCards.find((card) => card.signatureMoment?.id === bible.signatureAnchors.at(-1)!.id)!.signatureMoment!;
    expect(acceptedPrefix.some((card) => card.signatureMoment?.id === finalLocalMoment.id)).toBe(false);
    expect(plan.dramaticScore.signatureMoments.find((moment) => moment.id === finalLocalMoment.id)).toEqual(finalLocalMoment);
  });

  it("rejects identity and continuity tampering", () => {
    const lyrics = lyricFixtures.wordTimedMixed;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const [card] = compileLocalSceneCardsV1(lyrics, bible);
    expect(card).toBeDefined();
    const state = initialRollingPerformanceStateV1(bible);
    expect(sanitizeSceneCardV1(lyrics, bible, state, { ...card!, entryStateHash: "tampered" })).toBeNull();
    expect(sanitizeDirectorBibleV1(lyrics, { ...bible, premise: `${bible.premise} changed` })).toBeNull();
  });

  it("compiles accepted coverage into the unchanged plan contract and falls back locally elsewhere", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const cards = compileLocalSceneCardsV1(lyrics, bible);
    const partial = cards.slice(0, 1);
    const plan = compileDirectorPlanFromRollingV1(lyrics, bible, partial, "ai");
    expect(isDirectorPlanV1ForLyrics(plan, lyrics)).toBe(true);
    expect(plan.source).toBe("ai");
    expect(plan.sections.some((section) => section.id.startsWith("rolling-local:"))).toBe(true);
    expect(plan.sections.some((section) => section.id === `rolling:${partial[0]!.sceneID}`)).toBe(true);
    expect(plan.dramaticScore.signatureMoments.some((moment) => moment.id === bible.signatureAnchors.at(-1)!.id
      && !partial.some((card) => card.signatureMoment?.id === moment.id))).toBe(true);

    const uniqueUncoveredID = "ai-only:uncovered-final-anchor";
    const aiBible = reidentifyBible({
      ...bible,
      signatureAnchors: bible.signatureAnchors.map((anchor, index) => index === bible.signatureAnchors.length - 1
        ? { ...anchor, id: uniqueUncoveredID }
        : anchor),
    });
    const aiCards = compileLocalSceneCardsV1(lyrics, aiBible);
    const uncoveredIndex = aiCards.findIndex((card) => card.signatureMoment?.id === uniqueUncoveredID);
    expect(uncoveredIndex).toBeGreaterThan(0);
    const aiPartialPlan = compileDirectorPlanFromRollingV1(lyrics, aiBible, aiCards.slice(0, uncoveredIndex), "ai");
    expect(aiPartialPlan.dramaticScore.signatureMoments.find((moment) => moment.id === uniqueUncoveredID)?.stageAction)
      .toBe("motif.recall");
    expect(aiPartialPlan.dramaticScore.signatureMoments.find((moment) => moment.id === uniqueUncoveredID)?.stageAction)
      .not.toBe("memory.imprint");

    const local = compileDirectorPlanFromRollingV1(lyrics, bible, [], "ai");
    expect(isDirectorPlanV1ForLyrics(local, lyrics)).toBe(true);
    expect(local.source).toBe("local");
  });

  it("creates a deterministic seek checkpoint that can validate a middle card", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const cards = compileLocalSceneCardsV1(lyrics, bible);
    const middle = cards.find((card, index) => index > 0 && !card.signatureMoment)!;
    expect(middle).toBeDefined();
    const checkpoint = checkpointRollingPerformanceStateV1(lyrics, bible, middle.fromLineIndex)!;
    expect(checkpointRollingPerformanceStateV1(lyrics, bible, middle.fromLineIndex)).toEqual(checkpoint);
    const rebased = reidentifyCard({
      ...middle,
      sceneIndex: 0,
      entryStateHash: checkpoint.stateHash,
      entryMotifState: checkpoint.motifState,
      exitMotifState: checkpoint.motifState,
      layout: checkpoint.layout,
      promiseCreates: [],
      promiseConsumes: [],
    });
    expect(sanitizeSceneCardV1(lyrics, bible, checkpoint, rebased)).toEqual(rebased);
    const plan = compileDirectorPlanFromRollingV1(lyrics, bible, [rebased], "ai");
    expect(isDirectorPlanV1ForLyrics(plan, lyrics)).toBe(true);
    expect(plan.source).toBe("ai");
    expect(plan.sections.some((section) => section.id === `rolling:${rebased.sceneID}`)).toBe(true);
    expect(plan.sections.some((section) => section.id.startsWith("rolling-local:") && section.toLineIndex < rebased.fromLineIndex)).toBe(true);
    expect(plan.sections.some((section) => section.id.startsWith("rolling-local:") && section.fromLineIndex > rebased.toLineIndex)).toBe(true);
    expect(rebased.sceneID).toBe(sceneCardIdentityV1(rebased));
  });

  it("preserves the accepted prefix but rejects a disjoint checkpoint-rebased suffix", () => {
    const lyrics = lyricFixtures.longSongStructure;
    const bible = compileLocalDirectorBibleV1(lyrics);
    const cards = compileLocalSceneCardsV1(lyrics, bible);
    const early = cards[0]!;
    const middle = cards.find((card) => card.fromLineIndex > early.toLineIndex + 1 && !card.signatureMoment)!;
    expect(middle).toBeDefined();
    const checkpoint = checkpointRollingPerformanceStateV1(lyrics, bible, middle.fromLineIndex)!;
    const packB = reidentifyCard({
      ...middle,
      sceneIndex: 0,
      entryStateHash: checkpoint.stateHash,
      entryMotifState: checkpoint.motifState,
      exitMotifState: checkpoint.motifState,
      layout: checkpoint.layout,
      promiseCreates: [],
      promiseConsumes: [],
    });
    const plan = compileDirectorPlanFromRollingV1(lyrics, bible, [early, packB], "ai");
    expect(isDirectorPlanV1ForLyrics(plan, lyrics)).toBe(true);
    expect(plan.sections.some((section) => section.id === `rolling:${early.sceneID}`)).toBe(true);
    expect(plan.sections.some((section) => section.id === `rolling:${packB.sceneID}`)).toBe(false);
    expect(plan.sections.some((section) => section.id.startsWith("rolling-local:")
      && section.fromLineIndex > early.toLineIndex)).toBe(true);
    expect(early.sceneID).toBe(sceneCardIdentityV1(early));
    expect(packB.sceneID).toBe(sceneCardIdentityV1(packB));

    const final = cards.find((card) => card.signatureMoment?.id === bible.signatureAnchors.at(-1)!.id)!;
    const finalCheckpoint = checkpointRollingPerformanceStateV1(lyrics, bible, final.fromLineIndex)!;
    const promiseMissingFinal = reidentifyCard({
      ...final,
      sceneIndex: 0,
      entryStateHash: finalCheckpoint.stateHash,
      entryMotifState: finalCheckpoint.motifState,
      layout: finalCheckpoint.layout,
    });
    const failClosedPlan = compileDirectorPlanFromRollingV1(lyrics, bible, [early, promiseMissingFinal], "ai");
    expect(failClosedPlan.sections.some((section) => section.id === `rolling:${early.sceneID}`)).toBe(true);
    expect(failClosedPlan.sections.some((section) => section.id === `rolling:${promiseMissingFinal.sceneID}`)).toBe(false);
  });
});
