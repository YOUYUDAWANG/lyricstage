import antiPatterns from "../../../../services/lyricstage-director/skills/performance-direction-v1/anti-patterns.md?raw";
import effectCards from "../../../../services/lyricstage-director/skills/performance-direction-v1/effect-cards/catalog.json";
import grammar from "../../../../services/lyricstage-director/skills/performance-direction-v1/grammar.json";
import gestureGrammar from "../../../../services/lyricstage-director/skills/performance-direction-v2/gesture-grammar.json";
import responseSchemaSource from "../../../../services/lyricstage-director/skills/performance-direction-v2/schema.json";
import instructions from "../../../../services/lyricstage-director/skills/performance-direction-v3/SKILL.md?raw";
import dramaticGrammar from "../../../../services/lyricstage-director/skills/performance-direction-v3/dramatic-grammar.json";

type JSONRecord = Record<string, unknown>;

const responseSchema = structuredClone(responseSchemaSource) as JSONRecord & {
  required: string[];
  properties: JSONRecord;
};
const providerValidationKeywords = new Set(["minimum", "maximum", "minItems", "maxItems", "uniqueItems"]);
const removeProviderValidationBounds = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(removeProviderValidationBounds);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (providerValidationKeywords.has(key)) delete (value as JSONRecord)[key];
    else removeProviderValidationBounds((value as JSONRecord)[key]);
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
          recallOf: { type: "string" }, intensity: { type: "number" },
          evidence: { type: "object", additionalProperties: false, required: ["sectionTriggers", "rationale", "confidence"], properties: { sectionTriggers: { type: "array", items: { type: "string" } }, rationale: { type: "string" }, confidence: { type: "number" } } },
        },
      },
    },
    quietWindows: { type: "array", items: { type: "object", additionalProperties: false, required: ["fromLineIndex", "toLineIndex", "reason"], properties: { fromLineIndex: { type: "integer" }, toLineIndex: { type: "integer" }, reason: { type: "string" } } } },
  },
};

export const performanceDirectionSkill = Object.freeze({
  instructions,
  antiPatterns,
  grammar,
  gestureGrammar,
  dramaticGrammar,
  cards: effectCards,
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
