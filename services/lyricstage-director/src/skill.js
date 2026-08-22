import { readFileSync } from "node:fs";

const skillRoot = new URL("../skills/performance-direction-v3/", import.meta.url);
const choreographyRoot = new URL("../skills/performance-direction-v2/", import.meta.url);
const legacyRoot = new URL("../skills/performance-direction-v1/", import.meta.url);
const readText = (path, root = skillRoot) => readFileSync(new URL(path, root), "utf8");
const readJSON = (path, root = skillRoot) => JSON.parse(readText(path, root));

const dramaticGrammar = readJSON("dramatic-grammar.json");
const responseSchema = readJSON("schema.json", choreographyRoot);
const providerValidationKeywords = new Set(["minimum", "maximum", "minItems", "maxItems", "uniqueItems"]);
const removeProviderValidationBounds = (value) => {
  if (Array.isArray(value)) {
    value.forEach(removeProviderValidationBounds);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (providerValidationKeywords.has(key)) delete value[key];
    else removeProviderValidationBounds(value[key]);
  }
};
removeProviderValidationBounds(responseSchema);
responseSchema.required.push("dramaticScore");
responseSchema.properties.dramaticScore = {
  type: "object",
  additionalProperties: false,
  required: ["version", "premise", "emotionalArc", "acts", "motifActor", "signatureMoments", "quietWindows"],
  properties: {
    version: { type: "string", enum: ["dramatic-score-v1"] },
    premise: { type: "string" },
    emotionalArc: { type: "string" },
    acts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "role", "fromLineIndex", "toLineIndex", "tension", "visualDensity", "motifState", "intention"],
        properties: {
          id: { type: "string" }, role: { type: "string", enum: dramaticGrammar.actRoles },
          fromLineIndex: { type: "integer" }, toLineIndex: { type: "integer" },
          tension: { type: "number" }, visualDensity: { type: "number" },
          motifState: { type: "string", enum: dramaticGrammar.motifStates }, intention: { type: "string" },
        },
      },
    },
    motifActor: {
      type: "object", additionalProperties: false,
      required: ["family", "origin", "relationship", "states"],
      properties: {
        family: { type: "string", enum: dramaticGrammar.motifFamilies },
        origin: { type: "string", enum: dramaticGrammar.origins }, relationship: { type: "string" },
        states: { type: "array", items: { type: "object", additionalProperties: false, required: ["state", "meaning"], properties: { state: { type: "string", enum: dramaticGrammar.motifStates }, meaning: { type: "string" } } } },
      },
    },
    signatureMoments: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "fromLineIndex", "toLineIndex", "anchorLineIndices", "purpose", "motifState", "actorFamily", "stageAction", "coverRole", "consequence", "recallOf", "intensity", "evidence"],
        properties: {
          id: { type: "string" }, fromLineIndex: { type: "integer" }, toLineIndex: { type: "integer" },
          anchorLineIndices: { type: "array", items: { type: "integer" } },
          purpose: { type: "string", enum: dramaticGrammar.purposes }, motifState: { type: "string", enum: dramaticGrammar.motifStates },
          actorFamily: { type: "string", enum: dramaticGrammar.motifFamilies }, stageAction: { type: "string", enum: dramaticGrammar.stageActions },
          coverRole: { type: "string", enum: dramaticGrammar.coverRoles }, consequence: { type: "string", enum: dramaticGrammar.consequences },
          recallOf: { type: "string", description: "Empty string for the first/setup moment; otherwise the exact id of an earlier signature moment, especially for return or resolve." }, intensity: { type: "number" },
          evidence: { type: "object", additionalProperties: false, required: ["sectionTriggers", "rationale", "confidence"], properties: { sectionTriggers: { type: "array", items: { type: "string" } }, rationale: { type: "string" }, confidence: { type: "number" } } },
        },
      },
    },
    quietWindows: { type: "array", items: { type: "object", additionalProperties: false, required: ["fromLineIndex", "toLineIndex", "reason"], properties: { fromLineIndex: { type: "integer" }, toLineIndex: { type: "integer" }, reason: { type: "string" } } } },
  },
};

export const performanceDirectionSkill = Object.freeze({
  instructions: readText("SKILL.md"),
  antiPatterns: readText("anti-patterns.md", legacyRoot),
  grammar: readJSON("grammar.json", legacyRoot),
  gestureGrammar: readJSON("gesture-grammar.json", choreographyRoot),
  dramaticGrammar,
  cards: readJSON("effect-cards/catalog.json", legacyRoot),
  responseSchema,
});

export const performanceDirectionSystemPrompt = [
  performanceDirectionSkill.instructions,
  "## Runtime grammar",
  JSON.stringify(performanceDirectionSkill.grammar),
  "## Lyric gesture grammar",
  JSON.stringify(performanceDirectionSkill.gestureGrammar),
  "## Dramatic score grammar",
  JSON.stringify(performanceDirectionSkill.dramaticGrammar),
  "## Effect cards",
  JSON.stringify(performanceDirectionSkill.cards),
  performanceDirectionSkill.antiPatterns,
].join("\n\n");
