import type { LyricDocumentV0, LyricLineV0 } from "@lyricstage/contracts";

export type PerformanceTriggerV1 =
  | "repeated_hook"
  | "section_boundary"
  | "silence_gap"
  | "duet_overlap"
  | "voice_handoff"
  | "density_lift"
  | "density_release"
  | "semantic_distance"
  | "semantic_motion"
  | "semantic_contrast"
  | "question_suspension"
  | "collective_chorus"
  | "final_resolution";

export type StagePresentationV1 = "reading" | "section" | "hero" | "duet" | "aperture";
export type EffectLayerV1 = "environment" | "structure" | "lyricSupport" | "cover" | "transition";

export type EffectPrimitiveIDV1 =
  | "field.drift"
  | "field.aperture"
  | "field.ribbon"
  | "field.prism"
  | "field.rain"
  | "geometry.converge"
  | "geometry.expand"
  | "geometry.mirror"
  | "geometry.cut"
  | "geometry.suspend"
  | "geometry.orbit"
  | "memory.echo"
  | "memory.trail"
  | "density.lift"
  | "density.release"
  | "motif.recall"
  | "cover.island"
  | "cover.portal"
  | "transition.bloom"
  | "transition.dissolve";

export interface EffectPrimitiveSpecV1 {
  id: EffectPrimitiveIDV1;
  layer: EffectLayerV1;
  cost: 1 | 2 | 3;
  allowedParameters: Readonly<Record<string, readonly [number, number]>>;
  reduceMotionFallback?: EffectPrimitiveIDV1;
  conflictsWith: readonly EffectPrimitiveIDV1[];
}

export interface EffectPrimitiveUseV1 {
  primitive: EffectPrimitiveIDV1;
  intensity: number;
  direction?: -1 | 1;
  scale?: number;
}

export interface EffectEvidenceV1 {
  songMotif: string;
  sectionTriggers: PerformanceTriggerV1[];
  lineIndices: number[];
  rationale: string;
  confidence: number;
}

export type EffectCardIDV1 =
  | "distance-convergence"
  | "chorus-memory"
  | "contrast-cut"
  | "silence-aperture"
  | "duet-mirror"
  | "chorus-expansion"
  | "question-suspension"
  | "gravity-resolution"
  | "density-lift"
  | "field-release"
  | "motif-recall"
  | "final-dissolution"
  | "motion-ribbon"
  | "contrast-prism"
  | "distance-orbit"
  | "chorus-trail"
  | "final-bloom";

export interface EffectCardV1 {
  id: EffectCardIDV1;
  presentation: StagePresentationV1;
  requiredAny: readonly PerformanceTriggerV1[];
  primary: EffectPrimitiveIDV1;
  support: readonly EffectPrimitiveIDV1[];
  heroEligible: boolean;
  contraindications: readonly string[];
}

export interface EffectRecipeV1 {
  version: "effect-recipe-v1";
  id: string;
  cardID: EffectCardIDV1 | "custom";
  sectionID: string;
  fromMs: number;
  toMs: number;
  presentation: StagePresentationV1;
  primary: EffectPrimitiveUseV1;
  support: EffectPrimitiveUseV1[];
  evidence: EffectEvidenceV1;
}

export interface EffectSectionV1 {
  id: string;
  fromLineIndex: number;
  toLineIndex: number;
  fromMs: number;
  toMs: number;
  intensity: number;
}

