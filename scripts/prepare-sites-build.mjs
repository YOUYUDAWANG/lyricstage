import { copyFile, mkdir, rm } from "node:fs/promises";
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

await copyFile(new URL("../apps/stage/sites-worker.js", import.meta.url), new URL("index.js", serverDirectory));

await copyFile(new URL("../.openai/hosting.json", import.meta.url), new URL("hosting.json", metadataDirectory));
await rm(nestedPluginOutput, { recursive: true, force: true });

console.log(`Prepared Sites worker at ${fileURLToPath(new URL("index.js", serverDirectory))}`);
