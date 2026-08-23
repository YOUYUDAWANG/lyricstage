# ADR 0003: Bounded rolling BYOK generation

Status: accepted, 2026-08-23.

LyricStage may generate a whole-song Director Bible and a bounded set of Scene Packs independently while the production Stage remains on the legacy `DirectorPlanV1` path. This intentionally supersedes ADR 0002's single-operation budget only for the two versioned rolling background messages; the legacy message, prompt, cache and request body remain supported.

For one track, lyrics and provider fingerprint, the background permits one provider HTTP request in flight, one Bible logical request, at most three Scene Pack logical requests, at most six provider HTTP attempts, and at most 90 seconds cumulative provider wall time. Three consecutive failed logical requests stop generation for the remainder of that song. These caps include fallback-provider attempts. BYOK users therefore have a predictable maximum cost instead of continuous per-line, beat, frame or timer-driven generation.

Initial coverage targets the current scene plus at least 45 seconds and normally 60 seconds. Refill becomes eligible below 35 seconds ahead. A Scene Pack contains one to three contiguous cards covering a target 45–75 second window. Pause keeps already-started work alive but prevents unnecessary horizon expansion. No request starts in the final 20 seconds unless it fills an explicit seek target. A seek outside cached coverage requests the target window plus 45 seconds; deterministic local performance remains visible until validated cards exist. A pack arriving less than eight seconds before its intended boundary is cached and waits for the next legal boundary.

Track or provider-configuration changes advance the rolling generation guard. Late results are ignored unless their original fingerprint and generation remain current, and they are never delivered to another track. A later MusicMap can inform only not-yet-generated Scene Packs; it cannot restart Bible generation or rewrite accepted cards.

Bible and Scene Card artifacts use separate extension-local 30-day caches and an explicit rolling epoch. Scene expiry never exceeds its Bible expiry, and scene identity includes track, Bible identity, window start and entry-state hash. The legacy cache remains readable by the legacy feature path.

Provider keys, endpoints, raw prompts, raw responses, lyric text and unsanitized diagnostics are excluded from rolling cache metadata and generation ledgers. The browser-extension background remains the sole owner of keys, fetch, provider selection, budgets and sanitized timing. Provider adapters are shared through parameterized request profiles; the optional gateway mirrors contracts only and is never a browser runtime dependency.

Every miss, failure, stale result or uncovered range falls back to deterministic local performance without invalidating a valid Bible or previously accepted Scene Card.
