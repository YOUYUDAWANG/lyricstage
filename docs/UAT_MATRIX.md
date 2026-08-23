# LyricStage real Chrome UAT

This is bounded runtime evidence for a reviewed commit. Never record provider keys, endpoints, lyrics, prompts or model responses. A badge is not visual evidence.

## Candidate

- Artifact source commit: `1a22a206f3be`
- Observed: 2026-08-23, real signed-in Chrome session
- Stable unpacked path: `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist`
- Extension identity: `majlfdidelchofnfodcijoppcgpmbelc`
- Required page marker: `data-lyricstage-content-script="isolated-v3"`

## Five-track matrix

For each row inspect Column mount, actual line readability, Fullscreen entry, start/mid/end seek, visible Director composition, exit back to one Column host, and console warning/error state.

| Class | Track | Video ID | Column | Fullscreen | Start/mid/end | Visible direction | Exit/remount | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast | 純情サクリファイス Parallel ver. | `LxcvrBS__UY` | pass, 62 lines | pass, `stage`, 2 canvases | pass, 0:10 / 1:32 / 3:13 | pass, directed and local fallback states visible | pass, one host | pass |
| slow | 水星記 Mercury Records | `v39OOPJlYC0` | pass, explicit no-match fallback | N/A, disabled without matched lyrics | N/A, no synchronized lyrics | pass, local fallback and import action visible | N/A | pass, degraded honestly |
| repeated hook | You & 合図 | `ZmCRFGcON-I` | pass, 40 lines | pass, `stage`, 2 canvases | pass, start / 1:14 / 2:26 | pass | pass, one host | pass |
| duet | Holiday∞Holiday | `6q3bT34uW10` | pass, 50 lines | pass, `stage`, 2 canvases | pass, start / 2:13 / 3:55 | pass | pass, one host | pass |
| long line | てにをは（feat. 重音テト） | `QaNyWEWAh4s` | pass, 38 lines | pass, `stage`, 2 canvases | pass, 0:00 / 1:49 / 3:48 | pass | pass, one host | pass |

The full-screen checks used a real screen-coordinate user gesture. Browser automation clicks were not counted because Chrome rejected their user activation. Escape returned each exercised track to `presentation="column"` with one connected host and no recorded mount failure.

The candidate also passed a full-document navigation regression from the fast sample to the slow sample: both documents reported `direct-shadow-v2`, no `content-ui` load error, and no mount failure. This covers the module-cache failure found during the first UAT attempt.

After merging `origin/main` at `3f730e0`, the reviewed integration build passed the same first-document/second-document remount check. Its Shadow DOM `More` menu exposed timing, manual search and lyric versions; embedded import and vocal enhancement were absent as intended.

## Multi-tab soak

- [x] Opened two YouTube Music tabs with different recordings.
- [x] Both embedded Columns stayed bound to their own track identity: `愛の残滓` (39 lines) and `Holiday∞Holiday` (50 lines).
- [x] After 10 seconds both tabs still had one host, advancing clocks, no content-UI error, and no mount failure.
- [x] An autoplay recording transition replaced the first tab's title and lyrics without leaving a stale host.
- [x] Reloaded the extension and confirmed first-document and second-document mounts with no reconnect/error loop.
- [ ] Standalone Stage authority, cross-tab pause/resume, and pinned capture ownership were not exercised in this bounded pass.

## Acceptance boundary

Automatic CI establishes code and artifact integrity. This document establishes only the observed Chrome session. If any candidate row or soak item is not exercised against the recorded source commit, leave it `pending`; do not infer acceptance from earlier builds.
