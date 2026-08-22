# LyricStage Fullscreen Director

An independent AI backend for the 16:9 Web Performance Runtime. It does not expose or adapt the iPhone Luna V1-V4 contracts.

- Request: `lyricstage-fullscreen-director-request-v1`
- Response: `lyricstage-fullscreen-director-v4`
- Route: `POST /v1/fullscreen/direct`
- Model: `gemini-3.7-flash` through Google Vertex AI Express Mode, with exact public YouTube video context when available and a text-only fallback when the media input is unsupported
- Music identity route: `POST /v1/music/identity`
- Music identity model: `gemma-4-26b-a4b-it` through the Gemini API with Google Search grounding and minimal thinking
- Music identity fallback: grounded `gemini-3.5-flash` through Vertex AI Express when the Gemma API is unavailable; Gemini remains the primary route
- Runtime: OCI Podman, loopback `127.0.0.1:8092`, public ingress only through the existing Cloudflare Tunnel
- Cache: 30 days, last 100 valid plans, never cache degraded output

Gemini first returns a `DramaticScoreV1`: two to five acts, one full-song motif actor, two to four evidence-backed signature moments, and authored quiet windows. Each moment is rendered as anticipation → event → consequence → recall, while the same motif must seed, transform or fracture, then return or resolve. Only then does `skills/performance-direction-v3` map the score onto `SongBlockingV1`, contiguous 16:9 sections, one bounded directive per lyric line, typed `EffectRecipeV1`, exact-text `LyricGestureV1`, and registered vector actors. Ordinary blocking is limited to two evidence-backed layout changes; a third needs exceptional structure/audio/voice evidence. Glyph, token, phrase and dramatic cues never replace the readable master lyric or invent timing. The official Vertex endpoint is constrained with JSON MIME output plus a response schema. The server independently verifies structural evidence, registered primitives, conflicts, cost, Hero density, layout budgets, motif continuity, signature-scene order, exact lyric targets, timing precision, enum/range/coverage and motion budgets. An invalid prose `recallOf` is treated as a repairable symbolic reference: setup references are cleared, while a return/resolve may point to the first already accepted setup moment; the underlying actor, lyric, evidence, order and return-state gates remain strict. It never executes model-authored SVG, scripts, coordinates or keyframes. The extension recomputes timing and `planIdentity`, validates the dramatic score, blocking, gestures and effects again, and keeps the deterministic local performance for invalid or degraded responses.

An invalid AI section partition is repaired locally instead of degrading an otherwise valid dramatic plan: the runtime keeps only validated AI section style values, rebuilds complete contiguous timing from deterministic section hints, and then revalidates blocking, effects, and gestures against the repaired sections. Missing or invalid section styling remains a hard failure; mismatched spatial/effect cues still fail closed individually.

The music identity route accepts only track metadata plus explicitly untrusted local cleanup hints. The identity model must use Google Search to separate the supplied recording performer from the earliest/canonical original recording artist and creator credits. The server derives citations or Google Search entry points from API grounding metadata rather than model-authored URLs and rejects missing grounding, performer mismatch, role confusion, low confidence, or a cover without an original artist. Only grounded results are cached. Gemma 4 remains primary; Vertex is invoked only after a primary transport or quota failure.
