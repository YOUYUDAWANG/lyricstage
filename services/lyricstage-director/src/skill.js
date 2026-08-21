import { readFileSync } from "node:fs";

const skillRoot = new URL("../skills/performance-direction-v1/", import.meta.url);
const readText = (path) => readFileSync(new URL(path, skillRoot), "utf8");
const readJSON = (path) => JSON.parse(readText(path));

export const performanceDirectionSkill = Object.freeze({
  instructions: readText("SKILL.md"),
  antiPatterns: readText("anti-patterns.md"),
  grammar: readJSON("grammar.json"),
  cards: readJSON("effect-cards/catalog.json"),
  responseSchema: readJSON("schema.json"),
});

export const performanceDirectionSystemPrompt = [
  performanceDirectionSkill.instructions,
  "## Runtime grammar",
  JSON.stringify(performanceDirectionSkill.grammar),
  "## Effect cards",
  JSON.stringify(performanceDirectionSkill.cards),
  performanceDirectionSkill.antiPatterns,
].join("\n\n");
