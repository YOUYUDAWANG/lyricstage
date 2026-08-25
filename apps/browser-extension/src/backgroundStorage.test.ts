import { describe, expect, it } from "vitest";
import {
  backgroundStorageKeys,
  boundedStorageRecord,
  localLyricsByteLimit,
} from "./backgroundStorage";
import { LyricsStorageRepository } from "./lyricsCacheRuntime";

describe("background storage byte budgets", () => {
  it("measures the serialized UTF-8 bytes rather than string length", () => {
    const entry: [string, { lyrics: string }] = ["newest", { lyrics: "あ".repeat(20) }];
    const exactBytes = new TextEncoder().encode(JSON.stringify(Object.fromEntries([entry]))).byteLength;

    expect(boundedStorageRecord([entry], 10, exactBytes)).toEqual(Object.fromEntries([entry]));
    expect(boundedStorageRecord([entry], 10, exactBytes - 1)).toEqual({});
  });

  it("keeps newest-first ordering while skipping entries that exceed the byte budget", () => {
    const entries: Array<[string, { lyrics: string }]> = [
      ["oversized", { lyrics: "x".repeat(1_000) }],
      ["new", { lyrics: "new" }],
      ["old", { lyrics: "old" }],
    ];
    const twoSmallEntries = Object.fromEntries(entries.slice(1));
    const budget = new TextEncoder().encode(JSON.stringify(twoSmallEntries)).byteLength;

    expect(boundedStorageRecord(entries, 10, budget)).toEqual(twoSmallEntries);
  });

  it("keeps the newly saved local lyrics while pruning the library to its byte budget", async () => {
    const values = new Map<string, unknown>();
    values.set(backgroundStorageKeys.localLyrics, Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`old-${index}`, {
        fingerprint: `old-${index}`,
        fileName: `old-${index}.lrc`,
        rawLyrics: "あ".repeat(80_000),
        updatedAtUnixMs: 1_000 - index,
      }]),
    ));
    const repository = new LyricsStorageRepository({
      get: async (key) => ({ [key]: values.get(key) }),
      set: async (next) => { Object.entries(next).forEach(([key, value]) => values.set(key, value)); },
    });

    await repository.saveLocal("new", {
      fingerprint: "new",
      fileName: "new.lrc",
      rawLyrics: "新".repeat(80_000),
      updatedAtUnixMs: 2_000,
    });

    const stored = values.get(backgroundStorageKeys.localLyrics) as Record<string, unknown>;
    expect(stored.new).toBeDefined();
    expect(Object.keys(stored).length).toBeLessThan(9);
    expect(new TextEncoder().encode(JSON.stringify(stored)).byteLength).toBeLessThanOrEqual(localLyricsByteLimit);
  });

  it("treats an adopted match as a durable track binding across metadata drift and expiry", async () => {
    const values = new Map<string, unknown>();
    values.set(backgroundStorageKeys.lyricsCache, {
      "video-track": {
        fingerprint: "old-title-and-duration",
        expiresAtUnixMs: 1,
        updatedAtUnixMs: 1,
        response: {
          type: "lyrics-lookup-result",
          version: "lyrics-lookup-v0",
          trackID: "video-track",
          status: "match",
          source: "network",
          match: {
            provider: "lrclib",
            id: "durable",
            title: "Song",
            artist: "Artist",
            durationMs: 180_000,
            syncedLyrics: "[00:01.00]cached forever",
          },
          candidates: [],
        },
      },
    });
    const repository = new LyricsStorageRepository({
      get: async (key) => ({ [key]: values.get(key) }),
      set: async (next) => { Object.entries(next).forEach(([key, value]) => values.set(key, value)); },
    });

    await expect(repository.cached("video-track", "new-title-and-duration", 10_000)).resolves.toMatchObject({
      status: "match",
      source: "cache",
      match: { id: "durable" },
    });

    await repository.save("other-track", "other", {
      type: "lyrics-lookup-result",
      version: "lyrics-lookup-v0",
      trackID: "other-track",
      status: "miss",
      source: "network",
      candidates: [],
    }, 60_000);
    expect((values.get(backgroundStorageKeys.lyricsCache) as Record<string, unknown>)["video-track"])
      .toBeDefined();
  });
});
