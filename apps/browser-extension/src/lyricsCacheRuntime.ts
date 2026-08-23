import {
  isLyricsLookupResponseV0,
  lookupResponseContainsCandidate,
  type LyricsCandidateV0,
  type LyricsLookupResponseV0,
} from "@lyricstage/lyrics";
import {
  backgroundStorageKeys,
  boundedStorageRecord,
  localLyricsByteLimit,
  lyricsCacheByteLimit,
  lyricsCacheLimit,
  type StoredLocalLyrics,
  type StoredLocalLyricsEntry,
  type StoredLyricsCache,
} from "./backgroundStorage";

interface LocalStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export class IssuedLyricsResponseLedger {
  readonly #entries = new Map<number, {
    expiresAtUnixMs: number;
    fingerprint: string;
    response: LyricsLookupResponseV0;
  }>();
  #sequence = 0;

  remember(fingerprint: string, response: LyricsLookupResponseV0, now = Date.now()): void {
    this.#prune(now);
    this.#entries.set(++this.#sequence, {
      expiresAtUnixMs: now + 30 * 60 * 1000,
      fingerprint,
      response,
    });
    while (this.#entries.size > 24) {
      const oldest = this.#entries.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  find(
    fingerprint: string,
    candidate: LyricsCandidateV0,
    now = Date.now(),
  ): LyricsLookupResponseV0 | undefined {
    this.#prune(now);
    return [...this.#entries.values()].find((entry) =>
      entry.fingerprint === fingerprint && lookupResponseContainsCandidate(entry.response, candidate)
    )?.response;
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAtUnixMs <= now) this.#entries.delete(key);
    }
  }
}

const isStorageQuotaError = (error: unknown): boolean => {
  const candidate = error as { name?: unknown; message?: unknown } | undefined;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  return /quota|quota_bytes/u.test(`${name} ${message}`.toLowerCase());
};

export const writeStorageRecordWithQuotaEviction = async <T>(
  setValues: (values: Record<string, unknown>) => Promise<void>,
  storageKey: string,
  record: Record<string, T>,
  minimumEntries: number,
): Promise<void> => {
  let entries = Object.entries(record);
  while (true) {
    try {
      await setValues({ [storageKey]: Object.fromEntries(entries) });
      return;
    } catch (error) {
      if (!isStorageQuotaError(error) || entries.length <= minimumEntries) throw error;
      const nextCount = Math.max(minimumEntries, Math.floor(entries.length * 0.75));
      entries = entries.slice(0, nextCount < entries.length ? nextCount : entries.length - 1);
    }
  }
};

export class LyricsStorageRepository {
  readonly #issued = new IssuedLyricsResponseLedger();

  constructor(readonly storage: LocalStorageArea) {}

  rememberIssued(fingerprint: string, response: LyricsLookupResponseV0): void {
    this.#issued.remember(fingerprint, response);
  }

  async localEntry(trackID: string): Promise<StoredLocalLyricsEntry | undefined> {
    return (await this.#readLocal())[trackID];
  }

  async saveLocal(trackID: string, entry: StoredLocalLyricsEntry): Promise<void> {
    let stored: StoredLocalLyrics = {};
    try { stored = await this.#readLocal(); } catch { /* Replace an unreadable cache. */ }
    const entries = Object.entries(stored).filter(([key, value]) =>
      key !== trackID && typeof value?.updatedAtUnixMs === "number" && typeof value.rawLyrics === "string"
    );
    entries.push([trackID, entry]);
    const bounded = boundedStorageRecord(
      entries.sort((left, right) => left[0] === trackID ? -1 : right[0] === trackID ? 1
        : right[1].updatedAtUnixMs - left[1].updatedAtUnixMs),
      lyricsCacheLimit,
      localLyricsByteLimit,
    );
    if (!bounded[trackID]) throw new Error("local-lyrics-storage-budget-exceeded");
    await writeStorageRecordWithQuotaEviction(
      (values) => this.storage.set(values), backgroundStorageKeys.localLyrics, bounded, 1,
    );
  }

  async cached(trackID: string, fingerprint: string, now = Date.now()): Promise<LyricsLookupResponseV0 | undefined> {
    const entry = (await this.#readLyrics())[trackID];
    if (!entry || entry.fingerprint !== fingerprint || entry.expiresAtUnixMs <= now
      || !isLyricsLookupResponseV0(entry.response)) return undefined;
    return { ...entry.response, source: "cache" };
  }

  async issued(
    fingerprint: string,
    candidate: LyricsCandidateV0,
    now = Date.now(),
  ): Promise<LyricsLookupResponseV0 | undefined> {
    const memory = this.#issued.find(fingerprint, candidate, now);
    if (memory) return memory;
    const stored = await this.#readLyrics();
    return Object.values(stored).find((entry) => entry?.fingerprint === fingerprint
      && entry.expiresAtUnixMs > now && isLyricsLookupResponseV0(entry.response)
      && lookupResponseContainsCandidate(entry.response, candidate))?.response;
  }

  async save(
    cacheKey: string,
    fingerprint: string,
    response: LyricsLookupResponseV0,
    ttlMilliseconds: number,
    requireEntry = false,
  ): Promise<void> {
    const now = Date.now();
    let stored: StoredLyricsCache = {};
    try { stored = await this.#readLyrics(); } catch { /* Replace an unreadable cache. */ }
    const entries = Object.entries(stored).filter(([key, entry]) => key !== cacheKey
      && entry?.expiresAtUnixMs > now && isLyricsLookupResponseV0(entry.response));
    entries.push([cacheKey, {
      fingerprint, expiresAtUnixMs: now + ttlMilliseconds, updatedAtUnixMs: now, response,
    }]);
    const bounded = boundedStorageRecord(
      entries.sort((left, right) => left[0] === cacheKey ? -1 : right[0] === cacheKey ? 1
        : (right[1].updatedAtUnixMs ?? right[1].expiresAtUnixMs)
          - (left[1].updatedAtUnixMs ?? left[1].expiresAtUnixMs)),
      lyricsCacheLimit,
      lyricsCacheByteLimit,
    );
    if (requireEntry && !bounded[cacheKey]) throw new Error("lyrics-storage-budget-exceeded");
    await writeStorageRecordWithQuotaEviction(
      (values) => this.storage.set(values), backgroundStorageKeys.lyricsCache, bounded, requireEntry ? 1 : 0,
    );
  }

  async #readLyrics(): Promise<StoredLyricsCache> {
    const value = (await this.storage.get(backgroundStorageKeys.lyricsCache))[backgroundStorageKeys.lyricsCache];
    return value && typeof value === "object" && !Array.isArray(value) ? value as StoredLyricsCache : {};
  }

  async #readLocal(): Promise<StoredLocalLyrics> {
    const value = (await this.storage.get(backgroundStorageKeys.localLyrics))[backgroundStorageKeys.localLyrics];
    return value && typeof value === "object" && !Array.isArray(value) ? value as StoredLocalLyrics : {};
  }
}
