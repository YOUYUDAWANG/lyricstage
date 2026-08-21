export {};

interface PopupChrome {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
  permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
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
const lyricsEndpointInput = document.querySelector<HTMLInputElement>("[data-lyrics-endpoint]");
const lyricsTokenInput = document.querySelector<HTMLInputElement>("[data-lyrics-token]");
const lyricsConfigStatus = document.querySelector<HTMLElement>("[data-lyrics-config-status]");
const saveLyricsConfigButton = document.querySelector<HTMLButtonElement>("[data-save-lyrics-config]");
const clearLyricsConfigButton = document.querySelector<HTMLButtonElement>("[data-clear-lyrics-config]");
const directorTokenInput = document.querySelector<HTMLInputElement>("[data-director-token]");
const directorConfigStatus = document.querySelector<HTMLElement>("[data-director-config-status]");
const saveDirectorConfigButton = document.querySelector<HTMLButtonElement>("[data-save-director-config]");
const clearDirectorConfigButton = document.querySelector<HTMLButtonElement>("[data-clear-director-config]");
const defaultPrivateLyricsEndpoint = "http://100.108.23.60:8788/";
let refreshGeneration = 0;
let activationMessageUntil = 0;

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
  if (statusElement) statusElement.textContent = "正在打开歌词";
  void chromeAPI.runtime.sendMessage({ type: "youtube-music-open-stage" }).then((response) => {
    const result = response as { ok?: boolean; reason?: string } | undefined;
    if (result?.ok) {
      window.close();
      return;
    }
    refreshGeneration += 1;
    activationMessageUntil = Date.now() + 5000;
    if (statusElement) statusElement.textContent = "需要处理";
    if (artist) artist.textContent = activationFailureCopy(result?.reason);
  }).catch(() => {
    refreshGeneration += 1;
    activationMessageUntil = Date.now() + 5000;
    if (statusElement) statusElement.textContent = "打开失败";
    if (artist) artist.textContent = activationFailureCopy(undefined);
  }).finally(() => {
    openStageButton.disabled = false;
  });
});
document.querySelector("[data-open-source]")?.addEventListener("click", () => {
  void chromeAPI.runtime.sendMessage({ type: "youtube-music-open-source" }).catch(() => {
    if (statusElement) statusElement.textContent = "无法打开 YouTube Music";
  });
});

const renderLyricsConfiguration = (value: unknown) => {
  const result = value as { configured?: boolean; endpoint?: string; reason?: string } | undefined;
  if (lyricsEndpointInput && typeof result?.endpoint === "string") {
    lyricsEndpointInput.value = result.endpoint || defaultPrivateLyricsEndpoint;
  }
  if (lyricsTokenInput) lyricsTokenInput.value = "";
  if (lyricsConfigStatus) {
    lyricsConfigStatus.textContent = result?.reason
      ? result.reason
      : result?.configured
        ? "已启用 LDDC；令牌仅保存在本机扩展存储"
        : "未配置时仍会搜索 LRCLIB 与酷狗";
  }
};

const refreshLyricsConfiguration = () => {
  void chromeAPI.runtime.sendMessage({ type: "youtube-music-private-lyrics-config" })
    .then(renderLyricsConfiguration)
    .catch(() => renderLyricsConfiguration({ configured: false }));
};

saveLyricsConfigButton?.addEventListener("click", () => {
  const endpoint = lyricsEndpointInput?.value.trim() ?? "";
  const token = lyricsTokenInput?.value.trim() ?? "";
  let origin: string;
  try {
    origin = `${new URL(endpoint).origin}/*`;
  } catch {
    renderLyricsConfiguration({ configured: false, endpoint, reason: "歌词后端地址无效" });
    return;
  }
  saveLyricsConfigButton.disabled = true;
  void chromeAPI.permissions.request({ origins: [origin] }).then((granted) => {
    if (!granted) throw new Error("未授权访问该歌词后端");
    return chromeAPI.runtime.sendMessage({
      type: "youtube-music-save-private-lyrics-config",
      endpoint,
      token,
    });
  }).then(renderLyricsConfiguration).catch((error) => {
    renderLyricsConfiguration({
      configured: false,
      endpoint,
      reason: error instanceof Error ? error.message : "歌词后端配置失败",
    });
  }).finally(() => {
    saveLyricsConfigButton.disabled = false;
  });
});

clearLyricsConfigButton?.addEventListener("click", () => {
  clearLyricsConfigButton.disabled = true;
  void chromeAPI.runtime.sendMessage({
    type: "youtube-music-save-private-lyrics-config",
    endpoint: "",
    token: "",
  }).then(renderLyricsConfiguration).catch(() => {
    renderLyricsConfiguration({ configured: false, reason: "停用失败" });
  }).finally(() => {
    clearLyricsConfigButton.disabled = false;
  });
});

const renderDirectorConfiguration = (value: unknown) => {
  const result = value as { configured?: boolean; reason?: string } | undefined;
  if (directorTokenInput) directorTokenInput.value = "";
  if (directorConfigStatus) {
    directorConfigStatus.textContent = result?.reason
      ? result.reason
      : result?.configured
        ? "已启用；歌曲稳定后后台生成，下一结构段接管"
        : "未配置时全屏仍使用完整本地演出";
  }
};

const refreshDirectorConfiguration = () => {
  void chromeAPI.runtime.sendMessage({ type: "youtube-music-director-config" })
    .then(renderDirectorConfiguration)
    .catch(() => renderDirectorConfiguration({ configured: false }));
};

const resumePendingAudioAnalysis = () => {
  void chromeAPI.runtime.sendMessage({ type: "youtube-music-resume-pending-audio-analysis" })
    .then((value) => {
      const result = value as { ok?: boolean; pending?: boolean; reason?: string } | undefined;
      if (!result?.pending) return;
      refreshGeneration += 1;
      activationMessageUntil = Date.now() + 3500;
      if (statusElement) statusElement.textContent = result.ok ? "人声增强已启动" : "音频授权失败";
      if (artist) artist.textContent = result.ok
        ? "可关闭此窗口，歌词会按本地人声节奏修正"
        : result.reason || "请回到 YouTube Music 后重试";
    })
    .catch(() => undefined);
};

saveDirectorConfigButton?.addEventListener("click", () => {
  const token = directorTokenInput?.value.trim() ?? "";
  if (!token) {
    renderDirectorConfiguration({ configured: false, reason: "请输入导演服务令牌" });
    return;
  }
  saveDirectorConfigButton.disabled = true;
  void chromeAPI.runtime.sendMessage({
    type: "youtube-music-save-director-config",
    token,
  }).then(renderDirectorConfiguration).catch(() => {
    renderDirectorConfiguration({ configured: false, reason: "导演配置失败" });
  }).finally(() => {
    saveDirectorConfigButton.disabled = false;
  });
});

clearDirectorConfigButton?.addEventListener("click", () => {
  clearDirectorConfigButton.disabled = true;
  void chromeAPI.runtime.sendMessage({
    type: "youtube-music-save-director-config",
    token: "",
  }).then(renderDirectorConfiguration).catch(() => {
    renderDirectorConfiguration({ configured: false, reason: "停用失败" });
  }).finally(() => {
    clearDirectorConfigButton.disabled = false;
  });
});

void refresh();
resumePendingAudioAnalysis();
refreshLyricsConfiguration();
refreshDirectorConfiguration();
setInterval(() => void refresh(), 1000);
