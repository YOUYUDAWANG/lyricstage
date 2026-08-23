# 003 — Stitch Scene Cards into the deterministic Stage

- **Status**: DONE
- **Commit**: 28f51ec
- **Severity**: HIGH
- **Category**: Interruptibility / performance / cohesion
- **Estimated scope**: 9–13 files, roughly 1,400–2,100 lines including Stage and renderer tests

## Problem

Stage currently starts one automatic whole-song request when track/lyrics identity changes, stores one remote plan, and queues that entire plan at the next section boundary.

```tsx
// apps/stage/src/App.tsx:353 — current
useEffect(() => {
  if (source !== "youtubeMusic" || !youtubeMusic.snapshot || !hasMatchingLyrics) return undefined;
  // ...
  setDirectorLookupState({ status: "requesting" });
  void requestAutomaticDirectorPlan(track, lyrics, musicMapAtRenderRef.current).then((response) => {
    // ...
    setRemoteDirectorPlan(next);
  });
}, [hasMatchingLyrics, localDirectorPlan.lyricsIdentity, source, youtubeMusic.snapshot?.track.trackID]);
```

```tsx
// apps/stage/src/StageCanvas.tsx:238 — current
useEffect(() => {
  if (!remoteDirectorPlan) return;
  const sample = clock.sample();
  const playbackTimeMs = sample.state === "unavailable" ? displayTimeRef.current : sample.timeMs;
  const timeMs = lyricsTimeForPlaybackMs(playbackTimeMs, lyricsOffsetMs, durationMs);
  handoffRef.current = queueDirectorPlanV1(handoffRef.current, remoteDirectorPlan, timeMs);
}, [clock, durationMs, lyricsOffsetMs, remoteDirectorPlan?.planIdentity]);
```

Rolling artifacts must arrive without causing mid-line swaps, repeated full-plan rebuild jank, lost motif state, or seek nondeterminism. The renderer should continue consuming a deterministic `DirectorPlanV1` during V1 rollout.

## Target

Add a Stage orchestration state that progressively compiles validated Bible/Scene coverage into stable `DirectorPlanV1` snapshots:

```ts
interface RollingDirectorRuntimeStateV1 {
  status: "local" | "bible-requesting" | "coverage-requesting" | "ready" | "degraded";
  bible?: DirectorBibleV1;
  cards: SceneCardV1[];
  coverageFromMs: number;
  coverageToMs: number;
  pendingWindow?: { fromMs: number; toMs: number };
  consecutiveFailures: number;
  compiledPlan: DirectorPlanV1;
}
```

Use these exact runtime rules:

- Local plan renders immediately and remains complete for the entire song.
- A cached Bible plus cards valid for the entry playhead may become the fullscreen first frame.
- A newly compiled plan may activate only at the first section/scene boundary strictly more than 80ms after the current authoritative lyric time, preserving the existing handoff rule.
- A late Scene Card never rewrites elapsed scenes.
- Adding future cards must preserve all earlier section ids, timings, directives, effect ids, gesture ids, and dramatic moment ids.
- Refill coverage only when ahead coverage falls below 35 seconds; target 60 seconds.
- Evaluate refill eligibility at most once per second and only send a request when no identical window is pending. Do not bind network requests directly to the animation rAF loop.
- Seek into cached coverage switches deterministically at the next legal boundary. Seek outside coverage renders local immediately and requests target coverage.
- Pause freezes all visible motion through authoritative `timeMs`; it may finish one already-started provider request but starts no horizon-only refill.
- Reduced motion changes rendering only; it does not create a separate generated plan or cache identity.
- Layout changes remain globally capped at two after all cards are stitched.

## Repo conventions to follow

- Keep YTM as the sole playback/seek/transport owner.
- Use existing `queueDirectorPlanV1`/`sampleDirectorPlanHandoffV1`; extend them with scene-aware invariants rather than replacing the handoff model.
- Keep all actual drawing in `packages/renderer`; Stage composes state and exposes diagnostic data attributes only.
- Reuse `prepareDirectedStageV1`, `drawDirectedStageV1`, `drawDramaticScenesV1`, and the registered vector actors.
- Use `transform` and `opacity` for any newly needed scene arrival transition. Do not animate width, height, margin, padding, top, or left. UI arrival must remain under 300ms; do not change the existing long-form lyric-performance timing unless a focused feel check justifies it.
- Preserve existing reduced-motion branches and the full local fallback.

