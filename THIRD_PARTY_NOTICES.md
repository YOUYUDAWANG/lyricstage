# Third-party notices

LyricStage depends on open-source packages distributed under their own licenses. The exact transitive versions and integrity hashes are recorded in `package-lock.json`; each installed package includes its full license text.

Direct runtime dependencies:

- AJV 8.20.0 — MIT
- PixiJS 8.20.0 — MIT
- React and React DOM 19.2.6 — MIT

Direct development/build dependencies:

- OpenAI Sites Vite Plugin 0.1.0 — MIT
- Theatre.js Core 0.7.2 — Apache-2.0
- Theatre.js Studio 0.7.2 — AGPL-3.0-only
- TypeScript 5.9.3 — Apache-2.0
- Vite 8.2.2 and Vitest 4.1.0 — MIT
- React Vite plugin and TypeScript declaration packages — MIT

This notice is informational and does not replace the license texts shipped by those projects.

## YouLy+

The persistent lyrics column adapts the rendering structure and animation algorithms from
[YouLy+ 4.4.3 at `69d2480`](https://github.com/ibratabian17/YouLyPlus/tree/69d2480c39dd226ebfc3960430b21a9f869c353e),
including its persistent line/word/syllable/character hierarchy, directional staggered scrolling,
pre-highlight and wipe states, growable-word metrics, gap lines, inactive-line blur,
voice-aware alignment, off-screen suspension, and direct lyric seeking.
YouLy+ is Copyright (c) 2025 Ibra Al Tabian and is distributed under the MIT License.