export const effectPrimitiveRegistryV1: Readonly<Record<EffectPrimitiveIDV1, EffectPrimitiveSpecV1>> = {
  "field.drift": { id: "field.drift", layer: "environment", cost: 1, allowedParameters: { intensity: [0, 1] }, conflictsWith: [] },
  "field.aperture": { id: "field.aperture", layer: "environment", cost: 1, allowedParameters: { intensity: [0, 1] }, conflictsWith: ["density.lift"] },
  "field.ribbon": { id: "field.ribbon", layer: "environment", cost: 2, allowedParameters: { intensity: [0.2, 1], scale: [0.6, 1.2] }, conflictsWith: ["geometry.cut"] },
  "field.prism": { id: "field.prism", layer: "environment", cost: 2, allowedParameters: { intensity: [0.2, 1] }, conflictsWith: ["field.aperture"] },
  "field.rain": { id: "field.rain", layer: "environment", cost: 2, allowedParameters: { intensity: [0.2, 1] }, conflictsWith: ["density.lift"] },
  "geometry.converge": { id: "geometry.converge", layer: "structure", cost: 2, allowedParameters: { intensity: [0.35, 1], scale: [0.8, 1.2] }, reduceMotionFallback: "field.drift", conflictsWith: ["geometry.expand", "geometry.cut"] },
  "geometry.expand": { id: "geometry.expand", layer: "structure", cost: 2, allowedParameters: { intensity: [0.35, 1], scale: [0.8, 1.2] }, reduceMotionFallback: "field.drift", conflictsWith: ["geometry.converge", "geometry.cut"] },
  "geometry.mirror": { id: "geometry.mirror", layer: "structure", cost: 2, allowedParameters: { intensity: [0.35, 1] }, reduceMotionFallback: "field.drift", conflictsWith: ["geometry.cut"] },
  "geometry.cut": { id: "geometry.cut", layer: "transition", cost: 2, allowedParameters: { intensity: [0.35, 1] }, reduceMotionFallback: "field.drift", conflictsWith: ["geometry.converge", "geometry.expand", "geometry.mirror"] },
  "geometry.suspend": { id: "geometry.suspend", layer: "structure", cost: 1, allowedParameters: { intensity: [0.2, 0.8] }, conflictsWith: ["density.lift"] },
  "geometry.orbit": { id: "geometry.orbit", layer: "structure", cost: 2, allowedParameters: { intensity: [0.2, 1], scale: [0.6, 1.2] }, reduceMotionFallback: "field.drift", conflictsWith: ["geometry.cut"] },
  "memory.echo": { id: "memory.echo", layer: "lyricSupport", cost: 2, allowedParameters: { intensity: [0.25, 0.9] }, reduceMotionFallback: "motif.recall", conflictsWith: [] },
  "memory.trail": { id: "memory.trail", layer: "lyricSupport", cost: 2, allowedParameters: { intensity: [0.2, 0.9] }, reduceMotionFallback: "motif.recall", conflictsWith: [] },
  "density.lift": { id: "density.lift", layer: "structure", cost: 2, allowedParameters: { intensity: [0.35, 1] }, reduceMotionFallback: "field.drift", conflictsWith: ["density.release", "field.aperture", "geometry.suspend"] },
  "density.release": { id: "density.release", layer: "environment", cost: 1, allowedParameters: { intensity: [0.2, 0.85] }, conflictsWith: ["density.lift"] },
  "motif.recall": { id: "motif.recall", layer: "lyricSupport", cost: 1, allowedParameters: { intensity: [0.2, 0.75] }, conflictsWith: [] },
  "cover.island": { id: "cover.island", layer: "cover", cost: 1, allowedParameters: { intensity: [0.4, 1], scale: [0.4, 0.7] }, conflictsWith: ["field.aperture"] },
  "cover.portal": { id: "cover.portal", layer: "cover", cost: 2, allowedParameters: { intensity: [0.35, 1], scale: [0.6, 1.2] }, conflictsWith: ["field.aperture", "cover.island"] },
  "transition.bloom": { id: "transition.bloom", layer: "transition", cost: 2, allowedParameters: { intensity: [0.2, 1] }, reduceMotionFallback: "density.release", conflictsWith: ["geometry.cut"] },
  "transition.dissolve": { id: "transition.dissolve", layer: "transition", cost: 2, allowedParameters: { intensity: [0.25, 0.9] }, reduceMotionFallback: "density.release", conflictsWith: ["geometry.cut"] },
};

