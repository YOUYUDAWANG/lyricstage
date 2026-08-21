import type { LyricDocumentV0, VoiceRole } from "@lyricstage/contracts";
import type {
  DirectorLineDirectiveV1,
  DirectorPlanV1,
  DirectorSectionV1,
  PerformancePaletteRoleV1,
} from "@lyricstage/performance";
import type { StagePaletteV0, TextMeasurerV0 } from "./types";

export interface DirectedStageViewportV1 {
  width: number;
  height: number;
  rendererVersion: string;
}

export interface DirectedStagePaletteV1 extends StagePaletteV0 {
  warm: string;
  secondary: string;
  veil: string;
}

export interface PreparedDirectedGlyphV1 {
  text: string;
  index: number;
  row: number;
  x: number;
  y: number;
  width: number;
  revealMs: number;
}

export interface PreparedDirectedLineV1 {
  lineIndex: number;
  fromMs: number;
  toMs: number;
  text: string;
  voiceRole: VoiceRole;
  font: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  glyphs: PreparedDirectedGlyphV1[];
  bounds: { x: number; y: number; width: number; height: number };
  section: DirectorSectionV1;
  directive: DirectorLineDirectiveV1;
  repetitionIndex: number;
  repetitionCount: number;
}

export interface PreparedDirectedStageV1 {
  version: "prepared-directed-stage-v1";
  identity: string;
  viewport: DirectedStageViewportV1;
  lyrics: LyricDocumentV0;
  plan: DirectorPlanV1;
  lines: PreparedDirectedLineV1[];
  linesByIndex: Map<number, PreparedDirectedLineV1>;
}

export interface DrawDirectedStageOptionsV1 {
  timeMs: number;
  reduceMotion: boolean;
  showGuides?: boolean;
  palette?: DirectedStagePaletteV1;
}

export type DirectedTextMeasurerV1 = TextMeasurerV0;

export const paletteColorForRoleV1 = (
  palette: DirectedStagePaletteV1,
  role: PerformancePaletteRoleV1,
): string => {
  if (role === "accent") return palette.signal;
  if (role === "warm") return palette.warm;
  if (role === "secondary") return palette.secondary;
  return palette.ink;
};
