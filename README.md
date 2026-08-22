# LyricStage

LyricStage is an independent Web Performance Runtime and Manifest V3 browser extension for synchronized lyric performances. YouTube Music owns playback and account state; LyricStage reads bounded track/clock information, resolves lyrics, and renders a deterministic Column or fullscreen stage. Optional AI direction is BYOK and fails closed to the local director.

## Repository map

- `apps/browser-extension`: Chrome/Edge companion for YouTube Music.
- `apps/stage`: standalone Stage and Sites deployment surface.
- `apps/performance-lab`: visual/performance authoring lab.
- `packages/contracts`: versioned schemas and fixtures shared with consumers.
- `packages/companion`, `lyrics`, `performance`, `renderer`, `core`: runtime packages.
- `services/director-gateway`: optional server-side gateway and reference contract validator; it is not required by the browser extension.
- `sources/youtube-music`: current source-adapter boundary.
- `sources/bilibili`: planned provider boundary, with no implementation claim yet.

## Local development

Requires Node.js 22.13 or newer.

```sh
npm ci
npm test
npm run build:all
```

Load `extension-dist` as an unpacked Chrome/Edge extension. The standalone Stage build is emitted to `dist`; Performance Lab is emitted to `performance-dist`.

## Security and privacy

Provider keys remain in extension-local storage and are never part of source, build output, public status, or plan cache identity. The extension does not read YouTube cookies, download media, persist PCM, or upload raw audio. See `SECURITY.md` for reporting and deployment boundaries.

## History and licensing

This repository was extracted with history from BiliMusic at tag `lyricstage-monorepo-v0.3.0`. Runtime and service code are `AGPL-3.0-only`. The portable files under `packages/contracts/schemas` and `packages/contracts/fixtures` are dual-licensed under `Apache-2.0 OR AGPL-3.0-only`; see `packages/contracts/README.md` and `LICENSES/Apache-2.0.txt`.
