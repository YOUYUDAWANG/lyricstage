---
name: performance-direction-v1
description: Direct a complete LyricStage fullscreen song using structural lyric evidence and the bounded EffectRecipeV1 grammar.
---

# Performance Direction V1

Create one coherent visual world for the whole song, then develop it across sections. Preserve exact lyric timing and text; the runtime owns coordinates, glyph reveal, easing and rendering. Treat the grammar as a set of instruments rather than a fixed template, and vary continuous physical parameters so different songs do not collapse into the same preset.

## Required outcome

- Return `concept`, `motif`, `intensityArc`, a song-wide `world`, contiguous `sections`, one `directive` per line, and at least one grounded `effect` across the song with no more than one per section.
- `world` directs the whole scene graph: spatial composition, motion law, artwork role, material texture, depth, fluidity, elasticity and atmosphere. It must be justified by this song's lyrics and, when supplied, its exact whole-song audio/video context.
- Ordinary sections stay readable and settle quickly. Strong effects are sparse structural decisions, not decorations for every line.
- A restrained song can use a quiet field, memory, or resolution treatment, but an empty score is not a completed AI direction.
- Every effect cites all three evidence levels: the song motif, controlled section triggers, and real line indices.
- One primary primitive is required. At most two support primitives are allowed. Never repeat a primitive inside one recipe.
- A card may be selected, adapted, or replaced by a `custom` composition of registered primitives. Unknown primitives are suggestions only and must not enter `effects`.

## Professional constraints

- The cover, typography and lyric meaning are the visual anchors. Default Reading uses cover-led color, light, material and negative space; it does not require visible geometry.
- Technology styling is a specific art direction for evidence-backed electronic, mechanical or urban material, never the universal default.
- Do not introduce symmetric side panels, persistent grids, continuous rails, particle soup or converging rays merely to make the frame feel active.
- One layer owns the structural motif. Do not ask the environment and lyric field to repeat the same geometry.
- Do not translate a keyword literally into an effect. Local semantics can only strengthen structural evidence already present.
- Do not infer a duet when voice roles or timing do not show overlap.
- Do not use Hero for long lines, weak evidence, or adjacent sections. Target roughly 15–25 percent of the song.
- Keep one primary motion focus. Support layers must remain subordinate and the total primitive cost must not exceed 6.
- Do not output code, shaders, keyframes, colors, coordinates, rewritten lyrics, invented beat/onset data, or absolute per-glyph timing.
- Treat `wordTiming.precision=word` as real lyric timing. Treat `estimated` cues only as low-confidence phrasing hints for pacing; they are not exact reveal, beat/onset facts, or sufficient structural evidence.
- Silence and stable Reading are valid direction choices.

Use `grammar.json` for primitives, triggers, budgets and conflicts; use `effect-cards/catalog.json` for mature recipes; use `anti-patterns.md` when evidence is ambiguous. The response must validate against `schema.json`.
