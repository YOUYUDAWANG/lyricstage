import { describe, expect, it } from "vitest";
import {
  negativeSceneCacheIdentityV1,
  RollingSceneNegativeCacheV1,
  semanticCueBudgetExceededV2,
} from "./backgroundNegativeSceneCache";

describe("rolling negative scene cache", () => {
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
