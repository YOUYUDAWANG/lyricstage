# 004 — Make layout transitions dramatic

- **Status**: TODO
- **Commit**: `82a5e21`
- **Severity**: HIGH
- **Category**: Physicality / cohesion / interruptibility
- **Estimated scope**: 7–11 files, roughly 900–1,500 lines including visual fixtures

## Problem

Every layout/world change toggles the same generic 200ms arrival keyframe. The transition does not explain whether the song changed perspective, handed off voices, opened into silence, or reached its final expansion.

```tsx
// apps/stage/src/StageCanvas.tsx:323 — current
const layoutTransitionIdentity = [
  handoff.active.source,
  handoff.active.world.spatialMode,
  activeSection.layout,
].join(":");
// any identity change toggles one phase bit
```

```css
/* apps/stage/src/styles.css:691 — current */
.stage-now-playing-layout[data-layout-transition-phase="0"] {
  animation: stage-layout-arrival-a 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
@keyframes stage-layout-arrival-a {
  from { opacity: 0.68; transform: translate3d(0, 7px, 0) scale(0.996); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
```

## Target

Add deterministic `StageTransitionV2` records derived from validated blocking transitions.

```ts
export interface StageTransitionV2 {
  id: string;
  atLineIndex: number;
  fromMs: number;
  toMs: number;
  purpose:
    | "perspectiveShift" | "voiceReframe" | "silenceOpen"
    | "finalExpansion" | "motifReturn";
  timing: "halfBeat" | "oneBeat" | "twoBeats" | "oneBar";
  direction: -1 | 1;
  intensity: number;
}
```

Transition families:

- `perspectiveShift`: prior composition travels 3–5% toward the leaving side while the destination enters from the opposite side; cross-opacity overlap <=180ms.
- `voiceReframe`: shared lyric center separates into duet positions; both voices remain readable throughout; no hard cut.
- `silenceOpen`: lyric and artwork recede 2–4%, field density decays to <=25%, and the center opens before the next line.
- `finalExpansion`: compress scale to 0.96–0.98 during anticipation, then expand to 1.02–1.06 with the final arrival; never use bounce.
- `motifReturn`: reconstruct the opening layout while rendering the motif’s resolved state; geometry returns, visual meaning changes.

Timing resolution:

- Use trusted tempo only when confidence >=0.62.
- `halfBeat` = 30,000/BPM ms; `oneBeat` = 60,000/BPM; `twoBeats` = 120,000/BPM; `oneBar` = 240,000/BPM for 4/4.
- Clamp resolved performance transition duration to 320–1,600ms.
- Without trusted tempo, use 420ms, 640ms, 960ms, and 1,280ms respectively.
- On-screen interpolation uses `cubic-bezier(0.77, 0, 0.175, 1)` for movement. Entry/exit opacity uses `cubic-bezier(0.23, 1, 0.32, 1)`.
- Reduced motion keeps a 200ms opacity transition and removes translation, scale, rotation, and blur.

## Repo conventions to follow

- Keep validated transition purpose/evidence in `packages/performance/src/lyricChoreography.ts`.
- Use authoritative time so pause/seek samples transition state deterministically.
- Animate transform and opacity only. Do not animate grid-template-columns, width, height, gap, padding, top, or left.
- Do not use restartable CSS keyframes for seekable song-time transitions. Sample transition progress from song time.
- Keep the readable lyric canvas and DOM artwork composition synchronized to the same progress value.

## Steps

1. Extend blocking compilation with `compileStageTransitionsV2`, resolving exact line and timing bounds from the scene, MusicMap tempo, and authoritative lyric timing.
2. Add transition sampling helpers that return prior/destination transforms and opacities for any `timeMs`.
3. Replace the phase-bit-only Stage behavior in V2 with a current transition ref sampled inside the existing rAF loop.
4. Apply transforms directly to `.stage-now-playing-info`, `.stage-lyric-viewport`, and `.stage-artwork-frame`; do not drive all children through one parent CSS variable.
5. Add matching renderer composition interpolation for lyric layouts so DOM artwork and Canvas lyrics never disagree spatially.
6. Keep the current 200ms generic arrival as V1 and as V2 emergency fallback when transition metadata is absent.
7. Add transition diagnostics: purpose, progress bucket, and resolved duration. Do not expose rationale.
8. Add Lab fixtures for every transition family, pause at 25/50/75%, backward seek, forward seek, and reduced motion.
9. Add long-line and duet collision tests at both 1280×720 and 1920×1080.

## Boundaries

- Do NOT increase the number of major layout transitions merely for variety. Plan 001 changes scene count, not the evidence threshold for major spatial reconstruction.
- Do NOT use springs or wall-clock animations for seekable song-time choreography.
- Do NOT animate layout properties.
- Do NOT let both old and new lyric masters render near full opacity simultaneously.
- Do NOT alter YTM clock or seek ownership.
- Do NOT add dependencies.

## Verification

- **Mechanical**: run `npm test -- packages/performance/src/lyricChoreography.test.ts packages/performance/src/rollingDirector.test.ts apps/stage/src/playback/rollingPerformanceDirector.test.ts packages/renderer/src/renderer.test.ts`, then `npm run typecheck`.
- **Determinism**: direct seek to 25%, 50%, and 75% of each transition matches uninterrupted playback at the same `timeMs`.
- **Performance**: DevTools shows transform/opacity updates only; no animated layout properties and no repeated prepared-stage rebuild.
- **Feel check**: at 25% playback speed, identify the transition’s purpose without reading diagnostics. `voiceReframe` must feel like a handoff, `silenceOpen` like removed pressure, and `finalExpansion` like earned release.
- **Reduced motion**: geometry changes at the boundary with only a 200ms opacity explanation.
- **Done when**: each structural transition communicates a different dramatic cause, remains seekable and interruptible, and never compromises lyric readability.
