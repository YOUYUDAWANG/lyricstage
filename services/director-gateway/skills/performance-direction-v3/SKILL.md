---
name: performance-direction-v3
description: Build a full-song dramatic score before staging LyricStage effects, with one evolving motif and two to four memorable signature moments.
---

# Performance Direction V3 — Dramaturgy First

Direct a song as a performance, not as a sequence of lyric effects. Work in two internal passes before returning one JSON object.

## Pass A — Dramaturg

First decide what changes emotionally across the whole song. Return `dramaticScore` with:

- one concise `premise` describing the dramatic action rather than the visual style;
- one `emotionalArc` covering setup, development, structural turn and resolution;
- two to five contiguous `acts` covering every lyric line exactly once;
- one `motifActor` that appears as a seed, transforms or fractures, then returns or resolves;
- two to four `signatureMoments`, each grounded in real lines and structural evidence;
- explicit `quietWindows` that preserve contrast and stable reading.

The motif is an actor with memory. Do not replace it every section. A signature moment must establish anticipation, produce an event, leave a consequence, and enable a later recall. The runtime derives these four beats from the moment window; explain their causal purpose in the rationale.

## Pass B — Stage director

Only after the dramatic score is coherent, map it onto the registered world, blocking, effect, gesture and vector actor grammar.

- Layout remains stable between dramatic turns. A song with three or more genuinely distinct acts should normally use one or two evidence-backed changes; an unbroken layout must itself serve the premise. A third remains exceptional.
- Section art, palette, typography and intensity may develop without changing layout.
- Lyric gestures are detail, not the dramatic spine.
- The cover may act as origin, destination, boundary, memory or portal when justified.
- Figurative actors such as firework, fish, petal or snow need song-level semantic and musical evidence. A literal noun match alone is insufficient.
- At least 40 percent of the song should remain restrained reading or authored stillness.
- The ending should recall an established image instead of introducing a new visual family.

## Signature moment rules

- Return two to four moments, ordered and non-overlapping.
- Each moment covers real line indices and cites at least one anchor line within that range.
- Use the single motif actor family in every moment; evolve its state and action instead of changing actor families.
- The first accepted moment uses `seed` or `emerge`.
- Set the first/setup moment's `recallOf` to the empty string. A later moment uses `return` or `resolve` and sets `recallOf` to the exact `id` of an earlier signature moment; never use prose, motif-state names or unknown identifiers there.
- Confidence is at least 0.70. High-intensity or figurative full-stage moments should be at least 0.82.
- Adjacent moments require breathing room. Do not turn every chorus line into a signature moment.

## Output

Return one JSON object containing all V2 fields plus `dramaticScore`. Never output code, SVG, paths, coordinates, colors, shaders, keyframes, rewritten lyrics or invented timing. Select only registered actor families and actions; the runtime owns geometry, authoritative `timeMs`, pause, seek, reduced motion and safe areas.
