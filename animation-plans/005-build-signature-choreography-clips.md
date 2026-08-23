# 005 — Build signature choreography clips

- **Status**: SUPERSEDED
- **Superseded by**: [009 — Director V2 final architecture](009-director-v2-final-architecture.md)
- **Commit**: `82a5e21`
- **Severity**: HIGH
- **Category**: Purpose / missed opportunity / cohesion
- **Estimated scope**: 9–14 files, roughly 1,500–2,400 lines including clip fixtures and renderer tests

## Problem

The dramatic model already has anticipation, event, consequence, and recall, but the whole song accepts only 2–4 signature moments and renders them through a small number of actor-family drawing branches.

```ts
// packages/performance/src/dramaticScore.ts:186 — current
if (
  wire.version !== "dramatic-score-v1"
  || !Array.isArray(wire.acts)
  || wire.signatureMoments.length < 2
  || wire.signatureMoments.length > 4
) return null;
```

```ts
// packages/renderer/src/prepareDirected.ts:317 — current
const duration = clamp(rawDuration + 6_000, 8_000, 20_000);
// 24% anticipation, 28% event, 30% consequence, then memory
```

The structure is sound, but too many songs resolve to visually similar thread, swarm, or architectural scenes. A memorable event needs a rehearsed multi-layer choreography, not one extra primitive.

## Target

Add a versioned `ChoreographyClipV2` registry. A clip coordinates lyric, motif, artwork, environment, transition, and audio response without allowing model-authored code.

```ts
export interface ChoreographyClipV2 {
  version: "choreography-clip-v2";
  id: SignatureClipIDV2;
  eligiblePurposes: SignatureMomentPurposeV1[];
  requiredAny: PerformanceTriggerV1[];
  actorFamilies: MotifActorFamilyV1[] | ["any"];
  layers: Array<"lyric" | "motif" | "artwork" | "environment" | "transition" | "reactive">;
  phases: {
    anticipation: number;
    event: number;
    consequence: number;
    release: number;
  };
  cost: 1 | 2 | 3;
  heroEligible: boolean;
  conflictsWith: SignatureClipIDV2[];
  reducedMotionFallback: SignatureClipIDV2 | "static-consequence";
}
```

Ship these first 12 clips:

| ID | Dramatic use | Defining action |
|---|---|---|
| `hook.expand` | repeated hook | lyric expands while motif multiplies outward |
| `hook.collectiveWall` | collective chorus | repeated phrases assemble into one readable chorus wall |
| `distance.orbitSever` | distance/rupture | artwork and lyric orbit, connection visibly breaks |
| `duet.bridge` | connection/handoff | two voice fields create and cross one shared bridge |
| `silence.vacuum` | silence/release | movement and density evacuate before the next entrance |
| `rupture.snap` | semantic contrast | established motif snaps and leaves a trace |
| `memory.imprint` | repeated image | phrase leaves a persistent low-opacity imprint |
| `question.suspend` | question | line holds unresolved while environment motion pauses |
| `motion.cascade` | motion/collective | phrase groups hand motion through the stage in sequence |
| `cover.portalReveal` | reveal | artwork becomes a bounded portal, never a fullscreen opaque image |
| `final.return` | resolution | opening geometry returns with transformed motif state |
| `final.dissolve` | final release | motif, traces, and field resolve in ordered layers |

Exact budgets for a four-minute balanced song:

- 6–8 signature beats total.
- 2–3 Hero/full-stage clips maximum.
- At least one signature before the first chorus, one at a bridge/reversal or equivalent structural turn, and one final return/resolution.
- One motif appears in at least three separated beats: seed, transform/fracture, return/resolve.
- Signature duration uses 1–4 beats/bars where trusted tempo exists; deterministic fallback 6–16 seconds.
- Phase ratios each sum to 1.0. Anticipation 0.18–0.30, event 0.18–0.32, consequence 0.25–0.42, release 0.12–0.28.
- At least three layers participate in a Hero clip; medium signature clips may use two.
- Only one Hero clip may be active. At most one subordinate line gesture may overlap a Hero event.
- Restrained time target becomes 25–35% in balanced mode, but still includes line-level readable motion.

## Repo conventions to follow

- Reuse `EffectRecipeV1`, `LyricGestureV1`, `MotifActorV1`, registered vector actors, and `ReactiveMappingV1` rather than bypassing them.
- Keep clip definitions declarative and imported by both validator and renderer.
- Use stable ids and authoritative time so consequence traces and recalls survive seek/cache replay.
- Keep the readable lyric master above decorative copies.
- Preserve reduced-motion fallbacks for every clip.

## Steps

1. Add `packages/performance/src/choreographyClips.ts` with the registry, cost/conflict validation, trigger eligibility, and phase-budget helpers.
2. Add `clipID` and bounded clip parameters to `SignatureMomentV2`; keep V1 moments readable for fallback/cache migration.
3. Update Bible/Scene prompts so the Bible chooses signature purpose/anchor and the Scene Pack chooses an eligible clip. The model may not invent a clip id.
4. Validate whole-song signature count, Hero count, motif three-touch arc, separation, conflicts, and final recall.
5. Add prepared clip phases in `packages/renderer/src/prepareDirected.ts`, resolving beat/bar timing through plan 003 and deterministic fallback durations.
6. Implement each clip as a composition of existing layers first. Add a primitive only when no existing registry element can express the clip without semantic distortion.
7. Extend `drawDramatic.ts` into clip-specific modules when it exceeds the module budget; keep one dispatcher and isolated drawing functions.
8. Add persistent consequence states with explicit maximum lifetime: normally 8–18s, never past the next conflicting signature, and no more than two simultaneous traces.
9. Add safe review summaries: clip ids, Hero count, motif touch count, consequence count, and rejected-clip categories.
10. Create one accepted and one rejected fixture per clip, plus full-song seed→transform→return fixtures.

## Boundaries

- Do NOT classify every scene as a signature beat.
- Do NOT allow more than three Hero events in a normal four-minute song.
- Do NOT add a clip that only changes color, particle count, or palette; that is styling, not choreography.
- Do NOT render literal lyric nouns automatically without an established motif relationship.
- Do NOT allow arbitrary model-authored assets or code.
- Do NOT remove quiet/restrained spans.
- Do NOT add dependencies.

## Verification

- **Mechanical**: run `npm test -- packages/performance/src/choreographyClips.test.ts packages/performance/src/dramaticScore.test.ts packages/performance/src/rollingDirector.test.ts packages/renderer/src/renderer.test.ts`, then `npm run typecheck`.
- **Contract**: wrong triggers, wrong actor family, cost/conflict violations, fourth Hero event, missing final recall, or a two-touch motif arc are rejected.
- **Determinism**: fixed-time snapshots before, during, after, and in the recall of every clip match across pause/seek/replay/cache.
- **Feel check**: watch all 12 clips without diagnostic labels. Each must be distinguishable by spatial action, not just color. For a full-song fixture, viewers should identify the repeated motif in opening, transformation, and ending.
- **Reduced motion**: semantic state and consequence remain understandable without translation, rotation, scale, blur, or rapid flashing.
- **Done when**: balanced songs have 6–8 earned signature beats, only 2–3 full-stage takeovers, and at least one recurring visual idea that a viewer can describe after playback.
