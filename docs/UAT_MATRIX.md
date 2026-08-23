# LyricStage real Chrome UAT

This is bounded runtime evidence for a reviewed commit. Never record provider keys, endpoints, lyrics, prompts or model responses. A badge is not visual evidence.

## Candidate

- Source commit: fill from `git rev-parse --short=12 HEAD`
- Stable unpacked path: `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist`
- Extension identity: `majlfdidelchofnfodcijoppcgpmbelc`
- Required page marker: `data-lyricstage-content-script="isolated-v3"`

## Five-track matrix

For each row inspect Column mount, actual line readability, Fullscreen entry, start/mid/end seek, visible Director composition, exit back to one Column host, and console warning/error state.

| Class | Track | Video ID | Column | Fullscreen | Start/mid/end | Visible direction | Exit/remount | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast | 純情サクリファイス Parallel ver. | `LxcvrBS__UY` | pending | pending | pending | pending | pending | pending |
| slow | 水星記 Mercury Records | `v39OOPJlYC0` | pending | pending | pending | pending | pending | pending |
| repeated hook | You & 合図 | `ZmCRFGcON-I` | pending | pending | pending | pending | pending | pending |
| duet | Holiday∞Holiday | `6q3bT34uW10` | pending | pending | pending | pending | pending | pending |
| long line | てにをは（feat. 重音テト） | `QaNyWEWAh4s` | pending | pending | pending | pending | pending | pending |

## Multi-tab soak

- Open two YouTube Music tabs with different recordings.
- Confirm the playing tab owns standalone Stage while each embedded Column remains bound to its own tab.
- Pause, seek and resume both directions; stale controls must fail closed after a recording change.
- Start local audio analysis only from an explicit user gesture; confirm capture ownership follows its immutable scope.
- Reload the extension, refresh both existing tabs, and confirm one host per Lyrics panel with no reconnect/error loop.

## Acceptance boundary

Automatic CI establishes code and artifact integrity. This document establishes only the observed Chrome session. If any candidate row or soak item is not exercised against the recorded source commit, leave it `pending`; do not infer acceptance from earlier builds.
