# LyricStage Director V2 animation roadmap

This roadmap turns LyricStage from a reliable but conservative rolling lyric stage into a layered, memorable real-time performance system.

For external review, start with [the Chinese expert review brief](EXPERT_REVIEW_BRIEF.zh-CN.md). It is self-contained and distinguishes the recommended architecture from ideas that should be reused, reduced, or deferred.

- **Planning commit**: `82a5e21`
- **Target branch base**: `origin/main`
- **Product target**: a four-minute balanced song should normally produce 4–5 acts, 16–20 visual scenes, 35–50 AI-authored line performances, 18–30 selected word accents, 6–8 signature beats, 2–3 full-stage Hero events, and continuous local audio response.
- **Non-goal**: random effect density, one unrelated world per lyric line, model-authored code, or network work in the render loop.

## Plans

| Plan | Title | Severity | Status | Depends on |
|---|---|---:|---|---|
| [001](001-return-multiple-scenes-per-window.md) | Return multiple scenes per rolling window | HIGH | TODO | — |
| [002](002-let-ai-direct-every-lyric-line.md) | Let AI direct every lyric line | HIGH | TODO | 001 |
| [003](003-add-a-local-audio-reactive-bus.md) | Add a local audio-reactive bus | HIGH | TODO | 001 |
| [004](004-make-layout-transitions-dramatic.md) | Make layout transitions dramatic | HIGH | TODO | 001, 003 |
| [005](005-build-signature-choreography-clips.md) | Build signature choreography clips | HIGH | TODO | 002, 003, 004 |
| [006](006-build-the-director-review-studio.md) | Build the Director Review studio | MEDIUM | TODO | 001, 002, 005 |
| [007](007-version-visual-identity-packs.md) | Version visual identity packs | MEDIUM | TODO | 004, 005 |
| [008](008-gate-release-on-artistic-quality.md) | Gate release on artistic quality | HIGH | TODO | 001–007 |

## Product phases

### Phase A — Increase authored density

Execute 001 and 002. Keep the existing provider request ledger, deterministic local fallback, authoritative lyric timing, and `DirectorPlanV1` renderer boundary. Increase the amount of validated choreography returned per request instead of increasing request frequency.

### Phase B — Make motion musical

Execute 003 and 004. Add a low-bandwidth, non-persistent local reactive signal and replace the single generic layout arrival with deterministic, musically timed transition families.

### Phase C — Create memorable moments

Execute 005. A signature beat must have anticipation, event, consequence, and later recall. Only 2–3 moments per four-minute song may take over the whole stage; the remaining signature beats are medium-scale motif developments.

### Phase D — Give the human art direction control

Execute 006. Build a separate Director Review surface rather than expanding the settings page into a creative editor. Allow scene locking, bounded regeneration, density selection, and A/B preview without exposing keys, raw prompts, or raw provider responses.

### Phase E — Expand visual identity without preset roulette

Execute 007. Replace a flat enum of art directions with versioned packs that bundle compatible layouts, typography, motif assets, motion clips, effect recipes, audio mappings, and reduced-motion behavior.

### Phase F — Prove that it is memorable

Execute 008. Add quantitative density/latency/render gates plus blind subjective comparison. Do not make Director V2 the default merely because its contracts and builds pass.

## Density profiles

| Profile | Scene target | AI line coverage | Restrained lyric time | Signature beats | Hero events |
|---|---:|---:|---:|---:|---:|
| restrained | 18–26s | 45–65% | 35–45% | 4–6 | 1–2 |
| balanced (default) | 12–18s | 70–90% | 25–35% | 6–8 | 2–3 |
| maximal | 8–14s | 85–100% | 15–25% | 7–9 | 3 |

“Restrained time” means the readable lyric remains the dominant focus. It does not mean a static frame. Every active line still receives a deterministic entrance, hold, and exit treatment.

## Non-negotiable boundaries

- Start every implementation task in one fresh worktree based on `origin/main`; run the committed `orca.yaml` setup first.
- Never edit or discard the existing dirty cover/stage work in `/Users/chaoyiliu/Desktop/lyricstage`.
- Never load a temporary worktree build into Chrome.
- Treat `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist` as a single-writer release surface. Only plan 008 may authorize a reviewed mirror/reload, after confirming no other UAT owns it.
- YouTube Music remains the media, transport, account, and authoritative clock owner.
- Provider keys stay in extension-local storage. Never store raw audio, PCM, keys, endpoints, prompts, responses, or full lyrics in review summaries.
- AI never authors JavaScript, CSS, SVG, shaders, paths, coordinates, colors, or keyframes.
- Network generation never runs per line, beat, frame, or animation tick.
- Every failure returns to a complete deterministic local performance.
- Bilibili provider work remains deferred.

## Recommended execution order

1. `001` as an additive V2 contract and scheduler path behind `off | shadow | on`.
2. `002` once multi-scene validation and cache identity are stable.
3. `003` in parallel with the later half of 002 only after its message and privacy boundaries are accepted.
4. `004`, using the reactive timing source but preserving a deterministic no-audio fallback.
5. `005`, because signature clips depend on stable scene, line, audio, and transition contracts.
6. `006`, first read-only, then bounded edits and regeneration.
7. `007`, after clip and transition registries have stable interfaces.
8. `008` shadow → opt-in → default-on rollout.
