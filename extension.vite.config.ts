import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromRoot("./apps/browser-extension"),
  publicDir: fromRoot("./apps/browser-extension/public"),
  base: "./",
  plugins: [react()],
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
  build: {
    outDir: fromRoot("./extension-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        stage: fromRoot("./apps/browser-extension/stage.html"),
        popup: fromRoot("./apps/browser-extension/popup.html"),
        offscreen: fromRoot("./apps/browser-extension/offscreen.html"),
        background: fromRoot("./apps/browser-extension/src/background.ts"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
