---
name: performance-direction-v2
description: Direct a coherent full-song LyricStage performance with bounded spatial blocking and lyric-attached glyph, token, and phrase choreography.
---

# Performance Direction V2

Create one emotional world for the whole song. First establish a stable spatial blocking plan, then develop section styling without moving the reading skeleton, and finally add sparse lyric-attached gestures. The result must feel composed across the song rather than shuffled section by section.

## Spatial blocking

- Return `blocking.version=song-blocking-v1`, one `baseLayout`, and zero to three transitions.
- The initial layout does not count as a transition. Normally use at most two `major` transitions.
- A third transition must be `exceptional`, confidence at least 0.90, and supported by structure, audio/density, and semantic/voice evidence together.
- Major transitions require confidence at least 0.78, two independent evidence categories, and at least six lines or about twenty seconds since the previous accepted transition.
- For songs with three or more genuinely distinct dramatic acts, prefer one or two justified transitions over holding one composition by habit. Zero transitions is reserved for a deliberately continuous or suspended dramatic idea.
- Every transition rationale must identify the song event, explain why the previous geometry can no longer carry it, and name the new spatial relationship created by the destination layout.
- A new section, palette, intensity, or typography alone is never a layout reason. Keep the existing layout and develop artwork role, material, vectors, typography, or color instead.
- A repeated hook normally recalls and transforms the established motif; it may return to an earlier layout only when that return is the dramatic resolution, not merely because the chorus repeated.

## Layout meanings

- `monument`: concentrated proclamation or iconic single focus. It is not the default for solo vocals, a large cover, or a loud chorus.
- `editorialSplit`: a genuine narrative or emotional dialogue between artwork and lyric.
- `railLeading`: approach, pursuit, accumulation, forward address, or a line that needs directional momentum.
- `railTrailing`: withdrawal, memory, aftermath, distance, or a line whose consequence should remain behind it.
- `duetDivide`: verified divided, alternating, or overlapping voices. Never infer a duet from typography alone.

Compare all five meanings before choosing `baseLayout`; enum order has no artistic significance.

## Lyric choreography

- Return `gestures` using only the registered `lyric-gesture-v1` grammar.
- Every target must cite exact grapheme indices and `expectedText` copied exactly from the supplied lyric line.
- `glyph` gestures require real word timing and exactly one grapheme. `wordWindow` also requires real word timing.
- Estimated timing may guide restrained token or phrase pacing, never exact reveal, beat, onset, or character timing.
- The readable master lyric remains complete and safe. Gestures create short-lived traces, outlines, echoes, or performance doubles; they never rewrite or replace lyric truth.
- Use the whole screen through `lyricToArtwork` or `fullStage` only when evidence confidence is strong. A vector is the consequence of a lyric action, not background decoration.
- Prefer one primary motion focus and at most one subordinate support gesture at a time.

## Budgets

- At most 24 glyph, 16 token, 8 phrase, 6 full-stage gestures, and 48 total.
- Keep 55–70 percent of the song in stable Reading.
- Do not run high motion for more than two consecutive lines.
- Hero remains sparse and unsuitable for long lines or adjacent sections.
- Silence and stillness are authored choices.

## Output

Return one valid JSON object containing `concept`, `motif`, `intensityArc`, `world`, contiguous `sections`, complete `directives`, grounded `effects`, `blocking`, and at least one grounded `gesture`. Never output code, SVG, paths, coordinates, colors, shaders, animation keyframes, rewritten lyrics, or invented timing.
