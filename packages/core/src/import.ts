import {
  parseLyricDocumentV0,
  type LyricDocumentV0,
  type ValidationResult,
} from "@lyricstage/contracts";
import { parseLRC } from "./lrc";

export const localRecordingID = (file: File): string =>
  `local:${encodeURIComponent(file.name)}:${file.size}:${file.lastModified}`;

export const parseLyricSource = (
  source: string,
  fileName: string,
  recordingID: string,
  durationMs?: number,
): ValidationResult<LyricDocumentV0> => {
  if (fileName.toLocaleLowerCase().endsWith(".lrc")) {
    try {
      return { ok: true, value: parseLRC(source, recordingID, durationMs), issues: [] };
    } catch (error) {
      return {
        ok: false,
        issues: [{ path: "/", message: error instanceof Error ? error.message : "LRC 解析失败" }],
      };
    }
  }

  try {
    const parsed = JSON.parse(source) as unknown;
    const result = parseLyricDocumentV0(parsed);
    if (!result.ok) return result;
    return {
      ok: true,
      value: { ...result.value, recordingID },
      issues: [],
    };
  } catch {
    return { ok: false, issues: [{ path: "/", message: "歌词 JSON 无法解析" }] };
  }
};
