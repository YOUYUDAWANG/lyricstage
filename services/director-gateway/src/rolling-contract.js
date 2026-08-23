const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value) => Number.isInteger(value) && value >= 0;

export const rollingDirectorProfilesV1 = Object.freeze({
  bible: Object.freeze({ schemaName: "lyricstage_director_bible_v1", version: "director-bible-v1" }),
  scenePack: Object.freeze({ schemaName: "lyricstage_scene_pack_v1", version: "scene-pack-v1", minimumCards: 1, maximumCards: 3 }),
});

export const validateRollingBibleWireV1 = (value) => {
  if (!object(value) || value.version !== "director-bible-v1"
    || typeof value.premise !== "string" || !value.premise.trim()
    || typeof value.emotionalArc !== "string" || !value.emotionalArc.trim()
    || !Array.isArray(value.acts) || value.acts.length < 2 || value.acts.length > 5
    || !Array.isArray(value.signatureAnchors) || value.signatureAnchors.length < 2 || value.signatureAnchors.length > 4
    || !object(value.motifActor) || !object(value.world) || !object(value.layoutBudget)) return false;
  return value.signatureAnchors.every((anchor) => object(anchor)
    && typeof anchor.id === "string" && anchor.id.length > 0
    && integer(anchor.fromLineIndex) && integer(anchor.toLineIndex) && anchor.fromLineIndex <= anchor.toLineIndex
    && Array.isArray(anchor.anchorLineIndices) && anchor.anchorLineIndices.length > 0
    && !("stageAction" in anchor) && !("coverRole" in anchor) && !("consequence" in anchor));
};

export const validateRollingScenePackWireV1 = (value, expected) => {
  if (!object(value) || value.version !== "scene-pack-v1"
    || value.bibleIdentity !== expected.bibleIdentity
    || value.entryStateHash !== expected.entryStateHash
    || !Array.isArray(value.scenes)
    || value.scenes.length < rollingDirectorProfilesV1.scenePack.minimumCards
    || value.scenes.length > rollingDirectorProfilesV1.scenePack.maximumCards) return false;
  return value.scenes.every((scene) => object(scene)
    && integer(scene.fromLineIndex) && integer(scene.toLineIndex) && scene.fromLineIndex <= scene.toLineIndex
    && typeof scene.intention === "string" && scene.intention.trim().length > 0
    && Array.isArray(scene.gestures) && scene.gestures.length <= 4
    && Array.isArray(scene.effects) && scene.effects.length <= 2
    && object(scene.consequence)
    && Array.isArray(scene.promiseCreates) && Array.isArray(scene.promiseConsumes)
    && object(scene.evidence));
};
