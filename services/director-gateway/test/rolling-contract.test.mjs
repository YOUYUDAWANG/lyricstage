import test from "node:test";
import assert from "node:assert/strict";
import {
  rollingDirectorProfilesV1,
  validateRollingBibleWireV1,
  validateRollingScenePackWireV1,
} from "../src/rolling-contract.js";

test("rolling gateway mirror keeps Bible anchors constitutional", () => {
  const bible = {
    version: "director-bible-v1",
    premise: "A fixture premise",
    emotionalArc: "A fixture arc",
    world: {}, motifActor: {}, layoutBudget: {},
    acts: [{}, {}],
    signatureAnchors: [
      { id: "seed", fromLineIndex: 0, toLineIndex: 0, anchorLineIndices: [0] },
      { id: "return", fromLineIndex: 9, toLineIndex: 9, anchorLineIndices: [9] },
    ],
  };
  assert.equal(validateRollingBibleWireV1(bible), true);
  assert.equal(validateRollingBibleWireV1({
    ...bible,
    signatureAnchors: [{ ...bible.signatureAnchors[0], stageAction: "thread.connect" }, bible.signatureAnchors[1]],
  }), false);
  assert.equal(rollingDirectorProfilesV1.bible.schemaName, "lyricstage_director_bible_v1");
});

test("rolling gateway mirror enforces exact Scene Pack envelope and 1-3 cards", () => {
  const scene = {
    fromLineIndex: 2, toLineIndex: 4, intention: "Fixture scene",
    gestures: [], effects: [], consequence: { kind: "trace", rationale: "fixture" },
    promiseCreates: [], promiseConsumes: [], evidence: {},
  };
  const expected = { bibleIdentity: "bible-id", entryStateHash: "state-id" };
  const pack = { version: "scene-pack-v1", ...expected, scenes: [scene] };
  assert.equal(validateRollingScenePackWireV1(pack, expected), true);
  assert.equal(validateRollingScenePackWireV1({ ...pack, entryStateHash: "wrong" }, expected), false);
  assert.equal(validateRollingScenePackWireV1({ ...pack, scenes: [scene, scene, scene, scene] }, expected), false);
  assert.equal(rollingDirectorProfilesV1.scenePack.maximumCards, 3);
});
