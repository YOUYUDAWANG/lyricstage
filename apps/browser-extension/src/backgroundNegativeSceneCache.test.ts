import { describe, expect, it } from "vitest";
import {
  negativeSceneCacheIdentityV1,
  RollingSceneNegativeCacheV1,
  rollingGenerationLimitsV2,
  rollingRequestAllowedV2,
  rollingSceneProviderBudgetMsV2,
  semanticCueBudgetExceededV2,
} from "./backgroundNegativeSceneCache";

describe("rolling negative scene cache", () => {
  it("finishes a Scene request before the 35-second refill runway expires", () => {
    expect(rollingSceneProviderBudgetMsV2(90_000)).toBe(12_000);
    expect(rollingSceneProviderBudgetMsV2(7_500)).toBe(7_500);
    expect(rollingSceneProviderBudgetMsV2(-10)).toBe(1);
  });

  it("keeps later Scene windows eligible after transient failures while retaining hard safety ceilings", () => {
    const ledger = {
      fingerprint: "fixture", generation: 1, bibleLogicalRequests: 1, sceneLogicalRequests: 4,
      providerAttempts: 9, providerMs: 36_000, consecutiveFailures: 4, generatedCoverage: [],
    };
    expect(rollingRequestAllowedV2(ledger, "scene-pack")).toBe(true);
    expect(rollingRequestAllowedV2({ ...ledger, providerAttempts: rollingGenerationLimitsV2.maximumProviderAttempts }, "scene-pack")).toBe(false);
    expect(rollingRequestAllowedV2({ ...ledger, providerMs: rollingGenerationLimitsV2.maximumProviderMs }, "scene-pack")).toBe(false);
    expect(rollingRequestAllowedV2({ ...ledger, sceneLogicalRequests: rollingGenerationLimitsV2.maximumSceneRequests }, "scene-pack")).toBe(false);
    expect(rollingRequestAllowedV2(ledger, "bible")).toBe(false);
  });

  it("binds failures to fingerprint, Bible, range, state, and schema", () => {
    const base = negativeSceneCacheIdentityV1("provider-a", "bible-a", 4, "state-a");
    expect(negativeSceneCacheIdentityV1("provider-b", "bible-a", 4, "state-a")).not.toBe(base);
    expect(negativeSceneCacheIdentityV1("provider-a", "bible-b", 4, "state-a")).not.toBe(base);
    expect(negativeSceneCacheIdentityV1("provider-a", "bible-a", 5, "state-a")).not.toBe(base);
    expect(negativeSceneCacheIdentityV1("provider-a", "bible-a", 4, "state-b")).not.toBe(base);
  });

  it("expires briefly and evicts the oldest bounded entry", () => {
    const expiring = new RollingSceneNegativeCacheV1(60_000, 2);
    expiring.remember("a", "first", 1_000);
    expect(expiring.reason("a", 60_999)).toBe("first");
    expect(expiring.reason("a", 61_000)).toBeUndefined();

    const bounded = new RollingSceneNegativeCacheV1(60_000, 2);
    bounded.remember("a", "first", 1_000);
    bounded.remember("b", "second", 2_000);
    bounded.remember("c", "third", 3_000);
    expect(bounded.reason("a", 3_000)).toBeUndefined();
    expect(bounded.reason("b", 3_000)).toBe("second");
    bounded.delete("b");
    expect(bounded.reason("b", 3_000)).toBeUndefined();
  });

  it("enforces the whole-song semantic cue ceiling", () => {
    expect(semanticCueBudgetExceededV2(
      [{ semanticCueCount: 6 }, { semanticCueCount: 6 }, { semanticCueCount: 6 }],
      [{ semanticCueCount: 6 }, { semanticCueCount: 6 }, { semanticCueCount: 2 }],
    )).toBe(false);
    expect(semanticCueBudgetExceededV2(
      [{ semanticCueCount: 6 }, { semanticCueCount: 6 }, { semanticCueCount: 6 }],
      [{ semanticCueCount: 6 }, { semanticCueCount: 6 }, { semanticCueCount: 3 }],
    )).toBe(true);
  });
});
