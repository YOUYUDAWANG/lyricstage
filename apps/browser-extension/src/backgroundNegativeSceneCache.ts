import { stableHash32 } from "@lyricstage/contracts";
import type { SceneCardV1 } from "@lyricstage/performance";
import type { RollingGenerationLedgerV1 } from "./backgroundStorage";

export const scenePackSchemaVersion = "window-intent-v2" as const;

export const rollingSceneProviderBudgetMsV2 = (remainingProviderMs: number): number =>
  Math.max(1, Math.min(12_000, remainingProviderMs));

export const rollingGenerationLimitsV2 = {
  maximumProviderAttempts: 18,
  maximumProviderMs: 120_000,
  maximumSceneRequests: 8,
} as const;

export const rollingRequestAllowedV2 = (
  ledger: RollingGenerationLedgerV1,
  kind: "bible" | "scene-pack",
): boolean => ledger.providerAttempts < rollingGenerationLimitsV2.maximumProviderAttempts
  && ledger.providerMs < rollingGenerationLimitsV2.maximumProviderMs
  && (kind === "bible"
    ? ledger.consecutiveFailures < 3 && ledger.bibleLogicalRequests < 1
    : ledger.sceneLogicalRequests < rollingGenerationLimitsV2.maximumSceneRequests);

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

export const semanticCueBudgetExceededV2 = (
  accepted: readonly Pick<SceneCardV1, "semanticCueCount">[],
  generated: readonly Pick<SceneCardV1, "semanticCueCount">[],
  maximum = 32,
): boolean => [...accepted, ...generated]
  .reduce((total, card) => total + (card.semanticCueCount ?? 0), 0) > maximum;

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
