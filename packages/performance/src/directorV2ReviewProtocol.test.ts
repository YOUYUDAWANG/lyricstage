import { describe, expect, it } from "vitest";
import { directorV2ManualFixtures } from "./directorV2Fixtures";
import {
  createDirectorV2BlindReviewSessionV1,
  createDirectorV2CombinedGateReportV1,
  createDirectorV2GateReportV1,
  createEmptyDirectorV2ArtGateReviewV1,
  directorV2BlindLabelsV1,
  directorV2HardGatesV1,
  directorV2ReviewDimensionsV1,
  type DirectorV2ArtGateReviewV1,
  type DirectorV2BlindReviewSessionV1,
  type DirectorV2FixtureReviewV1,
} from "./directorV2ReviewProtocol";

const fixtureIDs = directorV2ManualFixtures.map(({ id }) => id);

const completeFixture = (
  fixture: DirectorV2FixtureReviewV1,
  session: DirectorV2BlindReviewSessionV1,
): void => {
  (["A", "B", "C", "D"] as const).forEach((variantID) => {
    directorV2ReviewDimensionsV1.forEach(({ id }) => {
      fixture.variants[variantID].scores[id] = variantID === "B" ? 5 : 3;
    });
    fixture.variants[variantID].recall = {
      motif: "a displaced line",
      eventOne: "the line separated",
      eventTwo: "the missing fragment returned",
      returnOrResolution: "the displaced fragment closed the line",
      chorusDifference: "the final chorus completed the earlier opening",
      restrainedSegment: "the verse before the second chorus",
      wrongPositionAction: "one cut felt premature",
      motifConfirmed: variantID === "B" ? "pass" : "fail",
      twoEventsConfirmed: variantID === "B" ? "pass" : "fail",
    };
  });
  const assignment = session.assignments.find((candidate) => candidate.fixtureID === fixture.fixtureID)!;
  const bLabel = assignment.labelByVariant.B;
  fixture.comparisons = { bOverA: bLabel, bOverC: bLabel, bOverD: bLabel };
  fixture.grayscaleDistinct = "pass";
  fixture.chorusEscalationAndResolution = "pass";
  fixture.instrumentalGapAlive = "pass";
};

const completePassingReview = (
  session: DirectorV2BlindReviewSessionV1,
): DirectorV2ArtGateReviewV1 => {
  const review = createEmptyDirectorV2ArtGateReviewV1(fixtureIDs, session.reviewerID);
  Object.values(review.fixtures).forEach((fixture) => completeFixture(fixture, session));
  directorV2HardGatesV1.forEach(({ id }) => { review.hardGates[id] = "pass"; });
  return review;
};

