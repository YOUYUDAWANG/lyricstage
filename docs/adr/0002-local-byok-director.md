# ADR 0002: Local-first BYOK direction

Status: accepted, 2026-08-23.

The browser extension directly supports OpenAI Responses, OpenAI-compatible/local endpoints, Gemini, and Anthropic Messages. One optional fallback may be configured. Provider attempts share a bounded deadline, keys remain in `chrome.storage.local`, and cache identity includes protocol, endpoint, and model but excludes the key. The optional `services/director-gateway` implementation remains useful for hosted deployments and contract conformance, but it is not a browser runtime dependency.