## Steps

1. Add pure helpers in `apps/stage/src/playback/rollingPerformanceDirector.ts`: coverage normalization, refill decision, requested window selection, result reduction, seek handling, and status copy. Unit-test them without React.
2. Extend `apps/stage/src/playback/performanceDirector.ts` with `requestDirectorBibleV1` and `requestDirectorCoverageV1` bridge functions. Preserve `requestAutomaticDirectorPlan` for the legacy feature-flag path.
3. In `App.tsx`, add a feature-flagged rolling state machine. On stable track/lyrics identity: reset generation, compile local plan, request Bible, accept cached/current coverage, then request only the first missing scene window.
4. Drive refill evaluation from a one-second bounded scheduler derived from the authoritative clock. A boolean/request identity guard must prevent duplicate calls. Clean up timer and generation on track change/unmount.
5. Compile `displayedRemoteDirectorPlan` from Bible plus all accepted cards and the local fallback. Applying late MusicMap may alter only local intensity for not-yet-generated/uncovered ranges; it must not mutate accepted card blocking or identities.
6. Extend `DirectorPlanHandoffV1` with optional `coverageIdentity` and `activateSceneID`, or add an adjacent rolling handoff helper. Reject snapshots that change elapsed scene content or exceed the Bible layout budget.
7. Preserve the current full plan in `preparedRef` until the legal handoff. Rebuild prepared renderer state only when `planIdentity` changes; do not rebuild every coverage tick.
8. Expose safe DOM observability on `.stage-canvas-host`: `data-director-mode="legacy|rolling"`, `data-bible-source`, `data-scene-id`, `data-scene-coverage-ms`, `data-scene-count`, `data-layout-change-count`, `data-gesture-count`, `data-effect-count`, `data-dramatic-moment-count`, and `data-director-source`. Do not expose lyrics, rationale, endpoint, model response, or keys.
9. Ensure dramatic promise continuity reaches the renderer: stitched `dramaticScore.signatureMoments` must keep stable ids and memory traces, so a later `motif.recall` can reference a previously rendered scene.
10. Add a subtle scene-card activation state transition only if the existing composition would otherwise jump. Use `opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)` and transform only; reduced motion keeps the opacity transition but removes positional movement.
11. Add tests for entry cache hit, local first frame, Bible arrival, Pack A arrival, Pack B arrival, section-boundary activation, late card, pause, seek inside/outside coverage, track change, stale generation, plan-identity stability, two-layout cap, memory recall across packs, reduce motion, and p95 frame sampling.
12. Add Performance Lab fixtures that simulate cards arriving at 5s, 25s, and after their intended boundary. They must run without a provider.

## Boundaries

- Do NOT make rendering wait for Bible or Scene Cards.
- Do NOT call provider code from Stage or renderer.
- Do NOT request generation from rAF or on every lyric line.
- Do NOT rewrite elapsed Scene Cards when later cards arrive.
- Do NOT allow a late card to activate mid-line.
- Do NOT increase the global layout-change cap beyond two.
- Do NOT replace the authoritative YTM clock or lyric timing.
- Do NOT remove the legacy path until the rollout plan is complete.
- Do NOT add dependencies.

## Verification

- **Mechanical**: run `npm test -- apps/stage/src/playback/rollingPerformanceDirector.test.ts apps/stage/src/playback/performanceDirector.test.ts packages/performance/src/performance.test.ts packages/renderer/src/renderer.test.ts` followed by `npm run typecheck`.
- **Determinism check**: replay the same fixture with cards delivered in different wall-clock orders. Once sorted/validated, the final compiled plan identity and rendered samples at fixed `timeMs` values must match.
- **Interruptibility check**: pause during anticipation, seek backward, seek forward into uncached coverage, and change tracks while a card is pending. No visible cue may continue from wall time; no stale plan may cross tracks.
- **Performance check**: simulate a card arrival during playback. `data-frame-p95` must not regress materially from the legacy fixture; there must be one prepared-state rebuild, not one per tick.
- **Feel check**: in Performance Lab at 10 percent playback speed, confirm a Scene Card arrives only at a legal boundary, does not double-expose lyric masters, and retains its consequence trace into the next quiet window. Toggle reduced motion and confirm spatial movement disappears while legible opacity/state feedback remains.
- **Done when**: rolling coverage can arrive incrementally, remain deterministic across pause/seek/replay, and visibly differ from local performance without making network availability part of the playback critical path.
