# 002 — Build the rolling BYOK scheduler and split cache

- **Status**: DONE
- **Commit**: 28f51ec
- **Severity**: HIGH
- **Category**: Performance / interruptibility
- **Estimated scope**: 8–11 files, roughly 1,300–1,900 lines including background and provider tests

## Problem

The extension currently owns one whole-song provider operation and one whole-plan cache entry. A cache miss blocks until the complete `DirectorPlanV1` is adapted, then returns a single immutable plan.

```ts
// apps/browser-extension/src/background.ts:723 — current
const cached = await cachedDirectorPlan(track, lyrics, configuration);
if (cached) {
  // ...
  return { type: "director-resolution-v1", status: "ready", source: "cache", plan: cached, timing };
}
```

```ts
// apps/browser-extension/src/background.ts:748 — current
const task = (async (): Promise<DirectorResolutionResponseV1> => {
  const requestBuildStartedAt = Date.now();
  let payload = await buildDirectorRequestPayloadV1(track, lyrics, musicMap);
  // ... one executeDirectorBYOKV1 call ...
})();
```

Pure continuous generation would create uncontrolled requests, nondeterministic seek behavior, and direct network dependence during playback. The target is bounded rolling pre-generation: one Bible plus a small number of Scene Packs, one request in flight, cached independently, with local performance covering all gaps.

## Target

Add a versioned background orchestration path with two logical operations:

- `resolveDirectorBibleV1(track, lyrics, musicMap?)`
- `resolveDirectorCoverageV1(track, lyrics, bible, playheadMs, desiredHorizonMs, musicMap?)`

Use exact scheduling bounds:

- One provider HTTP request in flight per track/lyrics/provider identity.
- Initial desired coverage: current scene plus at least 45 seconds ahead; target 60 seconds.
- Refill when validated coverage ahead falls below 35 seconds.
- Generate Scene Packs of 1–3 contiguous Scene Cards covering 45–75 seconds.
- Maximum one Bible logical request and three Scene Pack logical requests per song.
- Hard maximum six provider HTTP attempts per song, including primary/fallback attempts.
- Hard maximum 90 seconds cumulative provider wall time per song.
- Stop rolling generation for the rest of the song after three consecutive failed logical requests; preserve existing cached cards and deterministic local coverage.
- Never start a request after playback enters the final 20 seconds unless it fills a seek target.
- A Scene Pack ready less than eight seconds before its intended boundary is cached but may only activate at the next legal boundary.
- Track change cancels queued work immediately and ignores late results by generation/fingerprint.
- Pause does not cancel already-started work; it prevents unnecessary horizon expansion.
- Seek outside cached coverage requests the target scene plus 45 seconds ahead. The visible stage remains local until valid coverage is ready.

Create a new ADR before runtime implementation because this intentionally changes ADR 0002's single-operation request budget. The ADR must document the bounds above, BYOK cost implications, one-in-flight rule, failure cap, fallback behavior, and why continuous per-line generation is rejected.

## Repo conventions to follow

- Background remains the only owner of provider keys, fetch, provider selection, sanitized timings, and extension-local cache.
- Reuse `executeDirectorBYOKV1` provider adapters; parameterize prompt/schema/response adaptation instead of duplicating OpenAI/Gemini/Anthropic request code.
- Reuse the current fingerprint inputs: epoch, protocol/endpoint/model cache identity, track fingerprint, and lyrics. Key remains excluded.
- Keep `services/director-gateway` optional; mirror contracts there for conformance only.
- Keep all provider errors sanitized. No endpoint, key, lyric text, response body, or raw rationale enters settings diagnostics.
- Preserve the existing one-recovery extension bridge behavior.

## Steps

