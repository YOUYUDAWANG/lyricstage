# LyricStage for YouTube Music 0.3.1 Release Candidate

Build artifact: `extension-dist`

## Closed automatic gates

- [x] `DirectorPlanV1` strict identity, bounded sections/directives and deterministic local fallback.
- [x] Fullscreen AI plan is rejected on degraded, incomplete, mismatched identity or invalid values.
- [x] A matching AI/cache plan that is ready before Fullscreen owns the first frame; only a plan arriving while the Stage is running waits for the next section boundary, never replacing a line mid-flight.
- [x] BYOK provider request contains title/artist/duration/full lyrics/timing and an optional bounded `MusicMapV1`, but no PCM, artwork, Cookie, media URL or playable YouTube attachment.
- [x] `EffectRecipeV1` preserves concept/motif/intensityArc/sections/directives and adds one registered primary plus at most two bounded support primitives.
- [x] Local compiler, OCI Director and extension client all validate effect evidence, card/primitive identity, conflicts, cost and exact section/line ownership.
- [x] Performance Direction Skill v3 contains the dramaturgy-first grammar, `DramaticScoreV1`, registered motif actors/actions, blocking/choreography rules, anti-patterns, examples and Gemini response schema; arbitrary code/SVG/shaders/coordinates/keyframes remain outside the contract.
- [x] Requests above 180 lines or 90KB fail closed to local performance.
- [x] User API Keys stay in `chrome.storage.local`; public status, cache identity, errors and production bundles contain no Key. HTTPS is required off private/local networks, and custom origins are requested as optional permissions only when the user saves them.
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
- [x] The initial content scripts stay below the committed launch budget; the embedded Column loads as an extension ES module and the Pixi/fullscreen renderer remains in a lazy chunk until Stage is requested.
- [x] The committed CI suite covers Web and Director contracts, source authority/clock reset, capture ownership, MV3 worker rehydration, four BYOK protocols, Legacy and Rolling budgets, Key-free cache identity, coverage thresholds, deterministic extension artifacts, bundle budgets, and a real Chromium extension-page smoke. Exact counts and artifact evidence belong to the current CI run rather than this document.
- [x] TypeScript and `build:all` pass; the aggregate build explicitly rebuilds standalone Stage, Performance Lab and both Manifest V3 extension surfaces, followed by CSP verification.
- [x] A clean temporary source copy independently rebuilt every file in `extension-dist` byte-for-byte; source `content.js` and `manifest.json` are packaged verbatim.
- [x] The Companion no longer depends on `director.hachi-mi.uk`; the existing 1.5.8/V4 service and deployment files remain an optional gateway/rollback implementation and are not a source of user provider Keys.
- [x] The client cache epoch is `fullscreen-director-v4-client-contract-v8.6-byok-v1`, and cache identity includes protocol/endpoint/model but excludes API Key.
- [x] Local browser continuous benchmark: 240 Canvas frames, P95 0.30ms, P99 0.30ms, max 0.40ms, WebGL active.
- [x] AMLL 0.5.2/TTML 1.0.1 ADR keeps one glyph renderer and one clock; repository license/NOTICE is AGPL-3.0-only.

## Manual Chrome gates

- [x] After deleting duplicate unpacked instances, installed the final Vite 8.2.2 `extension-dist` as one fresh instance under the original Chrome ID `majlfdidelchofnfodcijoppcgpmbelc` and refreshed YouTube Music. The page reported `data-lyricstage-content-script="isolated-v3"`; Lyrics mounted exactly one v2 host and zero legacy hosts; Related removed it and Lyrics remounted one host without a recorded mount failure. Multi-tab seek isolation, pause/resume and artwork fallback were also exercised on the release line. In automation where Fullscreen API ownership was denied, the UI stayed in Column, created no viewport canvas, and emitted no LyricStage warning/error loop.

- [x] A previous `web/extension-dist` 0.2.1 build was reloaded and established the baseline YTM UI gates below; these are historical evidence, not validation of the current candidate.
- [x] Native Lyrics Column mounts exactly once; Related hides the extension and restores native content, then Lyrics remounts once.
- [x] The button and `F` enter the viewport-filling Stage; `Esc` returns only to Column.
- [x] Previous build baseline showed synchronized GPU lyrics and stable local/AI handoff; the new visible-cover shell still requires the final reload gate above.
- [x] Clicking lyric lines seeks YouTube Music and the Stage clock resynchronizes (34.2s -> 90.6s; 56.4s -> 168.4s -> 22.2s).
- [x] Pause freezes both media time and the active Stage line; resume and bidirectional seek recover without duplicate toolbars.
- [x] Track change from `ボーイゼンガールズ` to `理論武装して` removes the previous state and installs one new local fallback.
- [x] Page reload/reconnect remounts exactly once, preserves the VJ preference and produces no console warning/error loop.
- [x] Dedicated OCI Director Bearer is saved in extension-local storage. On real YTM track `Hew46pJkFW0`, background generation completed and fullscreen changed from `LS / LOCAL` to `LS / DIRECTED` at the next section boundary without interrupting playback.

The source candidate remains fully usable without AI configuration by design. Real provider takeover still requires a user-supplied key and is an optional integration gate; AI configuration is never required for a complete fullscreen performance.
