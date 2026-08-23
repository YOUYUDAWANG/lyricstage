# 001 — Version the rolling dramaturgy contracts

- **Status**: DONE
- **Commit**: 28f51ec
- **Severity**: HIGH
- **Category**: Purpose & frequency / missed opportunity
- **Estimated scope**: 8–12 files, roughly 1,400–2,000 lines including tests and schemas

## Problem

The current BYOK request asks one model response to author the whole song: premise, world, blocking, sections, sparse directives, effects, gestures, and dramatic score. Its lower bounds permit the model to pass with two signature moments, one gesture, one effect, and zero layout changes. The deterministic local compiler then authors nearly every ordinary line, making a valid AI plan visually close to the local plan.

```ts
// packages/performance/src/directorIntent.ts:15 — current
directives.description = "Sparse overrides for at most 12 exceptional lyric lines. The local compiler fills every omitted line.";
effects.description = "One to four evidence-backed scenic events. Do not decorate every section.";
gestures.description = "One to eight exact lyric gestures across glyph, token and phrase scales. Prefer memorable structural anchors.";
```

```ts
// packages/performance/src/directorPlan.ts:128 — current
export interface DirectorPlanV1 {
  version: "director-plan-v1";
  recordingID: string;
  lyricsIdentity: string;
  planIdentity: string;
  source: "local" | "ai" | "cache";
  directorVersion: string;
  concept: string;
  motif: string;
  intensityArc: string;
  world: PerformanceWorldV1;
  blocking: SongBlockingV1;
  sections: DirectorSectionV1[];
  directives: DirectorLineDirectiveV1[];
  effects: EffectRecipeV1[];
  gestures: LyricGestureV1[];
  dramaticScore: DramaticScoreV1;
}
```

The target architecture needs a stable whole-song constitution and independently validated scene packs, while preserving `DirectorPlanV1` as the renderer input during migration.

## Target

Add a versioned three-layer contract in `packages/performance`:

1. `DirectorBibleV1`: whole-song premise, emotional arc, acts, one motif actor, world physics, signature anchors, quiet windows, and a global layout budget.
2. `SceneCardV1`: a bounded 20–45 second scene with entry state, anticipation, event, consequence, exit state, lyric gestures, effects, and evidence.
3. `RollingPerformanceStateV1`: the local continuity ledger used to validate and order cards.

The model never outputs coordinates, paths, SVG, CSS, JavaScript, keyframes, colors, or invented timing. The runtime continues to own all geometry, authoritative `timeMs`, pause, seek, reduced motion, safe areas, and fallback behavior.

Use these exact semantic bounds:

- Bible: 2–5 contiguous acts covering every lyric line.
- Ordinary songs shorter than 150 seconds or 24 lyric lines: 2–4 signature anchors.
- Songs at least 150 seconds and 24 lines: 3–4 signature anchors by default. Two is legal only with `continuityJustification.confidence >= 0.85` and evidence that uninterrupted continuity is the dramatic idea.
- Whole song: maximum two layout transitions. A third is not supported by the rolling V1 contract.
- Zero layout transitions require `continuityJustification` with at least two independent evidence categories and confidence `>= 0.82`.
- Quiet coverage must be at least 40 percent of lyric time.
- Scene Card duration: target 20–45 seconds, hard maximum 75 seconds; align boundaries to existing lyric lines/sections.
- Ordinary Scene Card: 0–2 gestures and 0–1 effects.
- Signature Scene Card: 2–4 gestures using at least two of `glyph`, `token`, `phrase` when the lyric timing permits; 1–2 grounded effects; exactly one authored consequence.
- Never allow more than two concurrent gestures.
- Every signature scene must leave one of `trace`, `afterimage`, `accumulation`, `absence`, `reframe`, or `return`.
- The final signature scene must consume an earlier unresolved promise by exact id.

Define the following minimum data shapes; exact TypeScript field names may expand, but must not weaken these invariants:

```ts
export interface DirectorBibleV1 {
  version: "director-bible-v1";
  recordingID: string;
  lyricsIdentity: string;
  bibleIdentity: string;
  premise: string;
  emotionalArc: string;
  world: PerformanceWorldV1;
  acts: DramaticActV1[];
  motifActor: MotifActorV1;
  signatureAnchors: SignatureAnchorV1[];
  quietWindows: QuietWindowV1[];
  layoutBudget: {
    baseLayout: PerformanceLayoutV1;
    maximumTransitions: 2;
    proposedTransitions: SongBlockingTransitionV1[];
    continuityJustification?: EvidenceV1;
  };
}

export interface SceneCardV1 {
  version: "scene-card-v1";
  recordingID: string;
  lyricsIdentity: string;
  bibleIdentity: string;
  sceneID: string;
  sceneIndex: number;
  fromLineIndex: number;
  toLineIndex: number;
  fromMs: number;
  toMs: number;
  intention: string;
  entryStateHash: string;
  entryMotifState: MotifStateV1;
  exitMotifState: MotifStateV1;
  coverRole: DramaticCoverRoleV1;
  layout: PerformanceLayoutV1;
  artDirection: PerformanceArtDirectionV1;
  typography: PerformanceTypographyV1;
  presentation: StagePresentationV1;
  gestures: LyricGestureV1[];
  effects: EffectRecipeV1[];
  signatureMoment?: SignatureMomentV1;
  consequence: DramaticConsequenceV1;
  promiseCreates: string[];
  promiseConsumes: string[];
  evidence: DramaticEvidenceV1;
}
```

