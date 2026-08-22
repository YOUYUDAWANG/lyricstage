# Orca development handoff

This file is the starting point for LyricStage work launched from Orca. Read `AGENTS.md`, `CLAUDE.md`, `README.md`, and the relevant ADR before changing code.

## Workspace

- GitHub repository: `https://github.com/YOUYUDAWANG/lyricstage` (private).
- Orca base ref: `origin/main`. Do not use the inherited local `main` branch as a base.
- Use one Orca worktree per task. Commit and push the task branch, review its diff, then merge it back to `main`.
- `orca.yaml` runs `npm ci` for every new worktree. Orca should wait for setup to finish before starting the agent.
- Node.js: `22.22.3` locally; the supported floor remains `>=22.13.0` in `package.json`.

## Project boundary

LyricStage owns the Web Performance Runtime, Manifest V3 browser extension, YouTube Music source, Performance Lab, portable contracts, renderer packages, and optional Director gateway. BiliMusic is an external iOS contract consumer and is not an implementation workspace.

The Bilibili browser provider is explicitly deferred. Do not start it or generalize the YouTube Music protocol unless the user reopens that scope.

The current product line is `0.3.0`:

- YouTube Music retains playback, account state, transport, and the authoritative clock.
- The extension owns only its Shadow DOM and bounded performance state.
- BYOK supports OpenAI Responses, OpenAI-compatible/local chat completions, Gemini, and Anthropic, with an optional fallback provider.
- Provider keys stay in `chrome.storage.local`; never copy them into a worktree, prompt, log, fixture, commit, or deployment.
- AI failure must preserve the complete deterministic local performance.

## Commands

```sh
npm ci
npm test
npm run typecheck
npm run build:all
(cd services/director-gateway && npm test)
```

During iteration, run only the narrowest relevant test. Before release-bound changes, run the complete commands above plus `npm audit`, the independent artifact comparison, and a real Chrome reload/UAT.

Development entry points:

```sh
npm run dev
npm run dev:performance
npm run build:extension
```

Build outputs are intentionally untracked: `dist`, `performance-dist`, and `extension-dist`.

## Chrome extension continuity

The installed unpacked extension uses the stable path `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist` and original Chrome ID `majlfdidelchofnfodcijoppcgpmbelc`. Chrome derives an unpacked extension ID from the real path.

Do not load an Orca worktree's `extension-dist` directly and do not replace the stable directory with a symlink. Either action creates another extension identity and separates `chrome.storage.local`, including BYOK configuration. After a reviewed standalone build, mirror the files into the stable real directory, reload that one extension, refresh YouTube Music, and then verify:

- `data-lyricstage-content-script="isolated-v3"`;
- Lyrics has exactly one v2 host and zero legacy hosts;
- Related removes the host and returning to Lyrics remounts exactly one;
- a denied Fullscreen API request remains in Column and leaves no viewport canvas;
- there is no LyricStage warning/error loop.

Never inspect, print, or migrate the user's provider key. If a fresh extension install reports AI unconfigured, the user re-enters it in the extension settings page.

## Current verified baseline

- Web: 325/325 tests.
- Director gateway: 27/27 tests.
- The settings UI uses a macOS-style floating sidebar/toolbar and standard-material content cards with adaptive light/dark presentation.
- AI provider setup discovers the account's available models through the provider's Models API; model selection is no longer free text. OpenAI, OpenAI-compatible/local, Gemini, and Anthropic discovery paths have bounded unit and background-integration coverage.
- The popup owns quick performance preferences and settings navigation. The embedded lyrics column keeps only `More` and fullscreen as persistent toolbar actions; search, timing, versions, import, and vocal timing live under `More`.
- TypeScript, the full Vite 8.2.2 production build, Manifest V3 CSP, `npm audit`, and the Director gateway suite pass.
- The reviewed extension build was mirrored into the stable unpacked path and reloaded under the original extension ID. Real Chrome UAT verified the redesigned popup, the settings route, the two-button lyrics toolbar, and the compact lyrics-tools menu without changing BYOK storage.
- Owner-only Stage deployment: `https://lyricstage.yihanchen617.chatgpt.site`.
- Frozen extraction tag: `lyricstage-monorepo-v0.3.0`.

Recheck drift-prone runtime and deployment state before claiming it is still current.

## Open work

1. Verify a successful real provider model-list refresh and one real provider takeover; the current Gemini key reaches the provider but its project/source restrictions reject `ListModels` with HTTP 403. Never record or inspect the key while diagnosing it.
2. Verify fallback-provider switching and deterministic local fallback without recording either key.
3. Run whole-song subjective A/B for fast, slow, repeated-chorus, duet, and long-line tracks.
4. Run a bounded multi-tab soak covering authority handoff, pause/seek, artwork fallback, capture ownership, and extension reload recovery.

These are post-migration quality gates. Repository extraction, GitHub upload, owner-only deployment, and the final local Chrome lifecycle gate are complete.
