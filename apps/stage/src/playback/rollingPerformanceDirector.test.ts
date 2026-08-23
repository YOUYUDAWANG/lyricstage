import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lyricFixtures } from "@lyricstage/contracts";
import {
  compileLocalDirectorBibleV1,
  compileLocalDirectorPlanV1,
  compileLocalSceneCardsV1,
} from "@lyricstage/performance";
import {
  createRollingDirectorRuntimeStateV1,
  applyMusicMapToRollingDirectorPlanV1,
  handleRollingSeekV1,
  normalizeRollingCoverageV1,
  reduceRollingCoverageResultV1,
  rollingCoverageAtV1,
  detectRollingSeekTargetV1,
  rollingHasRemainingDirectionV1,
  rollingPlanNeedsPreparedRebuildV1,
  rollingPreparedRendererIdentityV1,
  rollingRefillTargetV1,
  queueRollingDirectorPlanV1,
  selectRollingRequestedWindowV1,
  shouldRefillRollingCoverageV1,
} from "./rollingPerformanceDirector";

const fixture = lyricFixtures.repeatedHook;
const local = compileLocalDirectorPlanV1(fixture);
const bible = compileLocalDirectorBibleV1(fixture);
const cards = compileLocalSceneCardsV1(fixture, bible);

const withBible = () => ({
  ...createRollingDirectorRuntimeStateV1(local, 7),
  status: "ready" as const,
  bible,
  bibleSource: "cache" as const,
});

