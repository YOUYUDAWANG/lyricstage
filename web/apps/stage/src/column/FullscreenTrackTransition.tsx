import { useMemo, useState } from "react";
import { artworkCandidates } from "../StageCanvas";

export interface FullscreenTrackTransitionProps {
  active: boolean;
  artworkURL?: string;
  title: string;
  artist: string;
  status: string;
  timeMs: number;
  durationMs: number;
  onExit: () => void;
}

const progressPercent = (timeMs: number, durationMs: number): number => {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.min(100, Math.max(0, (timeMs / durationMs) * 100));
};

export const FullscreenTrackTransition = ({
  active,
  artworkURL,
  title,
  artist,
  status,
  timeMs,
  durationMs,
  onExit,
}: FullscreenTrackTransitionProps) => {
  const coverInitial = Array.from(title.trim())[0] || "音";
  const candidates = useMemo(() => artworkCandidates(artworkURL), [artworkURL]);
  const artworkIdentity = artworkURL?.trim() ?? "";
  const [candidateState, setCandidateState] = useState({ artworkIdentity, index: 0 });
  const candidateIndex = candidateState.artworkIdentity === artworkIdentity ? candidateState.index : 0;
  const candidateURL = candidates[candidateIndex];

  return (
    <div
      className="fullscreen-track-transition"
      data-active={active || undefined}
      role={active ? "status" : undefined}
      aria-live={active ? "polite" : "off"}
      aria-hidden={!active}
    >
      {candidateURL ? (
        <img className="fullscreen-track-transition-wash" src={candidateURL} alt="" aria-hidden="true" />
      ) : null}
      <div className="fullscreen-track-transition-shade" aria-hidden="true" />
      <div className="stage-now-playing-layout fullscreen-track-transition-layout">
        <aside className="stage-now-playing-info" aria-label="正在切换歌曲">
          <div className="stage-artwork-frame">
            {candidateURL ? (
              <img
                className="stage-artwork"
                src={candidateURL}
                alt=""
                aria-hidden="true"
                onError={() => setCandidateState((state) => {
                  const index = state.artworkIdentity === artworkIdentity ? state.index : 0;
                  return {
                    artworkIdentity,
                    index: index + 1 < candidates.length ? index + 1 : candidates.length,
                  };
                })}
              />
            ) : (
              <div className="stage-artwork-fallback" aria-hidden="true">{coverInitial}</div>
            )}
          </div>
          <div className="stage-track-meta">
            <strong>{title}</strong>
            <span>{artist}</span>
            <span className="stage-director-status">舞台保持中</span>
          </div>
          <div className="fullscreen-track-transition-progress" aria-hidden="true">
            <i style={{ width: `${progressPercent(timeMs, durationMs)}%` }} />
          </div>
        </aside>
        <div className="fullscreen-track-transition-lyrics">
          <span>LYRICS</span>
          <strong>{status}</strong>
          <small>歌词准备完成后会在这里继续</small>
        </div>
      </div>
      {active ? (
        <button type="button" className="fullscreen-exit" onClick={onExit}>
          退出全屏
        </button>
      ) : null}
    </div>
  );
};