export const effectCardsV1: readonly EffectCardV1[] = [
  { id: "distance-convergence", presentation: "hero", requiredAny: ["semantic_distance", "section_boundary"], primary: "geometry.converge", support: ["cover.island"], heroEligible: true, contraindications: ["long line", "low semantic confidence"] },
  { id: "chorus-memory", presentation: "hero", requiredAny: ["repeated_hook"], primary: "memory.echo", support: ["cover.island", "motif.recall"], heroEligible: true, contraindications: ["first occurrence"] },
  { id: "contrast-cut", presentation: "section", requiredAny: ["semantic_contrast", "section_boundary"], primary: "geometry.cut", support: ["field.drift"], heroEligible: false, contraindications: ["adjacent hard transition"] },
  { id: "silence-aperture", presentation: "aperture", requiredAny: ["silence_gap"], primary: "field.aperture", support: [], heroEligible: false, contraindications: ["active overlapping vocal"] },
  { id: "duet-mirror", presentation: "duet", requiredAny: ["duet_overlap", "voice_handoff"], primary: "geometry.mirror", support: ["field.drift"], heroEligible: false, contraindications: ["unmarked voice inference"] },
  { id: "chorus-expansion", presentation: "hero", requiredAny: ["collective_chorus", "repeated_hook"], primary: "geometry.expand", support: ["cover.island"], heroEligible: true, contraindications: ["low repetition confidence"] },
  { id: "question-suspension", presentation: "hero", requiredAny: ["question_suspension", "section_boundary"], primary: "geometry.suspend", support: ["cover.island"], heroEligible: true, contraindications: ["long line", "weak punctuation-only question"] },
  { id: "gravity-resolution", presentation: "hero", requiredAny: ["final_resolution"], primary: "geometry.converge", support: ["density.release", "cover.island"], heroEligible: true, contraindications: ["non-final section"] },
  { id: "density-lift", presentation: "section", requiredAny: ["density_lift"], primary: "density.lift", support: ["field.drift"], heroEligible: false, contraindications: ["already dense background"] },
  { id: "field-release", presentation: "section", requiredAny: ["density_release"], primary: "density.release", support: [], heroEligible: false, contraindications: ["rising section"] },
  { id: "motif-recall", presentation: "reading", requiredAny: ["repeated_hook"], primary: "motif.recall", support: [], heroEligible: false, contraindications: ["first occurrence"] },
  { id: "final-dissolution", presentation: "aperture", requiredAny: ["final_resolution", "density_release"], primary: "transition.dissolve", support: ["motif.recall"], heroEligible: false, contraindications: ["non-final section"] },
  { id: "motion-ribbon", presentation: "section", requiredAny: ["semantic_motion", "section_boundary"], primary: "field.ribbon", support: ["memory.trail"], heroEligible: false, contraindications: ["already dense background"] },
  { id: "contrast-prism", presentation: "section", requiredAny: ["semantic_contrast", "section_boundary"], primary: "field.prism", support: ["field.drift"], heroEligible: false, contraindications: ["soft continuous passage"] },
  { id: "distance-orbit", presentation: "hero", requiredAny: ["semantic_distance", "section_boundary"], primary: "geometry.orbit", support: ["cover.portal"], heroEligible: true, contraindications: ["long line", "low semantic confidence"] },
  { id: "chorus-trail", presentation: "hero", requiredAny: ["repeated_hook"], primary: "memory.trail", support: ["cover.portal", "motif.recall"], heroEligible: true, contraindications: ["first occurrence"] },
  { id: "final-bloom", presentation: "aperture", requiredAny: ["final_resolution", "density_release"], primary: "transition.bloom", support: ["motif.recall"], heroEligible: false, contraindications: ["non-final section"] },
] as const;

