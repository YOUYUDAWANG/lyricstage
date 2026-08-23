# 006 — Build the Director Review studio

- **Status**: TODO
- **Commit**: `82a5e21`
- **Severity**: MEDIUM
- **Category**: Missed opportunity / cohesion
- **Estimated scope**: 12–18 files, roughly 2,000–3,200 lines including editor model tests

## Problem

The existing settings review surface summarizes cached direction, while Performance Lab is fixture-only and explicitly excludes YouTube Music and AI.

```tsx
// apps/performance-lab/src/App.tsx:186 — current
<main className="lab-shell" data-rolling-fixture={rollingFixture.id}>
  // ...
  <span>fixture-only · no YTM · no AI · GPU {gpuStatus}</span>
</main>
```

Users cannot inspect the full performance timeline, lock a good scene, regenerate a weak scene, adjust density, correct a keyword focus, or compare two director versions. More automatic generation alone will make failures louder without making them correctable.

## Target

Add a separate extension page `director-review.html`. Do not turn the light Control Room settings page into an animation editor.

The page has four stable regions:

```text
Top: track identity, source, profile, save state, A/B mode
Left: acts/scenes/signatures outline
Center: 16:9 Stage preview with transport and exact seek
Bottom: multi-lane timeline (audio, acts, scenes, lines, signatures)
Right: selected item inspector and bounded actions
```

Editing model:

```ts
export interface DirectorOverrideV1 {
  version: "director-override-v1";
  recordingID: string;
  lyricsIdentity: string;
  baseBibleIdentity: string;
  basePackIdentities: string[];
  densityProfile?: "restrained" | "balanced" | "maximal";
  lockedSceneIDs: string[];
  sceneOverrides: SceneOverrideV1[];
  lineOverrides: LinePerformanceOverrideV1[];
  signatureOverrides: SignatureOverrideV1[];
  updatedAtUnixMs: number;
}
```

V1 user capabilities:

- Inspect acts, scenes, line performances, focus ranges, reactive mappings, transitions, signature clips, and local fallbacks.
- Select density profile before regeneration.
- Lock/unlock a scene or signature beat.
- Regenerate exactly one unlocked future scene window through the existing background ledger and provider boundary.
- Change a line clip through allowlisted registries; exact-text focus selection only.
- Move a scene boundary only to an existing lyric boundary and only while preserving pack coverage/state validity.
- Compare Original and Edited at the same authoritative preview time.
- Undo/redo up to 50 local edits.
- Save overrides locally per recording identity; export/import a sanitized JSON override without key, endpoint, prompt, response, or raw audio.

Interaction values:

- Timeline zoom and horizontal pan are immediate; do not animate high-frequency scrub/zoom actions.
- Inspector/popover entry: 150–200ms `cubic-bezier(0.23, 1, 0.32, 1)`.
- Button press: transform scale 0.97 for 120ms with the same ease-out.
- Rare save success may use a 200ms opacity/color confirmation; no confetti.
- Scene selection crossfade in preview: 200ms opacity; disabled during scrubbing.

## Repo conventions to follow

- Reuse the light Control Room typography, colors, grouped rows, and explicit save/error states, but keep the editor spatially optimized for timeline work.
- Reuse Stage rendering components; do not fork a second renderer.
- Background owns provider keys and generation. The review page sends versioned commands and receives validated artifacts/summaries.
- Overrides are data, never executable scripts or CSS.
- Use the current track/lyrics/source registry and fail closed when identity changes.

## Steps

1. Add `apps/browser-extension/director-review.html` and a lazily built review entry chunk; update manifest extension resources without adding host permissions.
2. Add pure review model/reducer modules with selection, zoom, scrub, override validation, undo/redo, and dirty/save states.
3. Add background messages for current validated review document, save override, bounded scene regeneration, and delete override. Deletion must show an explicit destructive confirmation.
4. Create a sanitized `DirectorReviewDocumentV1` containing validated contracts and authoritative lyric timing but no provider configuration, prompts, responses, rationales, or raw audio.
5. Build the outline, preview, timeline, and inspector using semantic DOM; virtualize only after a measured need.
6. Add exact lyric-boundary snapping and conflict previews before committing a scene-boundary change.
7. Implement lock-aware regeneration: provider input includes locked continuity summaries; accepted results cannot modify locked or elapsed scenes.
8. Compile overrides into `DirectorPlanV1` through the same validators as generated data. Invalid overrides never reach Stage.
9. Add A/B synchronized preview and an explicit “use edited direction for this recording” control.
10. Add tests for identity change, stale review document, invalid focus, boundary conflicts, lock preservation, undo/redo, save failure, sanitized export, and local fallback.

## Boundaries

- Do NOT expose provider keys, endpoints, raw prompt/response, cache internals, raw audio, or unsanitized rationales.
- Do NOT regenerate automatically when the page opens or when a slider moves.
- Do NOT allow edits to elapsed scenes during live playback without an explicit replay/restart preview.
- Do NOT let review failure affect Column or Fullscreen playback.
- Do NOT animate scrub, zoom, keyboard selection, or rapid timeline navigation.
- Do NOT load a temporary worktree extension into Chrome.
- Do NOT add dependencies unless the existing canvas/timeline implementation proves insufficient and the choice is separately approved.

## Verification

- **Mechanical**: run focused review model/client/background tests, `npm run typecheck`, and `npm run build:extension` only after the focused suite passes.
- **Privacy**: recursively inspect serialized review/export fixtures; forbidden key, endpoint, prompt, response, rationale, PCM, and cookie markers are absent.
- **Editing**: every edit either compiles to the same valid plan on replay or is rejected before save. Locked scenes remain byte-identical through regeneration.
- **Feel check**: a user can find a weak chorus scene, lock the good bridge, switch density, correct one keyword, A/B the result, and save without reading contract JSON.
- **Performance**: scrubbing stays responsive with a 60-line/20-scene fixture; no React render loop at audio-frame rate.
- **Reduced motion**: preview follows Stage policy; editor panels keep brief opacity feedback and drop spatial entrances.
- **Done when**: the human can steer and preserve creative decisions without weakening the deterministic runtime or provider privacy boundary.
