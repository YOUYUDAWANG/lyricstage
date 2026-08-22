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

- Web: `0.3.1` passes 334/334 tests.
- Director gateway: 27/27 tests.
- The low-latency Director authors a compact whole-song intent under a 45-second/three-request boundary and expands routine per-line mechanics locally.
- The settings UI uses the light Control Room system in `docs/uiux-light-control-room.md`: one stable split view, warm neutral canvas, grouped rows, progressive provider setup, explicit unsaved/saving/error states, and destructive credential wording. It keeps the sanitized last-run timing row without exposing endpoint, Key, lyrics, or response bodies.
- AI provider setup discovers the account's available models through the provider's Models API; model selection is no longer free text. OpenAI, OpenAI-compatible/local, Gemini, and Anthropic discovery paths have bounded unit and background-integration coverage.
- The popup is a compact remote for current track, Stage launch, quick performance preferences, and settings navigation. Preference persistence failure restores the prior switch state and uses an independent notice instead of replacing song metadata. The embedded lyrics column keeps only `More` and fullscreen as persistent toolbar actions; search, timing, versions, import, and vocal timing live under `More`.
- TypeScript, the full Vite 8.2.2 production build, deterministic extension artifact comparison, Manifest V3 CSP, `npm audit`, and the Director gateway suite pass.
- The last verified `0.3.1` extension build was mirrored byte-for-byte to `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist` and reloaded under the original extension ID. The subsequent light Control Room build passes static and production gates; at handoff, Computer Use could navigate the correct Chrome window but Chrome exposed only the window title, not a screenshot/accessibility tree, so fresh visual UAT must be rechecked without blind coordinate clicks.
- Owner-only Stage deployment: `https://lyricstage.yihanchen617.chatgpt.site`.
- Frozen extraction tag: `lyricstage-monorepo-v0.3.0`.

Recheck drift-prone runtime and deployment state before claiming it is still current.

## Open work

1. Diagnose the current real Gemini attempt: Settings recorded 320 ms total / 307 ms provider / two attempts, then Stage returned to `AI 暂不可用`; its project/source restrictions also reject `ListModels` with HTTP 403. Never read or record the key.
2. Reload and visually verify the light Control Room settings/popup under the original extension identity once Chrome exposes a screenshot/accessibility tree again.
3. Verify one successful real provider model-list refresh, compact-intent takeover, the 45-second/three-attempt fallback boundary, and deterministic local fallback without recording either key.
4. Run whole-song subjective A/B for fast, slow, repeated-chorus, duet, and long-line tracks.
5. Run a bounded multi-tab soak covering authority handoff, pause/seek, artwork fallback, capture ownership, and extension reload recovery.

These are post-migration quality gates. Repository extraction, GitHub upload, owner-only deployment, and the final local Chrome lifecycle gate are complete.
