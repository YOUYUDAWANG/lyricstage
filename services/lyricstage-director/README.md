# LyricStage Fullscreen Director

An independent AI backend for the 16:9 Web Performance Runtime. It does not expose or adapt the iPhone Luna V1-V4 contracts.

- Request: `lyricstage-fullscreen-director-request-v1`
- Response: `lyricstage-fullscreen-director-v2`
- Route: `POST /v1/fullscreen/direct`
- Model: `gemini-3.7-flash` through Google Vertex AI Express Mode, with exact public YouTube video context when available and a text-only fallback when the media input is unsupported
- Music identity route: `POST /v1/music/identity`
- Music identity model: `gemma-4-26b-a4b-it` through the Gemini API with Google Search grounding and minimal thinking
- Music identity fallback: grounded `gemini-3.5-flash` through Vertex AI Express when the Gemma API is unavailable; Gemini remains the primary route
- Runtime: OCI Podman, loopback `127.0.0.1:8092`, public ingress only through the existing Cloudflare Tunnel
- Cache: 30 days, last 100 valid plans, never cache degraded output

Gemini returns song-level concept, motif, intensity arc, contiguous 16:9 sections, one bounded directive per lyric line, and typed `EffectRecipeV1` entries selected or composed through `skills/performance-direction-v1`. The official Vertex endpoint is constrained with JSON MIME output plus a response schema. The server independently verifies structural evidence, registered primitives, conflicts, cost, Hero density, enum/range/coverage and high-motion budgets; it never returns lyric text in the response. The extension recomputes timing and `planIdentity`, validates the same effect grammar again, and keeps the deterministic local performance for invalid or degraded responses.

The music identity route accepts only track metadata plus explicitly untrusted local cleanup hints. The identity model must use Google Search to separate the supplied recording performer from the earliest/canonical original recording artist and creator credits. The server derives citations or Google Search entry points from API grounding metadata rather than model-authored URLs and rejects missing grounding, performer mismatch, role confusion, low confidence, or a cover without an original artist. Only grounded results are cached. Gemma 4 remains primary; Vertex is invoked only after a primary transport or quota failure.
