import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  readExtensionPreferences,
  saveExtensionPreferences,
  type ExtensionPreferencesV0,
} from "../../../stage/src/playback/extensionPreferences";
import {
  clearDirectorConfiguration,
  loadDirectorConfiguration,
  loadLyricsConfiguration,
  saveDirectorConfiguration,
  saveLyricsConfiguration,
  settingsChrome,
} from "./settingsClient";
import {
  apiKeyPlaceholder,
  directorProtocolOptions,
  directorStatusCopy,
  displayLyricsEndpoint,
  draftFromPublicProvider,
  emptyProviderDraft,
  endpointForChangedProtocol,
  fallbackProtocolOptions,
  lyricsStatusCopy,
  settingsSectionFromHash,
  settingsSections,
  summarizeDirectorConfig,
  summarizeLyricsConfig,
  type DirectorConfigView,
  type DirectorProtocol,
  type LyricsConfigView,
  type ProviderDraft,
  type SettingsSection,
} from "./settingsModel";

interface ConnectionStatus {
  connected: boolean;
  title: string;
  artist: string;
}

const runtimeAvailable = (): boolean => Boolean(settingsChrome());

const readConnection = (value: unknown): ConnectionStatus => {
  const next = value as {
    connected?: boolean;
    snapshot?: { track?: { title?: string; artist?: string } };
  };
  const connected = next.connected === true && Boolean(next.snapshot?.track?.title);
  return {
    connected,
    title: connected ? next.snapshot?.track?.title ?? "" : "先播放一首歌曲",
    artist: connected ? next.snapshot?.track?.artist ?? "YouTube Music" : "再打开 YouTube Music 歌词",
  };
};

interface ProviderFieldsProps {
  draft: ProviderDraft;
  hasApiKey: boolean;
  fallback?: boolean;
  disabled: boolean;
  onChange(draft: ProviderDraft): void;
}

const ProviderFields = ({ draft, hasApiKey, fallback = false, disabled, onChange }: ProviderFieldsProps) => {
  const options = fallback ? fallbackProtocolOptions : directorProtocolOptions;
  const update = (patch: Partial<ProviderDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.protocol) next.endpoint = endpointForChangedProtocol(patch.protocol, draft.endpoint);
    onChange(next);
  };

  return (
    <div className="settings-fields">
      <label>
        <span>{fallback ? "备用协议" : "接口协议"}</span>
        <select
          data-director-protocol={fallback ? undefined : ""}
          data-director-fallback-protocol={fallback ? "" : undefined}
          value={draft.protocol}
          disabled={disabled}
          onChange={(event) => update({ protocol: event.target.value as DirectorProtocol })}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{fallback ? "备用 API 地址" : "API 地址"}</span>
        <input
          data-director-endpoint={fallback ? undefined : ""}
          data-director-fallback-endpoint={fallback ? "" : undefined}
          type="url"
          value={draft.endpoint}
          disabled={disabled}
          placeholder={fallback ? "http://127.0.0.1:11434/v1" : "https://api.openai.com/v1"}
          autoComplete="off"
          onChange={(event) => update({ endpoint: event.target.value })}
        />
      </label>
      <label>
        <span>{fallback ? "备用模型" : "模型"}</span>
        <input
          data-director-model={fallback ? undefined : ""}
          data-director-fallback-model={fallback ? "" : undefined}
          type="text"
          value={draft.model}
          disabled={disabled}
          placeholder={fallback ? "输入备用模型 ID" : "输入供应商模型 ID"}
          autoComplete="off"
          onChange={(event) => update({ model: event.target.value })}
        />
      </label>
      <label>
        <span>{fallback ? "备用 API Key" : "API Key"}</span>
        <input
          data-director-api-key={fallback ? undefined : ""}
          data-director-fallback-api-key={fallback ? "" : undefined}
          type="password"
          value={draft.apiKey}
          disabled={disabled}
          placeholder={apiKeyPlaceholder(hasApiKey, fallback)}
          autoComplete="new-password"
          onChange={(event) => update({ apiKey: event.target.value })}
        />
      </label>
    </div>
  );
};

