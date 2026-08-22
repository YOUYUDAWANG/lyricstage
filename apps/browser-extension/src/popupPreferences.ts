import type { ExtensionPreferencesV0 } from "../../stage/src/playback/extensionPreferences";

export interface PopupPreferenceSaveResult {
  preferences: ExtensionPreferencesV0;
  saved: boolean;
}

export const persistPopupPreferencePatch = async (
  current: ExtensionPreferencesV0,
  patch: Partial<ExtensionPreferencesV0>,
  persist: (preferences: ExtensionPreferencesV0) => Promise<void>,
): Promise<PopupPreferenceSaveResult> => {
  const next = { ...current, ...patch };
  try {
    await persist(next);
    return { preferences: next, saved: true };
  } catch {
    return { preferences: current, saved: false };
  }
};
