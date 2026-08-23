# 002 — Let AI direct every lyric line

- **Status**: SUPERSEDED
- **Superseded by**: [009 — Director V2 final architecture](009-director-v2-final-architecture.md)
- **Commit**: `82a5e21`
- **Severity**: HIGH
- **Category**: Purpose & frequency / missed opportunity
- **Estimated scope**: 8–12 files, roughly 1,200–1,900 lines including renderer and contract tests

## Problem

Rolling AI controls Bible, scenes, gestures, and effects, but the compiled plan still copies every ordinary line directive from the deterministic local director.

```ts
// packages/performance/src/rollingDirector.ts:1105 — current
const withoutIdentity: Omit<DirectorPlanV1, "planIdentity"> = {
  // ... AI Bible and scene fields ...
  directives: local.directives as DirectorLineDirectiveV1[],
  effects,
  gestures,
  dramaticScore: mixedDramaticScore ?? local.dramaticScore,
};
```

```ts
// packages/performance/src/directorPlan.ts:408 — current local behavior
const directives = lyrics.lines.map((line) => {
  const behavior = overlapping
    ? "converge"
    : repetition > 1
      ? "echo"
      : (["settle", "assemble", "focus", "drift"] as const)[line.lineIndex % 4]!;
  // ...
});
```

The result can be technically AI-directed while most visible lyric movement still feels cyclic and non-semantic.

## Target

Add one validated `LinePerformanceV2` for every lyric line inside each V2 scene.

```ts
export interface LinePerformanceV2 {
  version: "line-performance-v2";
  lineIndex: number;
  dramaticRole:
    | "statement" | "confession" | "question" | "answer"
    | "refrain" | "approach" | "rupture" | "release" | "resolution";
  entrance: LineMotionClipIDV2;
  hold: LineHoldClipIDV2;
  exit: LineExitClipIDV2;
  motifRelationship:
    | "introduce" | "approach" | "cross" | "echo"
    | "break" | "multiply" | "withdraw" | "resolve";
  intensity: number;
  focus?: {
    fromGrapheme: number;
    toGrapheme: number;
    expectedText: string;
    semanticRole: LyricGestureSemanticRoleV1;
  };
}
```

Use these exact rules:

- V2 scenes contain exactly one `LinePerformanceV2` per covered lyric line, sorted by line index.
- `expectedText` must exactly match authoritative graphemes; no translation or rewritten lyric enters the contract.
- AI line coverage is measured by non-`settle` semantic choices: restrained 45–65%, balanced 70–90%, maximal 85–100%.
- Every line still receives a safe local entrance/hold/exit. “Coverage” means meaningfully AI-distinct, not whether text renders.
- At most one focus range per line in V2. Focus is optional and allowed on 25–50% of lines in balanced mode, 35–65% in maximal mode.
- Maximum simultaneous primary line performances: two, only for authoritative overlap/duet.
- A line shorter than 700ms uses a reduced `snap/read/release` treatment; do not compress a multi-phase clip until it becomes unreadable.
- The readable master lyric is never replaced, distorted beyond recognition, or moved outside the existing safe area.

Start with a bounded registry rather than arbitrary keyframes:

- Entrances: `settle`, `assemble`, `rise`, `railCut`, `focusPull`, `gravityDrop`, `converge`, `handoff`.
- Holds: `still`, `breathe`, `pulseOnBeat`, `suspend`, `drift`, `echoResidue`.
- Exits: `fade`, `trail`, `fold`, `release`, `withdraw`, `handoff`.

## Repo conventions to follow

- Reuse `LyricGestureV1` exact-text validation and native word-window gates from `packages/performance/src/lyricChoreography.ts`.
- Compile V2 line performances into the existing `DirectorLineDirectiveV1` plus optional validated gestures until the renderer contract is deliberately versioned.
- Keep geometry preparation in `packages/renderer/src/prepareDirected.ts` and drawing in `drawDirected.ts`.
- Preserve `Intl.Segmenter` grapheme handling, long-line fitting, duet safe areas, and reduced-motion behavior.
- Use authoritative playback time for every phase; no wall-clock animation state.

## Steps

1. Add `linePerformance.ts` with V2 types, clip registries, validators, density measurement, and `compileLinePerformanceV2`.
2. Add `linePerformances` to `SceneCardV2` and its JSON schema. Reject duplicates, missing covered lines, out-of-range targets, or unknown clips.
3. Update `scenePackSystemPromptV2` to assign dramatic roles before motion clips. Instruct the model to repeat a motion only when repetition is part of the song structure.
4. Compile each line performance into a stable `DirectorLineDirectiveV1`; use the local directive only when a V2 scene is absent or the whole pack fell back locally.
5. Extend prepared renderer data with entrance/hold/exit phase bounds derived from line duration and real word timing. Do not add React state per line.
6. Add renderer implementations for missing registry clips using transform and opacity; keep transition-time blur at or below 18px.
7. Implement focus as a secondary overlay on the readable master lyric, reusing existing gesture bounds. Do not draw a second full lyric master at full opacity.
8. Add semantic repetition escalation: first refrain introduces, second transforms, final resolves. The validator rejects three identical refrain directives unless the Bible explicitly marks mechanical repetition.
9. Add safe summary counts: semantic role distribution, distinct clip count, non-settle coverage, and focus count.
10. Add fixtures for short lines, long Japanese lines, line-only timing, real word timing, repeated hook, duet overlap, question/answer, and rapid rap.

## Boundaries

- Do NOT generate provider requests per lyric line.
- Do NOT allow model-authored easing curves, keyframes, coordinates, font families, or colors.
- Do NOT target a token/glyph without exact authoritative text and timing eligibility.
- Do NOT animate every word; focus remains selected and semantic.
- Do NOT remove the complete deterministic local directive path.
- Do NOT change lyric source ownership or timing.
- Do NOT add dependencies.

## Verification

- **Mechanical**: run `npm test -- packages/performance/src/linePerformance.test.ts packages/performance/src/rollingDirector.test.ts packages/renderer/src/renderer.test.ts apps/stage/src/playback/rollingPerformanceDirector.test.ts`, then `npm run typecheck`.
- **Contract**: missing, duplicated, reordered, out-of-range, or text-mismatched line performances reject the full pack.
- **Readability**: at fixed samples for every fixture, every active line remains within safe bounds and the master glyph sequence is unchanged.
- **Determinism**: pause, backward seek, replay, and cache replay produce identical line transforms at the same authoritative `timeMs`.
- **Feel check**: compare V1 local, V2 balanced, and V2 maximal on repeated-hook and question/answer fixtures. The line motion should communicate function before reading the diagnostic label, while the lyric remains effortless to read.
- **Reduced motion**: entrances/exits retain opacity; positional travel, rotation, blur, and beat pulse are removed; focus may retain color/weight only.
- **Done when**: AI visibly controls ordinary lines, balanced songs reach 70–90% semantically distinct line coverage, and no line sacrifices timing truth or legibility.