`bibleIdentity`, `sceneID`, `entryStateHash`, and the compiled plan identity must be deterministic hashes of normalized semantic content. Do not include generation timestamps, provider keys, endpoint URLs, response bodies, or diagnostics in identity.

## Repo conventions to follow

- Put semantic plan types and validators under `packages/performance/src`; keep `packages/renderer` ignorant of provider protocols.
- Reuse `stableHash32` and the existing `finalizePlan` identity approach in `packages/performance/src/directorPlan.ts:360`.
- Reuse the existing evidence matrices and enum registries in `dramaticScore.ts`, `lyricChoreography.ts`, and `effectGrammar.ts` rather than defining parallel primitive names.
- Preserve the current security boundary from `directorIntentSystemPromptV1`: no model-authored coordinates, SVG, paths, scripts, CSS, colors, keyframes, or audio instructions.
- Preserve `DirectorPlanV1` until the rolling path has completed shadow and opt-in validation.
- Export new types through `packages/performance/src/index.ts`.

## Steps

1. Add `packages/performance/src/rollingDirector.ts` with `DirectorBibleV1`, `SceneCardV1`, `RollingPerformanceStateV1`, summary types, deterministic identity helpers, and validators.
2. Implement `sanitizeDirectorBibleV1(lyrics, value)` with contiguous act coverage, signature-count, quiet-share, motif-state, layout-budget, and evidence gates. Fail closed; never silently invent a missing Bible.
3. Implement `sanitizeSceneCardV1(lyrics, bible, priorState, value)` with exact lyric range/timing checks, state-hash continuity, gesture/effect validation, layout-budget enforcement, consequence/promise validation, and signature-scene minimum-completeness checks.
4. Implement `compileLocalDirectorBibleV1(lyrics)` and `compileLocalSceneCardsV1(lyrics, bible)` as deterministic fallback. Local cards must use existing primitives and never pretend to be AI.
5. Implement `compileDirectorPlanFromRollingV1(lyrics, bible, cards, source)` to produce a valid `DirectorPlanV1`. Uncovered ranges must use the deterministic local plan while covered scene ranges retain validated AI Bible/world/card choices. Previously accepted cards must not change when a later card arrives.
6. Add `packages/performance/src/rollingDirectorPrompt.ts` with separate JSON schemas and prompts for Bible and Scene Pack generation. Bible output contains no gestures/effects. Scene Pack input contains the Bible, current continuity ledger, bounded lyric window, verified MusicMap evidence for that window, and a short diversity ledger.
7. Keep `directorIntentSchemaV1`, `expandDirectorIntentV1`, and existing V1–V4 adapters operational as the legacy compatibility path.
8. Add focused tests for: short song, normal 3+ minute song, zero-transition continuity exception, rejected third transition, signature scene with two gesture scales, rejected one-gesture signature scene, promise creation/consumption, invalid state hash, overlapping voices, long Japanese line, seek-generated middle card, deterministic identities, and uncovered local fallback.
9. Add fixture builders rather than large provider-response snapshots. Fixtures must contain no real key, endpoint, user history, or full copyrighted lyrics.

## Boundaries

- Do NOT modify `apps/stage` or the browser-extension request scheduler in this plan.
- Do NOT remove or rename `DirectorPlanV1`, current adapters, or current cache keys.
- Do NOT add a provider dependency to the Stage or renderer.
- Do NOT allow the model to author executable SVG/script/keyframes/coordinates.
- Do NOT force a layout change merely to create variety.
- Do NOT add dependencies.
- If the cited types have drifted since commit `28f51ec`, stop and update this plan before implementing.

## Verification

- **Mechanical**: run the narrow performance tests first, then `npm test -- packages/performance/src/rollingDirector.test.ts packages/performance/src/performance.test.ts`. Expected: all focused tests pass and existing `DirectorPlanV1` tests remain unchanged.
- **Contract check**: serialize and reparse a Bible plus two Scene Cards; identities must be stable and a tampered `entryStateHash` must be rejected.
- **Fallback check**: compile a plan with no AI cards; output source must remain `local` and pass `isDirectorPlanV1ForLyrics`.
- **Feel check**: use Performance Lab fixtures to inspect one short song and one 3+ minute song. The normal song must expose at least three signature anchors in the Bible but still contain at least 40 percent quiet lyric time.
- **Done when**: rolling contracts can be produced, validated, deterministically compiled into the unchanged renderer plan, and rejected independently without affecting the legacy whole-song path.
