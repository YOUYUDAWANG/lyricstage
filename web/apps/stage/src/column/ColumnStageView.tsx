import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { lyricsProviderLabel, type LyricsCandidateV0 } from "@lyricstage/lyrics";
import { prepareTimeline } from "@lyricstage/core";
import { vocalAwareVirtualTimeMs, type VocalTimingMapV1 } from "@lyricstage/performance";
import {
  activeLineIndicesAt,
  formatClock,
  linePhase,
  mapVoiceClass,
  resolveColumnSurfaceState,
  type AutomaticLyricsStatus,
  type ColumnSurfaceState,
} from "./columnModel";
import { activeScrollKey, shouldScrollForActiveChange } from "./embeddedFullscreen";
import { alignTimedLineSegments, wordProgressFromTiming } from "./timedLineText";

export interface ColumnStageViewProps {
  bridgeAvailable: boolean;
  bridgeConnected: boolean;
  hasSnapshot: boolean;
  disconnected: boolean;
  title: string;
  artist: string;
  directorStatus: string;
  automaticStatus: AutomaticLyricsStatus;
  message: string;
  candidates: LyricsCandidateV0[];
  hasMatchingLyrics: boolean;
  lyrics: LyricDocumentV0;
  timeMs: number;
  durationMs: number;
  playbackState?: "playing" | "paused" | "buffering" | "ended";
  onEnterFullscreen: () => void;
  onChooseCandidate: (candidate: LyricsCandidateV0) => void;
  onImportLyrics: (file?: File) => void;
  onShowVersions: () => void;
  showVersionPicker: boolean;
  manualSearchPending: boolean;
  onManualSearch: (title: string, artist: string) => void;
  canEnterFullscreen: boolean;
  lightweight: boolean;
  vjMode: boolean;
  vocalTimingMap?: VocalTimingMapV1;
  vocalTimingStatus: "idle" | "analyzing" | "ready" | "error";
  vocalTimingError?: string;
  onToggleLightweight: () => void;
  onToggleVJMode: () => void;
  onToggleVocalTiming: () => void;
  onSeekLine: (timeMs: number) => void;
}

const stateCopy = (state: ColumnSurfaceState, message: string): { title: string; body: string } => {
  switch (state) {
    case "awaitingTrack":
      return { title: "等待播放", body: "在 YouTube Music 播放歌曲后，歌词将在此显示。" };
    case "searching":
      return { title: "正在匹配歌词", body: message || "正在按歌名、歌手和时长搜索同步歌词……" };
    case "candidates":
      return { title: "选择歌词版本", body: message || "找到多个候选版本，请选择一个采用。" };
    case "miss":
      return { title: "未找到同步歌词", body: message || "可导入本地 LRC 或 Lyric JSON 歌词文件。" };
    case "error":
      return { title: "搜索失败", body: message || "歌词搜索遇到问题，仍可手动导入本地歌词。" };
    case "prelude":
      return { title: "前奏中", body: "……" };
    case "interlude":
      return { title: "间奏中", body: "……" };
    case "paused":
      return { title: "已暂停", body: "歌词已冻结，播放后继续跟随。" };
    case "disconnected":
      return { title: "连接中断", body: "回到 YouTube Music 后会自动恢复。" };
    case "boot":
      return { title: "LyricStage", body: "连接中" };
    default:
      return { title: "", body: "" };
  }
};

const ImportControl = ({ onImportLyrics }: { onImportLyrics: (file?: File) => void }) => (
  <label className="column-import-button" title="导入本地 LRC 或 JSON 歌词文件">
    <span>导入 LRC / JSON</span>
    <input
      type="file"
      accept=".lrc,.json,text/plain,application/json"
      onChange={(event) => {
        onImportLyrics(event.target.files?.[0]);
        event.currentTarget.value = "";
      }}
    />
  </label>
);

