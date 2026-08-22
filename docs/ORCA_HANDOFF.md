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

The current product line is `0.3.1`:

- YouTube Music retains playback, account state, transport, and the authoritative clock.
- The extension owns only its Shadow DOM and bounded performance state.
- BYOK supports OpenAI Responses, OpenAI-compatible/local chat completions, Gemini, and Anthropic, with an optional fallback provider.
- Provider keys stay in `chrome.storage.local`; never copy them into a worktree, prompt, log, fixture, commit, or deployment.
- AI failure must preserve the complete deterministic local performance.
- BYOK generation uses compact Director intent, a 45-second total budget, at most three HTTP attempts, and one in-flight request per track/lyrics identity. Late MusicMap data is fused locally without a second provider call.
- Settings exposes only sanitized last-run phase timing; provider keys, endpoints, lyric text and response bodies are not diagnostic data.

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

- Web: `0.3.1` low-latency Director branch passed 321/321 tests, typecheck, `build:all`, deterministic extension artifact comparison, Manifest V3 CSP, and `npm audit` with zero vulnerabilities.
- Director gateway: 27/27 tests.
- The full-tab extension settings UI is merged; the popup is now limited to status, lyrics activation, and the settings entry.
- TypeScript, the current extension production build, and Manifest V3 CSP passed after the settings merge.
- The reviewed `0.3.1` extension build is mirrored byte-for-byte to `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist`. A refreshed real YouTube Music tab reported `data-lyricstage-content-script="isolated-v3"`, one visible LyricStage lyrics toolbar/director status and no captured warning/error loop. Chrome's automation boundary cannot operate `chrome://extensions` or `chrome-extension://` pages, so the internal-page reload click and settings timing-row visual check remain manual gates.
- Owner-only Stage deployment: `https://lyricstage.yihanchen617.chatgpt.site`.
- Frozen extraction tag: `lyricstage-monorepo-v0.3.0`.

Recheck drift-prone runtime and deployment state before claiming it is still current.

## Open work

1. In `chrome://extensions`, reload the existing stable-path LyricStage instance, then verify the settings timing row plus normal popup/settings lifecycle without changing the extension identity.
2. Verify one real compact-intent provider takeover, the 45-second/three-attempt fallback boundary, and deterministic local fallback without recording the key.
3. Run whole-song subjective A/B for fast, slow, repeated-chorus, duet, and long-line tracks.
4. Run a bounded multi-tab soak covering authority handoff, pause/seek, artwork fallback, capture ownership, and extension reload recovery.

These are post-migration quality gates. Repository extraction, GitHub upload, owner-only deployment, and the final local Chrome lifecycle gate are complete.