1. Add `docs/adr/0003-rolling-director-generation.md` with the target scheduling, budget, privacy, fallback, cache, and migration decisions.
2. Refactor `packages/performance/src/directorProviders.ts` so the existing protocol adapters accept a request profile containing `systemPrompt`, `schema`, `schemaName`, `compactInput`, and `repair/adapt` callbacks. Keep the legacy whole-song profile bit-for-bit compatible.
3. Add provider profiles for `director-bible-v1` and `scene-pack-v1`. Scene requests must include only the bounded lyric window plus Bible and continuity/diversity summaries; never resend unrelated full-song word timings.
4. Introduce cache keys `lyricstage-director-bible-cache-v1` and `lyricstage-director-scene-cache-v1`, each with an explicit rolling epoch. Keep legacy `lyricstage-director-cache-v5` readable while the feature flag is off.
5. Store Bible and cards independently. Bible entries expire after 30 days. Scene entries inherit the Bible expiry and are keyed by `trackID + bibleIdentity + fromLineIndex + entryStateHash`.
6. Add a bounded per-song generation ledger in background memory: logical requests used, provider attempts used, cumulative provider milliseconds, consecutive failures, current in-flight kind/window, and generated coverage. Do not persist failure counters across browser restarts.
7. Add extension messages `youtube-music-resolve-director-bible-v1` and `youtube-music-resolve-director-coverage-v1`. Validate track, recording identity, lyric contract, Bible identity, playhead bounds, and MusicMap before starting work.
8. Return versioned results with `status`, `source`, validated artifact, coverage summary, and sanitized phase timing. Cache hits must report zero provider attempts.
9. Add cancellation/generation guards for track change and provider configuration change. Late responses may be cached only if their original fingerprint is still valid; they must never be delivered to the wrong track.
10. Keep MusicMap behavior bounded: a MusicMap available before Bible generation may inform it; later MusicMap data may inform only not-yet-generated Scene Packs. It must never rewrite accepted cards or restart the provider chain.
11. Add background integration tests covering: Bible miss/hit, two Scene Pack fills, one-in-flight deduplication, seek target fill, pause behavior, track cancellation, stale response suppression, fallback attempt accounting, six-attempt cap, three-failure stop, cumulative timeout, late MusicMap, configuration change, expiry, invalid card rejection, and legacy feature-flag path.
12. Mirror the Bible/Scene validators and profiles in `services/director-gateway` without making the gateway a dependency. Add conformance tests only; do not deploy in this plan.

## Boundaries

- Do NOT change Stage rendering or activate rolling plans in this plan.
- Do NOT delete `lyricstage-director-cache-v5` or the legacy `youtube-music-resolve-performance` message.
- Do NOT persist raw prompts, responses, lyric text, keys, endpoints, or rationales in diagnostic storage.
- Do NOT run more than one provider request concurrently for a song.
- Do NOT generate continuously per line, beat, frame, or timer tick.
- Do NOT allow a failed Scene Pack to invalidate a valid Bible or earlier cards.
- Do NOT add dependencies.
- If the provider adapter cannot be parameterized without changing legacy request bodies, first add characterization tests and stop if compatibility cannot be preserved.

## Verification

- **Mechanical**: run `npm test -- packages/performance/src/directorProviders.test.ts apps/browser-extension/src/background.test.ts` and `(cd services/director-gateway && npm test)`. Expected: rolling and legacy paths pass.
- **Budget test**: use a fake provider that fails repeatedly. Assert at most six HTTP calls, one concurrent call, and local fallback after the third consecutive logical failure.
- **Cache test**: generate Bible and Pack A, restart the mocked background, then request the same horizon. Assert zero provider attempts and identical artifact identities.
- **Privacy test**: recursively scan stored cache/diagnostic fixtures; API keys, endpoints, full lyrics, response bodies, and prompt text must be absent.
- **Performance check**: for a representative 50-line song, Scene Pack request bytes must be lower than the current compact whole-song request and must not include lyric lines outside the requested window.
- **Done when**: background can safely fill rolling Bible/Scene caches under hard request/time/failure caps while the production Stage still uses the untouched legacy path.
