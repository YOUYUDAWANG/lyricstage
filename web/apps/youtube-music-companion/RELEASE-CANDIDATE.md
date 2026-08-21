# LyricStage for YouTube Music 0.2.1 Release Candidate

Build artifact: `web/extension-dist`

## Closed automatic gates

- [x] `DirectorPlanV1` strict identity, bounded sections/directives and deterministic local fallback.
- [x] Fullscreen AI plan is rejected on degraded, incomplete, mismatched identity or invalid values.
- [x] AI plan handoff happens only at the next section boundary; no mid-line replacement.
- [x] Director request contains title/artist/duration/full lyrics/timing and no audio, artwork or media URL.
- [x] `EffectRecipeV1` preserves concept/motif/intensityArc/sections/directives and adds one registered primary plus at most two bounded support primitives.
- [x] Local compiler, OCI Director and extension client all validate effect evidence, card/primitive identity, conflicts, cost and exact section/line ownership.
- [x] Performance Direction Skill v1 contains the runtime grammar, twelve cards, anti-patterns, examples and the Gemini response schema; arbitrary code/shaders/keyframes are outside the contract.
- [x] Requests above 180 lines or 90KB fail closed to local performance.
- [x] Director token stays in `chrome.storage.local`; production bundle contains no token.
- [x] PixiJS WebGL environment and Canvas2D CJK lyric layers are independent.
- [x] Production `StageCanvas` consumes `DirectorPlanV1` directly through `PreparedDirectedStageV1`; it no longer collapses nine behaviors and section design into the legacy three-family recipe adapter.
- [x] Six art directions, five layouts, five typography choices, twelve section palettes, nine behaviors and every line directive control have an independent renderer effect.
- [x] The audience Canvas is layered as Environment / Structural Field / Primary Lyrics / Memory-Counterpoint / Transition Veil and no longer paints recording identity or time debug text.
- [x] Artwork is sampled locally into an OKLCH-derived stage palette; the cover remains the visual anchor while background, lyric ink and restrained accents share its color relationships. Cross-origin failure falls back to a neutral readable palette without blocking artwork.
- [x] The subtractive visual audit removed duplicate structural ownership, giant symmetric panels, default converging rays, full-frame grids/cards and always-on rails. Ordinary Reading now uses cover-led light, material and negative space; special geometry requires an explicit section direction.
- [x] GPU init/draw/context-loss failure preserves the Canvas2D lyric layer and CSS environment fallback.
- [x] Stage-first shell visibly renders the authoritative current cover, title/artist, progress and only the Bridge-supported transport controls; Hero may shrink the cover into an information island.
- [x] Fullscreen has no top/bottom floating chrome. Reading keeps previous/current/next visible; Hero is line-window scoped; Duet and Aperture preserve their own spatial rules.
- [x] Latin text wraps at word boundaries, long CJK remains complete, and Reading motion cannot delay or obscure source-owned reveal.
- [x] System reduced-motion and lightweight mode override personal VJ intensity.
- [x] Production extension excludes Theatre Studio, `MediaRecorder`, `captureStream`, eval and CommonJS require; `tabCapture` is limited to user-started, in-memory feature analysis in the offscreen document.
- [x] `content-ui.js` stays below the 1.2MB launch ceiling.
- [x] Focused release suite: 9 Web files and 74/74 tests passing; dedicated OCI Director: 8/8 passing.
- [x] TypeScript and Manifest V3 double build pass.
- [x] Source/built `content.js` and `manifest.json` remain byte-identical.
- [x] OCI `director.hachi-mi.uk` runs Director 1.3.1 / `lyricstage-fullscreen-vertex-gemini-3.5-skill-v3` on the existing loopback/Tunnel path. The aesthetic canary returned `degraded=false`, one quiet editorial section at intensity 0.3 and no effects for a calm domestic lyric; no grid, rail, symmetric panel or generic technology motif was requested. Pre-1.3.1 Quadlet/env backups remain available.
- [x] Local browser continuous benchmark: 240 Canvas frames, P95 0.30ms, P99 0.30ms, max 0.40ms, WebGL active.
- [x] AMLL 0.5.2/TTML 1.0.1 ADR keeps one glyph renderer and one clock; repository license/NOTICE is AGPL-3.0-only.

## Manual Chrome gates

- [ ] Reload the latest `web/extension-dist` containing artwork palette extraction and the subtractive visual pass, then confirm `data-palette-source="artwork"`, real cover/progress/transport, calm three-level Reading, one justified Hero/Duet/Aperture state, lyric click seek, pause/resume, track change cleanup, AI boundary handoff and no new console error. This is the only open release gate.

- [x] Reloaded `web/extension-dist` 0.2.1 in Chrome; existing baseline YTM UI gates remain closed.
- [x] Native Lyrics Column mounts exactly once; Related hides the extension and restores native content, then Lyrics remounts once.
- [x] The button and `F` enter the viewport-filling Stage; `Esc` returns only to Column.
- [x] Previous build baseline showed synchronized GPU lyrics and stable local/AI handoff; the new visible-cover shell still requires the final reload gate above.
- [x] Clicking lyric lines seeks YouTube Music and the Stage clock resynchronizes (34.2s -> 90.6s; 56.4s -> 168.4s -> 22.2s).
- [x] Pause freezes both media time and the active Stage line; resume and bidirectional seek recover without duplicate toolbars.
- [x] Track change from `ボーイゼンガールズ` to `理論武装して` removes the previous state and installs one new local fallback.
- [x] Page reload/reconnect remounts exactly once, preserves the VJ preference and produces no console warning/error loop.
- [x] Dedicated OCI Director Bearer is saved in extension-local storage. On real YTM track `Hew46pJkFW0`, background generation completed and fullscreen changed from `LS / LOCAL` to `LS / DIRECTED` at the next section boundary without interrupting playback.

The baseline release candidate is installable and fully usable without AI configuration. AI configuration is an optional enhancement and must never be required for a complete fullscreen performance.
