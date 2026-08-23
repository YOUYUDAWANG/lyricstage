# 003 — Add a local audio-reactive bus

- **Status**: SUPERSEDED
- **Superseded by**: [009 — Director V2 final architecture](009-director-v2-final-architecture.md)
- **Commit**: `82a5e21`
- **Severity**: HIGH
- **Category**: Purpose & frequency / performance
- **Estimated scope**: 10–15 files, roughly 1,200–1,800 lines including capture and renderer tests

## Problem

LyricStage captures local audio features, but the visible environment mostly samples deterministic time loops. MusicMap changes section intensity only slightly and does not provide frame-level musical response.

```ts
// packages/performance/src/directorPlan.ts:471 — current
return { ...section, intensity: clamp(section.intensity * 0.82 + energy * 0.18, 0, 1) };
```

```ts
// packages/performance/src/environmentScene.ts:182 — current
const pulse = 0.55 + Math.sin(time * particle.speed * 2.4 + particle.phase) * 0.45;
```

```css
/* apps/stage/src/styles.css:643 — current */
.stage-canvas-host[data-world-motion="pulse"] .stage-world-motif {
  animation: stage-world-pulse 4.8s ease-in-out infinite;
}
```

The stage moves continuously, but it does not consistently feel attached to the current beat, bass impact, brightness, stereo spread, or silence.

## Target

Add an ephemeral, local-only `ReactiveFrameV1` stream and a validated per-act mapping selected by the Director Bible.

```ts
export interface ReactiveFrameV1 {
  version: "reactive-frame-v1";
  trackID: string;
  captureID: string;
  mediaTimeMs: number;
  beatPhase: number;
  energy: number;
  bass: number;
  brightness: number;
  onset: number;
  stereoWidth: number;
  silence: number;
}

export interface ReactiveMappingV1 {
  beatTarget: "none" | "worldScale" | "lyricWeight" | "motifPulse";
  bassTarget: "none" | "depth" | "coverWeight" | "particleRadius";
  onsetTarget: "none" | "accentFlash" | "strokeTrace" | "railImpulse";
  brightnessTarget: "none" | "bloom" | "inkContrast" | "prismShift";
  widthTarget: "none" | "duetSpread" | "fieldSpread" | "orbitRadius";
  silenceTarget: "none" | "freeze" | "vacuum" | "desaturate";
  gain: number;
}
```

Exact runtime values:

- Feature analysis: keep the existing 30Hz local analysis where available.
- Background-to-Stage broadcast: maximum 15Hz, latest-frame wins, payload below 320 bytes serialized.
- Renderer interpolation: sample on rAF using authoritative `mediaTimeMs`; never use receipt wall time as song truth.
- Attack smoothing: 80ms for onset, 120ms for energy/bass, 180ms for brightness/width.
- Release smoothing: 180ms for onset, 320ms for energy/bass, 420ms for brightness/width.
- If frames are absent for 500ms, decay toward neutral over 600ms.
- Silence may freeze drift only when `silence >= 0.72` for at least 180ms; release the freeze after `silence < 0.55` for 240ms.
- Reactive displacement is subordinate: default gain 0.35–0.65; only a signature clip may temporarily reach 0.9.
- Reduced motion sets spatial reactive output to zero while retaining bounded opacity/color response at gain <=0.25.

## Repo conventions to follow

- Raw PCM remains inside the offscreen capture document and is never persisted or sent to AI.
- Background remains capture owner and validates track/capture/generation tuples.
- Use `MutableRefObject`/imperative renderer sampling like the existing authoritative time ref; do not cause 15 React renders per second.
- Keep `MusicMapV1` for structural planning and `ReactiveFrameV1` for ephemeral performance. Do not merge their identities or caches.
- Keep WebGL and Canvas2D outputs visually equivalent enough for fallback.

## Steps

1. Add `ReactiveFrameV1`, sanitization, smoothing, neutral-frame, and decay helpers under `packages/performance/src/reactiveBus.ts`.
2. Extend `apps/browser-extension/src/offscreen-audio.ts` to derive the bounded tuple from already-computed features and emit at no more than 15Hz.
3. Extend background tuple validation and forward only the active capture owner’s latest frame. Never replay a reactive frame after track/capture generation changes.
4. Extend `youtubeMusicBridge` with an imperative latest-frame ref and status; do not store frame history in React state.
5. Add `reactiveMappings` per act to Director Bible V2. The model selects enums and gain only; it never sees or authors raw frame values.
6. Update `PerformanceEnvironment` and `drawDirectedStageV1` options to sample the current smoothed frame and apply the active act mapping.
7. Replace fixed CSS pulse for AI/cache V2 with renderer-driven values. Keep deterministic time-loop fallback when audio capture is unavailable.
8. Add `data-reactive-status`, `data-reactive-age-ms`, and `data-reactive-mapping` diagnostics without exposing feature values or track audio.
9. Add tests for ownership changes, pause, seek, stale frames, capture loss, neutral decay, reduced motion, and no-audio fallback.
10. Add a Performance Lab synthetic reactive source with kick, chorus lift, silence, stereo expansion, and irregular onset sequences.

## Boundaries

- Do NOT persist reactive frames or include them in cache identity.
- Do NOT send reactive frames, PCM, or analyzer history to a provider.
- Do NOT start or authorize tab capture without the existing user-gesture boundary.
- Do NOT change playback or lyric timing based on audio analysis.
- Do NOT update React state at analyzer frequency.
- Do NOT exceed one forwarded frame every 66ms.
- Do NOT add dependencies.

## Verification

- **Mechanical**: run `npm test -- packages/performance/src/reactiveBus.test.ts apps/browser-extension/src/offscreen-audio.test.ts apps/browser-extension/src/background.test.ts apps/stage/src/playback/youtubeMusicBridge.test.ts packages/renderer/src/renderer.test.ts`, then `npm run typecheck`.
- **Privacy**: serialized messages and all storage fixtures contain no PCM, FFT bins, provider data, or frame history.
- **Latency**: synthetic onset-to-visible-response p95 is <=120ms in the Lab; stale input reaches neutral within 1.1s of the last frame.
- **Performance**: on the reference machine, renderer p95 remains <=8ms and no more than 20% slower than the V1 fixture, whichever threshold is stricter.
- **Feel check**: kick changes should feel immediate but not flicker; sustained chorus energy should widen the world; silence should visibly remove motion instead of merely dimming it. Disable capture and confirm the stage remains complete rather than dead.
- **Reduced motion**: beat/bass do not move position or scale; a subtle opacity/color pulse may remain.
- **Done when**: the stage visibly breathes with real music while provider availability, audio capture availability, and raw audio remain outside the playback critical path.
