export const ytmShellStorageKey = "lyricstage-ytm-shell-v1";

interface ShellStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

const localStorageArea = (): ShellStorage | undefined => (
  globalThis as typeof globalThis & { chrome?: { storage?: { local?: ShellStorage } } }
).chrome?.storage?.local;

export const readYtmShellEnabled = async (): Promise<boolean> => {
  const storage = localStorageArea();
  if (!storage) return true;
  return (await storage.get(ytmShellStorageKey))[ytmShellStorageKey] !== false;
};

export const saveYtmShellEnabled = async (enabled: boolean): Promise<void> => {
  await localStorageArea()?.set({ [ytmShellStorageKey]: enabled });
};
