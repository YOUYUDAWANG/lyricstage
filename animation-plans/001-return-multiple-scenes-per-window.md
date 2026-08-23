# 001 — Return multiple scenes per rolling window

- **Status**: SUPERSEDED
- **Superseded by**: [009 — Director V2 final architecture](009-director-v2-final-architecture.md)
- **Commit**: `82a5e21`
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 9–13 files, roughly 1,400–2,100 lines including tests

## Problem

Rolling V1 asks for a 60-second horizon but forces the provider to return exactly one scene. That makes the AI-authored visual unit much coarser than the lyric and music structure.

```ts
// packages/performance/src/rollingDirectorPrompt.ts:246 — current
scenes: {
  type: "array",
  minItems: 1,
  maxItems: 1,
  items: { /* one scene */ },
}
```

```ts
// packages/performance/src/rollingDirectorPrompt.ts:299 — current
The scenes array must contain exactly one Scene Card whose fromLineIndex and toLineIndex cover the entire supplied window. Do not split the window into multiple scenes.
```

```ts
// apps/stage/src/playback/rollingPerformanceDirector.ts:149 — current
export const selectRollingRequestedWindowV1 = (
  lyrics,
  targetMs,
  horizonMs = 60_000,
) => { /* hard maximum 75 seconds */ };
```

## Target

Add `ScenePackV2` beside V1. Do not mutate V1 cache entries or validators.

```ts
export interface ScenePackV2 {
  version: "scene-pack-v2";
  bibleIdentity: string;
  entryStateHash: string;
  densityProfile: "restrained" | "balanced" | "maximal";
  scenes: SceneCardV2[];
}
```

Use these exact bounds:

- Requested provider window: target 45–60 seconds, hard maximum 75 seconds.
- Window under 24 seconds: 1–2 scenes.
- Window 24–44.999 seconds: 2–4 scenes.
- Window at least 45 seconds: 3–5 scenes in `balanced` or `maximal`; 2–4 in `restrained`.
- Scene target duration: restrained 18–26s, balanced 12–18s, maximal 8–14s.
- Hard scene duration: minimum 4 seconds unless one lyric line itself is shorter; maximum 30 seconds unless one authoritative line is longer.
- Each scene normally covers 2–6 lyric lines. A signature anchor, voice handoff, silence boundary, or single long line may form a one-line scene.
- Scenes must cover every supplied line exactly once, in order, without gaps or overlaps.
- Every scene begins and ends on authoritative lyric line boundaries.
- Prefer a boundary supported by `section_boundary`, `silence_gap`, `voice_handoff`, `density_lift`, `density_release`, or `repeated_hook`.
- One provider request remains in flight. Keep the existing six-attempt and 90-second whole-song ledgers.
- A provider pack is accepted transactionally: either every card validates and chains state hashes, or the entire requested window is filled with deterministic local cards.

The provider returns scene contents without trusted identities. The adapter must construct and validate cards sequentially:

```text
pack.entryStateHash
  → sanitize scene 0 → advance state
  → sanitize scene 1 → advance state
  → …
  → final pack state
```

## Repo conventions to follow

- Keep rolling semantics in `packages/performance/src/rollingDirector.ts`.
- Keep prompt/schema construction in `packages/performance/src/rollingDirectorPrompt.ts`.
- Keep keys, fetch, provider selection, request ledgers, and cache writes in `apps/browser-extension/src/background.ts`.
- Reuse `sceneCardIdentityV1`, normalized semantic hashes, and `advanceRollingPerformanceStateV1`; introduce V2 names only where the wire contract changes.
- Keep `DirectorPlanV1` as the renderer input.
- Preserve the current `35_000`ms refill threshold and final-20-seconds rule until plan 008 measures them.

## Steps

1. Add `SceneCardV2`, `ScenePackV2`, V2 identity helpers, and `sanitizeScenePackV2` to `packages/performance/src/rollingDirector.ts` without changing V1 exports.
2. Add the density-profile table and deterministic `expectedSceneCountForWindowV2` helper. The validator, not the prompt, is authoritative.
3. Add `scenePackSchemaV2` and `scenePackSystemPromptV2`. Require the model to state `preserves`, `changes`, and `leavesBehind` for each scene so adjacent cards have explicit continuity.
4. Update the provider profile in `packages/performance/src/directorProviders.ts` to adapt all raw scenes in order and reject a partially valid pack.
5. Add a rolling cache epoch for V2. Store validated cards individually, but attach the originating `packIdentity` for review.
6. Update `resolveDirectorCoverageV1` through an additive V2 route so one logical request saves all accepted cards and computes coverage from the final card.
7. Update Stage result reduction to merge multiple returned cards in one state transition and rebuild prepared renderer state once per accepted pack, not once per card.
8. Extend safe DOM diagnostics with `data-scene-pack-version`, `data-scene-pack-count`, and `data-current-scene-duration-ms`; expose no intentions or lyric text.
9. Add focused fixtures for 18s final window, 32s quiet window, 60s pop window, 60s fast-rap window, a signature anchor, duet handoff, and one authoritative 34s long line.
10. Keep Rolling V1 available under the existing preference while V2 is `shadow` or `on` through a new internal epoch/flag.

## Boundaries

- Do NOT increase provider concurrency or make one request per scene.
- Do NOT split inside a lyric line or invent timing.
- Do NOT accept valid-prefix/invalid-suffix packs.
- Do NOT rewrite elapsed cards after a later pack arrives.
- Do NOT alter the installed extension or stable unpacked directory in this plan.
- Do NOT add dependencies.
- If the code has drifted from `82a5e21`, stop and refresh the cited excerpts before editing.

## Verification

- **Mechanical**: run `npm test -- packages/performance/src/rollingDirector.test.ts packages/performance/src/rollingDirectorPrompt.test.ts packages/performance/src/directorProviders.test.ts apps/browser-extension/src/background.test.ts apps/stage/src/playback/rollingPerformanceDirector.test.ts`, then `npm run typecheck`.
- **Contract**: a 60s balanced fixture returns 3–5 valid scenes; deleting, reordering, overlapping, or tampering any scene rejects the entire pack.
- **Budget**: fake provider tests still show one concurrent request, at most six attempts, and at most 90 seconds provider time.
- **Determinism**: cache replay yields identical scene ids, state hashes, compiled plan identity, and fixed-time render samples.
- **Feel check**: in Performance Lab, play a four-minute fixture at normal speed and 25% speed. New visual beats should arrive every 12–18s without cutting a sung line, and the world/motif should remain recognizable across the whole request window.
- **Reduced motion**: scene boundaries keep opacity/state feedback and remove travel; scene count and timing stay identical.
- **Done when**: one bounded provider request can author several contiguous scenes and a representative four-minute song can reach 16–20 validated scene beats without additional request frequency.
