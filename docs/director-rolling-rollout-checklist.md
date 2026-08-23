# Rolling Director V1 rollout checklist

Use only the original unpacked extension identity:

- Stable real path: `/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist`
- Chrome extension id: `majlfdidelchofnfodcijoppcgpmbelc`
- Never load a worktree build directly and never replace the stable directory with a symlink.

Rollout order is fixed: internal fixtures, `shadow` on real songs, opt-in `on` for the five-song matrix, then default-on only after every release gate passes. The stored default remains `off`.

For fast, slow, repeated-chorus, duet, and long-line songs:

1. In `shadow`, record Bible/card validation, coverage, warnings, HTTP attempts, and sanitized timings from Director 审片. Confirm legacy remains rendered.
2. In opt-in `on`, inspect entry, one signature scene, one quiet window, seek, pause, reduced motion, and final recall.
3. Confirm public Stage attributes report `directorSource=ai|cache`, `paletteSource=artwork-directed`, a Scene Card id/coverage, and no more than two layout changes.
4. Confirm a visible performance difference rather than accepting the badge alone.
5. Confirm no activation hitch, renderer p95 stays within the project budget, and background retains one provider request in flight.

After a reviewed build is mirrored to the stable path and the original extension is reloaded, focus the real YouTube Music Stage tab and run:

```sh
node scripts/review-rolling-director-public-dom.mjs
```

The script reads only the allowlisted public `.stage-canvas-host` data attributes. It does not read extension storage, lyrics, provider configuration, cookies, prompts, or model responses.

Default-on remains blocked until the focused tests, full tests, typecheck, `build:all`, gateway tests, audit, MV3 CSP check, deterministic artifact comparison, stable-path mirror, extension reload, and real YouTube Music UAT all pass.