export function ColumnStageView({
  bridgeAvailable,
  bridgeConnected,
  hasSnapshot,
  disconnected,
  title,
  artist,
  directorStatus,
  automaticStatus,
  message,
  candidates,
  hasMatchingLyrics,
  lyrics,
  timeMs,
  durationMs,
  playbackState,
  onEnterFullscreen,
  onChooseCandidate,
  onImportLyrics,
  onShowVersions,
  showVersionPicker,
  manualSearchPending,
  onManualSearch,
  canEnterFullscreen,
  lightweight,
  vjMode,
  vocalTimingMap,
  vocalTimingStatus,
  vocalTimingError,
  onToggleLightweight,
  onToggleVJMode,
  onToggleVocalTiming,
  onSeekLine,
}: ColumnStageViewProps) {
  const streamRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const lastActiveKeyRef = useRef<string>("");
  const enterFullscreenRef = useRef(onEnterFullscreen);
  enterFullscreenRef.current = onEnterFullscreen;
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [manualTitle, setManualTitle] = useState(title);
  const [manualArtist, setManualArtist] = useState(artist);
  const frozen = disconnected || playbackState === "paused" || playbackState === "ended";

  useEffect(() => {
    setManualTitle(title);
    setManualArtist(artist);
    setShowManualSearch(false);
  }, [title, artist]);

  const surface = resolveColumnSurfaceState({
    bridgeAvailable,
    bridgeConnected,
    hasSnapshot,
    disconnected,
    automaticStatus,
    hasMatchingLyrics,
    playbackState,
    timeMs,
    lyrics: hasMatchingLyrics ? lyrics : null,
  });

  const timeline = useMemo(
    () =>
      hasMatchingLyrics
        ? prepareTimeline({
            version: "performance-plan-v0",
            recordingID: lyrics.recordingID,
            lyricsIdentity: lyrics.recordingID,
            planIdentity: `column:${lyrics.recordingID}`,
            durationMs: lyrics.durationMs,
            scenes: lyrics.lines.map((line) => ({
              lineIndex: line.lineIndex,
              fromMs: line.fromMs,
              toMs: line.toMs,
              family: "fallback" as const,
              intensity: 0.4,
              repetitionIndex: 0,
              repetitionCount: 1,
            })),
          })
        : null,
    [hasMatchingLyrics, lyrics],
  );

  const lineSegments = useMemo(
    () => new Map(lyrics.lines.map((line) => [line.lineIndex, alignTimedLineSegments(line)])),
    [lyrics],
  );
  const usesEstimatedTiming = useMemo(
    () => Array.from(lineSegments.values()).some((segments) =>
      segments.some((segment) => segment.kind === "word" && segment.timingKind === "estimated")
    ),
    [lineSegments],
  );
  const vocalTimingActive = vocalTimingStatus === "analyzing" || vocalTimingStatus === "ready";
  const hasTrustedVocalTiming = Boolean(
    vocalTimingMap?.samples.some((sample) => sample.confidence >= 0.28),
  );
  const estimatedTimingLabel = !hasMatchingLyrics || !usesEstimatedTiming
    ? ""
    : vocalTimingStatus === "error"
      ? ` · 人声失败${vocalTimingError ? `：${vocalTimingError}` : ""}`
      : hasTrustedVocalTiming
      ? " · 人声增强"
      : vocalTimingActive
        ? " · 人声采集中"
        : " · 轻量逐字";

  const activeIndices = useMemo(() => {
    if (!timeline) return new Set<number>();
    return new Set(activeLineIndicesAt(timeline, timeMs));
  }, [timeline, timeMs]);

  const activeKey = useMemo(() => activeScrollKey(activeIndices), [activeIndices]);
  const primaryActiveIndex = useMemo(
    () => (activeIndices.size > 0 ? Math.min(...activeIndices) : -1),
    [activeIndices],
  );

  useLayoutEffect(() => {
    if (!shouldScrollForActiveChange(lastActiveKeyRef.current, activeKey, frozen)) return;
    lastActiveKeyRef.current = activeKey;
    const stream = streamRef.current;
    const active = activeRef.current;
    if (!stream || !active) return;
    const streamRect = stream.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const target =
      stream.scrollTop +
      (activeRect.top - streamRect.top) -
      streamRect.height * 0.3 +
      activeRect.height / 2;
    stream.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeKey, frozen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "f" || event.key === "F") {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        ) {
          return;
        }
        if (!canEnterFullscreen) return;
        event.preventDefault();
        enterFullscreenRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [canEnterFullscreen]);

  const copy = stateCopy(surface, message);
  const showStream =
    hasMatchingLyrics &&
    (surface === "singing" ||
      surface === "prelude" ||
      surface === "interlude" ||
      surface === "paused" ||
      surface === "disconnected");
  const showStateCard = surface !== "singing" || showVersionPicker || showManualSearch;
  const limitedCandidates = candidates.slice(0, 5);
  const showImport = surface === "miss" || surface === "error";

  return (
    <div
      className="column-stage"
      data-state={surface}
      data-frozen={frozen || undefined}
      data-lightweight={lightweight || undefined}
    >
      <header className="column-header">
        <div className="column-header-info">
          <strong title={title || "YouTube Music 歌词"}>{title || "YouTube Music 歌词"}</strong>
          {artist && <small title={artist}>{artist}</small>}
          <small className="column-director-status" aria-live="polite">
            {directorStatus}{estimatedTimingLabel}
          </small>
        </div>
        <div className="column-toolbar" role="toolbar" aria-label="歌词工具栏">
          <button
            type="button"
            className={`column-tool-button ${lightweight ? "is-active" : ""}`}
            aria-pressed={lightweight}
            aria-label="切换轻量模式"
            title="轻量模式：减少模糊和动态效果"
            onClick={onToggleLightweight}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </button>
          <button
            type="button"
            className={`column-tool-button ${vjMode ? "is-active" : ""}`}
            aria-pressed={vjMode}
            aria-label="切换个人 VJ 模式"
            title="个人 VJ 模式：提高全屏环境运动强度"
            onClick={onToggleVJMode}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m13 2-8 12h6l-1 8 9-13h-6V2Z" />
            </svg>
          </button>
          <button
            type="button"
            className={`column-tool-button ${vocalTimingActive ? "is-active" : ""}`}
            aria-pressed={vocalTimingActive}
            aria-label="切换人声感知逐字"
            title={vocalTimingStatus === "error"
              ? `人声分析启动失败：${vocalTimingError || "请重试"}`
              : vocalTimingActive
              ? "停止本地人声感知节奏分析"
              : "人声感知：用本地音频起音、停顿和中置人声修正估算逐字"}
            disabled={!bridgeAvailable || !hasSnapshot || !usesEstimatedTiming}
            onClick={onToggleVocalTiming}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 12h2l1.5-5 3 10 2.5-13 3 16 2.5-9 1.5 4H21" />
            </svg>
          </button>
          <button
            type="button"
            className={`column-tool-button ${showManualSearch ? "is-active" : ""}`}
            aria-label="手动搜索歌词"
            title="手动搜索歌词"
            onClick={() => setShowManualSearch((value) => !value)}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" />
            </svg>
          </button>
          <button
            type="button"
            className={`column-tool-button ${showVersionPicker ? "is-active" : ""}`}
            aria-label="选择歌词版本"
            title="选择歌词版本"
            onClick={onShowVersions}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m12 4 7 4-7 4-7-4 7-4Z" />
              <path d="m5 12 7 4 7-4M5 16l7 4 7-4" />
            </svg>
          </button>
          <label className="column-tool-button column-import-tool" title="导入本地 LRC 或 JSON 歌词" aria-label="导入本地歌词">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 15V4M8 8l4-4 4 4M5 14v5h14v-5" />
            </svg>
            <input
              type="file"
              accept=".lrc,.json,text/plain,application/json"
              onChange={(event) => {
                onImportLyrics(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="column-tool-button column-fullscreen-tool"
            disabled={!canEnterFullscreen}
            aria-label="进入全屏舞台"
            title={canEnterFullscreen ? "进入全屏舞台 (F)" : "请先匹配或导入歌词"}
            onClick={onEnterFullscreen}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
        </div>
      </header>

      {(surface === "paused" || surface === "disconnected") && (
        <div className="column-banner" role="status">
          {copy.title} · {copy.body}
        </div>
      )}

      <div className="column-stream" ref={streamRef}>
        {showStream ? (
          lyrics.lines.map((line) => {
            const phase = linePhase(line, timeMs, activeIndices);
            const voice = mapVoiceClass(line.voiceRole);
            const segments = lineSegments.get(line.lineIndex) ?? [{ kind: "plain" as const, text: line.text }];
            const estimatedEndMs = segments.reduce((latest, segment) =>
              segment.kind === "word" && segment.timingKind === "estimated"
                ? Math.max(latest, segment.toMs)
                : latest,
            line.fromMs);
            const estimatedTimeMs = estimatedEndMs > line.fromMs
              ? vocalAwareVirtualTimeMs(line.fromMs, estimatedEndMs, timeMs, vocalTimingMap)
              : timeMs;
            const distance =
              primaryActiveIndex < 0
                ? Number.POSITIVE_INFINITY
                : Math.abs(line.lineIndex - primaryActiveIndex);
            const proximity = phase === "active" ? "active" : distance <= 1 ? "near" : distance <= 2 ? "middle" : "far";
            return (
              <div
                key={line.lineIndex}
                ref={phase === "active" ? activeRef : undefined}
                className="column-line"
                role="button"
                tabIndex={0}
                aria-label={`跳转到 ${formatClock(line.fromMs)}`}
                title={`跳转到 ${formatClock(line.fromMs)}`}
                data-phase={phase}
                data-voice={voice}
                data-proximity={proximity}
                onClick={() => onSeekLine(line.fromMs)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSeekLine(line.fromMs);
                }}
              >
                <span className="column-line-words">
                  {segments.map((segment, index) => {
                    if (segment.kind === "word") {
                      const progress = wordProgressFromTiming(
                        segment.timingKind === "estimated" ? estimatedTimeMs : timeMs,
                        segment.fromMs,
                        segment.toMs,
                      );
                      return (
                        <span
                          key={`${line.lineIndex}:word:${segment.wordIndex}:${index}`}
                          className="column-word"
                          data-has-timing="true"
                          data-timing-kind={segment.timingKind}
                          style={{ ["--word-progress" as string]: `${progress * 100}%` }}
                        >
                          {segment.text}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={`${line.lineIndex}:gap:${index}`}
                        className="column-word"
                        data-has-timing="false"
                      >
                        {segment.text}
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })
        ) : (
          <div className="column-stream-spacer" aria-hidden="true" />
        )}

        {showStateCard && (
          <div className="column-state-card" data-status={surface} aria-live="polite">
            {surface === "searching" && <div className="column-skeleton" aria-hidden="true" />}
            {(surface === "prelude" || surface === "interlude") && !showVersionPicker && (
              <div className="column-ellipsis" aria-hidden="true">
                ···
              </div>
            )}
            {surface !== "singing" && (
              <>
                <strong>{copy.title}</strong>
                <p>{copy.body}</p>
              </>
            )}
            {surface === "candidates" && (
              <div className="column-candidate-list">
                {limitedCandidates.map((candidate) => (
                  <button
                    type="button"
                    key={`${candidate.provider}:${candidate.id}`}
                    onClick={() => onChooseCandidate(candidate)}
                  >
                    <span>{candidate.title}</span>
                    <small>
                      {lyricsProviderLabel(candidate.provider)} · {candidate.artist || "未知歌手"} · {formatClock(candidate.durationMs)}{candidate.timingKind === "word" ? " · 逐字" : ""}
                    </small>
                  </button>
                ))}
              </div>
            )}
            {showImport && <ImportControl onImportLyrics={onImportLyrics} />}
            {showManualSearch && (
              <form
                className="column-manual-search"
                data-testid="column-manual-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  onManualSearch(manualTitle, manualArtist);
                }}
              >
                <strong>手动搜索歌词</strong>
                <label>
                  <span>歌名</span>
                  <input
                    type="search"
                    value={manualTitle}
                    maxLength={500}
                    required
                    placeholder="例如：死別"
                    onChange={(event) => setManualTitle(event.target.value)}
                  />
                </label>
                <label>
                  <span>歌手</span>
                  <input
                    type="search"
                    value={manualArtist}
                    maxLength={500}
                    placeholder="可留空，例如：シャノン"
                    onChange={(event) => setManualArtist(event.target.value)}
                  />
                </label>
                <div className="column-manual-search-actions">
                  <button type="submit" disabled={manualSearchPending || !manualTitle.trim()}>
                    {manualSearchPending ? "搜索中…" : "搜索"}
                  </button>
                  <button type="button" disabled={manualSearchPending} onClick={() => setShowManualSearch(false)}>
                    关闭
                  </button>
                </div>
              </form>
            )}
            {showVersionPicker && (
              <div className="column-version-panel" data-testid="column-version-panel">
                <strong>选择歌词版本</strong>
                {limitedCandidates.length > 0 ? (
                  <div className="column-candidate-list">
                    {limitedCandidates.map((candidate) => (
                      <button
                        type="button"
                        key={`version:${candidate.provider}:${candidate.id}`}
                        onClick={() => onChooseCandidate(candidate)}
                      >
                        <span>{candidate.title}</span>
                        <small>
                          {lyricsProviderLabel(candidate.provider)} · {candidate.artist || "未知歌手"} · {formatClock(candidate.durationMs)}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>暂无其他候选版本。</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="column-footer">
        <span>
          {formatClock(timeMs)} / {formatClock(durationMs)}
        </span>
      </footer>
    </div>
  );
}