describe("rolling Performance Director", () => {
  it("renders the complete local plan first, then accepts cached Pack A and Pack B deterministically", () => {
    const initial = createRollingDirectorRuntimeStateV1(local, 7);
    expect(initial.compiledPlan).toBe(local);
    const split = Math.max(1, Math.floor(cards.length / 2));
    const packA = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "cache", cards: cards.slice(0, split),
    }, 0, 7);
    const packB = reduceRollingCoverageResultV1(fixture, packA, {
      status: "ready", source: "network", cards: cards.slice(split),
    }, 0, 7);
    const allAtOnce = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "network", cards: [...cards].reverse(),
    }, 0, 7);
    expect(packA.cards.length).toBeGreaterThan(0);
    expect(packB.cards.map((card) => card.sceneID)).toEqual(cards.map((card) => card.sceneID));
    expect(packB.compiledPlan.planIdentity).toBe(allAtOnce.compiledPlan.planIdentity);
  });

  it("normalizes duplicate cards without changing identity and keeps layout changes capped at two", () => {
    const normalized = normalizeRollingCoverageV1(fixture, bible, [...cards, ...cards]);
    const next = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "network", cards: normalized,
    }, 0, 7);
    expect(normalized.map((card) => card.sceneID)).toEqual(cards.map((card) => card.sceneID));
    expect(next.compiledPlan.blocking.transitions.length).toBeLessThanOrEqual(2);
  });

  it("does not allow a late result or stale generation to rewrite elapsed cards", () => {
    const accepted = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "network", cards,
    }, 0, 7);
    const elapsed = cards[0]!;
    const stale = reduceRollingCoverageResultV1(fixture, accepted, {
      status: "ready", source: "network", cards: [{ ...elapsed, sceneID: `${elapsed.sceneID}:changed` }],
    }, elapsed.toMs + 1, 6);
    expect(stale).toBe(accepted);
    const late = reduceRollingCoverageResultV1(fixture, accepted, {
      status: "ready", source: "network", cards: [{ ...elapsed, intention: "late rewrite" }],
    }, elapsed.toMs + 1, 7);
    expect(late.cards.find((card) => card.sceneID === elapsed.sceneID)?.intention).toBe(elapsed.intention);
  });

  it("uses a 35-second refill threshold, pauses horizon refill, and requests a bounded window", () => {
    const state = withBible();
    expect(shouldRefillRollingCoverageV1(state, 0, fixture.durationMs + 60_000, false)).toBe(true);
    expect(shouldRefillRollingCoverageV1(state, 0, fixture.durationMs + 60_000, true)).toBe(false);
    expect(shouldRefillRollingCoverageV1(state, 0, fixture.durationMs + 60_000, true, 10_000)).toBe(true);
    const finalSeek = Math.max(0, fixture.durationMs - 1_000);
    expect(shouldRefillRollingCoverageV1(state, finalSeek, fixture.durationMs, true, finalSeek)).toBe(true);
    const window = selectRollingRequestedWindowV1(fixture, 5_000)!;
    expect(window.toMs - window.fromMs).toBeLessThanOrEqual(75_000);
    expect(selectRollingRequestedWindowV1(fixture, 5_000)).toEqual(window);
  });

  it("refills from the accepted coverage boundary instead of overlapping the playhead", () => {
    const accepted = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "cache", cards: cards.slice(0, 1),
    }, cards[0]!.fromMs, 7);
    const inside = cards[0]!.toMs - 1_000;
    expect(rollingRefillTargetV1(accepted, inside, fixture.durationMs)).toBe(cards[0]!.toMs);
    expect(rollingRefillTargetV1(accepted, inside, fixture.durationMs, 5_000)).toBe(5_000);
    expect(rollingRefillTargetV1(withBible(), 5_000, fixture.durationMs)).toBe(5_000);
  });

  it("keeps a refill card that is already live instead of requesting the same gap forever", () => {
    expect(cards.length).toBeGreaterThan(1);
    const firstPack = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "cache", cards: cards.slice(0, 1),
    }, cards[0]!.fromMs, 7);
    const liveRefill = cards[1]!;
    const currentLyricMs = liveRefill.fromMs + Math.min(500, Math.max(1, liveRefill.toMs - liveRefill.fromMs - 1));
    const refilled = reduceRollingCoverageResultV1(fixture, firstPack, {
      status: "ready", source: "local", cards: [liveRefill],
    }, currentLyricMs, 7);
    expect(refilled.cards.some((card) => card.sceneID === liveRefill.sceneID)).toBe(true);
    expect(rollingCoverageAtV1(refilled.cards, currentLyricMs).aheadMs).toBeGreaterThan(0);
    const recovered = queueRollingDirectorPlanV1(fixture, { active: local }, refilled.compiledPlan, currentLyricMs);
    expect(recovered.active.planIdentity).toBe(refilled.compiledPlan.planIdentity);
    expect(recovered.pending).toBeUndefined();
  });

  it("only treats current or future cards as remaining direction", () => {
    expect(rollingHasRemainingDirectionV1(cards, cards[0]!.fromMs)).toBe(true);
    expect(rollingHasRemainingDirectionV1(cards, cards.at(-1)!.toMs)).toBe(false);
  });

  it("keeps covered seeks directed and switches uncovered seeks immediately to local", () => {
    const accepted = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "cache", cards: cards.slice(0, 1),
    }, cards[0]!.fromMs, 7);
    expect(rollingCoverageAtV1(accepted.cards, cards[0]!.fromMs).aheadMs).toBeGreaterThan(0);
    expect(handleRollingSeekV1(accepted, local, cards[0]!.fromMs, fixture).useLocalImmediately).toBe(false);
    const outside = Math.min(fixture.durationMs, cards[0]!.toMs + 100);
    const reset = handleRollingSeekV1(accepted, local, outside, fixture);
    expect(reset).toMatchObject({ useLocalImmediately: true });
    expect(reset.state.compiledPlan.planIdentity).toBe(local.planIdentity);
  });

  it("rebuilds the rolling plan when a backward seek returns from an uncovered local gap", () => {
    const accepted = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "network", cards: cards.slice(0, 1),
    }, cards[0]!.fromMs, 7);
    const outside = Math.min(fixture.durationMs, cards[0]!.toMs + 100);
    const localGap = handleRollingSeekV1(accepted, local, outside, fixture);
    expect(localGap.state.compiledPlan).toBe(local);

    const restored = handleRollingSeekV1(localGap.state, local, cards[0]!.fromMs, fixture);
    expect(restored.useLocalImmediately).toBe(false);
    expect(restored.state.compiledPlan.source).not.toBe("local");
    expect(restored.state.compiledPlan.sections.some((section) => section.id === `rolling:${cards[0]!.sceneID}`)).toBe(true);
  });

  it("releases an obsolete pending window when a seek needs a new request", () => {
    const oldWindow = selectRollingRequestedWindowV1(fixture, cards[0]!.fromMs)!;
    const pending = {
      ...withBible(),
      status: "coverage-requesting" as const,
      pendingWindow: oldWindow,
    };
    const target = Math.min(fixture.durationMs, cards[0]!.toMs + 100);
    const seek = handleRollingSeekV1(pending, local, target, fixture);
    expect(seek.state.status).toBe("ready");
    expect(seek.state.pendingWindow).toBeUndefined();
    expect(shouldRefillRollingCoverageV1(seek.state, target, fixture.durationMs, false, target)).toBe(true);
  });

  it("does not bridge disjoint checkpoint cards by a small timestamp gap", () => {
    const first = cards[0]!;
    const disjoint = {
      ...cards.at(-1)!,
      fromLineIndex: first.toLineIndex + 2,
      fromMs: first.toMs + 40,
      toMs: first.toMs + 4_000,
    };
    expect(rollingCoverageAtV1([first, disjoint], first.fromMs).toMs).toBe(first.toMs);
  });

  it("detects authoritative backward and material forward jumps but not normal playback", () => {
    const prior = { lyricTimeMs: 10_000, observedAtMs: 1_000, playing: true };
    expect(detectRollingSeekTargetV1(prior, { lyricTimeMs: 11_000, observedAtMs: 2_000, playing: true })).toBeUndefined();
    expect(detectRollingSeekTargetV1(prior, { lyricTimeMs: 4_000, observedAtMs: 2_000, playing: true })).toBe(4_000);
    expect(detectRollingSeekTargetV1(prior, { lyricTimeMs: 40_000, observedAtMs: 2_000, playing: true })).toBe(40_000);
  });

  it("does not rebuild prepared state for a one-second status or coverage tick with the same plan identity", () => {
    expect(rollingPlanNeedsPreparedRebuildV1("same", "same")).toBe(false);
    expect(rollingPlanNeedsPreparedRebuildV1("old", "new")).toBe(true);
    const ready = { ...withBible(), status: "ready" as const };
    const requesting = { ...ready, status: "coverage-requesting" as const };
    expect(rollingPreparedRendererIdentityV1(ready.recordingID, ready.compiledPlan.planIdentity))
      .toBe(rollingPreparedRendererIdentityV1(requesting.recordingID, requesting.compiledPlan.planIdentity));
  });

  it("adopts a compatible rolling snapshot immediately without a waiting state", () => {
    const directed = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "network", cards,
    }, 0, 7).compiledPlan;
    const queued = queueRollingDirectorPlanV1(fixture, { active: local }, directed, 0);
    expect(queued.active.planIdentity).toBe(directed.planIdentity);
    expect(queued.pending).toBeUndefined();
    expect(queued.activateAtMs).toBeUndefined();
  });

  it("applies a late MusicMap only to uncovered local sections", () => {
    const accepted = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "network", cards: cards.slice(0, 1),
    }, 0, 7);
    const sceneSection = accepted.compiledPlan.sections.find((section) => section.id === `rolling:${cards[0]!.sceneID}`)!;
    const mapped = applyMusicMapToRollingDirectorPlanV1(accepted.compiledPlan, {
      version: "music-map-v1", source: "tab-capture", durationMs: fixture.durationMs,
      analyzedMs: fixture.durationMs, featureRateHz: 30, tempo: null,
      summary: { dynamicRange: 0.5, meanEnergy: 0.8, peakEnergy: 0.9, silenceRatio: 0 },
      segments: [{
        fromMs: 0, toMs: fixture.durationMs, energy: 1, bass: 0.5, mid: 0.5,
        treble: 0.5, brightness: 0.5, flux: 0.5, onsetDensity: 0.5, stereoWidth: 0.5,
      }],
      landmarks: [],
    }, accepted.cards);
    expect(mapped.sections.find((section) => section.id === sceneSection.id)?.intensity).toBe(sceneSection.intensity);
  });

  it("preserves signature identities and the final memory recall across packs", () => {
    const split = Math.max(1, Math.floor(cards.length / 2));
    const packA = reduceRollingCoverageResultV1(fixture, withBible(), {
      status: "ready", source: "network", cards: cards.slice(0, split),
    }, 0, 7);
    const packB = reduceRollingCoverageResultV1(fixture, packA, {
      status: "ready", source: "network", cards: cards.slice(split),
    }, 0, 7);
    const moments = packB.compiledPlan.dramaticScore.signatureMoments;
    const finalAnchor = bible.signatureAnchors.at(-1)!;
    expect(moments.map((moment) => moment.id)).toEqual(bible.signatureAnchors.map((anchor) => anchor.id));
    expect(moments.at(-1)?.recallOf).toBe(finalAnchor.recallOf);
    expect(moments.some((moment) => moment.id === finalAnchor.recallOf)).toBe(true);
  });

  it("keeps directed Stage motion off CSS wall-clock timelines", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const layoutRule = css.match(/\.stage-now-playing-layout \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    const artworkRule = css.match(/\.stage-artwork-frame \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(layoutRule).not.toMatch(/transition:[^;]*(grid-template-columns|gap|padding)/u);
    expect(artworkRule).not.toMatch(/transition:[^;]*(width|border-radius|box-shadow)/u);
    expect(css).not.toMatch(/animation:[^;\n]*\binfinite\b/u);
    expect(css).not.toContain("data-layout-transition-phase");
    const stageSource = readFileSync(new URL("../StageCanvas.tsx", import.meta.url), "utf8");
    expect(stageSource).toMatch(/useLayoutEffect\(\(\) => \{\s*if \(!remoteDirectorPlan\)/u);
    expect(stageSource).toContain("handoffRef.current = { active: localDirectorPlan }");
    expect(stageSource).toContain('directorMode === "legacy" && Boolean(remoteDirectorPlan)');
    expect(stageSource).toContain("applyStageFrameDOMV1(stageFrame");
    expect(stageSource).not.toContain("setLayoutTransitionPhase");
    const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain("const priorRollingState = rollingDirectorStateRef.current");
    expect(appSource).toContain("setRollingDirectorState(priorRollingState)");
    expect(appSource).toContain("setRollingForceLocal(priorForceLocal)");
    expect(appSource).toContain("requestEpoch !== rollingCoverageRequestEpochRef.current");
  });
});
