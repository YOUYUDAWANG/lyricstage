import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { DirectorModelOptionV1 } from "@lyricstage/performance";
import {
  readExtensionPreferences,
  saveExtensionPreferences,
  type ExtensionPreferencesV0,
} from "../../../stage/src/playback/extensionPreferences";
import {
  clearDirectorConfiguration,
  discoverDirectorModels,
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
  directorTimingCopy,
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

type ModelDiscoveryPhase = "idle" | "saved" | "connecting" | "connected" | "error";

interface ModelDiscoveryState {
  phase: ModelDiscoveryPhase;
  models: DirectorModelOptionV1[];
  reason?: string;
}

const emptyDiscovery = (): ModelDiscoveryState => ({ phase: "idle", models: [] });
const savedDiscovery = (model: string): ModelDiscoveryState => model
  ? { phase: "saved", models: [{ id: model, label: model }] }
  : emptyDiscovery();
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

const sectionIcon = (section: SettingsSection): ReactNode => {
  if (section === "lyrics") return "♫";
  if (section === "director") return "✦";
  if (section === "performance") return "◫";
  return "⌾";
};

const discoveryCopy = (state: ModelDiscoveryState): string => {
  if (state.phase === "connecting") return "正在连接并读取可用模型…";
  if (state.phase === "connected") return `已连接 · ${state.models.length} 个可用模型`;
  if (state.phase === "saved") return "当前为已保存模型；连接后可刷新列表";
  if (state.phase === "error") return state.reason ?? "连接失败";
  return "连接提供商后选择模型";
};

interface ProviderFieldsProps {
  draft: ProviderDraft;
  discovery: ModelDiscoveryState;
  hasApiKey: boolean;
  fallback?: boolean;
  disabled: boolean;
  onChange(draft: ProviderDraft): void;
  onDiscoveryReset(): void;
  onDiscover(): void;
}

const ProviderFields = ({
  draft,
  discovery,
  hasApiKey,
  fallback = false,
  disabled,
  onChange,
  onDiscoveryReset,
  onDiscover,
}: ProviderFieldsProps) => {
  const options = fallback ? fallbackProtocolOptions : directorProtocolOptions;
  const connecting = discovery.phase === "connecting";
  const modelOptions = discovery.models.some((model) => model.id === draft.model) || !draft.model
    ? discovery.models
    : [{ id: draft.model, label: `${draft.model}（已保存）` }, ...discovery.models];
  const updateConnection = (patch: Partial<ProviderDraft>, clearModel = false) => {
    const next = { ...draft, ...patch, ...(clearModel ? { model: "" } : {}) };
    if (patch.protocol) next.endpoint = endpointForChangedProtocol(patch.protocol, draft.endpoint);
    onChange(next);
    onDiscoveryReset();
  };

  return (
    <section className="provider-panel" aria-label={fallback ? "备用模型提供商" : "主要模型提供商"}>
      <header className="provider-heading">
        <div>
          <span className="provider-eyebrow">{fallback ? "Fallback" : "Primary"}</span>
          <h3>{fallback ? "备用提供商" : "主要提供商"}</h3>
        </div>
        <span className="connection-state" data-phase={discovery.phase}>
          <i />{discovery.phase === "connected" ? "已连接" : discovery.phase === "error" ? "连接失败" : "待连接"}
        </span>
      </header>

      <div className="provider-grid">
        <label className="field-group compact-field">
          <span>接口协议</span>
          <select
            data-director-protocol={fallback ? undefined : ""}
            data-director-fallback-protocol={fallback ? "" : undefined}
            value={draft.protocol}
            disabled={disabled || connecting}
            onChange={(event) => updateConnection({ protocol: event.target.value as DirectorProtocol }, true)}
          >
            {options.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
          </select>
        </label>

        <label className="field-group endpoint-field">
          <span>API 地址</span>
          <input
            data-director-endpoint={fallback ? undefined : ""}
            data-director-fallback-endpoint={fallback ? "" : undefined}
            type="url"
            value={draft.endpoint}
            disabled={disabled || connecting}
            placeholder={fallback ? "http://127.0.0.1:11434/v1" : "https://api.openai.com/v1"}
            autoComplete="off"
            onChange={(event) => updateConnection({ endpoint: event.target.value }, true)}
          />
        </label>

        <label className="field-group key-field">
          <span>{fallback ? "备用 API Key" : "API Key"}</span>
          <input
            data-director-api-key={fallback ? undefined : ""}
            data-director-fallback-api-key={fallback ? "" : undefined}
            type="password"
            value={draft.apiKey}
            disabled={disabled || connecting}
            placeholder={apiKeyPlaceholder(hasApiKey, fallback)}
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            spellCheck={false}
            onChange={(event) => updateConnection({ apiKey: event.target.value })}
          />
        </label>

        <button
          className="connect-button"
          type="button"
          data-discover-director-models={fallback ? undefined : ""}
          data-discover-fallback-models={fallback ? "" : undefined}
          disabled={disabled || connecting || !draft.endpoint.trim()}
          onClick={onDiscover}
        >
          <span aria-hidden="true">↻</span>
          {connecting ? "连接中" : discovery.phase === "connected" ? "刷新模型" : "连接提供商"}
        </button>

        <label className="field-group model-field">
          <span>可用模型</span>
          <select
            data-director-model={fallback ? undefined : ""}
            data-director-fallback-model={fallback ? "" : undefined}
            value={draft.model}
            disabled={disabled || connecting || modelOptions.length === 0}
            onChange={(event) => onChange({ ...draft, model: event.target.value })}
          >
            <option value="">{modelOptions.length > 0 ? "选择模型" : "请先连接提供商"}</option>
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label === model.id ? model.id : `${model.label} · ${model.id}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="provider-footnote" data-phase={discovery.phase} aria-live="polite">{discoveryCopy(discovery)}</p>
    </section>
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
  const [primaryDiscovery, setPrimaryDiscovery] = useState<ModelDiscoveryState>(emptyDiscovery);
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [fallback, setFallback] = useState<ProviderDraft>(emptyProviderDraft(true));
  const [fallbackDiscovery, setFallbackDiscovery] = useState<ModelDiscoveryState>(emptyDiscovery);
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
    const nextPrimary = draftFromPublicProvider(next.primary);
    const nextFallback = draftFromPublicProvider(next.fallback, true);
    setPrimary(nextPrimary);
    setFallback(nextFallback);
    setPrimaryDiscovery(savedDiscovery(nextPrimary.model));
    setFallbackDiscovery(savedDiscovery(nextFallback.model));
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

  const onDiscover = async (slot: "primary" | "fallback") => {
    const draft = slot === "primary" ? primary : fallback;
    const setDiscovery = slot === "primary" ? setPrimaryDiscovery : setFallbackDiscovery;
    const setDraft = slot === "primary" ? setPrimary : setFallback;
    setDiscovery({ phase: "connecting", models: [] });
    const result = await discoverDirectorModels(draft, slot);
    if (result.reason || result.models.length === 0) {
      setDiscovery({ phase: "error", models: [], reason: result.reason ?? "没有找到可用模型" });
      return;
    }
    setDiscovery({ phase: "connected", models: result.models });
    setDraft((current) => ({
      ...current,
      model: result.models.some((model) => model.id === current.model)
        ? current.model
        : result.models[0]?.id ?? "",
    }));
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

  const currentSection = settingsSections.find((item) => item.id === section);

  return (
    <div className="settings-window">
      <div className="ambient-shape ambient-one" />
      <div className="ambient-shape ambient-two" />

      <aside className="settings-sidebar">
        <header className="settings-brand">
          <span className="settings-mark">LS</span>
          <div><strong>LyricStage</strong><small>扩展设置</small></div>
        </header>
        <nav aria-label="设置分类">
          <span className="sidebar-label">设置</span>
          {settingsSections.map((item) => (
            <a key={item.id} href={`#${item.id}`} aria-current={section === item.id ? "page" : undefined} onClick={(event) => {
              event.preventDefault();
              openSection(item.id);
            }}>
              <i aria-hidden="true">{sectionIcon(item.id)}</i><span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-runtime">
          <span className="runtime-dot" data-connected={connection.connected || undefined} />
          <div><strong>{connection.connected ? "YouTube Music 已连接" : "等待播放器"}</strong><small>{connection.connected ? connection.title : "本地演出始终可用"}</small></div>
        </div>
      </aside>

      <main className="settings-content">
        <header className="settings-toolbar">
          <div><span className="toolbar-eyebrow">LyricStage</span><h1>{currentSection?.label}</h1></div>
          <span className="toolbar-status" data-connected={connection.connected || undefined}><i />{connection.connected ? connection.artist : "未连接播放器"}</span>
        </header>

        <div className="settings-scroll">
          {section === "lyrics" && (
            <form className="settings-card" onSubmit={(event) => void onSaveLyrics(event)}>
              <header className="settings-card-head">
                <div className="card-icon lyrics-icon">♫</div>
                <div><h2>私有多源歌词</h2><p>接入自己的 LDDC，同时保留 LRCLIB 与酷狗的自动搜索。</p></div>
                <span className="settings-pill" data-on={lyrics.configured || undefined}>{summarizeLyricsConfig(lyrics)}</span>
              </header>
              <div className="grouped-form">
                <label className="form-row"><span>后端地址</span><input data-lyrics-endpoint="" type="url" value={lyricsEndpoint} disabled={busy === "lyrics"} placeholder="http://100.x.x.x:8788/" autoComplete="off" onChange={(event) => setLyricsEndpoint(event.target.value)} /></label>
                <label className="form-row"><span>Bearer 令牌</span><input data-lyrics-token="" type="password" value={lyricsToken} disabled={busy === "lyrics"} placeholder="原地址已配置时可留空" autoComplete="new-password" onChange={(event) => setLyricsToken(event.target.value)} /></label>
              </div>
              <footer className="settings-card-footer">
                <small className="settings-status" data-lyrics-config-status="">{lyricsStatusCopy(lyrics)}</small>
                <div className="settings-actions"><button type="button" data-clear-lyrics-config="" disabled={busy === "lyrics"} onClick={() => void onClearLyrics()}>停用</button><button className="primary" type="submit" data-save-lyrics-config="" disabled={busy === "lyrics"}>保存</button></div>
              </footer>
            </form>
          )}

          {section === "director" && (
            <form className="settings-card director-card" onSubmit={(event) => void onSaveDirector(event)}>
              <header className="settings-card-head">
                <div className="card-icon director-icon">✦</div>
                <div><h2>AI 导演</h2><p>连接模型提供商，读取账户实际可用的模型，再选择演出导演。</p></div>
                <span className="settings-pill" data-on={director.configured || undefined}>{summarizeDirectorConfig(director)}</span>
              </header>
              <ProviderFields draft={primary} discovery={primaryDiscovery} hasApiKey={director.primary?.hasApiKey === true} disabled={busy === "director"} onChange={setPrimary} onDiscoveryReset={() => setPrimaryDiscovery(emptyDiscovery())} onDiscover={() => void onDiscover("primary")} />
              <label className="settings-toggle fallback-toggle">
                <span><strong>备用提供商</strong><small>主模型失败时自动切换，然后再回到本地确定性演出。</small></span>
                <input data-director-fallback-enabled="" type="checkbox" checked={fallbackEnabled} disabled={busy === "director"} onChange={(event) => {
                  setFallbackEnabled(event.target.checked);
                  if (event.target.checked) setFallback((current) => ({ ...current, endpoint: endpointForChangedProtocol(current.protocol, current.endpoint) }));
                }} />
              </label>
              {fallbackEnabled && <ProviderFields draft={fallback} discovery={fallbackDiscovery} hasApiKey={director.fallback?.hasApiKey === true} fallback disabled={busy === "director"} onChange={setFallback} onDiscoveryReset={() => setFallbackDiscovery(emptyDiscovery())} onDiscover={() => void onDiscover("fallback")} />}
              <div className="privacy-banner"><span aria-hidden="true">⌾</span><p>请求从扩展直接发往所选 API。Key 只保存在本机扩展存储；模型列表和导演计划都不会包含 Key。HTTP 仅允许本机、局域网、link-local 或 Tailscale 地址。</p></div>
              <footer className="settings-card-footer">
                <div className="settings-status-stack"><small className="settings-status" data-director-config-status="">{directorStatusCopy(director)}</small><small className="settings-status" data-director-last-timing="">{directorTimingCopy(director)}</small></div>
                <div className="settings-actions"><button type="button" data-clear-director-config="" disabled={busy === "director"} onClick={() => void onClearDirector()}>停用</button><button className="primary" type="submit" data-save-director-config="" disabled={busy === "director" || !primary.model}>保存并启用</button></div>
              </footer>
            </form>
          )}

          {section === "performance" && (
            <section className="settings-card">
              <header className="settings-card-head"><div className="card-icon performance-icon">◫</div><div><h2>演出偏好</h2><p>与 YouTube Music 侧栏共用同一份本机设置，并实时生效。</p></div></header>
              <div className="grouped-list">
                <label className="settings-switch"><span><strong>轻量模式</strong><small>减少模糊和动态效果，适合低性能设备或安静阅读。</small></span><input type="checkbox" checked={preferences.lightweight} disabled={busy === "performance"} onChange={(event) => void onTogglePreference({ lightweight: event.target.checked })} /></label>
                <label className="settings-switch"><span><strong>个人 VJ 模式</strong><small>增强全屏环境运动；系统“减少动态效果”仍拥有最终优先级。</small></span><input type="checkbox" checked={preferences.vjMode} disabled={busy === "performance"} onChange={(event) => void onTogglePreference({ vjMode: event.target.checked })} /></label>
              </div>
            </section>
          )}

          {section === "privacy" && (
            <section className="settings-card">
              <header className="settings-card-head"><div className="card-icon privacy-icon">⌾</div><div><h2>本机边界</h2><p>LyricStage 只取完成同步演出所需的最小数据。</p></div></header>
              <div className="privacy-list">
                <article><span>1</span><div><strong>密钥留在本机</strong><p>LDDC Bearer 与供应商 API Key 只写入 <code>chrome.storage.local</code>。</p></div></article>
                <article><span>2</span><div><strong>不接管媒体</strong><p>扩展不读取 Cookie、不下载媒体、不持久化 PCM，也不上传原始音频。</p></div></article>
                <article><span>3</span><div><strong>按需授权域名</strong><p>连接提供商时才请求精确 origin，不会预先取得所有站点访问权。</p></div></article>
                <article><span>4</span><div><strong>AI 永远可选</strong><p>未配置或请求失败时，本地导演仍会编译完整确定性演出。</p></div></article>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};
