# 007 — Version visual identity packs

- **Status**: TODO
- **Commit**: `82a5e21`
- **Severity**: MEDIUM
- **Category**: Cohesion / missed opportunity
- **Estimated scope**: 10–16 files, roughly 1,800–3,000 lines plus code-native vector assets and tests

## Problem

Visual identity is currently represented by flat enums. The AI can combine five layouts, six art directions, five typography values, effects, and motif families, but those pieces do not form authored style systems. Different songs can therefore look like permutations of the same stage.

```ts
// packages/performance/src/directorPlan.ts:30 — current
export type PerformanceArtDirectionV1 =
  | "editorialKinetic" | "neonRail" | "paperCut"
  | "liquidMemory" | "monoImpact" | "celestialGrid";

export type PerformanceLayoutV1 =
  | "monument" | "editorialSplit" | "railLeading"
  | "railTrailing" | "duetDivide";
```

## Target

Add versioned visual identity packs. A pack is a coherent grammar, not a preset snapshot.

```ts
export interface VisualIdentityPackV1 {
  version: "visual-identity-pack-v1";
  id: VisualIdentityPackIDV1;
  compatibleLayouts: PerformanceLayoutV1[];
  typography: PerformanceTypographyV1[];
  motifFamilies: MotifActorFamilyV1[];
  lineClips: LineMotionClipIDV2[];
  signatureClips: SignatureClipIDV2[];
  effects: EffectCardIDV1[];
  reactiveMappings: ReactiveMappingV1[];
  palettePolicy: "artworkAnalogous" | "artworkComplement" | "monochromeAccent";
  texturePolicy: PerformanceTextureV1[];
  reducedMotionPolicy: string;
}
```

Ship six clearly separated packs by deepening the existing art directions:

1. `editorial-signal`: strict grids, asymmetric rails, scale contrast, hard typographic hierarchy; no mist/orbit motifs.
2. `ink-weather`: slow ink/mist field, bleed/reveal, negative space, Mincho-compatible motion; no hard geometric cuts.
3. `paper-theatre`: layered cutouts, fold/reveal, shadowed planes, physical cover portal; no neon rails.
4. `neon-transit`: directional rails, handoffs, acceleration/deceleration, chromatic counterpoint; no soft paper dissolution.
5. `celestial-archive`: orbit, constellation traces, memory return, large depth changes; no rapid cut rhythm.
6. `mono-pressure`: black/white dominant field, weight/scale/spacing tension, rare single accent color; no decorative particle wash.

Exact rules:

- Bible V2 selects one primary pack for the song and optionally one compatible coda variation. It may not switch packs scene by scene.
- Each pack exposes at least 3 layouts, 6 line clips, 3 signature clips, 4 effects, 3 reactive mappings, and a reduced-motion policy.
- At least 60% of selected scene/line/signature choices must belong to the primary pack.
- Cross-pack choices require an explicit compatible tag and may occupy at most 25% of scenes.
- Coda variation must preserve typography and motif family while changing at most palette policy and one motion family.
- Recent-history diversity is advisory: avoid the same full pack/world/motif tuple for three consecutive tracks when another equally supported pack exists; never choose an unsupported pack just for novelty.
- All assets are local, code-reviewed, deterministic, and bounded. No remote runtime downloads.

## Repo conventions to follow

- Put semantic pack definitions under `packages/performance`; renderer modules consume registered ids only.
- Reuse artwork-derived palettes; packs define relationships, not hardcoded model colors.
- Reuse vector actor registry and add only code-native reviewed assets.
- Preserve package/module budgets and lazy-load nonessential pack renderers with the existing Stage chunk strategy.
- Keep current enum adapters for V1 cache compatibility.

## Steps

1. Add `visualIdentityPacks.ts` with types, registry, compatibility validation, and deterministic selection helpers.
2. Add `visualIdentityPackID` to Director Bible V2 and include a compact registry summary in the prompt.
3. Validate every scene, line clip, signature clip, effect, motif, typography, and reactive mapping against the selected pack.
4. Refactor renderer art-direction branches behind pack renderer modules while preserving V1 enum entry points.
5. Give each initial pack a distinct structural field, environment sampling policy, artwork treatment, line-motion subset, and signature subset—not merely a different palette.
6. Add reduced-motion snapshots for every pack.
7. Add pack summaries and repeated-tuple warnings to Director Review; do not automatically regenerate only because of a warning.
8. Add bundle/module budget assertions so one new pack cannot inflate the first-load content script.
9. Add a contributor document describing how to add a pack, required fixtures, visual QA, conflicts, licensing, and prohibited remote/executable content.
10. Create a 6×5 fixture matrix: six packs across ordinary line, repeated hook, duet, silence, and final return.

## Boundaries

- Do NOT treat a palette swap as a new pack.
- Do NOT switch primary pack every scene.
- Do NOT make history diversity override lyric/music/artwork evidence.
- Do NOT add remote images, fonts, shaders, scripts, or generated runtime code.
- Do NOT expand Bilibili/provider scope.
- Do NOT add a user plugin execution system in this phase.

## Verification

- **Mechanical**: run pack, rolling contract, renderer, deterministic build, module-budget, and bundle-budget focused checks; run full release commands only in plan 008.
- **Contract**: reject incompatible line/signature/effect selections, excessive cross-pack scenes, and coda variations that replace typography or motif family.
- **Visual matrix**: at grayscale and without diagnostic labels, each pack must still be distinguishable by composition and motion, not only hue.
- **Feel check**: watch six versions of the same fixture. Each should feel like a different production language while preserving the same lyric timing and dramatic events.
- **Reduced motion**: every pack retains identity through typography, composition, texture, and opacity without relying on travel or pulse.
- **Done when**: songs can possess recognizably different visual identities without becoming random preset roulette or weakening deterministic rendering.