describe("Director V2 blind art-gate protocol", () => {
  it("creates deterministic, neutral, per-fixture assignments", () => {
    const first = createDirectorV2BlindReviewSessionV1(fixtureIDs, "external-reviewer");
    const repeated = createDirectorV2BlindReviewSessionV1(fixtureIDs, "external-reviewer");
    expect(repeated).toEqual(first);
    expect(new Set(first.fixtureOrder)).toEqual(new Set(fixtureIDs));
    first.assignments.forEach((assignment) => {
      expect(new Set(assignment.playbackOrder)).toEqual(new Set(directorV2BlindLabelsV1));
      expect(new Set(Object.values(assignment.variantByLabel))).toEqual(new Set(["A", "B", "C", "D"]));
      expect(Object.keys(assignment.variantByLabel).every((label) => !/[ABCD]/.test(label))).toBe(true);
    });
    for (let index = 1; index < first.assignments.length; index += 1) {
      expect(first.assignments[index]!.variantByLabel).not.toEqual(first.assignments[index - 1]!.variantByLabel);
    }
  });

  it("gives different reviewers different order and mappings", () => {
    const owner = createDirectorV2BlindReviewSessionV1(fixtureIDs, "owner");
    const external = createDirectorV2BlindReviewSessionV1(fixtureIDs, "external");
    expect(external.fixtureOrder).not.toEqual(owner.fixtureOrder);
    expect(external.assignments.map(({ variantByLabel }) => variantByLabel))
      .not.toEqual(owner.assignments.map(({ variantByLabel }) => variantByLabel));
  });

  it("never turns incomplete human input into an artistic pass", () => {
    const session = createDirectorV2BlindReviewSessionV1(fixtureIDs, "owner");
    const review = createEmptyDirectorV2ArtGateReviewV1(fixtureIDs, session.reviewerID);
    const report = createDirectorV2GateReportV1(session, review);
    expect(report.artGate).toBe("awaiting-review");
    expect(report.aiShadow).toBe("blocked");
    expect(report.requiredFixes).toContain("完成所有四个盲测版本的 1–5 分评分、即时回忆和三组比较。");
  });

  it("allows AI shadow only after every strict product threshold and hard gate passes", () => {
    const session = createDirectorV2BlindReviewSessionV1(fixtureIDs, "owner");
    const report = createDirectorV2GateReportV1(session, completePassingReview(session));
    expect(report.artGate).toBe("pass");
    expect(report.aiShadow).toBe("blocked");
    expect(report.counts).toEqual({ bOverA: 5, bOverC: 5, bOverD: 5, recall: 5, total: 5 });
    expect(report.rows.every(({ verdict }) => verdict === "pass")).toBe(true);
    expect(report.requiredFixes).toEqual([]);
  });

  it("allows AI shadow only after two distinct reviewers independently pass", () => {
    const ownerSession = createDirectorV2BlindReviewSessionV1(fixtureIDs, "owner");
    const externalSession = createDirectorV2BlindReviewSessionV1(fixtureIDs, "external");
    const owner = createDirectorV2GateReportV1(ownerSession, completePassingReview(ownerSession));
    const external = createDirectorV2GateReportV1(externalSession, completePassingReview(externalSession));
    expect(createDirectorV2CombinedGateReportV1([owner]).aiShadow).toBe("blocked");
    expect(createDirectorV2CombinedGateReportV1([owner, external])).toMatchObject({
      artGate: "pass",
      aiShadow: "allowed",
      reviewerIDs: ["owner", "external"],
    });
  });

  it("blocks the gate immediately when one engineering hard gate fails", () => {
    const session = createDirectorV2BlindReviewSessionV1(fixtureIDs, "owner");
    const review = completePassingReview(session);
    review.hardGates.surfaceSeek = "fail";
    const report = createDirectorV2GateReportV1(session, review);
    expect(report.artGate).toBe("fail");
    expect(report.aiShadow).toBe("blocked");
    expect(report.requiredFixes[0]).toContain("停止艺术调试");
  });

  it("reports a hard-gate failure even before the human review is complete", () => {
    const session = createDirectorV2BlindReviewSessionV1(fixtureIDs, "owner");
    const review = createEmptyDirectorV2ArtGateReviewV1(fixtureIDs, session.reviewerID);
    review.hardGates.runtimeError = "fail";
    const report = createDirectorV2GateReportV1(session, review);
    expect(report.artGate).toBe("fail");
    expect(report.aiShadow).toBe("blocked");
  });

  it("keeps one classified local weakness conditional and AI shadow blocked", () => {
    const session = createDirectorV2BlindReviewSessionV1(fixtureIDs, "owner");
    const review = completePassingReview(session);
    const weakFixture = review.fixtures[fixtureIDs[0]!]!;
    weakFixture.comparisons.bOverD = "same";
    weakFixture.localizedFailureCause = "primitive-insufficient";
    const report = createDirectorV2GateReportV1(session, review);
    expect(report.artGate).toBe("conditional-pass");
    expect(report.aiShadow).toBe("blocked");
    expect(report.rows.filter(({ verdict }) => verdict === "conditional")).toHaveLength(1);
  });

  it("does not let a localized-failure label excuse reduced readability", () => {
    const session = createDirectorV2BlindReviewSessionV1(fixtureIDs, "owner");
    const review = completePassingReview(session);
    const weakFixture = review.fixtures[fixtureIDs[0]!]!;
    weakFixture.variants.B.scores.readability = 2;
    weakFixture.localizedFailureCause = "primitive-insufficient";
    const report = createDirectorV2GateReportV1(session, review);
    expect(report.artGate).toBe("fail");
    expect(report.aiShadow).toBe("blocked");
  });
});
