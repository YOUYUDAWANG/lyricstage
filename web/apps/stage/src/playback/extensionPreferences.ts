export interface ExtensionPreferencesV0 {
  lightweight: boolean;
  vjMode: boolean;
}

const storageKey = "lyricstage-preferences-v0";
const lyricsOffsetStorageKey = "lyricstage-lyrics-offsets-v1";
const maxLyricsOffsetEntries = 200;
let lyricsOffsetWriteQueue: Promise<void> = Promise.resolve();

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

interface StoredLyricsOffsetV0 {
  recordingIdentity: string;
  offsetMs: number;
}

const sanitizeLyricsOffset = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(10_000, Math.max(-10_000, Math.round(value)));
};

const sanitizeLyricsOffsets = (value: unknown): StoredLyricsOffsetV0[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: StoredLyricsOffsetV0[] = [];
  for (const candidate of value.slice(-maxLyricsOffsetEntries).reverse()) {
    if (!candidate || typeof candidate !== "object") continue;
    const recordingIdentity = "recordingIdentity" in candidate && typeof candidate.recordingIdentity === "string"
      ? candidate.recordingIdentity.trim()
      : "";
    if (!recordingIdentity || recordingIdentity.length > 256 || seen.has(recordingIdentity)) continue;
    const offsetMs = "offsetMs" in candidate ? sanitizeLyricsOffset(candidate.offsetMs) : 0;
    if (offsetMs === 0) continue;
    seen.add(recordingIdentity);
    entries.push({ recordingIdentity, offsetMs });
  }
  return entries.reverse();
};

export const readLyricsOffset = async (recordingIdentity: string): Promise<number> => {
  const storage = extensionStorage();
  const normalizedIdentity = recordingIdentity.trim();
  if (!storage || !normalizedIdentity) return 0;
  await lyricsOffsetWriteQueue;
  const stored = (await storage.get(lyricsOffsetStorageKey))[lyricsOffsetStorageKey];
  return sanitizeLyricsOffsets(stored).find((entry) => entry.recordingIdentity === normalizedIdentity)?.offsetMs ?? 0;
};

export const saveLyricsOffset = async (recordingIdentity: string, offsetMs: number): Promise<void> => {
  const storage = extensionStorage();
  const normalizedIdentity = recordingIdentity.trim();
  if (!storage || !normalizedIdentity || normalizedIdentity.length > 256) return;
  const boundedOffset = sanitizeLyricsOffset(offsetMs);
  const write = lyricsOffsetWriteQueue.then(async () => {
    const stored = (await storage.get(lyricsOffsetStorageKey))[lyricsOffsetStorageKey];
    const entries = sanitizeLyricsOffsets(stored).filter((entry) => entry.recordingIdentity !== normalizedIdentity);
    if (boundedOffset !== 0) entries.push({ recordingIdentity: normalizedIdentity, offsetMs: boundedOffset });
    await storage.set({
      [lyricsOffsetStorageKey]: entries.slice(-maxLyricsOffsetEntries),
    });
  });
  // Keep later writes moving after a failed storage operation while preserving
  // the rejection for the caller that initiated the failed write.
  lyricsOffsetWriteQueue = write.catch(() => undefined);
  await write;
};
