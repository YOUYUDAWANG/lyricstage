import { describe, expect, it, vi } from "vitest";

import { realisticLyrics } from "./rollingDirectorRealDataFixture";
import {
  directorBibleRequestProfileV1,
  executeDirectorBYOKProfileV1,
  scenePackRequestProfileV1,
  type DirectorBYOKConfigurationV1,
} from "./directorProviders";
import {
  checkpointRollingPerformanceStateV1,
  compileDirectorPlanFromRollingV1,
} from "./rollingDirector";


const configuration: DirectorBYOKConfigurationV1 = {
  version: "lyricstage-director-byok-v1",
  primary: { protocol: "openai-compatible", endpoint: "https://provider.test/v1", model: "official-model", apiKey: "fixture-key" },
};

describe("rolling director realistic whole-song integration", () => {
  it("repairs Bible and Scene independently while retaining safe AI authorship", async () => {
    const lyrics = realisticLyrics();
    const bibleFetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      version: "director-bible-v1",
      premise: "A captive confession repeatedly strikes the same fragile boundary until it becomes a shared flare.",
      emotionalArc: "Private fixation accelerates through rupture, briefly suspends, and returns as an exposed final demand.",
      world: {
        spatialMode: "cinematic", motionLaw: "fracture", artworkRole: "boundary", texture: "glass",
        depth: 0.76, fluidity: 0.34, elasticity: 0.71, atmosphere: 0.84,
        rationale: "Glass tension turns repeated bilingual commands into accumulating fractures around the cover boundary.",
      },
      acts: [{ id: "invalid-gap", role: "setup", fromLineIndex: 4, toLineIndex: 19 }],
      motifActor: { family: "firework", origin: "lyric", relationship: "Each repeated command stores pressure before a final flare.", states: [] },
      signatureAnchors: [], quietWindows: [],
      layoutBudget: { baseLayout: "railTrailing", maximumTransitions: 2, proposedTransitions: [] },
    }) } }] }), { status: 200 }));
    const bibleResult = await executeDirectorBYOKProfileV1(
      configuration,
      { lyrics, promptInput: { track: { trackID: "rolling-fixture", title: "Signal Atlas", artist: "LyricStage Fixtures", durationMs: 206_000 }, lines: lyrics.lines } },
      directorBibleRequestProfileV1,
      bibleFetch as typeof fetch,
    );
    expect(bibleResult.response).toMatchObject({
      world: { spatialMode: "cinematic", motionLaw: "fracture", texture: "glass" },
      motifActor: { family: "firework" },
      layoutBudget: { baseLayout: "railTrailing" },
    });
    const firstAnchor = bibleResult.response.signatureAnchors[0]!;
    const requestedFrom = firstAnchor.fromLineIndex;
    const anchorStartMs = lyrics.lines.find((line) => line.lineIndex === requestedFrom)!.fromMs;
    const requestedTo = lyrics.lines.filter((line) => line.lineIndex >= requestedFrom && line.toMs - anchorStartMs <= 60_000).at(-1)!.lineIndex;
    const state = checkpointRollingPerformanceStateV1(lyrics, bibleResult.response, requestedFrom)!;
    const sceneFetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      sections: [{
        fromLineIndex: requestedFrom, toLineIndex: requestedTo,
        intention: "Let the first command gather pressure as a paper-cut incision without moving the readable lyric master.",
        artDirection: "paperCut", typography: "jpMincho", presentation: "section",
        gestures: [{ primitive: "unregistered.explosion", expectedText: "rewritten lyric" }],
        effects: [{ primary: { primitive: "unregistered.effect" } }],
      }],
    }) } }] }), { status: 200 }));
    const sceneResult = await executeDirectorBYOKProfileV1(
      configuration,
      {
        lyrics, bible: bibleResult.response, state,
        promptInput: { bible: bibleResult.response, state, fromLineIndex: requestedFrom, toLineIndex: requestedTo, lines: lyrics.lines },
      },
      scenePackRequestProfileV1,
      sceneFetch as typeof fetch,
    );
    expect(sceneResult.response).toHaveLength(1);
    expect(sceneResult.response[0]).toMatchObject({ artDirection: "paperCut", typography: "jpMincho", presentation: "section" });
    expect(sceneResult.response[0]!.gestures.every((gesture) => !String(gesture.primitive).startsWith("unregistered"))).toBe(true);
    expect(sceneResult.response[0]!.effects.every((effect) => !String(effect.primary.primitive).startsWith("unregistered"))).toBe(true);
    const plan = compileDirectorPlanFromRollingV1(lyrics, bibleResult.response, sceneResult.response, "ai");
    expect(plan.source).toBe("ai");
    expect(plan.sections.some((section) => section.artDirection === "paperCut")).toBe(true);
    expect(plan.gestures.length).toBeGreaterThanOrEqual(2);
    expect(plan.effects.length).toBeGreaterThanOrEqual(1);
    expect(bibleFetch).toHaveBeenCalledTimes(1);
    expect(sceneFetch).toHaveBeenCalledTimes(1);
  });
});
