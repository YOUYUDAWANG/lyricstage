import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@lyricstage/contracts": fromRoot("./packages/contracts/src/index.ts"),
      "@lyricstage/companion": fromRoot("./packages/companion/src/index.ts"),
      "@lyricstage/core": fromRoot("./packages/core/src/index.ts"),
      "@lyricstage/lyrics": fromRoot("./packages/lyrics/src/index.ts"),
      "@lyricstage/performance": fromRoot("./packages/performance/src/index.ts"),
      "@lyricstage/renderer": fromRoot("./packages/renderer/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/stage/src/**/*.test.ts",
      "apps/youtube-music-companion/src/**/*.test.ts",
    ],
  },
});
