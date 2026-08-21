import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readExtensionPreferences,
  saveExtensionPreferences,
} from "./extensionPreferences";

describe("extension appearance preferences", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to the full renderer outside the extension", async () => {
    vi.stubGlobal("chrome", undefined);
    await expect(readExtensionPreferences()).resolves.toEqual({ lightweight: false, vjMode: false });
  });

  it("persists and restores lightweight mode through extension storage", async () => {
    const records: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: records[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => Object.assign(records, values)),
        },
      },
    });
    await saveExtensionPreferences({ lightweight: true, vjMode: true });
    await expect(readExtensionPreferences()).resolves.toEqual({ lightweight: true, vjMode: true });
  });
});
