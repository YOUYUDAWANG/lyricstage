# 009 — Director V2 final architecture

- **Status**: FROZEN — READY FOR IMPLEMENTATION
- **Decision date**: 2026-08-24
- **Baseline**: `origin/main@82a5e21`
- **Supersedes**: plans 001–008 and the implementation route in `EXPERT_REVIEW_BRIEF.zh-CN.md`
- **Implementation boundary**: commits 1–10 described below; MotionClip, WAAPI, Reactive Bus, Visual Identity Packs, and editing tools remain blocked. On 2026-08-24 the product owner explicitly waived the manual expression-sufficiency gate and authorized the bounded `WindowIntentV2` provider path; this is a gate bypass, not an artistic pass.

## Decision

Director V2 is not a new animation platform. It is a sparse, evidence-bound semantic rewrite of a complete deterministic local performance.

```text
TrackIdentity + LyricDocument + optional MusicMap
                         |
                         v
              complete local DirectorPlanV1
                         |
                         v
         DirectorBibleV1 structural evidence
       acts / sections / signatures / quiet / layoutBudget
                         |
                         v
          manual or provider WindowIntentV2
                         |
                         v
               sparse SemanticCueV2
                         |
                         v
       pure stages inside the existing Rolling compiler
       validate -> derive influence -> resolve recipes
                         |
                         v
              complete DirectorPlanV1
                         |
                         v
             authoritative provider timeMs
                         |
                         v
                sampleStageFrame(timeMs)
                  /          |          \
             Canvas       Pixi/2D       DOM
```

The local plan is always complete. AI never owns playback time, renderer parameters, or the fallback path.

## Frozen architecture rules

1. AI payloads do not contain concrete visual execution parameters.
2. Renderers do not know about `WindowIntentV2`, `SemanticCueV2`, cue influence, or signature recipes.
3. Every base choreography state is a pure function of plan plus authoritative `timeMs`.
4. Scene, Cue, Hero, clip, or effect counts cannot increase before the A/B/C/D expression-sufficiency gate passes.
5. A new runtime capability requires evidence that existing behavior, gesture, effect, dramatic, and environment samplers cannot express the need.
6. The deterministic local path remains complete with no provider, invalid provider output, exhausted budget, lost audio capture, or disabled WebGL.
7. Elapsed accepted history is immutable. Later results cannot replace it, even when they report higher confidence.

## Explicit non-goals for the first implementation

- multi-scene provider output;
- per-line AI animation objects;
- a separate Performance Compiler package or engine;
- MotionClip or ClipBundle production runtime;
- Theatre-to-runtime export;
- WAAPI as a second time executor;
- Reactive Bus, `beatPhase`, or `stereoWidth`-driven direction;
- Visual Identity Pack contracts;
- a timeline editor or new Director Review product surface;
- moving lyrics into Pixi or adding another WebGL engine;
- explicit `worldSlots` in the first contract.

Transport windows are not scenes. Scene and layout changes remain local compiler decisions constrained by existing act, section, signature, quiet, and `layoutBudget` evidence.

## Intent contract — enabled by explicit owner override

`scene-pack-v1` provider output remains frozen for compatibility. The live provider now uses one explicit wire-version change, while its locally compiled result continues through the existing SceneCard runtime:

```ts
interface WindowIntentModelOutputV2 {
  version: "window-intent-v2";
  spatialIntent: "hold" | "split" | "open" | "stack";
  coverRole: DramaticCoverRoleV1;
  arcIntent: "hold" | "lift" | "break" | "recall";
  cues: SemanticCueV2[]; // at most 6 in one window
}

interface WindowIntentV2 extends WindowIntentModelOutputV2 {
  bibleIdentity: string; // locally bound
  entryStateHash: string; // locally bound
  fromLineIndex: number; // locally bound
  toLineIndex: number; // locally bound
}

interface SemanticCueV2 {
  version: "semantic-cue-v2";
  role: "refrain" | "rupture" | "release" | "hold" | "handoff" | "recall";
  fromLineIndex: number;
  toLineIndex?: number;
  evidenceLineIndices: number[];
  confidence: number;
  focus?: {
    lineIndex: number;
    fromGrapheme: number;
    toGrapheme: number;
    expectedText: string;
  };
}
```

`focus.lineIndex` is required because a cue may span more than one lyric line. Confidence is model-reported ranking evidence only: it cannot replace exact-text, range, identity, or registry validation, and low confidence alone does not invalidate an otherwise legal cue.

The model does not return trusted transport identity. The local adapter binds it:

```ts
interface WindowIntentArtifactV2 {
  trackIdentity: string;
  lyricsIdentity: string;
  schemaVersion: "window-intent-v2";
  generation: number;
  providerIdentity: string;
  payload: WindowIntentV2;
}
```

Whole-song resource caps are 12 accepted cues and 6 accepted exact focuses. They are output and cost limits, not artistic success metrics.

