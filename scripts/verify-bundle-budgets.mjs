import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../extension-dist/", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const limits = {
  initialContentScripts: 100_000,
  largestJavaScript: 500_000,
  // The optional AM shell now includes a minified light stylesheet, a persistent
  // collapsible guide, the native media switch, and toolbar panel popovers. Keep
  // a narrow 50KB envelope without relaxing either JavaScript budget.
  totalExtension: 2_550_000,
};
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? files(path) : [path];
});
const allFiles = files(root);
const javascript = allFiles.filter((path) => path.endsWith(".js"));
const initial = (manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []);
const initialBytes = initial.reduce((sum, path) => sum + statSync(join(root, path)).size, 0);
const largestJavaScript = Math.max(...javascript.map((path) => statSync(path).size));
const totalExtension = allFiles.reduce((sum, path) => sum + statSync(path).size, 0);

for (const [label, value] of Object.entries({ initialContentScripts: initialBytes, largestJavaScript, totalExtension })) {
  if (value > limits[label]) throw new Error(`${label} exceeded ${limits[label]} bytes (${value}).`);
}

console.log(JSON.stringify({ initialBytes, largestJavaScript, totalExtension, limits }));
