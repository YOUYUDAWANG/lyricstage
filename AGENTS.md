# Working rules

- Keep the browser extension usable without AI configuration; BYOK failure must return to deterministic local performance.
- Preserve source ownership: providers supply media/clock metadata, contracts define portable truth, and renderers never invent timing.
- Never commit API keys, bearer tokens, cookies, raw audio, or generated build directories.
- Use `rg` for exact searches and run the narrowest relevant test during iteration. Before release-bound changes run `npm test`, `npm run build:all`, the Director gateway tests, and a real unpacked-extension reload check.
- Keep `packages/contracts/schemas` and `packages/contracts/fixtures` portable and backwards-compatible unless a versioned contract change is intentional.
- Do not make `services/director-gateway` a mandatory browser runtime dependency.