export const SettingsApp = () => {
  const [section, setSection] = useState<SettingsSection>(() => settingsSectionFromHash(window.location.hash));
  const [connection, setConnection] = useState<ConnectionStatus>({
    connected: false,
    title: "先播放一首歌曲",
    artist: "再打开 YouTube Music 歌词",
  });
  const [lyrics, setLyrics] = useState<LyricsConfigView>({ configured: false });
  const [lyricsEndpoint, setLyricsEndpoint] = useState(displayLyricsEndpoint(undefined));
  const [lyricsToken, setLyricsToken] = useState("");
  const [director, setDirector] = useState<DirectorConfigView>({ configured: false });
  const [primary, setPrimary] = useState<ProviderDraft>(emptyProviderDraft());
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [fallback, setFallback] = useState<ProviderDraft>(emptyProviderDraft(true));
  const [preferences, setPreferences] = useState<ExtensionPreferencesV0>({ lightweight: false, vjMode: false });
  const [busy, setBusy] = useState<"lyrics" | "director" | "performance" | undefined>();
  const available = runtimeAvailable();

  const applyLyrics = useCallback((next: LyricsConfigView) => {
    setLyrics(next);
    setLyricsEndpoint(displayLyricsEndpoint(next));
    setLyricsToken("");
  }, []);

  const applyDirector = useCallback((next: DirectorConfigView) => {
    setDirector(next);
    if (next.reason) return;
    setPrimary(draftFromPublicProvider(next.primary));
    setFallback(draftFromPublicProvider(next.fallback, true));
    setFallbackEnabled(Boolean(next.fallback));
  }, []);

  useEffect(() => {
    const syncSection = () => setSection(settingsSectionFromHash(window.location.hash));
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);

  useEffect(() => {
    if (!available) return undefined;
    const chromeAPI = settingsChrome();
    let cancelled = false;
    const refreshConnection = async () => {
      try {
        const value = await chromeAPI?.runtime.sendMessage({ type: "youtube-music-request-status" });
        if (!cancelled) setConnection(readConnection(value));
      } catch {
        if (!cancelled) setConnection({ connected: false, title: "先播放一首歌曲", artist: "再打开 YouTube Music 歌词" });
      }
    };
    void loadLyricsConfiguration().then((next) => { if (!cancelled) applyLyrics(next); });
    void loadDirectorConfiguration().then((next) => { if (!cancelled) applyDirector(next); });
    void readExtensionPreferences().then((next) => { if (!cancelled) setPreferences(next); });
    void refreshConnection();
    const timer = window.setInterval(() => void refreshConnection(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [available, applyDirector, applyLyrics]);

  const openSection = (next: SettingsSection) => {
    setSection(next);
    const url = `${window.location.pathname}${window.location.search}#${next}`;
    window.history.replaceState(null, "", url);
  };

  const onSaveLyrics = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("lyrics");
    applyLyrics(await saveLyricsConfiguration(lyricsEndpoint, lyricsToken));
    setBusy(undefined);
  };

  const onClearLyrics = async () => {
    setBusy("lyrics");
    applyLyrics(await saveLyricsConfiguration("", ""));
    setBusy(undefined);
  };

  const onSaveDirector = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("director");
    applyDirector(await saveDirectorConfiguration({ primary, fallbackEnabled, fallback }));
    setBusy(undefined);
  };

  const onClearDirector = async () => {
    setBusy("director");
    applyDirector(await clearDirectorConfiguration());
    setBusy(undefined);
  };

  const onTogglePreference = async (patch: Partial<ExtensionPreferencesV0>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    setBusy("performance");
    try {
      await saveExtensionPreferences(next);
    } catch {
      setPreferences(preferences);
    } finally {
      setBusy(undefined);
    }
  };

  if (!available) {
    return (
      <main className="settings-missing">
        <span className="settings-mark">LS</span>
        <h1>请从 Chrome 扩展打开设置</h1>
        <p>LyricStage 的密钥和歌词后端只保存在本机扩展存储。请在 <code>chrome://extensions</code> 加载解压后的扩展，再通过工具栏图标或「扩展选项」进入此页面。</p>
      </main>
    );
  }

  return (
    <div className="settings-shell">
      <aside className="settings-rail">
        <header className="settings-brand">
          <span className="settings-mark">LS</span>
          <div>
            <strong>LyricStage</strong>
            <small>本机设置</small>
          </div>
        </header>
        <nav aria-label="设置分类">
          {settingsSections.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={section === item.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                openSection(item.id);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <p className="settings-rail-note">未配置 AI 时仍可完成本地演出。Key 不会进入计划缓存或构建产物。</p>
      </aside>

      <div className="settings-main">
        <header className="settings-masthead">
          <div>
            <p className="settings-kicker">YouTube Music 伴生扩展</p>
            <h1>{settingsSections.find((item) => item.id === section)?.label}</h1>
          </div>
          <div className="settings-connection" data-connected={connection.connected || undefined}>
            <b data-dot={connection.connected ? "connected" : undefined} />
            <div>
              <strong>{connection.connected ? "已连接" : "等待 YouTube Music"}</strong>
              <small>{connection.connected ? connection.title : connection.artist}</small>
            </div>
          </div>
        </header>

        {section === "lyrics" && (
          <form className="settings-card" onSubmit={(event) => void onSaveLyrics(event)}>
            <div className="settings-card-head">
              <h2>私有多源歌词</h2>
              <span className="settings-pill" data-on={lyrics.configured || undefined}>
                {summarizeLyricsConfig(lyrics)}
              </span>
            </div>
            <p>配置自己的 LDDC 地址后，扩展会继续聚合网易云、QQ 与酷狗，并在来源提供 QRC/KRC/YRC 时保留真实逐字轴。</p>
            <div className="settings-fields">
              <label>
                <span>后端地址</span>
                <input
                  data-lyrics-endpoint=""
                  type="url"
                  value={lyricsEndpoint}
                  disabled={busy === "lyrics"}
                  placeholder="http://100.x.x.x:8788/"
                  autoComplete="off"
                  onChange={(event) => setLyricsEndpoint(event.target.value)}
                />
              </label>
              <label>
                <span>Bearer 令牌</span>
                <input
                  data-lyrics-token=""
                  type="password"
                  value={lyricsToken}
                  disabled={busy === "lyrics"}
                  placeholder="原地址已配置时可留空"
                  autoComplete="new-password"
                  onChange={(event) => setLyricsToken(event.target.value)}
                />
              </label>
            </div>
            <div className="settings-actions">
              <button className="primary" type="submit" data-save-lyrics-config="" disabled={busy === "lyrics"}>保存</button>
              <button type="button" data-clear-lyrics-config="" disabled={busy === "lyrics"} onClick={() => void onClearLyrics()}>停用</button>
            </div>
            <small className="settings-status" data-lyrics-config-status="">{lyricsStatusCopy(lyrics)}</small>
          </form>
        )}

        {section === "director" && (
          <form className="settings-card" onSubmit={(event) => void onSaveDirector(event)}>
            <div className="settings-card-head">
              <h2>AI 导演 · 本地 BYOK</h2>
              <span className="settings-pill" data-on={director.configured || undefined}>
                {summarizeDirectorConfig(director)}
              </span>
            </div>
            <p>扩展直接调用你选择的模型接口。失败会重试、切备用，最终回到完整确定性演出。</p>
            <ProviderFields
              draft={primary}
              hasApiKey={director.primary?.hasApiKey === true}
              disabled={busy === "director"}
              onChange={setPrimary}
            />
            <label className="settings-toggle">
              <span>配置备用供应商</span>
              <input
                data-director-fallback-enabled=""
                type="checkbox"
                checked={fallbackEnabled}
                disabled={busy === "director"}
                onChange={(event) => {
                  setFallbackEnabled(event.target.checked);
                  if (event.target.checked) {
                    setFallback((current) => ({
                      ...current,
                      endpoint: endpointForChangedProtocol(current.protocol, current.endpoint),
                    }));
                  }
                }}
              />
            </label>
            {fallbackEnabled && (
              <div className="settings-fallback" data-director-fallback="">
                <ProviderFields
                  draft={fallback}
                  hasApiKey={director.fallback?.hasApiKey === true}
                  fallback
                  disabled={busy === "director"}
                  onChange={setFallback}
                />
              </div>
            )}
            <p className="settings-privacy-note">请求从扩展直接发往你选择的 API；Key 仅保存在本机扩展存储，不经过 LyricStage 服务器。HTTP 只接受 localhost、`.local`、RFC1918、link-local 或 Tailscale CGNAT 地址。</p>
            <div className="settings-actions">
              <button className="primary" type="submit" data-save-director-config="" disabled={busy === "director"}>保存并启用</button>
              <button type="button" data-clear-director-config="" disabled={busy === "director"} onClick={() => void onClearDirector()}>停用</button>
            </div>
            <small className="settings-status" data-director-config-status="">{directorStatusCopy(director)}</small>
          </form>
        )}

        {section === "performance" && (
          <section className="settings-card">
            <div className="settings-card-head">
              <h2>演出偏好</h2>
            </div>
            <p>这些选项与 YouTube Music 侧栏工具栏共用同一份本机存储。系统 reduced-motion 仍然拥有最终优先级。</p>
            <label className="settings-switch">
              <span>
                <strong>轻量模式</strong>
                <small>减少模糊和动态效果，适合低性能设备或需要更安静的阅读。</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.lightweight}
                disabled={busy === "performance"}
                onChange={(event) => void onTogglePreference({ lightweight: event.target.checked })}
              />
            </label>
            <label className="settings-switch">
              <span>
                <strong>个人 VJ 模式</strong>
                <small>提高全屏环境运动强度。轻量模式或系统减少动态效果开启时不会强制加强。</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.vjMode}
                disabled={busy === "performance"}
                onChange={(event) => void onTogglePreference({ vjMode: event.target.checked })}
              />
            </label>
          </section>
        )}

        {section === "privacy" && (
          <section className="settings-card">
            <div className="settings-card-head">
              <h2>本机边界</h2>
            </div>
            <ul className="settings-privacy-list">
              <li>LDDC Bearer 与供应商 API Key 只写入 <code>chrome.storage.local</code>，不会进入计划缓存、日志或构建产物。</li>
              <li>扩展不读取 YouTube Cookie、不下载媒体、不持久化 PCM，也不上传原始音频。</li>
              <li>自定义模型域名在保存时才请求你填写的精确 origin，不会预先授予 <code>https://*/*</code>。</li>
              <li>未配置 AI 时，本地导演仍按歌词结构编译完整演出。</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};