const cardByID = new Map(effectCardsV1.map((card) => [card.id, card]));
const triggerSet = new Set<PerformanceTriggerV1>([
  "repeated_hook", "section_boundary", "silence_gap", "duet_overlap", "voice_handoff",
  "density_lift", "density_release", "semantic_distance", "semantic_motion", "semantic_contrast",
  "question_suspension", "collective_chorus", "final_resolution",
]);
const presentationSet = new Set<StagePresentationV1>(["reading", "section", "hero", "duet", "aperture"]);
const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
const normalize = (value: string): string => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
const textLength = (value: string): number => Array.from(value).length;

const overlaps = (left: LyricLineV0, right: LyricLineV0): boolean =>
  left.lineIndex !== right.lineIndex && left.fromMs < right.toMs && right.fromMs < left.toMs;

const sectionLines = (lyrics: LyricDocumentV0, section: EffectSectionV1): LyricLineV0[] =>
  lyrics.lines.filter((line) => line.lineIndex >= section.fromLineIndex && line.lineIndex <= section.toLineIndex);

const densityFor = (lines: LyricLineV0[]): number => {
  const duration = Math.max(1, Math.max(...lines.map((line) => line.toMs)) - Math.min(...lines.map((line) => line.fromMs)));
  return lines.reduce((sum, line) => sum + textLength(line.text), 0) / duration * 1000;
};

const semanticTriggers = (lines: LyricLineV0[]): PerformanceTriggerV1[] => {
  const body = normalize(lines.map((line) => line.text).join(" "));
  const triggers: PerformanceTriggerV1[] = [];
  if (/[?？]$/u.test(lines.at(-1)?.text.trim() ?? "")) triggers.push("question_suspension");
  if (/(远|近|距离|靠近|离开|far|near|distance|closer|away|遠く|近く)/iu.test(body)) triggers.push("semantic_distance");
  if (/(但是|却|相反|明暗|黑白|but|yet|however|opposite|光と影|でも)/iu.test(body)) triggers.push("semantic_contrast");
  if (/(走|跑|飞|坠|追|流动|run|fly|fall|chase|move|歩|走|飛|落ち)/iu.test(body)) triggers.push("semantic_motion");
  return triggers;
};

const evidenceForSection = (
  lyrics: LyricDocumentV0,
  section: EffectSectionV1,
  songMotif: string,
  normalizedCounts: ReadonlyMap<string, number>,
  averageDensity: number,
  sectionIndex: number,
  sectionCount: number,
): EffectEvidenceV1 => {
  const lines = sectionLines(lyrics, section);
  const triggers = new Set<PerformanceTriggerV1>();
  if (sectionIndex > 0) triggers.add("section_boundary");
  if (lines.some((line) => (normalizedCounts.get(normalize(line.text)) ?? 0) > 1)) triggers.add("repeated_hook");
  if (lines.some((line) => lines.some((candidate) => overlaps(line, candidate)))) triggers.add("duet_overlap");
  if (lines.some((line) => line.voiceRole === "duetA" || line.voiceRole === "duetB" || line.voiceRole === "harmony")) triggers.add("voice_handoff");
  const before = lyrics.lines.find((line) => line.lineIndex === section.fromLineIndex - 1);
  if (before && lines[0]!.fromMs - before.toMs >= 2_800) triggers.add("silence_gap");
  const density = densityFor(lines);
  if (density > averageDensity * 1.22) triggers.add("density_lift");
  if (density < averageDensity * 0.74) triggers.add("density_release");
  if (lines.some((line) => /(我们|一起|所有|we|together|everyone|僕ら|みんな)/iu.test(line.text))) triggers.add("collective_chorus");
  semanticTriggers(lines).forEach((trigger) => triggers.add(trigger));
  if (sectionIndex === sectionCount - 1) triggers.add("final_resolution");
  const sectionTriggers = Array.from(triggers);
  return {
    songMotif,
    sectionTriggers,
    lineIndices: lines.map((line) => line.lineIndex),
    rationale: sectionTriggers.length > 0
      ? `Section ${section.id} develops ${songMotif} through ${sectionTriggers.join(", ")}.`
      : `Section ${section.id} preserves the reading state because no strong structural evidence is present.`,
    confidence: clamp(0.46 + sectionTriggers.filter((trigger) => !trigger.startsWith("semantic_")).length * 0.09),
  };
};

