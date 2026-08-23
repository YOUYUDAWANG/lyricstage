import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const extension = join(root, "extension-dist");
const profile = mkdtempSync(join(tmpdir(), "lyricstage-chrome-smoke-"));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const candidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium",
].filter(Boolean);
const fromPath = () => {
  for (const name of ["chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [name], { encoding: "utf8" }).trim();
    } catch {
      // Continue through known executable names.
    }
  }
  return undefined;
};
const chromePath = candidates.find((path) => existsSync(path)) ?? fromPath();
if (!chromePath) throw new Error("Chrome executable not found; set CHROME_PATH.");

const child = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=${profile}`,
  "--remote-debugging-port=0",
  `--disable-extensions-except=${extension}`,
  `--load-extension=${extension}`,
  "about:blank",
], { stdio: "ignore" });

const poll = async (reader, label, timeoutMilliseconds = 15_000) => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const value = await reader();
    if (value) return value;
    if (child.exitCode !== null) throw new Error(`Chrome exited before ${label}.`);
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
};

const evaluate = (target, expression) => new Promise((resolve, reject) => {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const requestID = 1;
  const timeout = setTimeout(() => {
    socket.close();
    reject(new Error(`Timed out evaluating ${target.url}.`));
  }, 10_000);
  socket.addEventListener("open", () => socket.send(JSON.stringify({
    id: requestID,
    method: "Runtime.evaluate",
    params: { expression, awaitPromise: true, returnByValue: true },
  })));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== requestID) return;
    clearTimeout(timeout);
    socket.close();
    if (message.error || message.result?.exceptionDetails) reject(new Error(`Chrome evaluation failed for ${target.url}.`));
    else resolve(message.result?.result?.value);
  });
  socket.addEventListener("error", () => reject(new Error(`Chrome DevTools connection failed for ${target.url}.`)));
});

try {
  const activePort = await poll(() => {
    const path = join(profile, "DevToolsActivePort");
    return existsSync(path) ? readFileSync(path, "utf8").trim().split(/\r?\n/)[0] : undefined;
  }, "DevTools port");
  const endpoint = `http://127.0.0.1:${activePort}`;
  const targets = async () => fetch(`${endpoint}/json/list`).then((response) => response.json());
  const worker = await poll(async () => (await targets()).find((target) =>
    target.type === "service_worker"
      && /^chrome-extension:\/\//.test(target.url)
      && target.url.endsWith("/assets/background.js")
  ), "extension service worker");
  const extensionID = new URL(worker.url).host;

  for (const [page, selector] of [
    ["popup.html", ".popup-shell"],
    ["settings.html", ".settings-window"],
    ["stage.html", "#root"],
  ]) {
    const url = `chrome-extension://${extensionID}/${page}`;
    const created = await fetch(`${endpoint}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((response) => response.json());
    const target = await poll(async () => (await targets()).find((candidate) =>
      candidate.id === created.id && candidate.url === url
    ), `${page} navigation`);
    const ready = await evaluate(target, `new Promise((resolve) => {
      const deadline = Date.now() + 8000;
      const check = () => {
        const node = document.querySelector(${JSON.stringify(selector)});
        if (document.readyState === "complete" && node) resolve(true);
        else if (Date.now() >= deadline) resolve(false);
        else setTimeout(check, 50);
      };
      check();
    })`);
    if (!ready) {
      const diagnostic = await evaluate(target, `({
        url: location.href,
        readyState: document.readyState,
        title: document.title,
        body: document.body?.textContent?.trim().slice(0, 160) ?? "",
      })`);
      throw new Error(`${page} did not mount ${selector}: ${JSON.stringify(diagnostic)}`);
    }
  }

  console.log(`Chrome extension smoke passed for ${extensionID}: worker, popup, settings, stage.`);
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(2_000),
    ]);
  }
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
