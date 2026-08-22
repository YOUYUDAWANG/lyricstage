export type VoiceRole =
  | "lead"
  | "harmony"
  | "duetA"
  | "duetB"
  | "choir"
  | "unknown";

export interface ProviderTrackRefV0 {
  provider: string;
  trackID: string;
  partID?: string;
}

export interface RecordingIdentityV0 {
  version: "recording-identity-v0";
  recordingID: string;
  assetHash: string;
  durationMs: number;
  title?: string;
  artist?: string;
  versionHint?: string;
  providerRefs: ProviderTrackRefV0[];
}

export interface LyricWordV0 {
  wordIndex: number;
  fromMs: number;
  toMs: number;
  text: string;
}

export interface LyricLineV0 {
  lineIndex: number;
  fromMs: number;
  toMs: number;
  text: string;
  words?: LyricWordV0[];
  voiceRole?: VoiceRole;
  layerID?: string;
  overlapGroup?: string;
}

export interface LyricDocumentV0 {
  version: "lyric-document-v0";
  recordingID: string;
  durationMs: number;
  language?: string;
  lines: LyricLineV0[];
}

export type SceneFamilyV0 =
  | "fallback"
  | "railHandoff"
  | "semanticLens"
  | "chorusMemory"
  | "silenceAperture";

export type MotifPhaseV0 = "introduce" | "develop" | "transform" | "resolve";

export interface SceneRecipeV0 {
  lineIndex: number;
  family: SceneFamilyV0;
  intensity: number;
  motifPhase?: MotifPhaseV0;
  focusTokenFrom?: number;
  focusTokenTo?: number;
  companionLineIndices?: number[];
}

export interface DirectorRecipeV0 {
  version: "director-recipe-v0";
  recordingID: string;
  lyricsHash: string;
  recipes: SceneRecipeV0[];
}

export interface LyricStageManifestV0 {
  version: "lyricstage-manifest-v0";
  recordingID: string;
  lyricsPath: string;
  audioFactsPath?: string;
  recipePath?: string;
  requiredFonts: string[];
}

export interface ContractIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; issues: ContractIssue[] };
