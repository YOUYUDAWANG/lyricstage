# ADR 0002: Local-first BYOK direction

Status: accepted, 2026-08-23.

The browser extension directly supports OpenAI Responses, OpenAI-compatible/local endpoints, Gemini, and Anthropic Messages. The settings page requests an exact provider origin, calls that provider's Models API through the extension background, and presents returned model IDs as choices instead of requiring free-form entry. A matching stored key may be used for discovery without exposing it back to the page. One optional fallback may be configured. Provider attempts share a 45-second whole-operation budget and a three-request ceiling; keys remain in `chrome.storage.local`, and cache identity includes protocol, endpoint, and model but excludes the key. The optional `services/director-gateway` implementation remains useful for hosted deployments and contract conformance, but it is not a browser runtime dependency.

The model authors a compact `DirectorIntentV1`: song premise, recurring motif, act structure, blocking, signature moments, sparse exceptional lyric cues, and a small effect/gesture set. The browser deterministically expands that intent into the complete strict V4 response, so routine per-line mechanics do not consume model output tokens. A representative 50-line request, including system prompt and schema, is kept below 25 KB.

One track/lyrics identity owns one in-flight generation. A MusicMap available at the beginning may inform the intent; a map that arrives later is fused locally into section intensity and cannot restart the provider chain or change blocking/layout. Requests above 60 KB are compacted before the first provider attempt instead of retrying the entire chain after failure.

The extension records only sanitized phase timing and byte counts—cache, request construction, provider, contract, adaptation, attempts, protocol/model, status and response sizes—and surfaces the last record in Settings. Endpoints, API keys, lyric text and response bodies are excluded.
