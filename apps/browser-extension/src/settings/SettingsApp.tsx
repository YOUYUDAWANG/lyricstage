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
import { loadDirectorCacheSummariesV1 } from "./directorReviewClient";
import {
  apiKeyPlaceholder,
  canReuseSavedProviderKey,
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
import { directorReviewAggregateV1, type DirectorReviewStateV1 } from "./directorReviewModel";

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
const reviewWarningLabel = (warning: string): string => ({
  "minimum-budget": "预算偏低",
  "single-scale": "手势尺度单一",
  "static-without-evidence": "静态但无连续性证据",
  "repeated-tuple": "连续三首元组重复",
  "coverage-gap": "末段覆盖不足",
  "local-repair-heavy": "本地修复较多",
}[warning] ?? warning);

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
  const paths = section === "lyrics"
    ? <><path d="M9 18V5l9-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="15" cy="16" r="3" /></>
    : section === "director"
      ? <><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><path d="m6.3 6.3 2.1 2.1m7.2 7.2 2.1 2.1m0-11.4-2.1 2.1m-7.2 7.2-2.1 2.1" /><circle cx="12" cy="12" r="3.2" /></>
      : section === "performance"
        ? <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
        : <><path d="M12 3a7 7 0 0 0-4 12.7V21h8v-5.3A7 7 0 0 0 12 3Z" /><path d="M9 17h6" /></>;
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>;
};

const discoveryCopy = (state: ModelDiscoveryState): string => {
  if (state.phase === "connecting") return "正在连接并读取可用模型…";
  if (state.phase === "connected") return `已连接 · ${state.models.length} 个可用模型`;
  if (state.phase === "saved") return "当前为已保存模型；连接后可刷新列表";
  if (state.phase === "error") return state.reason ?? "连接失败";
  return "连接提供商后选择模型";
};

