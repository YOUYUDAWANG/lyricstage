import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const readJSON = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const packageJSON = readJSON("package.json");
const sourceManifest = readJSON("apps/browser-extension/public/manifest.json");
const builtManifest = readJSON("extension-dist/manifest.json");

const versions = new Set([packageJSON.version, sourceManifest.version, builtManifest.version]);
if (versions.size !== 1) throw new Error(`Version drift: ${[...versions].join(", ")}`);

const staleEvidence = /(?:passes?\s+)?\d+\s*\/\s*\d+\s+tests?(?:\s+passing)?/i;
for (const path of ["docs/ORCA_HANDOFF.md", "apps/browser-extension/RELEASE-CANDIDATE.md"]) {
  const source = readFileSync(new URL(path, root), "utf8");
  if (staleEvidence.test(source)) {
    throw new Error(`${path} contains a hand-maintained test count; release evidence must come from CI.`);
  }
}

const commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
console.log(JSON.stringify({ version: packageJSON.version, commit, artifact: "extension-dist" }));
