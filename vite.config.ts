import { sites } from "@openai/sites-vite-plugin";
import react from "@vitejs/plugin-react";
import { createReadStream, statSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const localShowcaseAudio = (): Plugin => ({
  name: "lyricstage-local-showcase-audio",
  apply: "serve",
  configureServer(server) {
    const audioPath = process.env.LYRICSTAGE_SHOWCASE_AUDIO?.trim();
    if (!audioPath) return;
    server.middlewares.use("/__lyricstage_showcase_audio", (request, response) => {
      let size: number;
      try {
        size = statSync(audioPath).size;
      } catch {
        response.statusCode = 404;
        response.end();
        return;
      }
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/u);
      const start = range ? Math.min(size - 1, Number(range[1])) : 0;
      const requestedEnd = range?.[2] ? Number(range[2]) : size - 1;
      const end = Math.min(size - 1, Math.max(start, requestedEnd));
      response.statusCode = range ? 206 : 200;
      response.setHeader("Accept-Ranges", "bytes");
      response.setHeader("Content-Type", "audio/mp4");
      response.setHeader("Content-Length", end - start + 1);
      if (range) response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      createReadStream(audioPath, { start, end }).pipe(response);
    });
  },
});

export default defineConfig({
  root: fromRoot("./apps/stage"),
  plugins: [react(), sites(), localShowcaseAudio()],
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
    outDir: fromRoot("./dist/client"),
    emptyOutDir: true,
  },
});
