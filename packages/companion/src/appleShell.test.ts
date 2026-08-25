import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contentScript = readFileSync(
  new URL("../../../apps/browser-extension/public/content.js", import.meta.url),
  "utf8",
);
const shellStyles = readFileSync(
  new URL("../../../apps/browser-extension/public/ytm-shell.css", import.meta.url),
  "utf8",
);
const columnStyles = readFileSync(
  new URL("../../../apps/stage/src/column/column.css", import.meta.url),
  "utf8",
);
const youLyStyles = readFileSync(
  new URL("../../../apps/stage/src/lyrics/YouLyColumnScroller.css", import.meta.url),
  "utf8",
);

describe("Apple-style YouTube Music shell contract", () => {
  it("respects the native guide state instead of forcing the sidebar open", () => {
    expect(contentScript).toContain('const APPLE_SHELL_GUIDE_ATTR = "data-lyricstage-guide"');
    expect(contentScript).toContain('const APPLE_SHELL_GUIDE_STORAGE_KEY = "lyricstage-guide-collapsed-v1"');
    expect(contentScript).toContain('collapsed ? "collapsed" : "expanded"');
    expect(contentScript).not.toContain('if (navigation.hasAttribute?.("guide-collapsed") && !drawer.hasAttribute?.("opened"))');
    expect(shellStyles).toContain('[data-lyricstage-guide="collapsed"]');
    expect(shellStyles).toContain('--ls-shell-sidebar-width: 0px');
    expect(shellStyles).toContain('visibility: hidden !important');
  });

  it("keeps lyrics persistent and moves queue and related into toolbar popovers", () => {
    expect(contentScript).toContain('const APPLE_SHELL_PLAYER_ACTIONS_ATTR = "data-lyricstage-player-actions"');
    expect(contentScript).toContain('["queue", "播放队列", queueTab]');
    expect(contentScript).toContain('["related", "相关推荐", relatedTab]');
    expect(contentScript).toContain('const APPLE_SHELL_MEDIA_PROXY_ATTR = "data-lyricstage-media-proxy"');
    expect(contentScript).toContain('const APPLE_SHELL_PLAYER_BAR_ATTR = "data-lyricstage-player-bar-shell"');
    expect(contentScript).toContain('button.addEventListener("click", () => invokeAppleShellMediaMode(index))');
    expect(contentScript).toContain('appleShellMediaToggle.removeAttribute?.("toggle-disabled")');
    expect(contentScript).not.toContain('actions.append(mediaToggle)');
    expect(contentScript).toContain('event?.key !== "Escape"');
    expect(contentScript).toContain('event.stopImmediatePropagation?.()');
    expect(contentScript).not.toContain("--lyricstage-owned-tab-left");
    expect(contentScript).not.toContain("--lyricstage-owned-tab-width");
    expect(shellStyles).toContain('[data-lyricstage-player-actions="true"]');
    expect(shellStyles).toContain('[data-lyricstage-media-proxy="true"]');
    expect(shellStyles).toContain('[data-lyricstage-player-bar-shell="true"]');
    expect(contentScript).toContain("lastAppleShellTrackTuple ?? acceptedTrackTuple ?? candidate ?? null");
    expect(shellStyles).toContain('aspect-ratio: var(--lyricstage-video-aspect, 16 / 9)');
    expect(shellStyles).toContain('ytmusic-player-bar[slot="player-bar"]');
    expect(shellStyles).toContain("#side-panel[data-lyricstage-player-popover]");
    expect(shellStyles).toContain('grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr)');
    expect(shellStyles).toContain('inset: 0');
    expect(shellStyles).not.toContain("left: var(--lyricstage-owned-tab-left");
  });

  it("keeps the shell and embedded lyrics on the same light appearance", () => {
    expect(shellStyles).toContain("color-scheme: light");
    expect(shellStyles).toContain("--ls-shell-bg: #e9ebf2");
    expect(contentScript).toContain('data-lyricstage-shell-theme", "light"');
    expect(columnStyles).toContain(':host([data-lyricstage-shell-theme="light"]) .column-stage');
    expect(youLyStyles).toContain(':host([data-lyricstage-shell-theme="light"]) .youly-column-shell');
  });
});
