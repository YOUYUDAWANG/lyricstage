import type { LyricDocumentV0, SceneFamilyV0, VoiceRole } from "@lyricstage/contracts";
import type { PerformancePlanV0, PerformanceSceneV0, PreparedTimelineV0 } from "@lyricstage/core";

export interface StageViewportV0 {
  width: number;
  height: number;
  fontFamily: string;
  rendererVersion: string;
}

export interface PreparedGlyphV0 {
  text: string;
  x: number;
  y: number;
  width: number;
  revealMs: number;
}

export interface PreparedVisualLineV0 {
  lineIndex: number;
  text: string;
  family: SceneFamilyV0;
  voiceRole: VoiceRole;
  font: string;
  fontSize: number;
  lineHeight: number;
  glyphs: PreparedGlyphV0[];
  bounds: { x: number; y: number; width: number; height: number };
  scene: PerformanceSceneV0;
}

export interface StagePaletteV0 {
  ground: string;
  groundLift: string;
  ink: string;
  inkMuted: string;
  signal: string;
  signalAlt: string;
}

export interface PreparedStageV0 {
  version: "prepared-stage-v0";
  identity: string;
  viewport: StageViewportV0;
  lyrics: LyricDocumentV0;
  plan: PerformancePlanV0;
  timeline: PreparedTimelineV0;
  lines: PreparedVisualLineV0[];
  palette: StagePaletteV0;
}

export interface DrawStageOptionsV0 {
  timeMs: number;
  reduceMotion: boolean;
  showGuides?: boolean;
}

export type TextMeasurerV0 = (text: string, font: string) => number;
