import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifact = join(root, "extension-dist");
const temporary = mkdtempSync(join(tmpdir(), "lyricstage-determinism-"));
const first = join(temporary, "first");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const build = () => execFileSync(npm, ["run", "build:extension", "--silent"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
});
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? files(path) : [path];
});

try {
  build();
  cpSync(artifact, first, { recursive: true });
  build();
  const firstFiles = files(first).map((path) => relative(first, path)).sort();
  const secondFiles = files(artifact).map((path) => relative(artifact, path)).sort();
  if (JSON.stringify(firstFiles) !== JSON.stringify(secondFiles)) {
    throw new Error("Extension builds emitted different file sets.");
  }
  const changed = firstFiles.filter((path) => !readFileSync(join(first, path)).equals(readFileSync(join(artifact, path))));
  if (changed.length > 0) throw new Error(`Non-deterministic extension files: ${changed.join(", ")}`);
  console.log(`Deterministic extension artifact: ${firstFiles.length} files.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
