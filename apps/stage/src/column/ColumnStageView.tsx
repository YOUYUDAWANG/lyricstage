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
  toggledColumnTool,
  type AutomaticLyricsStatus,
  type ColumnTool,
  type ColumnSurfaceState,
} from "./columnModel";
import { activeScrollKey, shouldScrollForActiveChange } from "./embeddedFullscreen";
import { alignTimedLineSegments, wordProgressFromTiming } from "./timedLineText";
import {
  clampLyricsOffsetMs,
  formatLyricsOffset,
  LYRICS_OFFSET_STEP_MS,
  lyricsTimeForPlaybackMs,
  playbackTimeForLyricsMs,
} from "../playback/lyricsTimeOffset";

export interface ColumnStageViewProps {
  bridgeAvailable: boolean;
  bridgeConnected: boolean;
  hasSnapshot: boolean;
  disconnected: boolean;
  title: string;
  artist: string;
  directorStatus: string;
  directorStatusReason?: string;
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
  onShowVersions: () => void;
  showVersionPicker: boolean;
  manualSearchPending: boolean;
  onManualSearch: (title: string, artist: string) => void;
  canEnterFullscreen: boolean;
  lightweight: boolean;
  vocalTimingMap?: VocalTimingMapV1;
  lyricsOffsetMs: number;
  onSetLyricsOffset: (offsetMs: number) => void;
  onAlignCurrentLine: (lineIndex: number) => void;
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
      return { title: "未找到同步歌词", body: message || "可使用手动搜索修改歌名或歌手后重试。" };
    case "error":
      return { title: "搜索失败", body: message || "歌词搜索遇到问题，可使用手动搜索重试。" };
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

export function ColumnStageView({
  bridgeAvailable,
  bridgeConnected,
  hasSnapshot,
  disconnected,
  title,
  artist,
  directorStatus,
  directorStatusReason,
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
  onShowVersions,
  showVersionPicker,
  manualSearchPending,
  onManualSearch,
  canEnterFullscreen,
  lightweight,
  vocalTimingMap,
  lyricsOffsetMs,
  onSetLyricsOffset,
  onAlignCurrentLine,
  onSeekLine,
}: ColumnStageViewProps) {
  const streamRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const lastActiveKeyRef = useRef<string>("");
  const enterFullscreenRef = useRef(onEnterFullscreen);
  enterFullscreenRef.current = onEnterFullscreen;
  const [activeTool, setActiveTool] = useState<ColumnTool | null>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [manualTitle, setManualTitle] = useState(title);
  const [manualArtist, setManualArtist] = useState(artist);
  const frozen = disconnected || playbackState === "paused" || playbackState === "ended";
  const lyricTimeMs = lyricsTimeForPlaybackMs(timeMs, lyricsOffsetMs, durationMs);
  const lyricsOffsetLabel = lyricsOffsetMs === 0 ? "" : ` · 歌词${formatLyricsOffset(lyricsOffsetMs)}`;

  useEffect(() => {
    setManualTitle(title);
    setManualArtist(artist);
    setShowToolsMenu(false);
  }, [title, artist]);

  useEffect(() => {
    if (activeTool === "versions" && !showVersionPicker) setActiveTool(null);
  }, [activeTool, showVersionPicker]);

  useEffect(() => {
    if (!showToolsMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const toolbar = toolbarRef.current;
      if (toolbar && !event.composedPath().includes(toolbar)) {
        setShowToolsMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowToolsMenu(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [showToolsMenu]);

  const surface = resolveColumnSurfaceState({
    bridgeAvailable,
    bridgeConnected,
    hasSnapshot,
    disconnected,
    automaticStatus,
    hasMatchingLyrics,
    playbackState,
    timeMs: lyricTimeMs,
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
  const estimatedTimingLabel = !hasMatchingLyrics || !usesEstimatedTiming
    ? ""
    : " · 轻量逐字";

  const activeIndices = useMemo(() => {
    if (!timeline) return new Set<number>();
    return new Set(activeLineIndicesAt(timeline, lyricTimeMs));
  }, [timeline, lyricTimeMs]);

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
  const showStateCard = surface !== "singing";
  const limitedCandidates = candidates.slice(0, 5);

  const selectTool = (selected: ColumnTool) => {
    const next = toggledColumnTool(activeTool, selected);
    if ((next === "versions") !== showVersionPicker) onShowVersions();
    setActiveTool(next);
    setShowToolsMenu(false);
  };

  const closeTool = () => {
    if (activeTool === "versions" && showVersionPicker) onShowVersions();
    setActiveTool(null);
  };

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
          <small className="column-director-status" aria-live="polite" title={directorStatusReason || directorStatus}>
            {directorStatus}{estimatedTimingLabel}{lyricsOffsetLabel}
          </small>
        </div>
        <div ref={toolbarRef} className="column-toolbar" role="toolbar" aria-label="歌词工具栏">
          <button
            type="button"
            className={`column-tool-button ${showToolsMenu ? "is-active" : ""}`}
            aria-expanded={showToolsMenu}
            aria-label="更多歌词工具"
            title="更多歌词工具"
            onClick={() => setShowToolsMenu((value) => !value)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
          <button
            type="button"
            className="column-tool-button column-fullscreen-tool"
            disabled={!canEnterFullscreen}
            aria-label="进入全屏舞台"
            title={canEnterFullscreen ? "进入全屏舞台 (F)" : "请先匹配同步歌词"}
            onClick={onEnterFullscreen}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
          {showToolsMenu && (
            <div className="column-tools-menu" role="group" aria-label="更多歌词工具">
              <button
                type="button"
                className={activeTool === "timing" || lyricsOffsetMs !== 0 ? "is-active" : ""}
                disabled={!hasMatchingLyrics}
                onClick={() => selectTool("timing")}
              >
                <span>◷</span><div><strong>歌词时间轴</strong><small>{formatLyricsOffset(lyricsOffsetMs)}</small></div>
              </button>
              <button type="button" className={activeTool === "search" ? "is-active" : ""} onClick={() => selectTool("search")}>
                <span>⌕</span><div><strong>手动搜索</strong><small>按歌名和歌手重搜</small></div>
              </button>
              <button type="button" className={activeTool === "versions" ? "is-active" : ""} onClick={() => selectTool("versions")}>
                <span>▱</span><div><strong>歌词版本</strong><small>查看其他匹配结果</small></div>
              </button>
            </div>
          )}
        </div>
      </header>

      {activeTool && (
        <section className="column-tool-panel" role="dialog" aria-label={{
          timing: "歌词时间轴",
          search: "手动搜索歌词",
          versions: "选择歌词版本",
        }[activeTool]}>
          <header className="column-tool-panel-header">
            <strong>{{
              timing: "歌词时间轴",
              search: "手动搜索歌词",
              versions: "选择歌词版本",
            }[activeTool]}</strong>
            <button type="button" aria-label="关闭歌词工具" onClick={closeTool}>×</button>
          </header>

          {activeTool === "timing" && hasMatchingLyrics && (
            <div className="column-timing-adjust" role="group" aria-label="歌词时间轴调整">
              <button
                type="button"
                className="column-timing-auto"
                disabled={primaryActiveIndex < 0 || disconnected || playbackState === "ended"}
                title="听到当前高亮句真正开唱时点击；也可以先暂停再对齐"
                onClick={() => onAlignCurrentLine(primaryActiveIndex)}
              >
                当前句对齐
              </button>
              <button
                type="button"
                onClick={() => onSetLyricsOffset(clampLyricsOffsetMs(lyricsOffsetMs - LYRICS_OFFSET_STEP_MS))}
              >
                提前 0.1s
              </button>
              <strong aria-live="polite">{formatLyricsOffset(lyricsOffsetMs)}</strong>
              <button
                type="button"
                onClick={() => onSetLyricsOffset(clampLyricsOffsetMs(lyricsOffsetMs + LYRICS_OFFSET_STEP_MS))}
              >
                延后 0.1s
              </button>
              <button
                type="button"
                className="column-timing-reset"
                disabled={lyricsOffsetMs === 0}
                onClick={() => onSetLyricsOffset(0)}
              >
                归零
              </button>
            </div>
          )}

          {activeTool === "search" && (
            <form
              className="column-manual-search"
              data-testid="column-manual-search"
              onSubmit={(event) => {
                event.preventDefault();
                onManualSearch(manualTitle, manualArtist);
              }}
            >
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
              </div>
            </form>
          )}

          {activeTool === "versions" && (
            <div className="column-version-panel" data-testid="column-version-panel">
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
        </section>
      )}

      {(surface === "paused" || surface === "disconnected") && (
        <div className="column-banner" role="status">
          {copy.title} · {copy.body}
        </div>
      )}

      <div className="column-stream" ref={streamRef}>
        {showStream ? (
          lyrics.lines.map((line) => {
            const phase = linePhase(line, lyricTimeMs, activeIndices);
            const voice = mapVoiceClass(line.voiceRole);
            const segments = lineSegments.get(line.lineIndex) ?? [{ kind: "plain" as const, text: line.text }];
            const estimatedEndMs = segments.reduce((latest, segment) =>
              segment.kind === "word" && segment.timingKind === "estimated"
                ? Math.max(latest, segment.toMs)
                : latest,
            line.fromMs);
            // VocalTimingMap samples live on the host playback axis. Convert the
            // lyric estimate bounds to that axis before applying the acoustic
            // warp, then convert the result back for word progress sampling.
            // This keeps a persisted lyric offset from shifting text and audio
            // evidence in opposite coordinate systems.
            const estimatedPlaybackFromMs = playbackTimeForLyricsMs(
              line.fromMs,
              lyricsOffsetMs,
              durationMs,
            );
            const estimatedPlaybackEndMs = playbackTimeForLyricsMs(
              estimatedEndMs,
              lyricsOffsetMs,
              durationMs,
            );
            const estimatedTimeMs = estimatedEndMs > line.fromMs
              ? lyricsTimeForPlaybackMs(
                  vocalAwareVirtualTimeMs(
                    estimatedPlaybackFromMs,
                    estimatedPlaybackEndMs,
                    timeMs,
                    vocalTimingMap,
                  ),
                  lyricsOffsetMs,
                  durationMs,
                )
              : lyricTimeMs;
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
                aria-label={`跳转到 ${formatClock(playbackTimeForLyricsMs(line.fromMs, lyricsOffsetMs, durationMs))}`}
                title={`跳转到 ${formatClock(playbackTimeForLyricsMs(line.fromMs, lyricsOffsetMs, durationMs))}`}
                data-phase={phase}
                data-voice={voice}
                data-proximity={proximity}
                onClick={() => onSeekLine(playbackTimeForLyricsMs(line.fromMs, lyricsOffsetMs, durationMs))}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSeekLine(playbackTimeForLyricsMs(line.fromMs, lyricsOffsetMs, durationMs));
                }}
              >
                <span className="column-line-words">
                  {segments.map((segment, index) => {
                    if (segment.kind === "word") {
                      const progress = wordProgressFromTiming(
                        segment.timingKind === "estimated" ? estimatedTimeMs : lyricTimeMs,
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
            {(surface === "prelude" || surface === "interlude") && (
              <div className="column-ellipsis" aria-hidden="true">
                ···
              </div>
            )}
            <strong>{copy.title}</strong>
            <p>{copy.body}</p>
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
