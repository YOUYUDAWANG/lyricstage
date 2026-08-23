# 004 — Add a safe Director cache review console and rollout gates

- **Status**: DONE
- **Commit**: 28f51ec
- **Severity**: MEDIUM
- **Category**: Cohesion / accessibility / verification
- **Estimated scope**: 8–12 files, roughly 1,000–1,500 lines including settings and UAT fixtures

## Problem

Current settings expose only the last sanitized timing, while cache entries contain complete plans. There is no safe local UI for answering whether previous songs repeatedly used minimum budgets, the same layout/world tuple, repaired fallback cues, or incomplete rolling coverage.

```ts
// packages/performance/src/directorPlan.ts:159 — current
export interface DirectorTimingV1 {
  version: "director-timing-v1";
  cache: "hit" | "miss" | "disabled";
  totalMs: number;
  cacheMs: number;
  requestBuildMs: number;
  providerMs: number;
  contractMs: number;
  adaptationMs: number;
  inputBytes: number;
  outputBytes: number;
  attempts: DirectorAttemptTimingV1[];
  completedAt: string;
}
```

Without cache-level observability, a visible “AI Director” badge can be mistaken for a rich performance, and minimum-budget bias cannot be measured before rollout.

## Target

Add a local-only, sanitized “Director 审片” section to the light Control Room settings. It reads summary records prepared by background code; the settings page never receives complete plans, lyrics, prompts, rationales, response bodies, keys, or endpoint URLs.

Each cache summary may expose only:

- locally stored track title and artist already associated with the cache entry, truncated to 120/160 characters;
- track id truncated or hashed for display;
- cache version/epoch, source, creation/expiry, Bible identity prefix;
- Bible present/absent, Scene Card count, coverage percent and missing ranges;
- base layout and layout-transition count;
- motif family, act count, signature-moment count;
- gesture counts by glyph/token/phrase and total;
- effect count and primitive category counts;
- art-direction/world tuple;
- quiet-share percentage;
- local repair flags by category, never repair rationales;
- last provider/cache timing summary;
- diversity warning flags computed locally.

Use these exact warning rules for V1:

- `minimum-budget`: normal song (>=150s and >=24 lines) has `<=2` signature moments, `<=1` gesture, or `<=1` effect.
- `single-scale`: signature scenes collectively use fewer than two gesture scopes where timing permits.
- `static-without-evidence`: zero layout transitions without accepted continuity justification.
- `repeated-tuple`: the same `baseLayout + spatialMode + artworkRole + motionLaw + motifFamily` appears in three consecutive valid AI/Bible entries.
- `coverage-gap`: cached Scene Cards cover less than 80 percent after the song reached its final 20 seconds.
- `local-repair-heavy`: two or more AI artifact categories were replaced locally.

This console is an audit surface, not a button to force more effects. It must not turn diversity warnings into random runtime choices.

## Repo conventions to follow

- Follow `docs/uiux-light-control-room.md`: stable split view, warm neutral canvas, grouped rows, progressive disclosure, one accent color, and explicit empty/loading/error states.
- Keep the settings surface static and task-focused. Do not add decorative animation.
- Use current settings message/client/model patterns and Sonner/notice conventions already present in the app; do not create a parallel data layer.
- All summary sanitization happens in background code before sending a response.
- Preserve BYOK privacy: keys remain in `chrome.storage.local` and are never returned to settings.

## Steps

1. Add `DirectorCacheSummaryV1` and a pure `summarizeDirectorCacheEntryV1` helper in `packages/performance` or the extension settings model boundary. The helper accepts validated artifacts and returns only the allowlisted fields above.
2. Extend rolling cache entries with bounded `createdAtUnixMs`, track title/artist, summary-safe repair flags, and sanitized timing. Do not retrofit or expose full legacy entries; summarize only entries that pass current validators.
3. Add background message `youtube-music-director-cache-summaries-v1`. Return at most 100 summaries, newest first. Never return complete Bible/Card/Plan objects.
4. Add a pure diversity analysis helper over summaries using the exact warning rules. Its output must be deterministic and must not mutate plans.
5. Add settings client/model states for loading, ready, empty, and error. Do not let a cache-inspector failure affect provider configuration or Stage playback.
6. Add a “Director 审片” settings section with an aggregate header and compact per-song rows. Default row shows title, coverage, moments/gestures/effects/layout count, motif, and warnings. Expanded details show only the allowlisted tuple and sanitized timing.
7. Do not add cache deletion in this plan. Deletion is destructive and requires a separate user-approved workflow.
8. Add a feature flag `rollingDirectorV1` with states `off`, `shadow`, and `on`. `off` uses the legacy path. `shadow` generates/validates/caches rolling artifacts but renders the legacy plan. `on` renders rolling coverage.
9. Define rollout order: internal fixtures → shadow mode on real songs → opt-in on five-song test matrix → default on only after acceptance gates below pass.
10. Add focused tests for summary allowlist, key/endpoint/lyrics/response exclusion, truncation, invalid entry skip, all warning rules, loading/empty/error UI, and feature-flag routing.
11. Add a real Chrome review script/checklist using the stable unpacked path and original extension id; the script may read public DOM data attributes only and must never inspect extension storage directly.

## Boundaries

- Do NOT expose complete cached plans, Bible text, scene intentions, lyric text, prompts, rationales, provider responses, keys, endpoints, or cookies to settings.
- Do NOT add cache deletion or regeneration buttons.
- Do NOT automatically reject a plan solely because it differs from recent plans; warnings inform evaluation and the next model request's bounded diversity ledger.
- Do NOT add motion to high-frequency settings rows.
- Do NOT enable rolling rendering by default before shadow/opt-in gates pass.
- Do NOT load an Orca/worktree build directly into Chrome; mirror a reviewed build to the stable unpacked path.
- Do NOT add dependencies.

## Verification

- **Mechanical**: run `npm test -- apps/browser-extension/src/settings/settingsModel.test.ts apps/browser-extension/src/settings/settingsClient.test.ts apps/browser-extension/src/background.test.ts packages/performance/src/rollingDirector.test.ts`, then `npm run typecheck`.
- **Privacy check**: serialize the cache-summary response and assert it contains none of: configured key fragments, provider endpoint, lyric lines, prompts, response bodies, rationale strings, or cookies.
- **UI check**: load settings with 0, 1, 10, and 100 synthetic summaries. Rows must remain readable without animated list entrances, and errors must not replace provider configuration state.
- **Shadow-mode gate**: run at least fast, slow, repeated chorus, duet, and long-line songs. For each, record Bible/card validation, coverage, warning flags, provider attempts, and timings without rendering rolling output.
- **Opt-in visual gate**: for the same five songs, inspect real Chrome fullscreen at entry, one signature scene, one quiet window, a seek, pause, reduced motion, and final recall. Confirm `source=ai/cache`, `artwork-directed`, Scene Card id/coverage, actual visual differences, and at most two layout transitions. A badge alone is not acceptance.
- **Performance gate**: no visible layout hitch on card activation; renderer p95 remains within the existing project performance budget; background has one provider request in flight.
- **Release gate**: run `npm test`, `npm run typecheck`, `npm run build:all`, `(cd services/director-gateway && npm test)`, `npm audit`, MV3 CSP, deterministic artifact comparison, stable-path mirror, extension reload, and real YTM UAT.
- **Done when**: the team can quantify minimum-budget/repetition bias locally, rolling mode passes shadow and five-song opt-in gates, and no private provider or lyric data is exposed by the review surface.