const chooseCard = (evidence: EffectEvidenceV1, sectionIndex: number, sectionCount: number): EffectCardV1 | undefined => {
  const triggers = new Set(evidence.sectionTriggers);
  const candidates: EffectCardIDV1[] = [];
  if (triggers.has("silence_gap")) candidates.push("silence-aperture");
  if (triggers.has("duet_overlap") || triggers.has("voice_handoff")) candidates.push("duet-mirror");
  if (sectionIndex === sectionCount - 1 && triggers.has("density_release")) candidates.push("final-dissolution");
  else if (sectionIndex === sectionCount - 1) candidates.push("gravity-resolution");
  if (triggers.has("repeated_hook") && triggers.has("collective_chorus")) candidates.push("chorus-expansion");
  else if (triggers.has("repeated_hook")) candidates.push(sectionIndex > 1 ? "chorus-memory" : "motif-recall");
  if (triggers.has("question_suspension") && triggers.has("section_boundary")) candidates.push("question-suspension");
  if (triggers.has("semantic_contrast") && triggers.has("section_boundary")) candidates.push("contrast-cut");
  if (triggers.has("semantic_distance") && triggers.has("section_boundary")) candidates.push("distance-convergence");
  if (triggers.has("density_lift")) candidates.push("density-lift");
  if (triggers.has("density_release")) candidates.push("field-release");
  return candidates.map((id) => cardByID.get(id)).find(Boolean);
};

export const compileLocalEffectRecipesV1 = (
  lyrics: LyricDocumentV0,
  sections: EffectSectionV1[],
  songMotif: string,
): EffectRecipeV1[] => {
  if (lyrics.lines.length === 0 || sections.length === 0) return [];
  const counts = new Map<string, number>();
  lyrics.lines.forEach((line) => counts.set(normalize(line.text), (counts.get(normalize(line.text)) ?? 0) + 1));
  const densities = sections.map((section) => densityFor(sectionLines(lyrics, section)));
  const averageDensity = densities.reduce((sum, density) => sum + density, 0) / Math.max(1, densities.length);
  let heroDurationMs = 0;
  return sections.flatMap((section, sectionIndex) => {
    const evidence = evidenceForSection(lyrics, section, songMotif, counts, averageDensity, sectionIndex, sections.length);
    const card = chooseCard(evidence, sectionIndex, sections.length);
    if (!card || evidence.confidence < 0.64) return [];
    const lines = sectionLines(lyrics, section);
    const heroLine = lines.find((line) => (counts.get(normalize(line.text)) ?? 0) > 1 && textLength(line.text) <= 34)
      ?? lines.find((line) => /[?？]$/u.test(line.text.trim()) && textLength(line.text) <= 34)
      ?? [...lines].reverse().find((line) => textLength(line.text) <= 34);
    const heroLineDuration = heroLine ? heroLine.toMs - heroLine.fromMs : Number.POSITIVE_INFINITY;
    const allowHero = card.heroEligible
      && Boolean(heroLine)
      && heroLineDuration / Math.max(1, lyrics.durationMs) <= 0.18
      && heroDurationMs + heroLineDuration <= lyrics.durationMs * 0.25;
    const presentation = card.presentation === "hero" && !allowHero ? "section" : card.presentation;
    if (presentation === "hero") heroDurationMs += heroLineDuration;
    const support = card.support
      .filter((primitive) => !(primitive === "cover.island" && presentation !== "hero"))
      .slice(0, 2)
      .map<EffectPrimitiveUseV1>((primitive) => ({ primitive, intensity: clamp(section.intensity) }));
    return [{
      version: "effect-recipe-v1",
      id: `local-effect:${section.id}:${card.id}`,
      cardID: card.id,
      sectionID: section.id,
      fromMs: presentation === "hero" ? heroLine!.fromMs : section.fromMs,
      toMs: presentation === "hero" ? heroLine!.toMs : section.toMs,
      presentation,
      primary: { primitive: card.primary, intensity: clamp(section.intensity), direction: sectionIndex % 2 === 0 ? 1 : -1 },
      support,
      evidence,
    } satisfies EffectRecipeV1];
  });
};

