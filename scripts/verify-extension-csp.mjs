import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = fileURLToPath(new URL("../extension-dist/", import.meta.url));
const publicRoot = fileURLToPath(
  new URL("../apps/browser-extension/public/", import.meta.url),
);
const forbidden = [
  { label: "eval", pattern: /\beval\s*\(/ },
  { label: "new Function", pattern: /\bnew\s+Function\b/ },
  { label: "CommonJS require", pattern: /\brequire\s*\(/ },
  { label: "Node process.env", pattern: /\bprocess\.env\b/ },
];

const javascriptFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return extname(path) === ".js" ? [path] : [];
  });

const violations = [];
for (const path of javascriptFiles(extensionRoot)) {
  const source = readFileSync(path, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) violations.push(`${path}: ${rule.label}`);
  }
  if (/StudioBundle|theatrejs:performance-lab|@theatre\/studio/.test(source)) {
    violations.push(`${path}: development-only Theatre Studio`);
  }
  if (/\bcaptureStream\s*\(|\bMediaRecorder\b/.test(source)) {
    violations.push(`${path}: forbidden audio recording path`);
  }
}

if (violations.length > 0) {
  throw new Error(`Extension violates Manifest V3 CSP:\n${violations.join("\n")}`);
}

const stagePath = join(extensionRoot, "stage.html");
if (!existsSync(stagePath)) throw new Error("Extension build is missing stage.html.");
const stageHTML = readFileSync(stagePath, "utf8");
if (!stageHTML.includes('id="root"') || !stageHTML.includes('type="module"')) {
  throw new Error("Extension stage.html is missing its root or module entrypoint.");
}

const localStageResources = Array.from(
  stageHTML.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g),
  (match) => match[1],
);
if (localStageResources.length === 0) {
  throw new Error("Extension stage.html has no packaged script or stylesheet resources.");
}
for (const resource of localStageResources) {
  const resourcePath = join(extensionRoot, resource);
  if (!existsSync(resourcePath) || statSync(resourcePath).size === 0) {
    throw new Error(`Extension stage resource is missing or empty: ${resource}`);
  }
}

const manifestPath = join(extensionRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const requireBuiltFile = (relativePath, label) => {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`Extension manifest is missing ${label}.`);
  }
  const path = join(extensionRoot, relativePath);
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(`Extension build is missing ${label}: ${relativePath}`);
  }
  return path;
};

requireBuiltFile(manifest.background?.service_worker, "background service worker");
if (!(manifest.permissions ?? []).includes("tabCapture") || !(manifest.permissions ?? []).includes("offscreen")) {
  throw new Error("Extension manifest is missing the bounded local audio-analysis permissions.");
}
const offscreenPath = requireBuiltFile("offscreen.html", "offscreen audio-analysis document");
const offscreenHTML = readFileSync(offscreenPath, "utf8");
if (!offscreenHTML.includes("offscreen.js")) {
  throw new Error("Offscreen audio-analysis document is missing its packaged entrypoint.");
}
const popupPath = requireBuiltFile(manifest.action?.default_popup, "action popup");
const popupHTML = readFileSync(popupPath, "utf8");
const popupResources = Array.from(
  popupHTML.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g),
  (match) => match[1],
);
if (popupResources.length === 0) {
  throw new Error("Extension popup has no packaged script or stylesheet resources.");
}
for (const resource of popupResources) {
  requireBuiltFile(resource, "popup resource");
}
const contentScripts = manifest.content_scripts?.[0]?.js ?? [];
if (
  contentScripts.length !== 2 ||
  contentScripts[0] !== "content-ui.js" ||
  contentScripts[1] !== "content.js"
) {
  throw new Error("Extension must load content-ui.js before content.js.");
}
const contentUIPath = join(extensionRoot, "content-ui.js");
if (!existsSync(contentUIPath) || statSync(contentUIPath).size === 0) {
  throw new Error("Extension build is missing the embedded Column runtime.");
}
if (statSync(contentUIPath).size > 1_200_000) {
  throw new Error("Embedded Column/fullscreen runtime exceeded the 1.2MB launch budget.");
}
const contentUISource = readFileSync(contentUIPath, "utf8");
if (!contentUISource.includes("director-plan-v1") || !contentUISource.includes("environment-scene-v1")) {
  throw new Error("Embedded fullscreen runtime is missing the production performance engine.");
}
const fixedDirectorOrigin = "https://director.hachi-mi.uk/*";
if ((manifest.host_permissions ?? []).includes(fixedDirectorOrigin)) {
  throw new Error("Extension manifest still grants the retired fixed AI director origin.");
}
if ((manifest.host_permissions ?? []).some((origin) => origin === "https://*/*" || origin === "http://*/*")) {
  throw new Error("Custom AI provider origins must never be granted as required host permissions.");
}
if (!(manifest.optional_host_permissions ?? []).includes("https://*/*")
  || !(manifest.optional_host_permissions ?? []).includes("http://*/*")) {
  throw new Error("Extension manifest cannot request exact custom or local AI provider origins.");
}
if (!popupHTML.includes("data-director-api-key")
  || !popupHTML.includes("data-director-protocol")
  || !popupHTML.includes("data-save-director-config")) {
  throw new Error("Extension popup is missing provider-neutral local AI director controls.");
}
const exposedStage = (manifest.web_accessible_resources ?? []).some((entry) =>
  (entry.resources ?? []).some((resource) => resource === "stage.html" || resource === "assets/*"),
);
if (exposedStage) {
  throw new Error("Embedded Column no longer needs Stage resources exposed to the host page.");
}

for (const filename of ["content.js", "manifest.json"]) {
  const source = readFileSync(join(publicRoot, filename));
  const built = readFileSync(join(extensionRoot, filename));
  if (!source.equals(built)) {
    throw new Error(`Extension build output differs from public source: ${filename}`);
  }
}

console.log("Extension scripts and packaged Stage resources are Manifest V3 safe.");
