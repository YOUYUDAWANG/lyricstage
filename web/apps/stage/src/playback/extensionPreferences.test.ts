import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readLyricsOffset,
  readExtensionPreferences,
  saveLyricsOffset,
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

  it("stores a bounded per-track lyrics offset and clears zero", async () => {
    const records: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: records[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => Object.assign(records, values)),
        },
      },
    });
    const identity = '["track-a","Song A","Artist",180]';
    await saveLyricsOffset(identity, 12_000);
    await expect(readLyricsOffset(identity)).resolves.toBe(10_000);
    await expect(readLyricsOffset('["track-b","Song B","Artist",180]')).resolves.toBe(0);
    await saveLyricsOffset(identity, 0);
    await expect(readLyricsOffset(identity)).resolves.toBe(0);
  });

  it("serializes concurrent offset writes so different identities are retained and the latest value wins", async () => {
    const records: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            const snapshot = records[key];
            await Promise.resolve();
            return { [key]: snapshot };
          }),
          set: vi.fn(async (values: Record<string, unknown>) => {
            await Promise.resolve();
            Object.assign(records, values);
          }),
        },
      },
    });

    const first = '["track-a","Song A","Artist",180]';
    const second = '["track-b","Song B","Artist",210]';
    await Promise.all([
      saveLyricsOffset(first, 500),
      saveLyricsOffset(second, -1_000),
      saveLyricsOffset(first, 1_500),
    ]);

    await expect(readLyricsOffset(first)).resolves.toBe(1_500);
    await expect(readLyricsOffset(second)).resolves.toBe(-1_000);
  });

  it("continues the serialized queue after one storage failure", async () => {
    const records: Record<string, unknown> = {};
    let shouldFail = true;
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: records[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            if (shouldFail) {
              shouldFail = false;
              throw new Error("storage unavailable");
            }
            Object.assign(records, values);
          }),
        },
      },
    });

    await expect(saveLyricsOffset("track-failed", 500)).rejects.toThrow("storage unavailable");
    await expect(saveLyricsOffset("track-recovered", 750)).resolves.toBeUndefined();
    await expect(readLyricsOffset("track-recovered")).resolves.toBe(750);
  });

  it("makes reads wait for an already queued write", async () => {
    const records: Record<string, unknown> = {};
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: records[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            await writeGate;
            Object.assign(records, values);
          }),
        },
      },
    });

    const pendingWrite = saveLyricsOffset("track-read-after-write", 1_250);
    await Promise.resolve();
    await Promise.resolve();
    const pendingRead = readLyricsOffset("track-read-after-write");
    releaseWrite();

    await expect(pendingWrite).resolves.toBeUndefined();
    await expect(pendingRead).resolves.toBe(1_250);
  });
});