const sectionDescription = (section: SettingsSection): string => {
  if (section === "lyrics") return "配置可选的私有歌词服务；公开只读来源始终保留。";
  if (section === "director") return "连接模型提供商，验证账户，再选择用于整曲演出的模型。";
  if (section === "performance") return "调整歌词栏和全屏舞台的本机演出偏好。";
  return "查看 LyricStage 如何处理密钥、媒体和站点权限。";
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
          <h3>{fallback ? "备用提供商" : "模型提供商"}</h3>
          <p>{fallback ? "主模型不可用时按相同规则接替。" : "先验证连接，再从账户实际可用的模型中选择。"}</p>
        </div>
        <span className="connection-state" data-phase={discovery.phase}>
          <i />{discovery.phase === "connected" ? "本次已验证" : discovery.phase === "error" ? "连接失败" : discovery.phase === "saved" ? "已保存" : "未验证"}
        </span>
      </header>

      <div className="provider-rows">
        <label className="provider-row">
          <span><strong>提供商</strong><small>决定连接协议和默认 API 地址</small></span>
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

        <label className="provider-row">
          <span><strong>{fallback ? "备用 API Key" : "API Key"}</strong><small>{hasApiKey ? "同一提供商已保存，可留空继续使用" : draft.protocol === "openai-compatible" ? "本地无鉴权服务可以留空" : "只保存在本机扩展存储"}</small></span>
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

        <div className="provider-row provider-connect-row">
          <span><strong>连接验证</strong><small>仅请求当前 API origin 并读取模型列表</small></span>
          <button
            className="connect-button"
            type="button"
            data-discover-director-models={fallback ? undefined : ""}
            data-discover-fallback-models={fallback ? "" : undefined}
            disabled={disabled || connecting || !draft.endpoint.trim()}
            onClick={onDiscover}
          >
            {connecting ? "正在连接…" : discovery.phase === "connected" ? "刷新模型" : "连接并读取模型"}
          </button>
        </div>

        {modelOptions.length > 0 && (
          <label className="provider-row model-row">
            <span><strong>可用模型</strong><small>{discovery.phase === "saved" ? "当前为已保存选择，重新连接可刷新" : `${modelOptions.length} 个模型可供选择`}</small></span>
            <select
              data-director-model={fallback ? undefined : ""}
              data-director-fallback-model={fallback ? "" : undefined}
              value={draft.model}
              disabled={disabled || connecting}
              onChange={(event) => onChange({ ...draft, model: event.target.value })}
            >
              <option value="">请选择模型</option>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label === model.id ? model.id : `${model.label} · ${model.id}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <p className="provider-footnote" data-phase={discovery.phase} aria-live="polite">{discoveryCopy(discovery)}</p>

      <details className="advanced-disclosure">
        <summary>高级连接设置</summary>
        <label className="advanced-endpoint">
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
      </details>
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
  const [lyricsDirty, setLyricsDirty] = useState(false);
  const [director, setDirector] = useState<DirectorConfigView>({ configured: false });
  const [directorReview, setDirectorReview] = useState<DirectorReviewStateV1>({ status: "loading", summaries: [] });
  const [primary, setPrimary] = useState<ProviderDraft>(emptyProviderDraft());
  const [primaryDiscovery, setPrimaryDiscovery] = useState<ModelDiscoveryState>(emptyDiscovery);
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [fallback, setFallback] = useState<ProviderDraft>(emptyProviderDraft(true));
  const [fallbackDiscovery, setFallbackDiscovery] = useState<ModelDiscoveryState>(emptyDiscovery);
  const [directorDirty, setDirectorDirty] = useState(false);
  const [preferences, setPreferences] = useState<ExtensionPreferencesV0>({ lightweight: false, vjMode: false, rollingDirectorV1: "off" });
  const [preferenceStatus, setPreferenceStatus] = useState("修改后立即保存在本机");
  const [busy, setBusy] = useState<"lyrics" | "director" | "performance" | undefined>();
  const available = runtimeAvailable();

  const applyLyrics = useCallback((next: LyricsConfigView) => {
    if (next.reason) {
      setLyrics((current) => ({ ...current, reason: next.reason }));
      return;
    }
    setLyrics(next);
    setLyricsEndpoint(displayLyricsEndpoint(next));
    setLyricsToken("");
    setLyricsDirty(false);
  }, []);

  const applyDirector = useCallback((next: DirectorConfigView) => {
    if (next.reason) {
      setDirector((current) => ({ ...current, reason: next.reason }));
      return;
    }
    setDirector(next);
    const nextPrimary = draftFromPublicProvider(next.primary);
    const nextFallback = draftFromPublicProvider(next.fallback, true);
    setPrimary(nextPrimary);
    setFallback(nextFallback);
    setPrimaryDiscovery(savedDiscovery(nextPrimary.model));
    setFallbackDiscovery(savedDiscovery(nextFallback.model));
    setFallbackEnabled(Boolean(next.fallback));
    setDirectorDirty(false);
  }, []);

  useEffect(() => {
    if (!lyricsDirty && !directorDirty) return undefined;
    const preventAccidentalClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventAccidentalClose);
    return () => window.removeEventListener("beforeunload", preventAccidentalClose);
  }, [directorDirty, lyricsDirty]);

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
    void loadDirectorCacheSummariesV1().then((next) => { if (!cancelled) setDirectorReview(next); });
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
    if (!window.confirm("删除私有歌词服务地址和本机保存的 Bearer 令牌？公开歌词来源不会受影响。")) return;
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
    setDraft((current) => {
      const model = result.models.some((candidate) => candidate.id === current.model) ? current.model : "";
      if (model !== current.model) setDirectorDirty(true);
      return { ...current, model };
    });
  };

  const onSaveDirector = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("director");
    applyDirector(await saveDirectorConfiguration({ primary, fallbackEnabled, fallback }));
    setBusy(undefined);
  };

  const onClearDirector = async () => {
    if (!window.confirm("删除 AI 导演配置和本机保存的提供商 Key？删除后仍会继续使用本地确定性演出。")) return;
    setBusy("director");
    applyDirector(await clearDirectorConfiguration());
    setBusy(undefined);
  };

  const onTogglePreference = async (patch: Partial<ExtensionPreferencesV0>) => {
    const previous = preferences;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    setBusy("performance");
    setPreferenceStatus("正在保存…");
    try {
      await saveExtensionPreferences(next);
      setPreferenceStatus("已保存");
    } catch {
      setPreferences(previous);
      setPreferenceStatus("保存失败，已恢复原设置");
    } finally {
      setBusy(undefined);
    }
  };

  const resetLyricsDraft = () => {
    setLyricsEndpoint(displayLyricsEndpoint(lyrics));
    setLyricsToken("");
    setLyricsDirty(false);
  };

  const resetDirectorDraft = () => {
    const { reason: _reason, ...saved } = director;
    applyDirector(saved);
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
  const currentSummary = section === "lyrics"
    ? summarizeLyricsConfig(lyrics)
    : section === "director"
      ? summarizeDirectorConfig(director)
      : section === "performance" ? preferenceStatus : "本机优先";

  return (
    <div className="settings-window">
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
              <span className="nav-icon">{sectionIcon(item.id)}</span><span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-runtime">
          <span className="runtime-dot" data-connected={connection.connected || undefined} />
          <div><strong>{connection.connected ? "YouTube Music 已连接" : "等待播放器"}</strong><small>{connection.connected ? connection.title : "本地演出始终可用"}</small></div>
        </div>
      </aside>

      <main className="settings-content">
        <header className="settings-page-header">
          <div><h1>{currentSection?.label}</h1><p>{sectionDescription(section)}</p></div>
          <span className="page-status" data-on={(section === "lyrics" ? lyrics.configured : section === "director" ? director.configured : true) || undefined}>{currentSummary}</span>
        </header>

        <div className="settings-scroll">
          {section === "lyrics" && (
            <form className="settings-card" onSubmit={(event) => void onSaveLyrics(event)}>
              <div className="section-intro"><h2>私有多源歌词</h2><p>接入自己的 LDDC；LRCLIB 与酷狗仍作为公开只读来源。</p></div>
              <div className="grouped-form">
                <label className="form-row"><span><strong>后端地址</strong><small>支持本机、局域网或 Tailscale 地址</small></span><input data-lyrics-endpoint="" type="url" value={lyricsEndpoint} disabled={busy === "lyrics"} placeholder="http://100.x.x.x:8788/" autoComplete="off" onChange={(event) => { setLyricsEndpoint(event.target.value); setLyricsDirty(true); }} /></label>
                <label className="form-row"><span><strong>Bearer 令牌</strong><small>{lyrics.configured ? "原地址已配置时可留空" : "仅保存在本机扩展存储"}</small></span><input data-lyrics-token="" type="password" value={lyricsToken} disabled={busy === "lyrics"} placeholder="可选" autoComplete="new-password" onChange={(event) => { setLyricsToken(event.target.value); setLyricsDirty(true); }} /></label>
              </div>
              <footer className="settings-card-footer">
                <small className="settings-status" data-lyrics-config-status="">{lyricsDirty ? "有未保存修改" : lyricsStatusCopy(lyrics)}</small>
                <div className="settings-actions"><button type="button" className="danger" data-clear-lyrics-config="" disabled={busy === "lyrics" || !lyrics.configured} onClick={() => void onClearLyrics()}>删除配置与令牌</button>{lyricsDirty && <button type="button" disabled={busy === "lyrics"} onClick={resetLyricsDraft}>取消修改</button>}<button className="primary" type="submit" data-save-lyrics-config="" disabled={busy === "lyrics" || (lyrics.configured && !lyricsDirty)}>{busy === "lyrics" ? "正在保存…" : "保存"}</button></div>
              </footer>
            </form>
          )}

          {section === "director" && (
            <>
            <form className="settings-card director-card" onSubmit={(event) => void onSaveDirector(event)}>
              <ProviderFields draft={primary} discovery={primaryDiscovery} hasApiKey={canReuseSavedProviderKey(director.primary, primary)} disabled={busy === "director"} onChange={(next) => { setPrimary(next); setDirectorDirty(true); }} onDiscoveryReset={() => setPrimaryDiscovery(emptyDiscovery())} onDiscover={() => void onDiscover("primary")} />
              <label className="settings-toggle fallback-toggle">
                <span><strong>备用提供商</strong><small>主模型失败时自动切换，然后再回到本地确定性演出。</small></span>
                <input data-director-fallback-enabled="" type="checkbox" checked={fallbackEnabled} disabled={busy === "director"} onChange={(event) => {
                  setFallbackEnabled(event.target.checked);
                  setDirectorDirty(true);
                  if (event.target.checked) setFallback((current) => ({ ...current, endpoint: endpointForChangedProtocol(current.protocol, current.endpoint) }));
                }} />
              </label>
              {fallbackEnabled && <ProviderFields draft={fallback} discovery={fallbackDiscovery} hasApiKey={canReuseSavedProviderKey(director.fallback, fallback)} fallback disabled={busy === "director"} onChange={(next) => { setFallback(next); setDirectorDirty(true); }} onDiscoveryReset={() => setFallbackDiscovery(emptyDiscovery())} onDiscover={() => void onDiscover("fallback")} />}
              <div className="privacy-banner"><span aria-hidden="true">i</span><p>请求直接发往所选 API。Key 只保存在本机，模型列表与导演计划都不会包含 Key。</p></div>
              <footer className="settings-card-footer">
                <div className="settings-status-stack"><small className="settings-status" data-director-config-status="">{directorDirty ? "有未保存修改" : directorStatusCopy(director)}</small><small className="settings-status" data-director-last-timing="">{directorTimingCopy(director)}</small></div>
                <div className="settings-actions"><button type="button" className="danger" data-clear-director-config="" disabled={busy === "director" || !director.configured} onClick={() => void onClearDirector()}>删除配置与 Key</button>{directorDirty && <button type="button" disabled={busy === "director"} onClick={resetDirectorDraft}>取消修改</button>}<button className="primary" type="submit" data-save-director-config="" disabled={busy === "director" || !directorDirty || !primary.model}>{busy === "director" ? "正在保存…" : "保存并启用"}</button></div>
              </footer>
            </form>
            <section className="settings-card director-review" data-director-review-state={directorReview.status}>
              <div className="section-intro"><h2>Director 审片</h2><p>只读取本机缓存的安全摘要；不会返回歌词、提示词、完整计划、Key 或 API 地址。</p></div>
              <p className="director-review-summary" aria-live="polite">{directorReviewAggregateV1(directorReview)}</p>
              {directorReview.status === "ready" && (
                <div className="director-review-list">
                  {directorReview.summaries.map((summary) => (
                    <details className="director-review-row" key={`${summary.trackIDDisplay}:${summary.createdAtUnixMs}`}>
                      <summary>
                        <span><strong>{summary.trackTitle}</strong><small>{summary.trackArtist} · {summary.trackIDDisplay}</small></span>
                        <span className="review-metrics">{summary.coveragePercent}% · M{summary.signatureMomentCount} G{summary.gestureCounts.total} E{summary.effectCount} L{summary.layoutTransitionCount}</span>
                        <span className="review-motif">{summary.motifFamily}</span>
                        <span className="review-warnings">{summary.warnings.length ? summary.warnings.map(reviewWarningLabel).join(" · ") : "无提醒"}</span>
                      </summary>
                      <dl>
                        <div><dt>World</dt><dd>{summary.baseLayout} / {summary.world.spatialMode} / {summary.world.artworkRole} / {summary.world.motionLaw}</dd></div>
                        <div><dt>Compiler</dt><dd>{summary.compilerVersion} · {summary.semanticDirectiveCount} semantic directives</dd></div>
                        <div><dt>Cache</dt><dd>{summary.cacheVersion} / {summary.cacheEpoch} / {summary.source}</dd></div>
                        <div><dt>Bible</dt><dd>{summary.bibleIdentityPrefix} · {summary.actCount} acts · quiet {summary.quietSharePercent}%</dd></div>
                        <div><dt>Gestures</dt><dd>glyph {summary.gestureCounts.glyph} / token {summary.gestureCounts.token} / phrase {summary.gestureCounts.phrase}</dd></div>
                        <div><dt>Effects</dt><dd>{Object.entries(summary.effectPrimitiveCounts).map(([name, count]) => `${name} ${count}`).join(" / ") || "0"}</dd></div>
                        <div><dt>Coverage</dt><dd>{summary.sceneCardCount} cards · {summary.missingRanges.length} missing ranges</dd></div>
                        <div><dt>Timing</dt><dd>{summary.timing ? `${summary.timing.cache} · ${summary.timing.totalMs}ms · provider ${summary.timing.providerMs}ms · ${summary.timing.attempts} attempts` : "无记录"}</dd></div>
                        <div><dt>Repairs</dt><dd>{summary.localRepairFlags.join(" / ") || "none"}</dd></div>
                      </dl>
                    </details>
                  ))}
                </div>
              )}
            </section>
            </>
          )}

          {section === "performance" && (
            <section className="settings-card">
              <div className="section-intro"><h2>演出偏好</h2><p>与 YouTube Music 歌词栏共用，并在修改后立即保存。</p></div>
              <div className="grouped-list">
                <label className="settings-switch"><span><strong>轻量模式</strong><small>减少模糊和动态效果，适合低性能设备或安静阅读。</small></span><input type="checkbox" checked={preferences.lightweight} disabled={busy === "performance"} onChange={(event) => void onTogglePreference({ lightweight: event.target.checked })} /></label>
                <label className="settings-switch"><span><strong>个人 VJ 模式</strong><small>增强全屏环境运动；系统“减少动态效果”仍拥有最终优先级。</small></span><input type="checkbox" checked={preferences.vjMode} disabled={busy === "performance"} onChange={(event) => void onTogglePreference({ vjMode: event.target.checked })} /></label>
                <label className="settings-switch"><span><strong>Rolling Director V2</strong><small>AI 只给稀疏语义 Cue，本地编译演出；Off 使用旧导演，Shadow 只缓存，On 才渲染。</small></span><select data-rolling-director-v1="" value={preferences.rollingDirectorV1} disabled={busy === "performance"} onChange={(event) => void onTogglePreference({ rollingDirectorV1: event.target.value as ExtensionPreferencesV0["rollingDirectorV1"] })}><option value="off">Off · legacy</option><option value="shadow">Shadow · audit only</option><option value="on">On · sparse cues</option></select></label>
              </div>
              <small className="inline-status" aria-live="polite">{preferenceStatus}</small>
            </section>
          )}

          {section === "privacy" && (
            <section className="settings-card">
              <div className="section-intro"><h2>本机边界</h2><p>LyricStage 只取完成同步演出所需的最小数据。</p></div>
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
