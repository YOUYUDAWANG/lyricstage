import { readFileSync, writeFileSync } from "node:fs";
import { transform } from "lightningcss";
import { rolldown } from "rolldown";
import { fileURLToPath } from "node:url";

const cssSource = fileURLToPath(new URL("../apps/browser-extension/public/ytm-shell.css", import.meta.url));
const cssOutput = fileURLToPath(new URL("../extension-dist/ytm-shell.css", import.meta.url));
const { code: css } = transform({
  filename: cssSource,
  code: readFileSync(cssSource),
  minify: true,
});
writeFileSync(cssOutput, css);

const scriptSource = fileURLToPath(new URL("../apps/browser-extension/public/content.js", import.meta.url));
const scriptOutput = fileURLToPath(new URL("../extension-dist/content.js", import.meta.url));
const bundle = await rolldown({ input: scriptSource });
const generated = await bundle.generate({ format: "iife", minify: true });
const chunk = generated.output.find((entry) => entry.type === "chunk");
if (!chunk) throw new Error("Unable to minify the extension content script.");
writeFileSync(scriptOutput, chunk.code);
