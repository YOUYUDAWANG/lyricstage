import type { DramaticCoverRoleV1 } from "./dramaticScore";

export type DirectorV2FixtureCategory =
  | "fast"
  | "slow-instrumental-gap"
  | "repeated-chorus"
  | "duet-overlap"
  | "long-line";

export type ManualSemanticCueRoleV2 =
  | "refrain"
  | "rupture"
  | "release"
  | "hold"
  | "handoff"
  | "recall";

export type ManualSpatialIntentV2 = "hold" | "split" | "open" | "stack";
export type ManualArcIntentV2 = "hold" | "lift" | "break" | "recall";
export type SignatureRecipeIDV1 = "rupture" | "release" | "recall";
export type SignatureRecipeBranchV1 =
  | "separation"
  | "vacuum"
  | "expansion"
  | "reveal"
  | "traceReturn"
  | "absenceResolve";

export interface ManualSemanticCueV2 {
  id: string;
  version: "semantic-cue-v2";
  role: ManualSemanticCueRoleV2;
  fromLineIndex: number;
  toLineIndex?: number;
  evidenceLineIndices: number[];
  confidence: number;
  focus?: {
    lineIndex: number;
    fromGrapheme: number;
    toGrapheme: number;
    expectedText: string;
  };
}

/**
 * Provider-free authoring input for the expression gate. It deliberately omits
 * transport identity, cache identity, generation, and concrete visual values.
 */
export interface ManualWindowIntentFixtureV2 {
  id: string;
  fromLineIndex: number;
  toLineIndex: number;
  spatialIntent: ManualSpatialIntentV2;
  coverRole: DramaticCoverRoleV1;
  arcIntent: ManualArcIntentV2;
  cues: ManualSemanticCueV2[];
}

/**
 * Provider-authored semantic input. It carries no renderer primitive, timing
 * parameter, color, coordinate, keyframe, gesture, or effect selection.
 */
export interface WindowIntentV2 extends ManualWindowIntentFixtureV2 {
  version: "window-intent-v2";
  bibleIdentity: string;
  entryStateHash: string;
}

export interface ManualSignatureExpectationV1 {
  cueID: string;
  recipe: SignatureRecipeIDV1;
  branch: SignatureRecipeBranchV1;
  observableFact: string;
}

export interface ManualPromiseExpectationV1 {
  promiseID: string;
  sourceCueID: string;
  consumerCueID: string;
  visibleContinuity: string;
}

export interface DirectorV2ManualFixtureV1 {
  id: string;
  category: DirectorV2FixtureCategory;
  recordingID: string;
  motifAnchor: string;
  windows: ManualWindowIntentFixtureV2[];
  expectations: {
    signatureEvents: ManualSignatureExpectationV1[];
    promises: ManualPromiseExpectationV1[];
    instrumentalGap?: {
      fromMs: number;
      toMs: number;
      requiredContinuity: string;
    };
  };
}

