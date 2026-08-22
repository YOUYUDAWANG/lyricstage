import {
  loadDirectorConfiguration,
  loadLyricsConfiguration,
  openSettingsPage,
} from "./settings/settingsClient";
import { summarizeDirectorConfig, summarizeLyricsConfig } from "./settings/settingsModel";
import {
  readExtensionPreferences,
  saveExtensionPreferences,
  type ExtensionPreferencesV0,
} from "../../stage/src/playback/extensionPreferences";
import { persistPopupPreferencePatch } from "./popupPreferences";

interface PopupChrome {
  runtime: {
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage?: () => Promise<void> | void;
  };
  tabs: {
    create(options: { url: string; active?: boolean }): Promise<unknown>;
  };
}

interface PopupStatus {
  connected?: boolean;
  snapshot?: {
    track?: { title?: string; artist?: string };
    playback?: { state?: string };
  };
}

const chromeAPI = (globalThis as typeof globalThis & { chrome: PopupChrome }).chrome;
const statusElement = document.querySelector<HTMLElement>("[data-status]");
const title = document.querySelector<HTMLElement>("[data-title]");
const artist = document.querySelector<HTMLElement>("[data-artist]");
const dot = document.querySelector<HTMLElement>("[data-dot]");
const openStageButton = document.querySelector<HTMLButtonElement>("[data-open-stage]");
const lyricsSummary = document.querySelector<HTMLElement>("[data-lyrics-summary]");
const directorSummary = document.querySelector<HTMLElement>("[data-director-summary]");
const lightweightToggle = document.querySelector<HTMLInputElement>("[data-lightweight-toggle]");
const vjToggle = document.querySelector<HTMLInputElement>("[data-vj-toggle]");
const notice = document.querySelector<HTMLElement>("[data-popup-notice]");
let refreshGeneration = 0;
let activationMessageUntil = 0;
let preferences: ExtensionPreferencesV0 = { lightweight: false, vjMode: false };
let noticeTimer: number | undefined;
let preferenceSaveGeneration = 0;

const showNotice = (message: string, tone: "info" | "error" = "info", durationMs = 4200) => {
  if (!notice) return;
  window.clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.dataset.tone = tone;
  noticeTimer = window.setTimeout(() => {
    notice.textContent = "";
    delete notice.dataset.tone;
  }, durationMs);
};

const render = (value: unknown) => {
  const next = value as PopupStatus;
  const connected = next.connected === true && Boolean(next.snapshot?.track?.title);
  if (statusElement) statusElement.textContent = connected ? "已连接" : "等待 YouTube Music";
  if (title) title.textContent = connected ? next.snapshot?.track?.title ?? "" : "先播放一首歌曲";
  if (artist) artist.textContent = connected ? next.snapshot?.track?.artist ?? "YouTube Music" : "再打开 YouTube Music 歌词";
  dot?.toggleAttribute("data-connected", connected);
};

const refresh = async () => {
  if (Date.now() < activationMessageUntil) return;
  const generation = ++refreshGeneration;
  try {
    const value = await chromeAPI.runtime.sendMessage({ type: "youtube-music-request-status" });
    if (generation === refreshGeneration) render(value);
  } catch {
    if (generation === refreshGeneration) render({ connected: false });
  }
};

const activationFailureCopy = (reason: string | undefined): string => {
  if (reason === "unlearned") return "请先在 YouTube Music 手动点一次原生「歌词」";
  if (reason === "source-not-ready") return "YouTube Music 已打开，请先播放歌曲";
  if (reason?.includes("ready-timeout")) return "歌词界面加载超时，请刷新 YouTube Music";
  if (reason?.includes("runtime-missing")) return "扩展页面脚本未就绪，请刷新 YouTube Music";
  return "暂时无法打开歌词，请刷新 YouTube Music 后重试";
};

openStageButton?.addEventListener("click", () => {
  openStageButton.disabled = true;
  showNotice("正在打开歌词舞台…", "info", 8000);
  void chromeAPI.runtime.sendMessage({ type: "youtube-music-open-stage" }).then((response) => {
    const result = response as { ok?: boolean; reason?: string } | undefined;
    if (result?.ok) {
      window.close();
      return;
    }
    refreshGeneration += 1;
    activationMessageUntil = Date.now() + 5000;
    showNotice(activationFailureCopy(result?.reason), "error");
  }).catch(() => {
    refreshGeneration += 1;
    activationMessageUntil = Date.now() + 5000;
    showNotice(activationFailureCopy(undefined), "error");
  }).finally(() => {
    openStageButton.disabled = false;
  });
});
document.querySelector("[data-open-source]")?.addEventListener("click", () => {
  void chromeAPI.runtime.sendMessage({ type: "youtube-music-open-source" }).catch(() => {
    showNotice("无法打开 YouTube Music", "error");
  });
});
document.querySelector("[data-open-settings]")?.addEventListener("click", () => {
  void openSettingsPage().then((opened) => {
    if (opened) {
      window.close();
      return;
    }
    showNotice("无法打开设置", "error");
  });
});

document.querySelectorAll<HTMLElement>("[data-open-settings-section]").forEach((button) => {
  button.addEventListener("click", () => {
    const section = button.getAttribute("data-open-settings-section") || "lyrics";
    void chromeAPI.tabs.create({
      url: chromeAPI.runtime.getURL(`settings.html#${section}`),
      active: true,
    }).then(() => window.close()).catch(() => {
      showNotice("无法打开设置", "error");
    });
  });
});

const renderPreferences = () => {
  if (lightweightToggle) lightweightToggle.checked = preferences.lightweight;
  if (vjToggle) vjToggle.checked = preferences.vjMode;
};

const updatePreferences = (patch: Partial<ExtensionPreferencesV0>) => {
  const previous = preferences;
  const generation = ++preferenceSaveGeneration;
  preferences = { ...previous, ...patch };
  renderPreferences();
  void persistPopupPreferencePatch(previous, patch, saveExtensionPreferences).then((result) => {
    if (generation !== preferenceSaveGeneration) return;
    preferences = result.preferences;
    renderPreferences();
    showNotice(result.saved ? "演出偏好已保存" : "保存失败，已恢复原设置", result.saved ? "info" : "error", result.saved ? 1800 : 4200);
  });
};

lightweightToggle?.addEventListener("change", () => updatePreferences({ lightweight: lightweightToggle.checked }));
vjToggle?.addEventListener("change", () => updatePreferences({ vjMode: vjToggle.checked }));

const resumePendingAudioAnalysis = () => {
  void chromeAPI.runtime.sendMessage({ type: "youtube-music-resume-pending-audio-analysis" })
    .then((value) => {
      const result = value as { ok?: boolean; pending?: boolean; reason?: string } | undefined;
      if (!result?.pending) return;
      refreshGeneration += 1;
      activationMessageUntil = Date.now() + 3500;
      showNotice(result.ok
        ? "可关闭此窗口，歌词会按本地人声节奏修正"
        : result.reason || "请回到 YouTube Music 后重试", result.ok ? "info" : "error");
    })
    .catch(() => undefined);
};

const refreshConfigurationSummaries = () => {
  void loadLyricsConfiguration().then((config) => {
    if (lyricsSummary) lyricsSummary.textContent = summarizeLyricsConfig(config);
  });
  void loadDirectorConfiguration().then((config) => {
    if (directorSummary) directorSummary.textContent = summarizeDirectorConfig(config);
  });
  void readExtensionPreferences().then((next) => {
    preferences = next;
    renderPreferences();
  });
};

void refresh();
resumePendingAudioAnalysis();
refreshConfigurationSummaries();
setInterval(() => void refresh(), 1000);
