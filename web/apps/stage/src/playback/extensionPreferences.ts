export interface ExtensionPreferencesV0 {
  lightweight: boolean;
  vjMode: boolean;
}

const storageKey = "lyricstage-preferences-v0";

interface StorageLocal {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

const extensionStorage = (): StorageLocal | undefined =>
  (globalThis as typeof globalThis & {
    chrome?: { storage?: { local?: StorageLocal } };
  }).chrome?.storage?.local;

export const readExtensionPreferences = async (): Promise<ExtensionPreferencesV0> => {
  const storage = extensionStorage();
  if (!storage) return { lightweight: false, vjMode: false };
  const stored = (await storage.get(storageKey))[storageKey] as Partial<ExtensionPreferencesV0> | undefined;
  return {
    lightweight: stored?.lightweight === true,
    vjMode: stored?.vjMode === true,
  };
};

export const saveExtensionPreferences = async (
  preferences: ExtensionPreferencesV0,
): Promise<void> => {
  const storage = extensionStorage();
  if (!storage) return;
  await storage.set({ [storageKey]: preferences });
};
