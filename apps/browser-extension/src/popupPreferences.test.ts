import { describe, expect, it, vi } from "vitest";
import { persistPopupPreferencePatch } from "./popupPreferences";

describe("popup preference persistence", () => {
  it("keeps the optimistic preference after persistence succeeds", async () => {
    const persist = vi.fn(async () => undefined);
    await expect(persistPopupPreferencePatch(
      { lightweight: false, vjMode: false },
      { vjMode: true },
      persist,
    )).resolves.toEqual({ preferences: { lightweight: false, vjMode: true }, saved: true });
    expect(persist).toHaveBeenCalledWith({ lightweight: false, vjMode: true });
  });

  it("restores the previous preference after persistence fails", async () => {
    await expect(persistPopupPreferencePatch(
      { lightweight: true, vjMode: false },
      { lightweight: false },
      async () => { throw new Error("storage unavailable"); },
    )).resolves.toEqual({ preferences: { lightweight: true, vjMode: false }, saved: false });
  });
});
