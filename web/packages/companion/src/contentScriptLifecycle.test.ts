import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("YouTube Music companion isolated content script lifecycle (real DOM shape)", () => {
  const contentScriptSource = readFileSync(
    new URL("../../../apps/youtube-music-companion/public/content.js", import.meta.url),
    "utf8",
  );
  const manifestSource = readFileSync(
    new URL("../../../apps/youtube-music-companion/public/manifest.json", import.meta.url),
    "utf8",
  );
  const contentUISource = readFileSync(
    new URL("../../../apps/youtube-music-companion/src/content-ui.tsx", import.meta.url),
    "utf8",
  );
  class FakeClock {
    now = 0;
    nextID = 1;
    tasks = new Map<number, { at: number; callback: () => void }>();

    setTimeout = (callback: () => void, delay = 0) => {
      const id = this.nextID++;
      this.tasks.set(id, { at: this.now + Math.max(0, delay), callback });
      return id;
    };

    clearTimeout = (id: number | null | undefined) => {
      if (typeof id === "number") this.tasks.delete(id);
    };

    advance = (milliseconds: number) => {
      const target = this.now + milliseconds;
      while (true) {
        const next = [...this.tasks.entries()]
          .filter(([, task]) => task.at <= target)
          .sort(([leftID, left], [rightID, right]) => left.at - right.at || leftID - rightID)[0];
        if (!next) break;
        const [id, task] = next;
        this.tasks.delete(id);
        this.now = task.at;
        task.callback();
      }
      this.now = target;
    };
  }

  class FakeElement {
    id = "";
    className = "";
    textContent = "";
    type = "";
    title = "";
    allow = "";
    src = "";
    hidden = false;
    isConnected = true;
    parentElement: FakeElement | null = null;
    children: FakeElement[] = [];
    attributes = new Map<string, string>();
    style: Record<string, string> = { display: "" };
    shadowRoot: FakeElement | null = null;
    eventListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    dispatchedEvents: string[] = [];
    classList = {
      contains: (token: string) => this.className.split(/\s+/).includes(token),
    };

    append = vi.fn((...items: FakeElement[]) => {
      items.forEach((child) => {
        child.isConnected = true;
        child.parentElement = this;
        if (!this.children.includes(child)) {
          this.children.push(child);
        }
      });
    });

    attachShadow = vi.fn(() => {
      this.shadowRoot = new FakeElement();
      return this.shadowRoot;
    });

    remove = vi.fn(() => {
      this.isConnected = false;
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
        this.parentElement = null;
      }
    });

    addEventListener = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const listeners = this.eventListeners.get(event) ?? new Set();
      listeners.add(listener);
      this.eventListeners.set(event, listeners);
    });

    removeEventListener = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      this.eventListeners.get(event)?.delete(listener);
    });

    emit(event: string, value: unknown = {}) {
      for (const listener of [...(this.eventListeners.get(event) ?? [])]) listener(value);
    }

    setAttribute = vi.fn((name: string, value: string) => {
      this.attributes.set(name, String(value));
    });

    getAttribute = vi.fn((name: string) => this.attributes.get(name) ?? null);

    hasAttribute = vi.fn((name: string) => this.attributes.has(name));

    removeAttribute = vi.fn((name: string) => {
      this.attributes.delete(name);
    });

    toggleAttribute = vi.fn((name: string, force?: boolean) => {
      const enabled = force ?? !this.attributes.has(name);
      if (enabled) this.attributes.set(name, "");
      else this.attributes.delete(name);
      return enabled;
    });

    querySelector = vi.fn((_selector: string): FakeElement | null => null);

    querySelectorAll = vi.fn((_selector: string): FakeElement[] => this.children);

    click = vi.fn(() => {
      this.setAttribute("aria-selected", "true");
      this.toggleAttribute("selected", true);
    });

    dispatchEvent = vi.fn((event: { type: string }) => {
      this.dispatchedEvents.push(event.type);
      this.emit(event.type, event);
      return true;
    });
  }

  class FakeMediaElement {
    static readonly HAVE_FUTURE_DATA = 3;
    ended = false;
    paused = false;
    readyState = 4;
    duration = 159;
    currentTime = 12;
    playbackRate = 1;
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
  }

  const createEnvironment = (overrides: {
    rendererPageType?: string;
    lyricsSelected?: boolean;
    invalidateRuntime?: boolean;
    contentUIMarker?: boolean;
    playerBarTimeText?: string;
    mediaElements?: Array<Partial<Pick<
      FakeMediaElement,
      "ended" | "paused" | "readyState" | "duration" | "currentTime" | "playbackRate"
    >>>;
  } = {}) => {
    const createdElements: FakeElement[] = [];
    const clock = new FakeClock();
    const clearIntervalFn = vi.fn();
    const disconnectFn = vi.fn();
    const runtimeListeners: Array<
      (message: unknown, sender: unknown, respond: (value: unknown) => void) => unknown
    > = [];
    const sentMessages: unknown[] = [];
    const windowListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    let heartbeatCallback: (() => void) | undefined;
    let invalidateRuntime = overrides.invalidateRuntime ?? false;
    let playerBarAvailable = true;
    let mediaAvailable = true;
    let tabOrder: FakeElement[];

    const mediaElements = (overrides.mediaElements ?? [{}]).map((values) =>
      Object.assign(new FakeMediaElement(), values)
    );
    const media = mediaElements[0];
    const documentElement = new FakeElement();
    if (overrides.contentUIMarker ?? true) {
      documentElement.setAttribute("data-lyricstage-content-ui", "direct-shadow-v2");
    }
    const sidePanel = new FakeElement();
    sidePanel.id = "side-panel";

    const tabList = new FakeElement();
    tabList.setAttribute("role", "tablist");

    let currentRenderer = new FakeElement();
    currentRenderer.id = "tab-renderer";
    currentRenderer.className = "style-scope ytmusic-player-page";
    if (overrides.rendererPageType !== "") {
      currentRenderer.setAttribute(
        "page-type",
        overrides.rendererPageType ?? "MUSIC_PAGE_TYPE_TRACK_LYRICS",
      );
    }

    const nativeLyricsBody = new FakeElement();
    nativeLyricsBody.id = "description";
    nativeLyricsBody.className = "description style-scope ytmusic-description-shelf-renderer";
    nativeLyricsBody.textContent = "Original native lyrics text";
    currentRenderer.append(nativeLyricsBody);

    const nativeLyricsTab = new FakeElement();
    nativeLyricsTab.setAttribute("role", "tab");
    nativeLyricsTab.textContent = "歌詞";

    if (overrides.lyricsSelected ?? true) {
      nativeLyricsTab.setAttribute("aria-selected", "true");
      nativeLyricsTab.toggleAttribute("selected", true);
    } else {
      nativeLyricsTab.setAttribute("aria-selected", "false");
    }

    const nativeRelatedTab = new FakeElement();
    nativeRelatedTab.setAttribute("role", "tab");
    nativeRelatedTab.textContent = "関連コンテンツ";
    nativeRelatedTab.setAttribute("aria-selected", overrides.lyricsSelected ?? true ? "false" : "true");
    nativeRelatedTab.toggleAttribute("selected", !(overrides.lyricsSelected ?? true));

    tabOrder = [nativeLyricsTab, nativeRelatedTab];
    tabList.append(...tabOrder);
    tabList.querySelectorAll.mockImplementation((selector: string) => {
      if (selector.includes("tab")) return tabOrder;
      return tabList.children;
    });

    sidePanel.append(tabList, currentRenderer);
    sidePanel.querySelector.mockImplementation((selector: string) => {
      if (selector.includes("tp-yt-paper-tabs")) return tabList;
      if (selector.includes("ytmusic-tab-renderer")) return currentRenderer;
      return null;
    });
    sidePanel.querySelectorAll.mockImplementation((selector: string) => {
      if (selector.includes("ytmusic-tab-renderer")) return [currentRenderer];
      if (selector.includes("#lyricstage-enhanced-lyrics")) {
        return currentRenderer.children.filter((child) =>
          child.id === "lyricstage-enhanced-lyrics-v2" || child.id === "lyricstage-enhanced-lyrics"
        );
      }
      return [tabList, currentRenderer];
    });

    const transportControls = {
      previous: { click: vi.fn(), disabled: false, getAttribute: vi.fn(() => null), hasAttribute: vi.fn(() => false) },
      playPause: { click: vi.fn(), disabled: false, getAttribute: vi.fn(() => null), hasAttribute: vi.fn(() => false) },
      next: { click: vi.fn(), disabled: false, getAttribute: vi.fn(() => null), hasAttribute: vi.fn(() => false) },
    };
    const playerBar = {
      querySelector: (selector: string) => {
        if (selector.includes(".title")) return { textContent: "You & 合図" };
        if (selector.includes(".time-info")) {
          return { textContent: overrides.playerBarTimeText ?? "0:12 / 2:39" };
        }
        if (selector.includes("img")) {
          return { currentSrc: "https://yt3.googleusercontent.com/cover-id=w60-h60-l90-rj" };
        }
        if (selector.includes("play-pause-button")) return transportControls.playPause;
        if (selector.includes("previous-button")) return transportControls.previous;
        if (selector.includes("next-button")) return transportControls.next;
        return null;
      },
      querySelectorAll: () => [{ textContent: "音乃瀬奏" }],
    };

    const FakeDate = class extends Date {
      static override now() {
        return clock.now;
      }
    };

    const context = vm.createContext({
      chrome: {
        runtime: {
          id: "extension-id",
          getURL: (path: string) => `chrome-extension://extension-id/${path}`,
          onMessage: {
            addListener: (
              listener: (
                message: unknown,
                sender: unknown,
                respond: (value: unknown) => void,
              ) => unknown,
            ) => runtimeListeners.push(listener),
            removeListener: vi.fn(),
          },
          sendMessage: (message: unknown, callback?: () => void) => {
            if (invalidateRuntime) throw new Error("Extension context invalidated.");
            sentMessages.push(message);
            callback?.();
          },
        },
      },
      document: {
        title: "YouTube Music",
        documentElement,
        createElement: () => {
          const element = new FakeElement();
          createdElements.push(element);
          return element;
        },
        querySelector: (selector: string) => {
          if (selector === "video, audio") return mediaAvailable ? media : null;
          if (selector === "ytmusic-player-bar") return playerBarAvailable ? playerBar : null;
          if (selector.includes("ytmusic-player-page#player-page")) return sidePanel;
          if (selector.includes("tp-yt-paper-tabs")) return tabList;
          return null;
        },
        querySelectorAll: (selector: string) => selector === "video, audio" && mediaAvailable ? mediaElements : [],
      },
      HTMLMediaElement: FakeMediaElement,
      navigator: {
        mediaSession: {
          metadata: {
            title: "Media Session Title",
            artist: "Media Session Artist",
            artwork: [{ src: "https://i.ytimg.com/vi/ZmCRFGcON-I/hqdefault.jpg" }],
          },
        },
      },
      location: {
        href: "https://music.youtube.com/watch?v=ZmCRFGcON-I",
        origin: "https://music.youtube.com",
      },
      MutationObserver: class {
        observe() {}
        disconnect = disconnectFn;
      },
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      setInterval: vi.fn((callback: () => void) => {
        heartbeatCallback = callback;
        return 99;
      }),
      clearInterval: clearIntervalFn,
      window: {
        addEventListener: (event: string, listener: (...args: unknown[]) => void) => {
          const listeners = windowListeners.get(event) ?? new Set();
          listeners.add(listener);
          windowListeners.set(event, listeners);
        },
        removeEventListener: (event: string, listener: (...args: unknown[]) => void) => {
          windowListeners.get(event)?.delete(listener);
        },
        setTimeout: clock.setTimeout,
      },
      URL,
      Date: FakeDate,
      Event: class {
        constructor(readonly type: string) {}
      },
      console: { ...console, warn: vi.fn() },
    });

    return {
      context,
      createdElements,
      clock,
      runtimeListeners,
      sentMessages,
      getHeartbeatCallback: () => heartbeatCallback,
      currentHost: () =>
        [...createdElements]
          .reverse()
          .find((element) => element.id === "lyricstage-enhanced-lyrics-v2" && element.isConnected),
      sidePanel,
      tabList,
      nativeLyricsTab,
      nativeRelatedTab,
      getRenderer: () => currentRenderer,
      setRenderer: (next: FakeElement) => {
        currentRenderer = next;
        sidePanel.children = [tabList, next];
      },
      setTabOrder: (next: FakeElement[]) => {
        tabOrder = next;
        tabList.children = next;
      },
      nativeLyricsBody,
      media,
      mediaElements,
      transportControls,
      documentElement,
      setInvalidateRuntime: (value: boolean) => {
        invalidateRuntime = value;
      },
      setPlayerBarAvailable: (value: boolean) => {
        playerBarAvailable = value;
      },
      setMediaAvailable: (value: boolean) => {
        mediaAvailable = value;
      },
    };
  };

  const makeReady = (env: ReturnType<typeof createEnvironment>) => {
    const host = env.currentHost();
    const readyEvent = host?.getAttribute("data-lyricstage-ready-event");
    expect(readyEvent).toMatch(/^lyricstage-column-ready-/);
    host?.emit(readyEvent ?? "");
    return host;
  };

  const makeError = (
    env: ReturnType<typeof createEnvironment>,
    reason = "render-error",
    host = env.currentHost(),
  ) => {
    host?.setAttribute("data-lyricstage-error-reason", reason);
    const errorEvent = host?.getAttribute("data-lyricstage-error-event");
    expect(errorEvent).toMatch(/^lyricstage-column-error-/);
    host?.emit(errorEvent ?? "");
    return host;
  };

  const selectRelated = (env: ReturnType<typeof createEnvironment>) => {
    env.nativeLyricsTab.setAttribute("aria-selected", "false");
    env.nativeLyricsTab.removeAttribute("selected");
    env.nativeRelatedTab.setAttribute("aria-selected", "true");
    env.nativeRelatedTab.toggleAttribute("selected", true);
    env.getRenderer().setAttribute("page-type", "MUSIC_PAGE_TYPE_TRACK_RELATED");
  };

  it("upgrades the tiny player-bar artwork URL before publishing a snapshot", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    env.clock.advance(40);
    const snapshotMessage = env.sentMessages.find((message) =>
      (message as { type?: string }).type === "youtube-music-source-snapshot"
    ) as { snapshot?: { track?: { artworkURL?: string } } } | undefined;
    expect(snapshotMessage?.snapshot?.track?.artworkURL).toBe(
      "https://yt3.googleusercontent.com/cover-id=w1200-h1200-l90-rj",
    );
  });

  it("keeps the bridge alive when the new player layout omits the legacy player-bar metadata", () => {
    const env = createEnvironment();
    env.setPlayerBarAvailable(false);
    vm.runInContext(contentScriptSource, env.context);
    env.clock.advance(40);
    const snapshotMessage = env.sentMessages.find((message) =>
      (message as { type?: string }).type === "youtube-music-source-snapshot"
    ) as { snapshot?: { track?: { title?: string; artist?: string; artworkURL?: string } } } | undefined;
    expect(snapshotMessage?.snapshot?.track).toMatchObject({
      title: "Media Session Title",
      artist: "Media Session Artist",
      artworkURL: "https://i.ytimg.com/vi/ZmCRFGcON-I/maxresdefault.jpg",
    });
  });

  it("uses the media element whose time and duration match the current player bar", () => {
    const env = createEnvironment({
      playerBarTimeText: "0:50 / 4:19",
      mediaElements: [
        { paused: true, currentTime: 193, duration: 282 },
        { paused: false, currentTime: 50, duration: 259 },
      ],
    });
    vm.runInContext(contentScriptSource, env.context);
    env.clock.advance(40);

    const snapshotMessage = env.sentMessages.find((message) =>
      (message as { type?: string }).type === "youtube-music-source-snapshot"
    ) as { snapshot?: { playback?: { currentTimeMs?: number; durationMs?: number } } } | undefined;
    expect(snapshotMessage?.snapshot?.playback).toMatchObject({
      currentTimeMs: 50_000,
      durationMs: 259_000,
    });
    expect(env.mediaElements[0]?.addEventListener).not.toHaveBeenCalled();
    expect(env.mediaElements[1]?.addEventListener).toHaveBeenCalled();
  });

  it("uses the player bar clock when YouTube Music reuses a different internal media timeline", () => {
    const env = createEnvironment({
      playerBarTimeText: "0:50 / 4:19",
      mediaElements: [{ paused: false, currentTime: 193, duration: 282 }],
    });
    vm.runInContext(contentScriptSource, env.context);
    env.clock.advance(40);

    const snapshotMessage = env.sentMessages.find((message) =>
      (message as { type?: string }).type === "youtube-music-source-snapshot"
    ) as { snapshot?: { playback?: { currentTimeMs?: number; durationMs?: number } } } | undefined;
    expect(snapshotMessage?.snapshot?.playback).toMatchObject({
      currentTimeMs: 50_000,
      durationMs: 259_000,
    });
    expect(env.media.addEventListener).toHaveBeenCalled();
  });

  it("keeps subsecond progress without letting the media timeline own absolute time", () => {
    const env = createEnvironment({
      playerBarTimeText: "0:50 / 4:19",
      mediaElements: [{ paused: false, currentTime: 193.2, duration: 282 }],
    });
    vm.runInContext(contentScriptSource, env.context);
    env.clock.advance(40);
    env.media.currentTime = 193.7;
    env.getHeartbeatCallback()?.();

    const snapshots = env.sentMessages.filter((message) =>
      (message as { type?: string }).type === "youtube-music-source-snapshot"
    ) as Array<{ snapshot?: { playback?: { currentTimeMs?: number; durationMs?: number } } }>;
    expect(snapshots.at(-1)?.snapshot?.playback).toMatchObject({
      currentTimeMs: 50_500,
      durationMs: 259_000,
    });

    env.media.currentTime = 20;
    env.getHeartbeatCallback()?.();
    const afterSeek = env.sentMessages.filter((message) =>
      (message as { type?: string }).type === "youtube-music-source-snapshot"
    ) as Array<{ snapshot?: { playback?: { currentTimeMs?: number } } }>;
    expect(afterSeek.at(-1)?.snapshot?.playback?.currentTimeMs).toBe(50_000);
  });

  it("keeps native lyrics visible while the direct Shadow DOM column is not ready", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);

    expect(env.currentHost()?.parentElement).toBe(env.getRenderer());
    expect(env.currentHost()?.style.display).toBe("none");
    expect(env.nativeLyricsBody.style.display).toBe("");
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.hasAttribute("inert")).toBe(false);
    expect(env.currentHost()?.getAttribute("data-lyricstage-ready-event")).toMatch(
      /^lyricstage-column-ready-/,
    );
    expect(env.currentHost()?.getAttribute("data-lyricstage-error-event")).toMatch(
      /^lyricstage-column-error-/,
    );
    expect(env.currentHost()?.getAttribute("data-lyricstage-dispose-event")).toMatch(
      /^lyricstage-column-dispose-/,
    );
    expect(env.currentHost()?.shadowRoot?.children.some((child) => child.className === "column-mount")).toBe(
      true,
    );
  });

  it("covers the native renderer only after the current host emits its ready event", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);

    expect(env.nativeLyricsBody.hidden).toBe(false);
    makeReady(env);

    expect(env.currentHost()?.style.display).toBe("flex");
    expect(env.currentHost()?.hidden).toBe(false);
    expect(env.currentHost()?.style.position).toBe("absolute");
    expect(env.currentHost()?.style.visibility).toBe("visible");
    expect(env.getRenderer().style.visibility).toBe("hidden");
    expect(env.getRenderer().style.position).toBe("relative");
    expect(env.nativeLyricsBody.style.display).toBe("");
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.getAttribute("aria-hidden")).toBeNull();
    expect(env.nativeLyricsBody.hasAttribute("inert")).toBe(false);
  });

  it("uses only the renderer's own page-type and ignores a stale Lyrics descendant", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    makeReady(env);

    const staleLyricsDescendant = new FakeElement();
    staleLyricsDescendant.setAttribute("page-type", "MUSIC_PAGE_TYPE_TRACK_LYRICS");
    env.getRenderer().querySelector.mockImplementation((selector: string) =>
      selector.includes("MUSIC_PAGE_TYPE_TRACK_LYRICS") ? staleLyricsDescendant : null,
    );
    selectRelated(env);
    env.getHeartbeatCallback()?.();

    expect(env.nativeLyricsBody.style.display).toBe("");
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.hasAttribute("inert")).toBe(false);
    expect(env.currentHost()).toBeUndefined();
  });

  it("prefers one strong selection over an earlier stale weak selected attribute", () => {
    const env = createEnvironment();
    env.nativeRelatedTab.removeAttribute("aria-selected");
    env.nativeRelatedTab.toggleAttribute("selected", true);
    env.setTabOrder([env.nativeRelatedTab, env.nativeLyricsTab]);

    vm.runInContext(contentScriptSource, env.context);

    expect(env.nativeLyricsTab.getAttribute("data-lyricstage-confirmed-lyrics-tab")).toBe("true");
    expect(env.nativeRelatedTab.hasAttribute("data-lyricstage-confirmed-lyrics-tab")).toBe(false);
    expect(env.currentHost()).toBeDefined();
  });

  it("mounts from renderer page-type but does not guess a marker when strong selection is ambiguous", () => {
    const env = createEnvironment();
    env.nativeRelatedTab.setAttribute("aria-selected", "true");
    env.nativeRelatedTab.className = "iron-selected";

    vm.runInContext(contentScriptSource, env.context);

    expect(env.currentHost()).toBeDefined();
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsTab.hasAttribute("data-lyricstage-confirmed-lyrics-tab")).toBe(false);
    expect(env.nativeRelatedTab.hasAttribute("data-lyricstage-confirmed-lyrics-tab")).toBe(false);
  });

  it("uses a direct tab click to disambiguate multiple stale strong selections", () => {
    const env = createEnvironment();
    env.nativeRelatedTab.setAttribute("aria-selected", "true");
    env.nativeRelatedTab.className = "iron-selected";
    vm.runInContext(contentScriptSource, env.context);

    env.nativeLyricsTab.emit("click");
    env.getHeartbeatCallback()?.();

    expect(env.nativeLyricsTab.getAttribute("data-lyricstage-confirmed-lyrics-tab")).toBe("true");
    expect(env.nativeRelatedTab.hasAttribute("data-lyricstage-confirmed-lyrics-tab")).toBe(false);
  });

  it("releases the enhanced Lyrics mount before a confirmed non-Lyrics tab switches Polymer state", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    makeReady(env);

    env.nativeRelatedTab.emit("click");

    expect(env.currentHost()).toBeUndefined();
    expect(env.getRenderer().style.visibility).toBe("");
    expect(env.getRenderer().style.position).toBe("");
    expect(env.nativeLyricsBody.style.display).toBe("");
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.getAttribute("aria-hidden")).toBeNull();
    expect(env.nativeLyricsBody.hasAttribute("inert")).toBe(false);
  });

  it("does not overwrite newer Polymer attributes while releasing after a programmatic tab switch", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    makeReady(env);

    env.nativeLyricsBody.style.display = "grid";
    env.nativeLyricsBody.hidden = false;
    env.nativeLyricsBody.setAttribute("aria-hidden", "false");
    env.nativeLyricsBody.removeAttribute("inert");
    selectRelated(env);
    env.getHeartbeatCallback()?.();

    expect(env.currentHost()).toBeUndefined();
    expect(env.nativeLyricsBody.style.display).toBe("grid");
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.getAttribute("aria-hidden")).toBe("false");
    expect(env.nativeLyricsBody.hasAttribute("inert")).toBe(false);
  });

  it("preserves native lyrics when the content UI runtime marker is missing", () => {
    const env = createEnvironment({ contentUIMarker: false });
    vm.runInContext(contentScriptSource, env.context);

    const host = env.currentHost();
    const disposeEvent = host?.getAttribute("data-lyricstage-dispose-event");
    expect(env.currentHost()?.style.display).toBe("none");
    expect(env.currentHost()?.hidden).toBe(true);
    expect(host?.dispatchedEvents).toContain(disposeEvent);
    expect(env.nativeLyricsBody.style.display).toBe("");
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.hasAttribute("inert")).toBe(false);
  });

  it("preserves native lyrics and dispatches dispose after the host error event", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);

    const host = env.currentHost();
    const disposeEvent = host?.getAttribute("data-lyricstage-dispose-event");
    makeError(env, "react-render-error", host);

    expect(host?.dispatchedEvents).toContain(disposeEvent);
    expect(env.currentHost()?.style.display).toBe("none");
    expect(env.currentHost()?.hidden).toBe(true);
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.style.display).toBe("");
  });

  it("preserves native lyrics when the host misses the ready deadline", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    const host = env.currentHost();
    const disposeEvent = host?.getAttribute("data-lyricstage-dispose-event");

    env.clock.advance(4000);

    expect(host?.dispatchedEvents).toContain(disposeEvent);
    expect(env.currentHost()?.style.display).toBe("none");
    expect(env.currentHost()?.hidden).toBe(true);
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.style.display).toBe("");
  });

  it("ignores a stale ready event after switching away and dispatches dispose", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    const staleHost = env.currentHost();
    const staleReadyEvent = staleHost?.getAttribute("data-lyricstage-ready-event");
    const staleDisposeEvent = staleHost?.getAttribute("data-lyricstage-dispose-event");

    selectRelated(env);
    env.getHeartbeatCallback()?.();
    staleHost?.emit(staleReadyEvent ?? "");

    expect(staleHost?.dispatchedEvents).toContain(staleDisposeEvent);
    expect(env.currentHost()).toBeUndefined();
    expect(env.nativeLyricsBody.hidden).toBe(false);
    expect(env.nativeLyricsBody.style.display).toBe("");
  });

  it("ignores old ready after renderer replacement, disposes it, and accepts only the new host", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    const oldHost = env.currentHost();
    const oldReadyEvent = oldHost?.getAttribute("data-lyricstage-ready-event");
    const oldDisposeEvent = oldHost?.getAttribute("data-lyricstage-dispose-event");

    const secondRenderer = new FakeElement();
    secondRenderer.id = "tab-renderer";
    secondRenderer.setAttribute("page-type", "MUSIC_PAGE_TYPE_TRACK_LYRICS");
    const secondBody = new FakeElement();
    secondBody.textContent = "Second renderer body";
    secondRenderer.append(secondBody);
    env.setRenderer(secondRenderer);
    env.getHeartbeatCallback()?.();

    const newHost = env.currentHost();
    const newReadyEvent = newHost?.getAttribute("data-lyricstage-ready-event");
    expect(newHost).toBeDefined();
    expect(newHost).not.toBe(oldHost);
    expect(oldHost?.isConnected).toBe(false);
    expect(oldHost?.dispatchedEvents).toContain(oldDisposeEvent);
    oldHost?.emit(oldReadyEvent ?? "");
    expect(secondBody.hidden).toBe(false);
    expect(env.currentHost()?.style.display).toBe("none");

    newHost?.emit(newReadyEvent ?? "");
    expect(secondBody.hidden).toBe(false);
    expect(secondBody.style.display).toBe("");
    expect(secondRenderer.style.visibility).toBe("hidden");
    expect(env.currentHost()?.style.display).toBe("flex");
  });

  it("hands off synchronously to a new content-script generation without duplicate hosts", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    const firstHost = env.currentHost();
    makeReady(env);

    vm.runInContext(contentScriptSource, env.context);

    const secondHost = env.currentHost();
    expect(firstHost?.isConnected).toBe(false);
    expect(secondHost).toBeDefined();
    expect(secondHost).not.toBe(firstHost);
    expect(
      env.getRenderer().children.filter((child) => child.id === "lyricstage-enhanced-lyrics-v2"),
    ).toHaveLength(1);
  });

  it("notifies the background when an established media source disappears", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    env.clock.advance(40);
    expect(env.sentMessages.some((message) =>
      (message as { type?: string }).type === "youtube-music-source-snapshot"
    )).toBe(true);

    env.setMediaAvailable(false);
    env.getHeartbeatCallback()?.();

    expect(env.sentMessages.some((message) =>
      (message as { type?: string }).type === "youtube-music-source-disconnect"
    )).toBe(true);
  });

  it("keeps popup activation pending until the host ready event, then reports success", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);

    const respond = vi.fn();
    const handled = env.runtimeListeners[0]?.(
      { type: "youtube-music-activate-lyrics" },
      undefined,
      respond,
    );
    expect(handled).toBe(true);
    expect(respond).not.toHaveBeenCalled();

    makeReady(env);
    expect(respond).not.toHaveBeenCalled();
    env.clock.advance(30);

    expect(respond).toHaveBeenCalledOnce();
    expect(respond).toHaveBeenCalledWith({ ok: true });
  });

  it("reports the host ready timeout reason to popup activation", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    const respond = vi.fn();
    env.runtimeListeners[0]?.(
      { type: "youtube-music-activate-lyrics" },
      undefined,
      respond,
    );
    env.clock.advance(5300);

    expect(respond).toHaveBeenCalledOnce();
    expect(respond).toHaveBeenCalledWith({ ok: false, reason: "embedded-column-ready-timeout" });
    expect(env.nativeLyricsBody.hidden).toBe(false);
  });

  it("rejects popup activation before the Lyrics tab has been learned", () => {
    const env = createEnvironment({
      rendererPageType: "MUSIC_PAGE_TYPE_TRACK_RELATED",
      lyricsSelected: false,
    });
    vm.runInContext(contentScriptSource, env.context);

    const respond = vi.fn();
    env.runtimeListeners[0]?.(
      { type: "youtube-music-activate-lyrics" },
      undefined,
      respond,
    );

    expect(respond).toHaveBeenCalledWith({ ok: false, reason: "unlearned" });
    expect(env.nativeLyricsTab.click).not.toHaveBeenCalled();
    expect(env.nativeRelatedTab.click).not.toHaveBeenCalled();
  });

  it("seeks the native media without changing its playback state", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    const respond = vi.fn();

    env.runtimeListeners[0]?.(
      { type: "youtube-music-seek-to", timeMs: 72_500 },
      undefined,
      respond,
    );

    expect(env.media.currentTime).toBe(72.5);
    expect(env.media.paused).toBe(false);
    expect(respond).toHaveBeenCalledWith({ ok: true, timeMs: 72_500 });
  });

  it("uses authoritative native controls and avoids redundant play/pause clicks", () => {
    const env = createEnvironment();
    vm.runInContext(contentScriptSource, env.context);
    const respond = vi.fn();

    env.runtimeListeners[0]?.(
      { type: "youtube-music-transport-command", action: "pause" },
      undefined,
      respond,
    );
    expect(env.transportControls.playPause.click).toHaveBeenCalledOnce();
    expect(respond).toHaveBeenCalledWith({ ok: true, state: "pause" });

    env.media.paused = true;
    respond.mockClear();
    env.runtimeListeners[0]?.(
      { type: "youtube-music-transport-command", action: "pause" },
      undefined,
      respond,
    );
    expect(env.transportControls.playPause.click).toHaveBeenCalledOnce();
    expect(respond).toHaveBeenCalledWith({ ok: true, state: "paused", unchanged: true });

    env.runtimeListeners[0]?.(
      { type: "youtube-music-transport-command", action: "next" },
      undefined,
      vi.fn(),
    );
    expect(env.transportControls.next.click).toHaveBeenCalledOnce();
  });

  it("keeps the source and manifest free of the removed MAIN-world bridge and peer tab", () => {
    const manifest = JSON.parse(manifestSource) as {
      content_scripts?: Array<{ js?: string[] }>;
      web_accessible_resources?: unknown;
    };
    expect(contentScriptSource.includes("lyricstage-tab-header")).toBe(false);
    expect(contentScriptSource.includes("lyricstage-tab-panel")).toBe(false);
    expect(contentScriptSource.includes("nativePanel.after")).toBe(false);
    expect(contentScriptSource.includes("LYRICSTAGE")).toBe(false);
    expect(contentScriptSource).toContain('"#right-controls-buttons, .right-controls-buttons"');
    expect(contentScriptSource).toContain('className = "ypcs-video-info"');
    expect(manifestSource).toContain('"https://sponsor.ajay.app/*"');
    expect(manifestSource.includes("page-bridge.js")).toBe(false);
    expect(manifestSource.includes('"world": "MAIN"')).toBe(false);
    expect(manifestSource.includes('"world":"MAIN"')).toBe(false);
    expect(manifest.content_scripts?.[0]?.js).toEqual(["content-ui.js", "content.js"]);
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(contentUISource).toContain('const contentUIStopEvent = "lyricstage-content-ui-stop-v2"');
    expect(contentUISource).toContain("hostObserver.disconnect()");
    expect(contentUISource).toContain("root.unmount()");
    expect(contentUISource).toContain('const stageHostSelector = "#lyricstage-enhanced-lyrics-v2"');
  });
});
