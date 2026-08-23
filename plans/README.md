# LyricStage rolling dramaturgy implementation plans

These plans replace the current one-shot whole-song AI direction with a bounded hybrid architecture:

`DirectorBibleV1 → rolling SceneCardV1 packs → deterministic local DirectorPlanV1/rendering`

The renderer, authoritative YouTube Music clock, local fallback, reduced-motion behavior, and BYOK privacy boundary remain intact throughout migration.

| Plan | Title | Severity | Status | Depends on |
|---|---|---:|---|---|
| [001](001-version-rolling-dramaturgy-contracts.md) | Version the rolling dramaturgy contracts | HIGH | DONE | — |
| [002](002-build-rolling-byok-scheduler-cache.md) | Build the rolling BYOK scheduler and split cache | HIGH | DONE | 001 |
| [003](003-stitch-scene-cards-into-stage.md) | Stitch Scene Cards into the deterministic Stage | HIGH | DONE | 001, 002 |
| [004](004-add-director-cache-review-and-rollout-gates.md) | Add a safe Director cache review console and rollout gates | MEDIUM | DONE | 001, 002; completes after 003 |

## Recommended execution order

1. Implement and merge 001. It is additive and must leave the legacy whole-song path untouched.
2. Implement 002 behind an inactive feature flag. Verify provider budgets, cancellation, caching, and privacy before touching Stage rendering.
3. Implement 003 with rolling mode still opt-in. Use local fixtures to close pause/seek/handoff/performance gates before real provider tests.
4. Implement 004, run shadow mode, then the five-song opt-in matrix. Enable rolling mode by default only after every release gate passes.

## Release strategy

- **Off**: legacy whole-song intent and cache remain production behavior.
- **Shadow**: Bible/Scene Packs generate and cache under hard budgets, but the Stage renders the legacy plan.
- **On (opt-in)**: rolling artifacts render for deliberate UAT; legacy and local paths remain available.
- **Default on**: only after fast, slow, repeated-chorus, duet, and long-line songs pass visual, pause/seek, reduced-motion, performance, fallback, and privacy gates.

## Non-negotiable boundaries

- No model-authored executable SVG, scripts, CSS, coordinates, paths, keyframes, or colors.
- No provider key, endpoint, lyric text, prompt, response body, or raw audio in cache summaries or diagnostics.
- No more than two layout changes per song.
- No provider request in the animation frame loop or per lyric line.
- One provider request in flight per song identity.
- Network failure never interrupts playback or removes the deterministic local performance.
- Accepted past Scene Cards never change when future cards arrive.
- Pause, seek, replay, reduced motion, and cache replay remain deterministic.
