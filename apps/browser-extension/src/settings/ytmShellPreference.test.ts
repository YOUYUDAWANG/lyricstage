import { afterEach, describe, expect, it, vi } from "vitest";
import { readYtmShellEnabled, saveYtmShellEnabled, ytmShellStorageKey } from "./ytmShellPreference";

describe("YouTube Music shell preference", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "chrome");
  });

  it("defaults to the Apple Music shell without stored configuration", async () => {
    expect(await readYtmShellEnabled()).toBe(true);
  });

  it("honors the explicit native YouTube Music opt-out", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      chrome: { storage: { local: { get: vi.fn(async () => ({ [ytmShellStorageKey]: false })), set } } },
    });
    expect(await readYtmShellEnabled()).toBe(false);
    await saveYtmShellEnabled(true);
    expect(set).toHaveBeenCalledWith({ [ytmShellStorageKey]: true });
  });
});
