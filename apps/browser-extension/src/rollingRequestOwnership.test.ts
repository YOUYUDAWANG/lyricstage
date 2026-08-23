import { describe, expect, it } from "vitest";
import { RollingRequestOwnership } from "./rollingRequestOwnership";

describe("RollingRequestOwnership", () => {
  it("does not let an older asynchronous activation replace a newer track", () => {
    const ownership = new RollingRequestOwnership();
    const old = ownership.begin("tab:1", "scene");
    const latest = ownership.begin("tab:1", "scene");
    const active = ownership.activate("tab:1", "fingerprint-b", latest.ownerOrder);

    expect(active.accepted).toBe(true);
    expect(ownership.activate("tab:1", "fingerprint-a", old.ownerOrder).accepted).toBe(false);
    expect(ownership.isCurrent("tab:1", "fingerprint-b", active.generation)).toBe(true);
  });

  it("keeps the newest seek alive when an older window activates late", () => {
    const ownership = new RollingRequestOwnership();
    const old = ownership.begin("tab:1", "scene");
    const latest = ownership.begin("tab:1", "scene");
    const active = ownership.activate("tab:1", "same-track", latest.ownerOrder);
    const latestScene = ownership.activateScene(
      "tab:1", "same-track", active.generation, "window-b", latest.sceneOrder!,
    );
    const oldBase = ownership.activate("tab:1", "same-track", old.ownerOrder);
    const oldScene = ownership.activateScene(
      "tab:1", "same-track", oldBase.generation, "window-a", old.sceneOrder!,
    );

    expect(oldBase.accepted).toBe(true);
    expect(oldScene.accepted).toBe(false);
    expect(latestScene.signal.aborted).toBe(false);
    expect(ownership.isSceneCurrent("tab:1", "same-track", active.generation, latestScene.epoch)).toBe(true);
  });

  it("aborts only the previous Scene Pack when a newer seek supersedes it", () => {
    const ownership = new RollingRequestOwnership();
    const first = ownership.begin("tab:1", "scene");
    const base = ownership.activate("tab:1", "same-track", first.ownerOrder);
    const sceneA = ownership.activateScene(
      "tab:1", "same-track", base.generation, "window-a", first.sceneOrder!,
    );
    const second = ownership.begin("tab:1", "scene");
    const sameBase = ownership.activate("tab:1", "same-track", second.ownerOrder);
    const sceneB = ownership.activateScene(
      "tab:1", "same-track", sameBase.generation, "window-b", second.sceneOrder!,
    );

    expect(sceneB.superseded).toBe(true);
    expect(sceneA.signal.aborted).toBe(true);
    expect(sceneB.signal.aborted).toBe(false);
    expect(base.signal.aborted).toBe(false);
  });
});
