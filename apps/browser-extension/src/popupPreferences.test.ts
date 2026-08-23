import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { persistPopupPreferencePatch } from "./popupPreferences";

describe("popup preference persistence", () => {
  it("keeps the optimistic preference after persistence succeeds", async () => {
    const persist = vi.fn(async () => undefined);
    await expect(persistPopupPreferencePatch(
      { lightweight: false, vjMode: false, rollingDirectorV1: "off" },
      { vjMode: true },
      persist,
    )).resolves.toEqual({ preferences: { lightweight: false, vjMode: true, rollingDirectorV1: "off" }, saved: true });
    expect(persist).toHaveBeenCalledWith({ lightweight: false, vjMode: true, rollingDirectorV1: "off" });
  });

  it("restores the previous preference after persistence fails", async () => {
    await expect(persistPopupPreferencePatch(
      { lightweight: true, vjMode: false, rollingDirectorV1: "off" },
      { lightweight: false },
      async () => { throw new Error("storage unavailable"); },
    )).resolves.toEqual({ preferences: { lightweight: true, vjMode: false, rollingDirectorV1: "off" }, saved: false });
  });

  it("does not resume hidden vocal analysis when the popup opens", () => {
    const source = readFileSync(new URL("./popup.ts", import.meta.url), "utf8");
    expect(source).not.toContain("youtube-music-resume-pending-audio-analysis");
    expect(source).not.toContain("人声节奏修正");
  });
});