export const effectRecipeAtV1 = (recipes: readonly EffectRecipeV1[], timeMs: number): EffectRecipeV1 | undefined =>
  recipes.find((recipe) => timeMs >= recipe.fromMs && timeMs < recipe.toMs);

export const stagePresentationAtV1 = (
  recipes: readonly EffectRecipeV1[],
  timeMs: number,
  lyrics?: LyricDocumentV0,
): StagePresentationV1 => {
  const presentation = effectRecipeAtV1(recipes, timeMs)?.presentation ?? "reading";
  if (presentation !== "aperture" || !lyrics) return presentation;
  return lyrics.lines.some((line) => timeMs >= line.fromMs && timeMs < line.toMs)
    ? "reading"
    : "aperture";
};

export const validateEffectRecipeV1 = (
  recipe: EffectRecipeV1,
  section: EffectSectionV1,
  validLineIndices: ReadonlySet<number>,
  timelineBounds: { fromMs: number; toMs: number } = section,
): boolean => {
  const card = recipe.cardID === "custom" ? undefined : cardByID.get(recipe.cardID);
  const rangeValid = recipe.cardID === "custom"
    ? recipe.fromMs >= section.fromMs && recipe.fromMs >= timelineBounds.fromMs && recipe.toMs <= timelineBounds.toMs
    : recipe.presentation === "hero"
      ? recipe.fromMs >= section.fromMs && recipe.toMs <= section.toMs
      : recipe.fromMs === section.fromMs && recipe.toMs === section.toMs;
  if (
    recipe.version !== "effect-recipe-v1"
    || recipe.sectionID !== section.id
    || recipe.fromMs >= recipe.toMs
    || !rangeValid
    || recipe.support.length > 2
    || recipe.evidence.songMotif.trim().length === 0
    || recipe.evidence.rationale.trim().length === 0
    || recipe.evidence.confidence < 0 || recipe.evidence.confidence > 1
    || recipe.evidence.sectionTriggers.length === 0
    || recipe.evidence.sectionTriggers.some((trigger) => !triggerSet.has(trigger))
    || recipe.evidence.lineIndices.length === 0
    || recipe.evidence.lineIndices.some((index) => !validLineIndices.has(index))
    || !presentationSet.has(recipe.presentation)
    || (recipe.cardID !== "custom" && !card)
    || (card && (card.presentation !== recipe.presentation
      && !(card.presentation === "hero" && (recipe.presentation === "section" || recipe.presentation === "reading"))))
    || (card && !card.requiredAny.some((trigger) => recipe.evidence.sectionTriggers.includes(trigger)))
  ) return false;
  const uses = [recipe.primary, ...recipe.support];
  if (uses.some((use) => !(use.primitive in effectPrimitiveRegistryV1))) return false;
  if (new Set(uses.map((use) => use.primitive)).size !== uses.length) return false;
  if (uses.reduce((total, use) => total + effectPrimitiveRegistryV1[use.primitive].cost, 0) > 6) return false;
  if (uses.some((use) => !Number.isFinite(use.intensity) || use.intensity < 0 || use.intensity > 1)) return false;
  return uses.every((use, index) => uses.every((candidate, candidateIndex) =>
    index === candidateIndex || !effectPrimitiveRegistryV1[use.primitive].conflictsWith.includes(candidate.primitive)
  ));
};
