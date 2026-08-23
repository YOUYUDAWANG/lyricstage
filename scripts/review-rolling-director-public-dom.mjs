#!/usr/bin/env node
import { lstatSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";

const stableExtensionPath = "/Users/chaoyiliu/Desktop/bilibili-music/web/extension-dist";
const originalExtensionID = "majlfdidelchofnfodcijoppcgpmbelc";
const allowedAttributes = [
  "directorMode", "bibleSource", "sceneId", "sceneCoverageMs", "sceneCount", "layoutChangeCount",
  "gestureCount", "effectCount", "dramaticMomentCount", "directorSource", "paletteSource", "frameP95",
];

if (lstatSync(stableExtensionPath).isSymbolicLink() || realpathSync(stableExtensionPath) !== stableExtensionPath) {
  throw new Error(`Stable unpacked path must be a real directory: ${stableExtensionPath}`);
}

const browserJavaScript = `JSON.stringify((() => {
  const host = document.querySelector('.stage-canvas-host');
  if (!host) return { ok: false, reason: 'stage-host-missing', page: location.origin };
  const allowed = ${JSON.stringify(allowedAttributes)};
  return { ok: true, page: location.origin, observedAt: new Date().toISOString(), attributes: Object.fromEntries(allowed.map((key) => [key, host.dataset[key] ?? null])) };
})())`;
const appleScript = `tell application "Google Chrome"
  if (count of windows) is 0 then error "Google Chrome has no open window"
  set resultJSON to execute active tab of front window javascript ${JSON.stringify(browserJavaScript)}
  return resultJSON
end tell`;

console.error(`Reviewing original extension ${originalExtensionID} from ${stableExtensionPath}`);
console.error("Only public .stage-canvas-host data attributes are read; extension storage is never accessed.");
const output = execFileSync("osascript", ["-e", appleScript], { encoding: "utf8" }).trim();
process.stdout.write(`${output}\n`);
