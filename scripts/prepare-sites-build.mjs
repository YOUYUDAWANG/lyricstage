import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const serverDirectory = new URL("server/", dist);
const metadataDirectory = new URL(".openai/", dist);
const nestedPluginOutput = new URL("../apps/stage/dist/", import.meta.url);

await Promise.all([
  mkdir(serverDirectory, { recursive: true }),
  mkdir(metadataDirectory, { recursive: true }),
]);

await writeFile(new URL("index.js", serverDirectory), `export default {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) {
      return new Response("LyricStage assets are unavailable", { status: 503 });
    }
    return env.ASSETS.fetch(request);
  },
};
`, "utf8");

await copyFile(new URL("../.openai/hosting.json", import.meta.url), new URL("hosting.json", metadataDirectory));
await rm(nestedPluginOutput, { recursive: true, force: true });

console.log(`Prepared Sites worker at ${fileURLToPath(new URL("index.js", serverDirectory))}`);
