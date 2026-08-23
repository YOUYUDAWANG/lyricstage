# 008 — Gate release on artistic quality

- **Status**: SUPERSEDED
- **Superseded by**: [009 — Director V2 final architecture](009-director-v2-final-architecture.md)
- **Commit**: `82a5e21`
- **Severity**: HIGH
- **Category**: Purpose / performance / accessibility / verification
- **Estimated scope**: 8–14 files plus review fixtures and UAT records

## Problem

Current gates prove contracts, builds, privacy, deterministic artifacts, Chrome lifecycle, seek behavior, and representative lyric cases. They do not prove that viewers perceive AI authorship, remember a signature moment, prefer the result, or avoid visual fatigue.

```md
<!-- docs/UAT_MATRIX.md — current emphasis -->
For each row inspect Column mount, actual line readability, Fullscreen entry,
start/mid/end seek, visible Director composition, exit back to one Column host,
and console warning/error state.
```

A badge, nonzero scene count, or valid contract is not artistic acceptance.

## Target

Create an artistic quality gate with machine metrics, blind A/B viewing, and bounded real Chrome UAT.

### Machine metrics

For a four-minute balanced song, require:

- 4–5 acts.
- 16–20 scenes, or 4.0–5.5 scenes/minute for other durations.
- 70–90% non-settle AI line coverage.
- 18–30 selected focus accents, capped at 50% of lines.
- 6–8 signature beats, 2–3 Hero events.
- Motif touched at least three times with seed→transform/fracture→return/resolve.
- Restrained lyric time 25–35%; no static uncovered time.
- No more than two simultaneous primary lyric performances, and only with authoritative overlap.
- No more than one Hero clip active.
- Reactive onset-to-visible p95 <=120ms when capture is available.
- Renderer p95 <=8ms and no more than 20% regression from the same V1 fixture, whichever is stricter.
- Zero invalid timing, out-of-bounds lyric masters, stale cross-track cards, provider-secret leakage, or raw audio persistence.

Profiles use their own ranges from `animation-plans/README.md`; do not fail a restrained ballad for not meeting maximal density.

### Blind artistic comparison

Compare three variants at identical song timestamps:

- A: current Rolling V1.
- B: Director V2 balanced.
- C: Director V2 maximal or a human-adjusted V2 draft.

Use at least 12 representative tracks:

- fast pop, slow ballad, repeated chorus, duet, long line;
- rapid rap, instrumental gaps, low-confidence line-only timing;
- Japanese, Chinese, English, and mixed-language lyrics;
- bright artwork, dark artwork, and artwork with baked border risk.

Score 1–5 on readability, semantic fit, musical fit, continuity, distinctiveness, surprise, fatigue, and overall preference. After playback, ask viewers to describe remembered moments without showing the timeline.

Acceptance:

- At least 70% of comparisons prefer V2 balanced over V1 overall.
- At least 80% of viewers can recall two specific visual moments after one song.
- Median readability is not below V1.
- Median fatigue is <=3/5 for balanced mode.
- No more than 20% report that scene changes feel random or unrelated.
- Repeated hooks are judged as escalating rather than duplicated in at least 75% of applicable comparisons.

## Repo conventions to follow

- Extend sanitized Director review summaries; never store full lyrics, prompts, responses, endpoints, keys, or raw audio in study records.
- Keep exact current CI and release checks; artistic gates are additive.
- Record commit, build hash, extension id/path, profile, source/cache state, and exercised timestamps for every Chrome observation.
- Treat real Chrome visual evidence separately from contract/build evidence.

## Steps

1. Add pure `DirectorArtisticMetricsV2` computation over validated Bible/packs/compiled plan and expose only summary-safe counts and ratios.
2. Add warning/failure thresholds per density profile and tests for boundary values.
3. Extend Performance Lab with synchronized A/B/C panes or rapid same-time switching; hide source labels during blind review.
4. Add a review form/export containing anonymous ratings, variant order, commit/build identity, and moment-recall notes. Do not include lyric text.
5. Extend `docs/UAT_MATRIX.md` or create `docs/DIRECTOR_V2_UAT.md` with the 12-track matrix, exact checkpoints, readability, signature, quiet, seek, pause, reduced-motion, and fallback observations.
6. Run shadow mode first. Measure generated density, validation, latency, cache coverage, and fallback without rendering V2.
7. Run opt-in V2 on the 12-track matrix and complete blind A/B before proposing default-on.
8. Tune thresholds through versioned contract changes only. Do not patch prompts repeatedly without recording the corresponding epoch.
9. Before release, run `npm test`, `npm run typecheck`, `npm run build:all`, `npm run test:gateway`, `npm run verify:deterministic-extension`, bundle/module budgets, MV3 CSP, `npm audit`, and Chromium smoke.
10. Confirm the stable unpacked directory has no active writer/UAT. Compare the reviewed build byte-for-byte, mirror once, reload the original extension id, refresh YTM tabs, and run real Chrome UAT. Do not automate or expose BYOK key entry.
11. Roll out `off → shadow → opt-in on → default balanced`. Keep restrained/manual override and full local fallback.

## Boundaries

- Do NOT declare success from an AI badge, nonzero scene count, screenshots of settings, or CI alone.
- Do NOT tune for maximum event count at the expense of readability or fatigue.
- Do NOT use one song or one reviewer as the artistic gate.
- Do NOT record copyrighted full lyrics, raw prompts/responses, keys, endpoints, cookies, or raw audio.
- Do NOT mirror/reload the fixed extension directory until all prior plans are reviewed and the single-writer check passes.
- Do NOT remove Rolling V1/local fallback during initial V2 rollout.

## Verification

- **Mechanical**: all focused artistic-metric tests pass, followed by the complete release command set above.
- **Artifact**: deterministic build comparison is clean; stable unpacked mirror is byte-identical to the reviewed artifact before reload.
- **Runtime**: all 12 tracks pass start/mid/end seek, pause, replay, reduced motion, Fullscreen enter/exit, track change, multi-tab isolation, capture loss, provider failure, and cache replay.
- **Artistic**: the preference, recall, readability, fatigue, randomness, and repeated-hook thresholds above are met.
- **Feel check**: the reviewer can name the song’s visual motif, one transformation, and the final resolution after the song. If the answer is only “particles changed” or “lyrics moved more,” the design has not passed.
- **Done when**: Director V2 is demonstrably more memorable than V1, remains readable and reliable, and has completed a single-writer reviewed Chrome release path.
