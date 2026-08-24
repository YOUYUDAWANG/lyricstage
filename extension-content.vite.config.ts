import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromRoot("./apps/browser-extension"),
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "import.meta.env.LYRICSTAGE_CONTENT_UI": "true",
  },
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
    emptyOutDir: false,
    rollupOptions: {
      input: fromRoot("./apps/browser-extension/src/content-ui.tsx"),
      output: {
        format: "es",
        entryFileNames: "assets/content-ui.js",
        chunkFileNames: "assets/content-[name]-[hash].js",
        assetFileNames: "assets/content-[name]-[hash][extname]",
      },
    },
  },
});
