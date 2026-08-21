import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromRoot("./apps/performance-lab"),
  plugins: [react()],
  resolve: {
    alias: {
      "@lyricstage/contracts": fromRoot("./packages/contracts/src/index.ts"),
      "@lyricstage/performance": fromRoot("./packages/performance/src/index.ts"),
    },
  },
  build: {
    outDir: fromRoot("./performance-dist"),
    emptyOutDir: true,
  },
});