export const directorV2ManualFixtures: readonly DirectorV2ManualFixtureV1[] = [
  {
    id: "director-v2:fast-mixed",
    category: "fast",
    recordingID: "fixture:word-timed-mixed",
    motifAnchor: "unfinished-light",
    windows: [{
      id: "fast:0-3",
      fromLineIndex: 0,
      toLineIndex: 3,
      spatialIntent: "open",
      coverRole: "portal",
      arcIntent: "lift",
      cues: [
        {
          id: "fast:rupture-unfinished",
          version: "semantic-cue-v2",
          role: "rupture",
          fromLineIndex: 1,
          evidenceLineIndices: [1],
          confidence: 0.94,
          focus: {
            lineIndex: 1,
            fromGrapheme: 1,
            toGrapheme: 4,
            expectedText: "未完成",
          },
        },
        {
          id: "fast:release-forward",
          version: "semantic-cue-v2",
          role: "release",
          fromLineIndex: 2,
          evidenceLineIndices: [2],
          confidence: 0.91,
        },
        {
          id: "fast:recall-open-sky",
          version: "semantic-cue-v2",
          role: "recall",
          fromLineIndex: 3,
          evidenceLineIndices: [0, 3],
          confidence: 0.86,
        },
      ],
    }],
    expectations: {
      signatureEvents: [
        {
          cueID: "fast:rupture-unfinished",
          recipe: "rupture",
          branch: "separation",
          observableFact: "The unfinished-light rail separates and leaves one displaced fragment behind.",
        },
        {
          cueID: "fast:release-forward",
          recipe: "release",
          branch: "expansion",
          observableFact: "Forward motion opens the same separated rail into navigable space.",
        },
        {
          cueID: "fast:recall-open-sky",
          recipe: "recall",
          branch: "traceReturn",
          observableFact: "The displaced fragment returns to close the rail beneath the final line.",
        },
      ],
      promises: [{
        promiseID: "promise:rupture:unfinished-light:1-1",
        sourceCueID: "fast:rupture-unfinished",
        consumerCueID: "fast:recall-open-sky",
        visibleContinuity: "One rail fragment remains offset after the rupture and is the fragment recalled at the ending.",
      }],
    },
  },
  {
    id: "director-v2:slow-gap",
    category: "slow-instrumental-gap",
    recordingID: "fixture:long-song-structure",
    motifAnchor: "distant-echo",
    windows: [
      {
        id: "slow:0-6",
        fromLineIndex: 0,
        toLineIndex: 6,
        spatialIntent: "hold",
        coverRole: "boundary",
        arcIntent: "break",
        cues: [
          {
            id: "slow:release-first-light",
            version: "semantic-cue-v2",
            role: "release",
            fromLineIndex: 0,
            evidenceLineIndices: [0],
            confidence: 0.84,
          },
          {
            id: "slow:rupture-distant-echo",
            version: "semantic-cue-v2",
            role: "rupture",
            fromLineIndex: 3,
            evidenceLineIndices: [3],
            confidence: 0.95,
          },
          {
            id: "slow:release-after-gap",
            version: "semantic-cue-v2",
            role: "release",
            fromLineIndex: 4,
            evidenceLineIndices: [3, 4],
            confidence: 0.97,
          },
          {
            id: "slow:refrain-second",
            version: "semantic-cue-v2",
            role: "refrain",
            fromLineIndex: 5,
            evidenceLineIndices: [2, 5],
            confidence: 0.93,
          },
        ],
      },
      {
        id: "slow:7-11",
        fromLineIndex: 7,
        toLineIndex: 11,
        spatialIntent: "split",
        coverRole: "memory",
        arcIntent: "recall",
        cues: [
          {
            id: "slow:handoff-duet",
            version: "semantic-cue-v2",
            role: "handoff",
            fromLineIndex: 7,
            toLineIndex: 8,
            evidenceLineIndices: [7, 8],
            confidence: 0.98,
          },
          {
            id: "slow:recall-final-refrain",
            version: "semantic-cue-v2",
            role: "recall",
            fromLineIndex: 9,
            evidenceLineIndices: [2, 5, 9],
            confidence: 0.97,
          },
          {
            id: "slow:release-terminal",
            version: "semantic-cue-v2",
            role: "release",
            fromLineIndex: 11,
            evidenceLineIndices: [10, 11],
            confidence: 0.92,
          },
        ],
      },
    ],
    expectations: {
      signatureEvents: [
        {
          cueID: "slow:rupture-distant-echo",
          recipe: "rupture",
          branch: "vacuum",
          observableFact: "The distant echo leaves a stable empty lane before the first instrumental gap.",
        },
        {
          cueID: "slow:release-after-gap",
          recipe: "release",
          branch: "reveal",
          observableFact: "The lyric return reveals the next section through the lane held open during silence.",
        },
        {
          cueID: "slow:recall-final-refrain",
          recipe: "recall",
          branch: "absenceResolve",
          observableFact: "The final refrain occupies and resolves the same lane that remained absent through the gap.",
        },
      ],
      promises: [{
        promiseID: "promise:rupture:distant-echo:3-3",
        sourceCueID: "slow:rupture-distant-echo",
        consumerCueID: "slow:recall-final-refrain",
        visibleContinuity: "The empty lane and its fading edge remain identifiable through the gap, later duet, and final refrain.",
      }],
      instrumentalGap: {
        fromMs: 108_000,
        toMs: 126_000,
        requiredContinuity: "Ambient drift and the distant-echo absence continue from authoritative time while lyrics are absent.",
      },
    },
  },
  {
    id: "director-v2:repeated-chorus",
    category: "repeated-chorus",
    recordingID: "fixture:repeated-hook",
    motifAnchor: "shared-rail",
    windows: [{
      id: "chorus:0-7",
      fromLineIndex: 0,
      toLineIndex: 7,
      spatialIntent: "stack",
      coverRole: "anchor",
      arcIntent: "recall",
      cues: [
        {
          id: "chorus:refrain-first",
          version: "semantic-cue-v2",
          role: "refrain",
          fromLineIndex: 2,
          toLineIndex: 3,
          evidenceLineIndices: [2, 3],
          confidence: 0.99,
        },
        {
          id: "chorus:rupture-directions",
          version: "semantic-cue-v2",
          role: "rupture",
          fromLineIndex: 4,
          evidenceLineIndices: [4],
          confidence: 0.96,
        },
        {
          id: "chorus:recall-return",
          version: "semantic-cue-v2",
          role: "recall",
          fromLineIndex: 5,
          toLineIndex: 6,
          evidenceLineIndices: [2, 3, 5, 6],
          confidence: 0.99,
        },
        {
          id: "chorus:release-ending",
          version: "semantic-cue-v2",
          role: "release",
          fromLineIndex: 7,
          evidenceLineIndices: [5, 6, 7],
          confidence: 0.89,
        },
      ],
    }],
    expectations: {
      signatureEvents: [
        {
          cueID: "chorus:rupture-directions",
          recipe: "rupture",
          branch: "separation",
          observableFact: "The shared rail forks into two directions without changing the lyric anchor.",
        },
        {
          cueID: "chorus:recall-return",
          recipe: "recall",
          branch: "traceReturn",
          observableFact: "The returning chorus retraces both forks and visibly joins them into the original shared rail.",
        },
      ],
      promises: [{
        promiseID: "promise:rupture:shared-rail:4-4",
        sourceCueID: "chorus:rupture-directions",
        consumerCueID: "chorus:recall-return",
        visibleContinuity: "Both fork traces remain faintly present until the repeated chorus joins them.",
      }],
    },
  },
  {
    id: "director-v2:duet-overlap",
    category: "duet-overlap",
    recordingID: "fixture:duet-overlap",
    motifAnchor: "shared-horizon",
    windows: [{
      id: "duet:0-4",
      fromLineIndex: 0,
      toLineIndex: 4,
      spatialIntent: "split",
      coverRole: "boundary",
      arcIntent: "lift",
      cues: [
        {
          id: "duet:handoff-sides",
          version: "semantic-cue-v2",
          role: "handoff",
          fromLineIndex: 0,
          toLineIndex: 1,
          evidenceLineIndices: [0, 1],
          confidence: 0.98,
        },
        {
          id: "duet:handoff-overlap",
          version: "semantic-cue-v2",
          role: "handoff",
          fromLineIndex: 2,
          toLineIndex: 3,
          evidenceLineIndices: [2, 3],
          confidence: 0.99,
        },
        {
          id: "duet:release-center",
          version: "semantic-cue-v2",
          role: "release",
          fromLineIndex: 4,
          evidenceLineIndices: [2, 3, 4],
          confidence: 0.97,
        },
      ],
    }],
    expectations: {
      signatureEvents: [{
        cueID: "duet:release-center",
        recipe: "release",
        branch: "reveal",
        observableFact: "The two independently readable voice lanes meet on one revealed horizon at the choir line.",
      }],
      promises: [],
    },
  },
  {
    id: "director-v2:long-line",
    category: "long-line",
    recordingID: "fixture:long-line",
    motifAnchor: "breathing-constellation",
    windows: [{
      id: "long-line:0-2",
      fromLineIndex: 0,
      toLineIndex: 2,
      spatialIntent: "hold",
      coverRole: "origin",
      arcIntent: "break",
      cues: [
        {
          id: "long-line:hold-breath",
          version: "semantic-cue-v2",
          role: "hold",
          fromLineIndex: 0,
          evidenceLineIndices: [0],
          confidence: 0.92,
        },
        {
          id: "long-line:rupture-box",
          version: "semantic-cue-v2",
          role: "rupture",
          fromLineIndex: 1,
          evidenceLineIndices: [1],
          confidence: 0.96,
        },
        {
          id: "long-line:release-breath",
          version: "semantic-cue-v2",
          role: "release",
          fromLineIndex: 2,
          evidenceLineIndices: [0, 1, 2],
          confidence: 0.94,
        },
      ],
    }],
    expectations: {
      signatureEvents: [
        {
          cueID: "long-line:rupture-box",
          recipe: "rupture",
          branch: "vacuum",
          observableFact: "The imposed text box disappears while the long sentence keeps a readable baseline and leaves an open contour.",
        },
        {
          cueID: "long-line:release-breath",
          recipe: "release",
          branch: "reveal",
          observableFact: "The final long line resolves the open contour as breathing room rather than a larger effect.",
        },
      ],
      promises: [{
        promiseID: "promise:rupture:breathing-constellation:1-1",
        sourceCueID: "long-line:rupture-box",
        consumerCueID: "long-line:release-breath",
        visibleContinuity: "The open contour left by the missing box remains visible until the terminal line occupies it without compression.",
      }],
    },
  },
] as const;