## Resolution precedence

```text
hard time / identity / safety / structural boundaries
                         >
              local SemanticCue intent
                         >
              WindowIntent default
                         >
               original local plan
```

The existing compiler is the resolver, not another precedence layer. Acts and sections determine where change is legal. A cue explains why a bounded local change occurs. Window intent supplies the default direction where no cue overrides it. The local plan owns every remaining range.

## Cue influence

A cue must not become a one-line preset replacement. The compiler derives a bounded influence envelope from existing phrase, act, section, signature, and quiet boundaries:

```ts
interface CueInfluenceEnvelope {
  anticipationRange?: LineRange;
  coreRange: LineRange;
  consequenceRange?: LineRange;
  recallEligibility: boolean;
}
```

This type is compiler-internal. It is not part of AI output, portable contracts, cache wire data, or renderer input.

## Signature recipes

The first implementation has three compile-time recipe IDs and at most two bounded branches per recipe:

```text
rupture: separation | vacuum
release: expansion | reveal
recall:  traceReturn | absenceResolve
```

Recipes expand only into existing production types:

```ts
interface SignatureRecipeV1 {
  id: "rupture" | "release" | "recall";
  supports: readonly SemanticCueV2["role"][];
  compile(context: SignatureCompileContext): {
    directiveOverrides: DirectorLineDirectiveV1[];
    gestures: LyricGestureV1[];
    effects: EffectRecipeV1[];
    promiseCreates: string[];
    promiseConsumes: string[];
  };
}
```

This is a pure compilation macro. It is not a renderer contract, keyframe format, plugin, or second motion runtime.

Branch selection is deterministic and may use the existing motif, art direction, typography, cover role, duet overlap, quiet window, prior action history, and unresolved promises. It cannot use arrival order or wall-clock state.

## Observable promises and recall

A promise is not satisfied merely because a string ID was created and consumed. It must correspond to a still-visible fact such as trace, absence, displacement, incomplete motif, reduced cover role, or broken rail.

Portable state continues to use the existing string promise mechanism. Deterministic IDs encode enough origin to reconstruct the visual debt:

```text
promise:<recipe>:<motif-or-anchor>:<source-range>
```

- Producer events (`rupture`, early `release`) create a visible consequence and a later obligation.
- Consumer events (`recall`, final resolution) resolve an obligation and do not recursively require another recall.
- A terminal release near the end may resolve directly without creating new debt.

Recall selection is deterministic:

1. compatible promise kind;
2. same motif or signature anchor;
3. nearest unconsumed promise;
4. stable promise-ID ordering;
5. no compatible promise means local `hold`/`refrain`, never an invented memory.

At an arbitrary paused frame after the source event, a reviewer must be able to point to what happened. Sharing only color, brightness, glow, scale, or particle count is not sufficient visual continuity.

## Deterministic ambient life

The implementation removes wall-clock ownership, not continuous stage life. Existing environment sampling is extended or reused; no second ambient engine is added.

Conceptually:

```ts
sampleAmbientState({
  timeMs,
  sectionIntensity,
  quietWindow,
  lyricPhraseProgress,
  motifState,
  planSeed,
});
```

It may control slow motif drift, rail/orb phase, environment density and depth, restrained artwork breathing, memory-trace decay, and quiet-window motion rate. It cannot change lyric time, large lyric placement, synthetic beat pulses, or full-stage onset response.

## Stage time contract

One frame owner samples provider time once and supplies one complete frame generation to Canvas lyrics, Pixi/Canvas2D environment, and imperative DOM consumers.

Use two preallocated frame buffers and swap generations. Do not build a large retained StageFrame object system.

The frame path must not contain:

- React state updates;
- DOM layout reads;
- scene/environment compilation;
- child animation frames or Pixi ticker;
- `performance.now()` choreography;
- CSS transitions or infinite animations controlling directed properties;
- `setTimeout`-driven phases;
- previous-frame integration that cannot be reconstructed from time;
- avoidable per-frame arrays or large object allocation.

Resize and graphics-context recovery redraw the last complete frame; they do not sample a different time. DOM transform, opacity, and CSS variables are written through an imperative wrapper that React does not overwrite.

The exit test samples random `timeMs` values and compares base numeric state reached by normal playback, direct seek, and hidden/resume. One rAF alone is not acceptance.

## Cache and immutable-prefix contract

An AI result is eligible only when all trusted local envelope fields match the active request:

```ts
accept =
  request.generation === activeGeneration &&
  artifact.trackIdentity === activeTrackIdentity &&
  artifact.lyricsIdentity === activeLyricsIdentity &&
  artifact.payload.bibleIdentity === activeBibleIdentity &&
  artifact.payload.entryStateHash === expectedEntryStateHash &&
  artifact.schemaVersion === expectedSchemaVersion &&
  artifact.payload.fromLineIndex === requestedFromLineIndex &&
  artifact.payload.toLineIndex === requestedToLineIndex &&
  !acceptedPrefixContainsSameRange &&
  !rangeHasElapsedBeyondPolicy;
```

