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

The current product line is `0.3.2`:

- YouTube Music retains playback, account state, transport, and the authoritative clock.
- The extension owns only its Shadow DOM and bounded performance state.
- BYOK supports OpenAI Responses, OpenAI-compatible/local chat completions, Gemini, and Anthropic, with an optional fallback provider.
- Provider keys stay in `chrome.storage.local`; never copy them into a worktree, prompt, log, fixture, commit, or deployment.
- AI failure must preserve the complete deterministic local performance.
- BYOK generation uses compact Director intent, a 45-second total budget, at most three HTTP attempts, and one in-flight request per track/lyrics identity. Late MusicMap data is fused locally without a second provider call.
- Rolling Director V1 is an explicit `off | shadow | on` preference. It keeps one provider request in flight, one Bible plus bounded Scene Packs, at most six provider attempts and 90 seconds of cumulative provider time; every gap fails locally without disabling the deterministic performance.
- Settings exposes only sanitized last-run phase timing; provider keys, endpoints, lyric text and response bodies are not diagnostic data.

## Commands

```sh
npm ci
npm run ci
npm run verify:deterministic-extension
npm run test:browser-smoke # requires Chromium/Chrome for Testing
```

During iteration, run only the narrowest relevant test. Before release-bound changes, run the complete commands above plus `npm audit` and a real Chrome reload/UAT. CI is the source of truth for exact test counts, coverage, build output and artifact evidence.

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

Treat the stable directory as a single-writer delivery surface. Do not mirror another worktree while a Chrome UAT is active. Immediately before reload, compare the reviewed build and stable directory again; after reload, confirm the registered content-script marker and menu/runtime state before recording acceptance.

Never inspect, print, or migrate the user's provider key. If a fresh extension install reports AI unconfigured, the user re-enters it in the extension settings page.

## Current verified baseline

- The committed CI workflow gates Web coverage, type safety, every production build, the Director gateway, MV3 CSP, version drift, bundle size, deterministic extension artifacts, dependency audit and a Chromium extension-page smoke. Read the latest CI run for exact counts.
- The low-latency Director authors a compact whole-song intent under a 45-second/three-request boundary and expands routine per-line mechanics locally.
- The settings UI uses the light Control Room system in `docs/uiux-light-control-room.md`: one stable split view, warm neutral canvas, grouped rows, progressive provider setup, explicit unsaved/saving/error states, and destructive credential wording. It keeps the sanitized last-run timing row without exposing endpoint, Key, lyrics, or response bodies.
- AI provider setup discovers the account's available models through the provider's Models API; model selection is no longer free text. OpenAI, OpenAI-compatible/local, Gemini, and Anthropic discovery paths have bounded unit and background-integration coverage.
- The popup is a compact remote for current track, Stage launch, quick performance preferences, and settings navigation. Preference persistence failure restores the prior switch state and uses an independent notice instead of replacing song metadata. The embedded lyrics column keeps only `More` and fullscreen as persistent toolbar actions; `More` contains timing, manual search, and version selection. Embedded local lyric import and the user-facing vocal-enhancement toggle were removed.
- Queue advances use the current internal YouTube player identity instead of a stale radio-seed URL. Track-relative Stage seeks are translated onto YouTube Music's reused media timeline, and stale controls fail closed as soon as the internal player changes recordings. Real Chrome UAT switched from `斜陽` to `青春の温度` while the page URL stayed stale, updated Stage title/artwork to the new track, and dragged playback back to 0:32 without returning to the previous recording.
- TypeScript, the full Vite 8.2.2 production build, deterministic extension artifact comparison, Manifest V3 CSP, `npm audit`, and the Director gateway suite pass.
- The reviewed hardening build and the lyric-tools build were each mirrored byte-for-byte to `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist` and reloaded under the original extension ID. Their bounded Chrome UAT covered one v2 host, no legacy host or mount failure, navigation remounts, working tools, five representative recordings, full-screen enter/exit and two-tab isolation. Keep the stable directory single-writer during UAT and verify it against the reviewed commit immediately before reload.
- Owner-only Stage deployment: `https://lyricstage.yihanchen617.chatgpt.site`.
- Frozen extraction tag: `lyricstage-monorepo-v0.3.0`.

Recheck drift-prone runtime and deployment state before claiming it is still current.

## Open work

1. Run the five-song fast/slow/repeated-hook/duet/long-line visual matrix against the reviewed commit and record visible output, not the badge alone.
2. Run a bounded multi-tab soak covering authority handoff, pause/seek, artwork fallback, capture ownership and extension reload recovery.
3. Verify primary/fallback provider boundaries without reading or recording either key.

These are post-migration quality gates. Repository extraction, GitHub upload, owner-only deployment, and the final local Chrome lifecycle gate are complete.
