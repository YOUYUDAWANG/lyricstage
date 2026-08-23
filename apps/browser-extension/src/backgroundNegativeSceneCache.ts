import { stableHash32 } from "@lyricstage/contracts";

export const scenePackSchemaVersion = "scene-pack-v1" as const;

export const negativeSceneCacheIdentityV1 = (
  fingerprint: string,
  bibleIdentity: string,
  fromLineIndex: number,
  entryStateHash: string,
): string => stableHash32({
  version: "rolling-scene-negative-v1",
  schemaVersion: scenePackSchemaVersion,
  fingerprint,
  bibleIdentity,
  fromLineIndex,
  entryStateHash,
});

export class RollingSceneNegativeCacheV1 {
  private readonly entries = new Map<string, { expiresAtUnixMs: number; reason: string }>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly maximumEntries = 100,
  ) {}

  reason(key: string, nowUnixMs = Date.now()): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtUnixMs <= nowUnixMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.reason;
  }

  remember(key: string, reason: string, nowUnixMs = Date.now()): void {
    for (const [candidateKey, entry] of this.entries) {
      if (entry.expiresAtUnixMs <= nowUnixMs) this.entries.delete(candidateKey);
    }
    this.entries.set(key, { expiresAtUnixMs: nowUnixMs + this.ttlMs, reason });
    while (this.entries.size > this.maximumEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}
