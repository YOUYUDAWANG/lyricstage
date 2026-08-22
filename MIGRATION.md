# BiliMusic extraction

LyricStage was separated from BiliMusic after the `0.3.0` BYOK browser-extension baseline was validated in Chrome.

- Source baseline in BiliMusic: tag `lyricstage-monorepo-v0.3.0`.
- History was rewritten only to retain `web/`, `services/lyricstage-director/`, the root license, and ignore rules.
- The extracted `web/` tree became the repository root.
- `apps/youtube-music-companion` became `apps/browser-extension`.
- `services/lyricstage-director` became `services/director-gateway`.
- BiliMusic retains a fixed, hash-addressed contract/fixture snapshot and consumes it without requiring this repository beside it.

The migration intentionally did not introduce a second build orchestrator or implement a Bilibili browser provider. Those are independent follow-up changes.
