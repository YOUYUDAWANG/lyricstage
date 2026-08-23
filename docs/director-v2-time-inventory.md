# Director V2 authoritative-time inventory

- **Status**: implementation inventory for commits 5–7
- **Scope**: directed fullscreen Stage only
- **Rule**: playback providers may use a monotonic wall clock to estimate media time; choreography may only consume the resulting authoritative `timeMs`

## Time ownership

| Source | Current purpose | Disposition |
|---|---|---|
| `PlaybackClockV0.sample()` | Samples media/provider playback truth | keep; this is the single frame input |
| `StageCanvas` rAF | Samples the clock and draws directed lyrics | keep as the sole continuous frame owner |
| `PerformanceEnvironment` rAF | Independently redraws Pixi/Canvas2D from a shared ref | remove; render synchronously from the Stage frame |
| `PerformanceEnvironment` resize rAF | Coalesces resize redraws | remove; resize/context recovery redraw the last complete Stage frame |
| Stage CSS infinite animations | Artwork wash, world motif, cover breathing and pulse | replace with pure `timeMs` sampling and imperative transform/opacity/filter writes |
| Stage CSS layout arrival and directed transitions | Wall-clock interpolation after plan/layout changes | remove from directed properties; the plan and sampled time own the base state |
| React setters inside the Stage frame loop | Activates plan, palette, presentation and layout phase | remove from the frame path; use prepared plan state and imperative DOM ownership |

## Legitimate wall clocks outside choreography

These clocks do not author visual state and are not migrated:

- provider deadlines, latency measurements, cache TTLs and connection leases;
- `PlaybackClockV0` implementations that extrapolate a provider media timestamp;
- offscreen audio-analysis sampling and publication intervals;
- renderer duration instrumentation used only for performance metrics;
- UI-only hover/transport opacity transitions;
- the embedded column view's display-time refresh while the fullscreen Stage is not mounted.

## Directed CSS state to migrate

The following selectors currently hide wall-clock state and must become sampled numeric output:

- `.stage-artwork-wash` (`stage-wash-drift`);
- `[data-world-motion] .stage-world-motif` (`flow`, `pulse`, `fall`, `orbit`, `converge`, `suspend`, `fracture`);
- `[data-world-motion="pulse"] .stage-artwork` and `.stage-artwork` cover breathing;
- `[data-layout-transition-phase]` layout arrival;
- directed `.stage-now-playing-info`, `.stage-lyric-viewport`, and `.stage-artwork-frame` transitions.

Reduced motion remains a sampled variant. It does not stop or restart a CSS timeline.

## Commit 7 exit condition

For any finite `timeMs`, normal playback, direct seek, and hidden/resume must produce the same base numeric Stage state:

```text
generation-independent sample
  = environment geometry and alpha
  + world motif transform and opacity
  + artwork wash transforms and opacity
  + artwork breathing/filter state
```

Pixi and Canvas2D receive the same complete frame generation as the DOM. Resize and graphics-context recovery redraw the last complete generation without sampling playback again.
