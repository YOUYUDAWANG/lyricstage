import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const budgets = new Map([
  ["apps/browser-extension/src/background.ts", 2850],
  ["apps/stage/src/App.tsx", 1725],
  ["packages/performance/src/directorProviders.ts", 1250],
  ["packages/performance/src/rollingDirector.ts", 1175],
  ["packages/renderer/src/drawDirected.ts", 1175],
]);
const measured = {};
for (const [path, maximumLines] of budgets) {
  const source = readFileSync(new URL(path, root), "utf8");
  const lines = source.endsWith("\n") ? source.split("\n").length - 1 : source.split("\n").length;
  measured[path] = { lines, maximumLines };
  if (lines > maximumLines) throw new Error(`${path} exceeded ${maximumLines} lines (${lines}). Extract a bounded module instead of raising the budget.`);
}
console.log(JSON.stringify(measured));