Cache provenance is metadata, not an expansion of the portable plan contract:

```ts
type CacheArtifactProvenance = "ai-positive" | "ai-negative" | "local";
```

- `ai-positive`: validated and actually accepted AI artifact; may use the long positive TTL.
- `ai-negative`: classified failure bound to provider, schema, and configuration identity; short TTL.
- `local`: deterministic local artifact; independent cache or regeneration, never an AI success entry.

Only the longest state-chain-continuous legal prefix is accepted. The first invalid result terminates the AI suffix. The remaining range uses deterministic local output.

Checkpoints may compact or persist an accepted prefix but cannot change its contents. The next `entryStateHash` comes from the last accepted result, never the last received result. A later result cannot replace an already accepted range. Cache keys include schema version; V1 and V2 positive entries never collide.

## Artistic reference — never a schema gate

For a typical four-minute fixture:

| Layer | Review reference |
|---|---:|
| Existing acts | 2–5 |
| Full layout/world reconstruction | 0–2 |
| Phrase blocks | no target |
| Motif touches | 3–6 |
| Dramatic beats | 4–6 |
| Hero events | 1–2, included in dramatic beats |
| Quiet/restrained lyric time | 35–50% |
| Cue coverage | measured, never filled to quota |

These values can produce warnings or review context only. Identity, timing, bounded ranges, resource caps, exact focus, concurrency, safe area, cost, and reduced-motion behavior are hard contracts.

## Manual fixtures and expression-sufficiency gate

The five manual fixtures are:

1. fast song;
2. slow song with a clear instrumental gap;
3. repeated chorus;
4. duet or overlapping lines;
5. long-line or line-only timing.

The instrumental gap must prove that deterministic ambient life persists, a promise can leave a trace through a lyricless range, and the lyric return feels like a return rather than a page restart. The first provider contract does not add lyricless AI cues.

Before AI shadow, compare:

```text
A: original local V1 plan
B: correct manual cues + contextual recipes
C: B's capabilities with cues shifted to the wrong phrase or section
D: correct cues with the same context-free recipe branch in every song
```

Required evidence:

- B improves memorable value over A;
- B has stronger semantic causality than C;
- B has stronger cross-song differentiation than D;
- B does not materially reduce lyric readability from A;
- the instrumental gap does not look powered off;
- recipe families remain distinguishable without color;
- the same recipe does not produce an identical spatial silhouette in two songs;
- pause, seek, replay, and hidden/resume preserve the same base state at the same `timeMs`.

If B does not beat A, improve use of existing primitives or event visibility. If B does not beat C, repair cue placement and resolver rules. If B does not beat D, repair bounded recipe context branches. None of these failures authorizes more cues, scenes, heroes, effects, MotionClip, WAAPI, Reactive Bus, or editing tools.

## Approved implementation sequence

1. Add this ADR and mark plans 001–008 and the expert brief as superseded.
2. Add failing cache immutability and provenance tests.
3. Repair cache, checkpoint, generation, and legal-prefix semantics.
4. Add the five ideal manual sparse-cue fixtures.
5. Inventory wall-clock state sources and add deterministic-time failing tests.
6. Introduce one authoritative frame owner and two preallocated buffers.
7. Rebase all directed continuous motion onto authoritative `timeMs`.
8. Compile manual cues and derived influence envelopes into existing plan types.
9. Add the three bounded recipe families and observable promise behavior.
10. Add the A/B/C/D expression-sufficiency experiment to the existing Lab/test surfaces.

The product owner explicitly waived step 10's human review requirement on 2026-08-24 and authorized `WindowIntentV2` production integration. This does not retroactively mark the Art Gate as passed. All blocked non-goals remain blocked until a later explicit architecture decision.

## Disposition of the superseded plans

| Old plan | Final disposition |
|---|---|
| 001 multi-scene provider | deferred; transport windows are not scenes |
| 002 per-line AI animation | deleted |
| 003 Reactive Bus | deferred; not an artistic prerequisite |
| 004 dramatic transitions | replace wall-clock ownership with authoritative-time sampling inside steps 5–7 |
| 005 signature clips | replace with compile-time recipes over existing production primitives |
| 006 Review Studio | deferred; use existing read-only Lab/settings surfaces |
| 007 Visual Identity Packs | deferred until real authored variation proves a shared contract |
| 008 artistic gate | retained as the bounded A/B/C/D gate, without density quotas |

## Final implementation statement

Director V2 is frozen and ready for steps 1–10. The implementation question is no longer which systems LyricStage might add. It is whether the existing production capabilities, when compiled at the right semantic positions and sampled from one authoritative time, can make viewers remember a performance.
