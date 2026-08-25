(() => {
  const protocolVersion = "youtube-music-companion-v0";
  const LYRICS_PAGE_TYPE = "MUSIC_PAGE_TYPE_TRACK_LYRICS";
  const CONFIRMED_TAB_ATTR = "data-lyricstage-confirmed-lyrics-tab";
  const OWNED_LYRICS_TAB_ATTR = "data-lyricstage-owned-lyrics-tab";
  const OWNED_LYRICS_RENDERER_ATTR = "data-lyricstage-owned-lyrics-renderer";
  const OWNED_LYRICS_ACTIVE_ATTR = "data-lyricstage-owned-lyrics-active";
  const APPLE_SHELL_GUIDE_ATTR = "data-lyricstage-guide";
  const APPLE_SHELL_GUIDE_STORAGE_KEY = "lyricstage-guide-collapsed-v1";
  const APPLE_SHELL_TAB_BAR_ATTR = "data-lyricstage-tab-bar";
  const APPLE_SHELL_TAB_PROXY_ATTR = "data-lyricstage-tab-proxy";
  const APPLE_SHELL_TAB_SIGNATURE_ATTR = "data-lyricstage-tab-signature";
  const APPLE_SHELL_PLAYER_ACTIONS_ATTR = "data-lyricstage-player-actions";
  const APPLE_SHELL_MEDIA_PROXY_ATTR = "data-lyricstage-media-proxy";
  const APPLE_SHELL_PLAYER_BAR_ATTR = "data-lyricstage-player-bar-shell";
  const APPLE_SHELL_COMPLETE_ARTWORK_ATTR = "data-lyricstage-complete-artwork";
  const APPLE_SHELL_POPOVER_ATTR = "data-lyricstage-player-popover";
  const APPLE_SHELL_PLAYER_OPEN_ATTR = "data-lyricstage-player-open";
  const CONTENT_SCRIPT_STOP_EVENT = "lyricstage-content-script-stop-v2";
  const CONTENT_SCRIPT_MARKER_ATTR = "data-lyricstage-content-script";
  const CONTENT_SCRIPT_MARKER = "isolated-v3";
  const STAGE_HOST_ID = "lyricstage-enhanced-lyrics-v2";
  const LEGACY_STAGE_HOST_ID = "lyricstage-enhanced-lyrics";
  const STAGE_FAILURE_ATTR = "data-lyricstage-last-mount-failure";
  const STAGE_FAILURE_COUNT_ATTR = "data-lyricstage-mount-failure-count";
  const SOURCE_LEASE_MS = 3000;
  const SOURCE_HEARTBEAT_MS = 1000;
  const SNAPSHOT_PROGRESS_INTERVAL_MS = 250;
  const SNAPSHOT_KEEPALIVE_MS = 1500;
  const MUTATION_RECONCILE_MS = 50;
  const TRACK_CHANGE_STABILITY_MS = 250;
  const TRACK_CHANGE_MAX_HOLD_MS = 1500;
  const TRACK_METADATA_ENRICHMENT_WINDOW_MS = 3000;
  const STAGE_MOUNT_MAX_FAILURES = 3;
  const STAGE_MOUNT_RETRY_DELAYS_MS = [250, 750];
  document.documentElement.dispatchEvent(new Event(CONTENT_SCRIPT_STOP_EVENT));
  document.documentElement.setAttribute(CONTENT_SCRIPT_MARKER_ATTR, CONTENT_SCRIPT_MARKER);
  const mediaEvents = [
    "play",
    "pause",
    "playing",
    "waiting",
    "seeking",
    "seeked",
    "durationchange",
    "ratechange",
    "volumechange",
    "timeupdate",
    "ended",
  ];
  let sequence = 0;
  let observedMedia = null;
  let playbackClockAnchor = null;
  let queued = false;
  let stopped = false;
  let pendingSend = null;
  let heartbeat = null;
  let rootObserver = null;
  let playerObserver = null;
  let stageObserver = null;
  let observedPlayerRoot = null;
  let observedStageRoot = null;
  let pendingMutationReconcile = null;
  let reconcileRoots = false;
  let reconcilePlayer = false;
  let reconcileStage = false;
  let inPageStageHost = null;
  let stageUIDispose = null;
  let stageReadyTimeout = null;
  let lastInteractedTab = null;
  let activeNativeRenderer = null;
  let stageMountGeneration = 0;
  let stageMountState = "idle";
  let stageMountFailure = "";
  let stageMountFailureCount = 0;
  let stageMountRetryAt = 0;
  let sourceWasAvailable = false;
  let sourceMissingSince = null;
  let sponsorBlockControlHost = null;
  let sponsorBlockTitleCompat = null;
  let lastKnownVideoID = "";
  let lastPlayerVideoID = "";
  let pendingPlayerVideoID = "";
  let acceptedTrackTuple = null;
  let pendingTrackTuple = null;
  let cachedQueue = null;
  let cachedQueueHrefs = [];
  let metadataEnrichmentUntilUnixMs = Number.NEGATIVE_INFINITY;
  let trackTransitionEpoch = 0;
  let lastSentSnapshotSignature = "";
  let lastSentSnapshotStateSignature = "";
  let lastSnapshotSentAtUnixMs = Number.NEGATIVE_INFINITY;
  const retiredTrackIDs = new Set();
  const savedNativeRenderers = new Map();
  const observedOwnedSurfaceTabs = new WeakSet();
  const ownedTabProxyTargets = new WeakMap();
  let ownedLyricsTabBar = null;
  let ownedLyricsTab = null;
  let ownedLyricsRenderer = null;
  let appleShellGuideObserver = null;
  let observedAppleShellNavigation = null;
  let observedAppleShellDrawer = null;
  const observedAppleShellGuideButtons = new WeakSet();
  const observedAppleShellMediaToggles = new WeakSet();
  const observedAppleShellArtworkImages = new WeakSet();
  let appleShellGuidePreferenceRequested = false;
  let appleShellPlayerActions = null;
  let appleShellPopoverKind = "";
  let appleShellMediaToggle = null;
  let appleShellPlayerBar = null;
  let lastAppleShellTrackTuple = null;

  const clean = (value) => (typeof value === "string" ? value.trim() : "");

  const highResolutionArtworkURL = (value) => {
    const source = clean(value);
    if (!source) return "";
    try {
      const url = new URL(source);
      if (url.protocol !== "https:") return "";
      // The current YTM player bar can keep an empty <img src> whose DOM `src`
      // property resolves to the site root. Treat it as a placeholder so the
      // matching video thumbnail fallback still gets a chance to run.
      if (url.hostname === "music.youtube.com" && url.pathname === "/") return "";
      if (url.hostname === "yt3.googleusercontent.com") {
        url.pathname = url.pathname.replace(/=w\d+-h\d+(?=-|$)/u, "=w1200-h1200");
      } else if (url.hostname === "i.ytimg.com") {
        const match = url.pathname.match(/^\/vi(?:_webp)?\/([^/]+)\//u);
        if (match) {
          url.pathname = `/vi/${match[1]}/maxresdefault.jpg`;
          url.search = "";
        }
      }
      return url.href;
    } catch {
      return "";
    }
  };

  const firstText = (root, selectors) => {
    for (const selector of selectors) {
      const text = clean(root?.querySelector?.(selector)?.textContent);
      if (text) return text;
    }
    return "";
  };

  const mediaSessionMetadata = () => {
    try {
      const metadata = globalThis.navigator?.mediaSession?.metadata;
      return metadata && typeof metadata === "object" ? metadata : null;
    } catch {
      return null;
    }
  };

  const documentTitleTrack = () => {
    const value = clean(document.title).replace(/\s*[|·-]\s*YouTube Music\s*$/iu, "");
    return value && value.toLowerCase() !== "youtube music" ? value : "";
  };

  const metadataArtworkURL = (metadata) => {
    const artwork = Array.isArray(metadata?.artwork) ? metadata.artwork : [];
    const preferred = [...artwork].reverse().find((candidate) => clean(candidate?.src));
    return highResolutionArtworkURL(preferred?.src);
  };

  const artworkVideoID = (value) => {
    const source = clean(value);
    if (!source) return "";
    try {
      const match = new URL(source).pathname.match(/^\/vi(?:_webp)?\/([^/]+)\//u);
      return match?.[1] ?? "";
    } catch {
      return "";
    }
  };

  const videoArtworkURL = (trackID) => {
    const safeTrackID = clean(trackID);
    if (!/^[A-Za-z0-9_-]{11}$/u.test(safeTrackID)) return "";

    const image = document.querySelector?.(
      `img[src*="/vi/${safeTrackID}/"], img[src*="/vi_webp/${safeTrackID}/"]`,
    );
    const imageURL = clean(image?.currentSrc || image?.src);
    if (imageURL) return imageURL;

    const thumbnail = document.querySelector?.(
      ".html5-video-player .ytp-cued-thumbnail-overlay-image, .ytp-cued-thumbnail-overlay-image",
    );
    const backgroundImage = thumbnail
      ? typeof getComputedStyle === "function"
        ? clean(getComputedStyle(thumbnail).backgroundImage)
        : clean(thumbnail.style?.backgroundImage)
      : "";
    const backgroundMatch = backgroundImage.match(/^url\((['"]?)(https:\/\/[^'"]+)\1\)$/u);
    if (backgroundMatch?.[2]) {
      try {
        const candidate = new URL(backgroundMatch[2]);
        const match = candidate.pathname.match(/^\/vi(?:_webp)?\/([^/]+)\//u);
        if (match?.[1] === safeTrackID) return candidate.href;
      } catch {
        // Fall through to the public video thumbnail below.
      }
    }

    return `https://i.ytimg.com/vi/${safeTrackID}/hqdefault.jpg`;
  };

  const videoIDFromHref = (href) => {
    if (!href) return "";
    try {
      return new URL(href, location.origin).searchParams.get("v") ?? "";
    } catch {
      return "";
    }
  };

  const currentVideoID = (playerBar) => {
    const locationVideoID = videoIDFromHref(location.href);
    const hrefs = [
      document.querySelector?.(
        '#movie_player a.ytp-title-link[href*="watch?"][href*="v="], ytmusic-player a.ytp-title-link[href*="watch?"][href*="v="]',
      )?.getAttribute?.("href"),
      playerBar?.querySelector?.('a[href*="watch?v="], a[href*="watch?"][href*="v="]')?.getAttribute?.("href"),
      document.querySelector?.(
        'ytmusic-player-queue-item[selected] a[href*="watch?v="], ytmusic-player-queue-item[selected] a[href*="watch?"][href*="v="]',
      )?.getAttribute?.("href"),
    ];
    const playerVideoIDs = [...new Set(hrefs.map(videoIDFromHref).filter(Boolean))];
    const primaryPlayerVideoID = playerVideoIDs[0] ?? "";
    const playerIdentityChanged = Boolean(
      primaryPlayerVideoID && primaryPlayerVideoID !== lastPlayerVideoID
    );
    if (primaryPlayerVideoID) lastPlayerVideoID = primaryPlayerVideoID;
    const evidence = [...new Set([
      ...playerVideoIDs,
      locationVideoID,
    ].filter(Boolean))];
    const acceptedTrackID = acceptedTrackTuple?.trackID ?? "";
    if (playerIdentityChanged) {
      pendingPlayerVideoID = primaryPlayerVideoID === acceptedTrackID ? "" : primaryPlayerVideoID;
    } else if (pendingPlayerVideoID && primaryPlayerVideoID !== pendingPlayerVideoID) {
      pendingPlayerVideoID = "";
    }
    if (pendingPlayerVideoID === acceptedTrackID) pendingPlayerVideoID = "";
    let selected = "";
    if (acceptedTrackID) {
      const nonRetiredChange = evidence.find((trackID) =>
        trackID !== acceptedTrackID && !retiredTrackIDs.has(trackID)
      );
      selected = (pendingPlayerVideoID && primaryPlayerVideoID === pendingPlayerVideoID
        ? pendingPlayerVideoID
        : "")
        || nonRetiredChange
        || (evidence.includes(acceptedTrackID) ? acceptedTrackID : "")
        || evidence.find((trackID) => trackID !== acceptedTrackID)
        || acceptedTrackID;
    } else {
      selected = evidence[0] || lastPlayerVideoID || locationVideoID || lastKnownVideoID;
    }
    if (selected) lastKnownVideoID = selected;
    return selected;
  };

  const mediaSeekTarget = (media, barClock, requestedTimeMs) => {
    const logicalDurationMs = barClock?.durationMs
      ?? (Number.isFinite(media.duration) ? Math.max(0, media.duration * 1000) : 0);
    const boundedLogicalMs = logicalDurationMs > 0
      ? Math.min(requestedTimeMs, logicalDurationMs)
      : requestedTimeMs;
    if (!barClock) {
      return {
        logicalTimeMs: boundedLogicalMs,
        mediaTimeSeconds: boundedLogicalMs / 1000,
      };
    }

    const logicalNowMs = synchronizedCurrentTimeMs(media, barClock);
    const mediaTimeSeconds = media.currentTime + (boundedLogicalMs - logicalNowMs) / 1000;
    if (!Number.isFinite(mediaTimeSeconds)) return null;
    const mediaDurationSeconds = Number.isFinite(media.duration) ? Math.max(0, media.duration) : 0;
    if (
      mediaTimeSeconds < -1.5
      || (mediaDurationSeconds > 0 && mediaTimeSeconds > mediaDurationSeconds + 1.5)
    ) return null;
    return {
      logicalTimeMs: boundedLogicalMs,
      mediaTimeSeconds: mediaDurationSeconds > 0
        ? Math.min(mediaDurationSeconds, Math.max(0, mediaTimeSeconds))
        : Math.max(0, mediaTimeSeconds),
    };
  };

  const isYouTubeMusicLocation = () => {
    try {
      return new URL(location.href).hostname === "music.youtube.com";
    } catch {
      return false;
    }
  };

  const rememberClickedVideo = (event) => {
    const href = event?.target?.closest?.('a[href*="watch?v="]')?.getAttribute?.("href");
    if (!href) return;
    try {
      const videoID = new URL(href, location.origin).searchParams.get("v");
      if (videoID) lastKnownVideoID = videoID;
    } catch {
      // Ignore malformed third-party anchors.
    }
  };

  const playbackState = (media) => {
    if (media.ended) return "ended";
    if (!media.paused && media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return "buffering";
    return media.paused ? "paused" : "playing";
  };

  const parsePlaybackSeconds = (value) => {
    const parts = clean(value).split(":").map(Number);
    if (
      (parts.length !== 2 && parts.length !== 3) ||
      parts.some((part) => !Number.isFinite(part) || part < 0)
    ) return undefined;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  };

  const playerBarClock = (playerBar) => {
    const text = clean(playerBar?.querySelector?.(".time-info, #time-info")?.textContent);
    const timestamps = text.match(/(?:\d+:)?\d{1,2}:\d{2}/g) ?? [];
    if (timestamps.length < 2) return undefined;
    const currentSeconds = parsePlaybackSeconds(timestamps[0]);
    const durationSeconds = parsePlaybackSeconds(timestamps[timestamps.length - 1]);
    if (currentSeconds === undefined || durationSeconds === undefined || durationSeconds <= 0) {
      return undefined;
    }
    return {
      currentTimeMs: currentSeconds * 1000,
      durationMs: durationSeconds * 1000,
    };
  };

  const mediaCandidates = () => {
    const queried = Array.from(document.querySelectorAll?.("video, audio") ?? []);
    if (queried.length > 0) return queried.filter((media) => media instanceof HTMLMediaElement);
    const fallback = document.querySelector("video, audio");
    return fallback instanceof HTMLMediaElement ? [fallback] : [];
  };

  const selectPlaybackMedia = (playerBar) => {
    const candidates = mediaCandidates().filter((media) =>
      Number.isFinite(media.currentTime) &&
      media.currentTime >= 0 &&
      Number.isFinite(media.duration) &&
      media.duration > 0
    );
    if (candidates.length === 0) return null;

    const barClock = playerBarClock(playerBar);
    if (barClock) {
      const durationToleranceMs = Math.max(2500, barClock.durationMs * 0.01);
      const currentTimeToleranceMs = 4000;
      const matching = candidates.filter((media) =>
        Math.abs(media.duration * 1000 - barClock.durationMs) <= durationToleranceMs &&
        Math.abs(media.currentTime * 1000 - barClock.currentTimeMs) <= currentTimeToleranceMs
      );
      if (matching.length > 0) {
        return matching.sort((left, right) => {
          const leftDistance = Math.abs(left.duration * 1000 - barClock.durationMs)
            + Math.abs(left.currentTime * 1000 - barClock.currentTimeMs);
          const rightDistance = Math.abs(right.duration * 1000 - barClock.durationMs)
            + Math.abs(right.currentTime * 1000 - barClock.currentTimeMs);
          return leftDistance - rightDistance;
        })[0];
      }
    }

    if (candidates.length === 1) return candidates[0];
    const active = candidates.filter((media) => !media.paused && !media.ended);
    if (active.length === 1) return active[0];
    if (observedMedia && candidates.includes(observedMedia)) return observedMedia;
    return null;
  };

  const synchronizedCurrentTimeMs = (media, barClock) => {
    const mediaTimeMs = Math.max(0, media.currentTime * 1000);
    if (!barClock) {
      playbackClockAnchor = null;
      return mediaTimeMs;
    }

    const anchor = playbackClockAnchor;
    const projectedTimeMs = anchor?.media === media
      ? anchor.barTimeMs + (mediaTimeMs - anchor.mediaTimeMs)
      : Number.NaN;
    const projectionFitsDisplayedSecond = Number.isFinite(projectedTimeMs)
      && projectedTimeMs >= barClock.currentTimeMs - 250
      && projectedTimeMs < barClock.currentTimeMs + 1250;
    if (!projectionFitsDisplayedSecond) {
      playbackClockAnchor = {
        media,
        mediaTimeMs,
        barTimeMs: barClock.currentTimeMs,
      };
      return barClock.currentTimeMs;
    }
    return Math.min(
      barClock.durationMs,
      Math.max(barClock.currentTimeMs, projectedTimeMs),
    );
  };

  const transportButton = (playerBar, action) => {
    const selector = action === "playPause"
      ? "#play-pause-button button, #play-pause-button"
      : action === "previous"
        ? ".previous-button button, .previous-button"
        : ".next-button button, .next-button";
    return playerBar?.querySelector?.(selector) ?? null;
  };

  const playbackModeButton = (playerBar, mode) => playerBar?.querySelector?.(
    mode === "shuffle"
      ? ".shuffle, #shuffle-button, tp-yt-paper-icon-button[aria-label*='シャッフル'], button[aria-label*='Shuffle']"
      : ".repeat, #repeat-button, tp-yt-paper-icon-button[aria-label*='リピート'], button[aria-label*='Repeat']",
  ) ?? null;

  const shuffleEnabled = (playerBar) => {
    const control = playbackModeButton(playerBar, "shuffle");
    return control?.getAttribute?.("aria-pressed") === "true"
      || control?.hasAttribute?.("active") === true;
  };

  const repeatMode = (playerBar) => {
    const control = playbackModeButton(playerBar, "repeat");
    const value = clean(
      control?.getAttribute?.("repeat-mode")
      || control?.getAttribute?.("data-repeat-mode")
      || control?.getAttribute?.("aria-label"),
    ).toLocaleLowerCase();
    if (/(?:one|single|1\s*曲)/u.test(value)) return "one";
    if (control?.getAttribute?.("aria-pressed") === "true" || control?.hasAttribute?.("active") === true) return "all";
    return "off";
  };

  const likeButtons = (playerBar) => {
    const renderer = playerBar?.querySelector?.("ytmusic-like-button-renderer")
      ?? document.querySelector?.("ytmusic-player-bar ytmusic-like-button-renderer");
    if (!renderer) return { like: null, dislike: null };
    const like = renderer.querySelector?.(
      "#like-button button, #like-button, #button-shape-like button, [data-title-no-tooltip='Like'], button[aria-label*='Like']",
    ) ?? null;
    const dislike = renderer.querySelector?.(
      "#dislike-button button, #dislike-button, #button-shape-dislike button, [data-title-no-tooltip='Dislike'], button[aria-label*='Dislike']",
    ) ?? null;
    const pressed = [...(renderer.querySelectorAll?.("button[aria-pressed], [role='button'][aria-pressed]") ?? [])];
    return {
      like: like ?? pressed[0] ?? null,
      dislike: dislike ?? pressed.find((button) => button !== like) ?? null,
    };
  };

  const likeStatus = (playerBar) => {
    const buttons = likeButtons(playerBar);
    if (buttons.like?.getAttribute?.("aria-pressed") === "true") return "liked";
    if (buttons.dislike?.getAttribute?.("aria-pressed") === "true") return "disliked";
    return "neutral";
  };

  const queueItemSnapshot = (item, queueIndex = -1) => {
    const itemData = item?.data?.playlistPanelVideoRenderer ?? item?.data ?? null;
    const runsText = (value) => clean(value?.runs?.map?.((run) => run?.text || "")?.join?.(""));
    const link = item?.querySelector?.('a[href*="watch?"][href*="v="]');
    const title = clean(
      item?.querySelector?.(".song-title, #song-title, yt-formatted-string.song-title")?.textContent
      || item?.querySelector?.(".title-column yt-formatted-string, yt-formatted-string.title")?.textContent
      || link?.getAttribute?.("title")
      || link?.textContent
      || runsText(itemData?.title),
    );
    const trackID = videoIDFromHref(link?.getAttribute?.("href") || link?.href)
      || clean(itemData?.videoId)
      || (title && queueIndex >= 0 ? `queue:${queueIndex}:${title}` : "");
    if (!trackID || !title) return null;
    const artist = clean(
      item?.querySelector?.(".byline, #byline, .secondary-flex-columns yt-formatted-string")?.textContent,
    ) || runsText(itemData?.longBylineText) || runsText(itemData?.shortBylineText);
    const thumbnails = itemData?.thumbnail?.thumbnails;
    const artworkURL = clean(
      item?.querySelector?.("img")?.currentSrc
      || item?.querySelector?.("img")?.src
      || (Array.isArray(thumbnails) ? thumbnails.at(-1)?.url : ""),
    );
    return {
      trackID,
      title,
      artist,
      ...(artworkURL ? { artworkURL } : {}),
      selected: item?.hasAttribute?.("selected") === true
        || item?.getAttribute?.("aria-selected") === "true",
    };
  };

  const queueItemElements = () => {
    const direct = [...(document.querySelectorAll?.("ytmusic-player-queue-item") ?? [])];
    if (direct.length) return direct;
    const sidePanel = document.querySelector?.("ytmusic-player-page#player-page #side-panel, #side-panel");
    const responsive = [...(sidePanel?.querySelectorAll?.("ytmusic-responsive-list-item-renderer") ?? [])];
    if (responsive.length) return responsive;
    const renderers = [...(sidePanel?.querySelectorAll?.("ytmusic-tab-renderer") ?? [])];
    const queueRenderer = renderers.find((renderer) =>
      renderer.getAttribute?.("page-type") !== LYRICS_PAGE_TYPE
      && renderer.querySelector?.('a[href*="watch?"][href*="v="]')
    );
    return [...(queueRenderer?.querySelectorAll?.(
      "ytmusic-player-queue-item, ytmusic-responsive-list-item-renderer",
    ) ?? [])];
  };

  const queueSnapshot = (currentTrackID) => {
    const elements = queueItemElements().slice(0, 100);
    const items = elements.map((item, index) => queueItemSnapshot(item, index)).filter(Boolean);
    if (items.length) {
      cachedQueueHrefs = elements.map((item) => clean(
        item?.querySelector?.('a[href*="watch?"][href*="v="]')?.getAttribute?.("href"),
      ) || (() => {
        const itemData = item?.data?.playlistPanelVideoRenderer ?? item?.data;
        const videoID = clean(itemData?.videoId);
        const listID = new URL(location.href).searchParams.get("list");
        return videoID
          ? `/watch?v=${encodeURIComponent(videoID)}${listID ? `&list=${encodeURIComponent(listID)}` : ""}`
          : "";
      })());
      if (!items.some((item) => item.selected)) {
        const fallback = items.find((item) => item.trackID === currentTrackID);
        if (fallback) fallback.selected = true;
      }
      cachedQueue = { items, currentIndex: items.findIndex((item) => item.selected) };
      return cachedQueue;
    }
    if (!cachedQueue?.items.length) return undefined;
    const priorIndex = cachedQueue.currentIndex;
    if (cachedQueue.items[priorIndex]?.trackID === currentTrackID) return cachedQueue;
    let currentIndex = cachedQueue.items.findIndex((item, index) =>
      index > priorIndex && item.trackID === currentTrackID
    );
    if (currentIndex < 0) currentIndex = cachedQueue.items.findIndex((item) => item.trackID === currentTrackID);
    if (currentIndex < 0) {
      cachedQueue = null;
      cachedQueueHrefs = [];
      return undefined;
    }
    cachedQueue = {
      currentIndex,
      items: cachedQueue.items.map((item, index) => ({ ...item, selected: index === currentIndex })),
    };
    return cachedQueue;
  };

  const enabledControl = (control) => Boolean(
    control &&
    control.disabled !== true &&
    control.getAttribute?.("aria-disabled") !== "true" &&
    !control.hasAttribute?.("disabled")
  );

  const comparableText = (value) => clean(value).normalize("NFKC").toLocaleLowerCase();

  const linkHref = (link) => clean(link?.getAttribute?.("href") || link?.href);

  const isAlbumLink = (link) => {
    const href = linkHref(link);
    return /\/browse\/(?:MPRE|OLAK)/iu.test(href)
      || href.includes("FEmusic_library_privately_owned_release_detail");
  };

  const isArtistLink = (link) => {
    const href = linkHref(link);
    return /\/(?:channel|browse)\/UC[A-Za-z0-9_-]+/u.test(href)
      || /\/artist\//iu.test(href);
  };

  const uniqueText = (values) => [...new Set(values.map(clean).filter(Boolean))];

  const trackCredits = (playerBar, metadata, title) => {
    const links = Array.from(playerBar?.querySelectorAll?.(".byline a, .subtitle a") ?? []);
    const linkEntries = links.map((link) => ({
      link,
      text: clean(link?.textContent),
    })).filter(({ text }) => text);
    const metadataArtist = clean(metadata?.artist);
    const metadataAlbum = clean(metadata?.album);
    const metadataMatchesTitle = comparableText(metadata?.title) === comparableText(title);
    const explicitAlbum = linkEntries.find(({ link }) => isAlbumLink(link))?.text ?? "";
    const album = (metadataMatchesTitle ? metadataAlbum : "") || explicitAlbum;
    const explicitArtists = uniqueText(
      linkEntries.filter(({ link }) => isArtistLink(link)).map(({ text }) => text),
    );
    const genericArtists = uniqueText(linkEntries
      .filter(({ link, text }) =>
        !isAlbumLink(link)
        && comparableText(text) !== comparableText(title)
        && comparableText(text) !== comparableText(album)
        && !/^\d{4}$/u.test(text)
      )
      .map(({ text }) => text));
    const bylineText = firstText(playerBar, [".byline", ".subtitle"]);
    const bylineFallback = bylineText.split(/\s+•\s+/u).map(clean).find((part) =>
      part
      && comparableText(part) !== comparableText(title)
      && comparableText(part) !== comparableText(album)
      && !/^\d{4}$/u.test(part)
    ) ?? "";
    const mediaSessionArtist = metadataMatchesTitle
      && comparableText(metadataArtist) !== comparableText(title)
      ? metadataArtist
      : "";
    return {
      artist: mediaSessionArtist
        || (explicitArtists.length > 0 ? explicitArtists.join("、") : "")
        || (genericArtists.length > 0 ? genericArtists.join("、") : "")
        || bylineFallback,
      album,
    };
  };

  const coherentArtworkURL = (trackID, playerArtworkURL, metadataURL) => {
    const candidates = uniqueText([
      highResolutionArtworkURL(playerArtworkURL),
      highResolutionArtworkURL(metadataURL),
    ]);
    const changingTrack = Boolean(
      acceptedTrackTuple && acceptedTrackTuple.trackID !== trackID
    );
    if (!changingTrack) {
      const candidate = candidates.find((url) => {
        const embeddedTrackID = artworkVideoID(url);
        return !embeddedTrackID || embeddedTrackID === trackID;
      });
      if (candidate) return candidate;
    } else {
      const exact = candidates.find((url) => artworkVideoID(url) === trackID);
      if (exact) return exact;
      const unverified = candidates.find((url) =>
        !artworkVideoID(url) && url !== acceptedTrackTuple.artworkURL
      );
      if (unverified) return unverified;
    }
    return videoArtworkURL(trackID);
  };

  const trackTupleKey = (tuple) => JSON.stringify([
    tuple.trackID,
    tuple.title,
    tuple.artist,
    Math.round(tuple.durationMs / 1000),
  ]);

  const trackIdentityMetadataKey = (tuple) => JSON.stringify([
    tuple.title,
    tuple.artist,
  ]);

  const rememberRetiredTrackID = (trackID) => {
    if (!trackID) return;
    retiredTrackIDs.delete(trackID);
    retiredTrackIDs.add(trackID);
    while (retiredTrackIDs.size > 4) {
      retiredTrackIDs.delete(retiredTrackIDs.values().next().value);
    }
  };

  const acceptsTrackTuple = (tuple, nowUnixMs = Date.now()) => {
    if (!acceptedTrackTuple) {
      acceptedTrackTuple = tuple;
      pendingTrackTuple = null;
      metadataEnrichmentUntilUnixMs = nowUnixMs + TRACK_METADATA_ENRICHMENT_WINDOW_MS;
      return true;
    }
    const matchesAcceptedIdentity =
      acceptedTrackTuple.trackID === tuple.trackID
      && trackIdentityMetadataKey(acceptedTrackTuple) === trackIdentityMetadataKey(tuple);
    if (matchesAcceptedIdentity) {
      acceptedTrackTuple = tuple;
      pendingTrackTuple = null;
      return true;
    }

    const key = trackTupleKey(tuple);
    if (!pendingTrackTuple) trackTransitionEpoch += 1;
    if (pendingTrackTuple?.key !== key) {
      pendingTrackTuple = {
        epoch: pendingTrackTuple?.epoch ?? trackTransitionEpoch,
        key,
        tuple,
        firstSeenAtUnixMs: nowUnixMs,
        observations: 1,
      };
      return false;
    }
    pendingTrackTuple.tuple = tuple;
    pendingTrackTuple.observations += 1;
    const stableForMs = nowUnixMs - pendingTrackTuple.firstSeenAtUnixMs;
    const identityMetadataChanged =
      trackIdentityMetadataKey(tuple) !== trackIdentityMetadataKey(acceptedTrackTuple);
    const stableChangedTuple =
      identityMetadataChanged &&
      tuple.trackID !== acceptedTrackTuple.trackID &&
      pendingTrackTuple.observations >= 2 &&
      stableForMs >= TRACK_CHANGE_STABILITY_MS;
    const boundedHoldExpired =
      tuple.trackID !== acceptedTrackTuple.trackID
      && stableForMs >= TRACK_CHANGE_MAX_HOLD_MS;
    const stableMetadataEnrichment =
      tuple.trackID === acceptedTrackTuple.trackID
      && identityMetadataChanged
      && nowUnixMs <= metadataEnrichmentUntilUnixMs
      && pendingTrackTuple.observations >= 2
      && stableForMs >= TRACK_CHANGE_STABILITY_MS;
    if (!stableChangedTuple && !boundedHoldExpired && !stableMetadataEnrichment) return false;

    if (stableMetadataEnrichment) {
      acceptedTrackTuple = tuple;
      pendingTrackTuple = null;
      metadataEnrichmentUntilUnixMs = Number.NEGATIVE_INFINITY;
      return true;
    }

    const changedTrackID = tuple.trackID !== acceptedTrackTuple.trackID;
    rememberRetiredTrackID(acceptedTrackTuple.trackID);
    acceptedTrackTuple = tuple;
    pendingTrackTuple = null;
    metadataEnrichmentUntilUnixMs = changedTrackID
      ? nowUnixMs + TRACK_METADATA_ENRICHMENT_WINDOW_MS
      : Number.NEGATIVE_INFINITY;
    playbackClockAnchor = null;
    return true;
  };

  const readTrackObservation = (playerBar) => {
    const media = selectPlaybackMedia(playerBar);
    if (!(media instanceof HTMLMediaElement)) return null;
    const metadata = mediaSessionMetadata();
    const artwork = playerBar?.querySelector?.("img.image, img");
    const playerArtworkURL = clean(artwork?.currentSrc || artwork?.src);
    const trackID = currentVideoID(playerBar);
    const title = firstText(playerBar, [".title", "yt-formatted-string.title"])
      || clean(metadata?.title)
      || firstText(document, [
        "ytmusic-player-page .title",
        "ytmusic-player-page yt-formatted-string.title",
        "ytmusic-responsive-list-item-renderer[is-active] .title",
      ])
      || documentTitleTrack();
    if (!trackID || !title) return null;
    const { artist, album } = trackCredits(playerBar, metadata, title);
    const barClock = playerBarClock(playerBar);
    const durationMs = barClock?.durationMs
      ?? (Number.isFinite(media.duration) ? Math.max(0, media.duration * 1000) : 0);
    const artworkURL = coherentArtworkURL(
      trackID,
      playerArtworkURL,
      metadataArtworkURL(metadata),
    );
    return {
      media,
      barClock,
      tuple: { trackID, title, artist, album, artworkURL, durationMs },
    };
  };

  const buildSnapshot = () => {
    const playerBar = document.querySelector("ytmusic-player-bar");
    const observation = readTrackObservation(playerBar);
    if (!observation || !acceptsTrackTuple(observation.tuple)) return null;
    const { media, barClock, tuple } = observation;
    const { trackID, title, artist, album, artworkURL, durationMs } = tuple;
    const nativeQueue = queueSnapshot(trackID);
    const nativeLikeButtons = likeButtons(playerBar ?? document);
    return {
      type: "youtube-music-snapshot",
      version: protocolVersion,
      sequence: sequence++,
      sentAtUnixMs: Date.now(),
      track: {
        provider: "youtubeMusic",
        trackID,
        title,
        artist,
        ...(album ? { album } : {}),
        ...(artworkURL
          ? { artworkURL }
          : {}),
        pageURL: `https://music.youtube.com/watch?v=${encodeURIComponent(trackID)}`,
      },
      playback: {
        currentTimeMs: synchronizedCurrentTimeMs(media, barClock),
        durationMs,
        playbackRate: Number.isFinite(media.playbackRate) ? Math.max(0, media.playbackRate) : 1,
        state: playbackState(media),
        volume: Number.isFinite(media.volume) ? Math.max(0, Math.min(1, media.volume)) : 1,
        muted: media.muted === true,
        shuffle: shuffleEnabled(playerBar ?? document),
        repeat: repeatMode(playerBar ?? document),
      },
      controls: {
        seek: true,
        playPause: enabledControl(transportButton(playerBar ?? document, "playPause")),
        previous: enabledControl(transportButton(playerBar ?? document, "previous")),
        next: enabledControl(transportButton(playerBar ?? document, "next")),
        like: enabledControl(nativeLikeButtons.like),
        queue: Boolean(nativeQueue?.items.length),
        volume: true,
        shuffle: enabledControl(playbackModeButton(playerBar ?? document, "shuffle")),
        repeat: enabledControl(playbackModeButton(playerBar ?? document, "repeat")),
      },
      engagement: { likeStatus: likeStatus(playerBar ?? document) },
      ...(nativeQueue ? { queue: nativeQueue } : {}),
    };
  };

  const visibleNativePlayerBar = () => Array.from(
    document.querySelectorAll?.("ytmusic-player-bar") ?? [],
  ).find((candidate) => candidate.getBoundingClientRect?.().width > 0)
    ?? document.querySelector?.("ytmusic-player-bar");

  const playerClockText = (valueMs) => {
    const totalSeconds = Math.max(0, Math.floor((Number.isFinite(valueMs) ? valueMs : 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
  };

  const stableAppleShellTuple = (observation) => {
    const candidate = observation?.tuple;
    const candidateTitle = clean(candidate?.title);
    if (candidate && candidateTitle && !/^(スポンサー|sponsor)$/i.test(candidateTitle)) {
      lastAppleShellTrackTuple = candidate;
    }
    return lastAppleShellTrackTuple ?? acceptedTrackTuple ?? candidate ?? null;
  };

  const playerShellButton = (action, label, glyph) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-action", action);
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = glyph;
    return button;
  };

  const nativeCaptionButton = (root) => Array.from(root?.querySelectorAll?.("button") ?? []).find((button) => {
    const label = `${clean(button.getAttribute?.("aria-label"))} ${clean(button.title)}`;
    return /字幕|captions|subtitles|CC/i.test(label);
  }) ?? null;

  const nativePlayerPageButton = (root) => root?.querySelector?.(
    ".toggle-player-page-button button, .toggle-player-page-button",
  ) ?? Array.from(root?.querySelectorAll?.("button") ?? []).find((button) => {
    const label = `${clean(button.getAttribute?.("aria-label"))} ${clean(button.title)}`;
    return /player page|プレーヤー\s*ページ|播放器页面|播放器頁面/i.test(label);
  }) ?? null;

  const syncAppleShellCompleteArtwork = (trackID) => {
    const image = document.querySelector?.("ytmusic-player-page#player-page #song-image img");
    if (!image || !trackID) return;
    const current = clean(image.currentSrc || image.src);
    if (artworkVideoID(current) !== trackID) return;
    const canonical = highResolutionArtworkURL(current);
    if (!canonical) return;
    const key = `${trackID}|${canonical}`;
    if (current === canonical || image.getAttribute?.(APPLE_SHELL_COMPLETE_ARTWORK_ATTR) === `fallback:${key}`) {
      return;
    }
    if (!observedAppleShellArtworkImages.has(image)) {
      observedAppleShellArtworkImages.add(image);
      image.addEventListener?.("error", () => {
        const fallback = clean(image.getAttribute?.("data-lyricstage-artwork-fallback"));
        const activeKey = clean(image.getAttribute?.(APPLE_SHELL_COMPLETE_ARTWORK_ATTR));
        if (!fallback || !activeKey || activeKey.startsWith("fallback:")) return;
        image.setAttribute?.(APPLE_SHELL_COMPLETE_ARTWORK_ATTR, `fallback:${activeKey}`);
        image.removeAttribute?.("srcset");
        image.src = fallback;
      });
    }
    image.setAttribute?.(APPLE_SHELL_COMPLETE_ARTWORK_ATTR, key);
    image.setAttribute?.("data-lyricstage-artwork-fallback", current);
    image.removeAttribute?.("srcset");
    image.src = canonical;
  };

  const syncAppleShellPlayerBar = () => {
    const nativeBar = visibleNativePlayerBar();
    const observation = readTrackObservation(nativeBar);
    const media = observation?.media ?? selectPlaybackMedia(nativeBar);
    if (!(media instanceof HTMLMediaElement)) {
      appleShellPlayerBar?.toggleAttribute?.("hidden", true);
      return;
    }
    ensureAppleShellPlayerBar();
    const tuple = stableAppleShellTuple(observation);
    const barClock = observation?.barClock ?? playerBarClock(nativeBar);
    const durationMs = observation?.tuple?.durationMs
      || barClock?.durationMs
      || (Number.isFinite(media.duration) ? media.duration * 1000 : 0);
    const currentTimeMs = synchronizedCurrentTimeMs(media, barClock);
    syncAppleShellCompleteArtwork(tuple?.trackID);
    const playerOpen = document.querySelector?.("ytmusic-player-page#player-page")
      ?.hasAttribute?.("player-page-open") === true;
    document.documentElement?.toggleAttribute?.(APPLE_SHELL_PLAYER_OPEN_ATTR, playerOpen);
    appleShellPlayerBar.hidden = false;
    const artwork = appleShellPlayerBar.querySelector?.("[data-role='artwork']");
    const title = appleShellPlayerBar.querySelector?.("[data-role='title']");
    const artist = appleShellPlayerBar.querySelector?.("[data-role='artist']");
    const time = appleShellPlayerBar.querySelector?.("[data-role='time']");
    const progress = appleShellPlayerBar.querySelector?.("input[type='range']");
    if (artwork) {
      const nextArtwork = highResolutionArtworkURL(tuple?.artworkURL);
      if (nextArtwork) {
        if (artwork.src !== nextArtwork) artwork.src = nextArtwork;
        artwork.hidden = false;
      } else {
        artwork.hidden = true;
        artwork.removeAttribute?.("src");
      }
    }
    if (title) title.textContent = clean(tuple?.title) || "正在播放";
    if (artist) artist.textContent = clean(tuple?.artist) || clean(tuple?.album);
    if (time) time.textContent = `${playerClockText(currentTimeMs)} / ${playerClockText(durationMs)}`;
    if (progress && !progress.hasAttribute("data-seeking")) {
      progress.max = String(Math.max(1, Math.round(durationMs)));
      progress.value = String(Math.max(0, Math.min(durationMs, Math.round(currentTimeMs))));
      progress.style.setProperty("--lyricstage-progress", `${durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0}%`);
    }
    const setButton = (action, { disabled = false, pressed = null, glyph = null } = {}) => {
      const button = appleShellPlayerBar.querySelector?.(`button[data-action='${action}']`);
      if (!button) return;
      button.disabled = disabled;
      if (pressed !== null) button.setAttribute("aria-pressed", pressed ? "true" : "false");
      if (glyph !== null) button.textContent = glyph;
    };
    setButton("previous", { disabled: !enabledControl(transportButton(nativeBar, "previous")) });
    setButton("playPause", {
      disabled: !enabledControl(transportButton(nativeBar, "playPause")),
      pressed: !media.paused,
      glyph: media.paused ? "▶" : "Ⅱ",
    });
    setButton("next", { disabled: !enabledControl(transportButton(nativeBar, "next")) });
    const liked = likeStatus(nativeBar ?? document) === "liked";
    setButton("like", { disabled: !enabledControl(likeButtons(nativeBar ?? document).like), pressed: liked, glyph: liked ? "♥" : "♡" });
    setButton("captions", { disabled: !enabledControl(nativeCaptionButton(nativeBar ?? document)) });
    setButton("repeat", { disabled: !enabledControl(playbackModeButton(nativeBar ?? document, "repeat")), pressed: repeatMode(nativeBar ?? document) !== "off" });
    setButton("shuffle", { disabled: !enabledControl(playbackModeButton(nativeBar ?? document, "shuffle")), pressed: shuffleEnabled(nativeBar ?? document) });
    const identity = appleShellPlayerBar.querySelector?.("[data-action='togglePlayer']");
    const expansionIndicator = appleShellPlayerBar.querySelector?.("[data-role='expansion-indicator']");
    if (identity) {
      identity.disabled = !enabledControl(nativePlayerPageButton(nativeBar ?? document));
      identity.setAttribute("aria-expanded", playerOpen ? "true" : "false");
      identity.setAttribute("aria-label", playerOpen ? "收起完整播放器" : "展开完整播放器");
      identity.title = playerOpen ? "收起完整播放器" : "展开完整播放器";
    }
    if (expansionIndicator) expansionIndicator.textContent = playerOpen ? "⌄" : "⌃";
    appleShellPlayerBar.toggleAttribute?.("data-player-open", playerOpen);
  };

  const ensureAppleShellPlayerBar = () => {
    if (appleShellPlayerBar?.isConnected) return appleShellPlayerBar;
    const shell = document.createElement("div");
    shell.setAttribute(APPLE_SHELL_PLAYER_BAR_ATTR, "true");
    shell.setAttribute("role", "toolbar");
    shell.setAttribute("aria-label", "LyricStage 播放器");
    const progress = document.createElement("input");
    progress.type = "range";
    progress.min = "0";
    progress.max = "1";
    progress.value = "0";
    progress.step = "100";
    progress.setAttribute("aria-label", "播放进度");
    const left = document.createElement("div");
    left.setAttribute("data-zone", "transport");
    left.append(
      playerShellButton("previous", "上一首", "|◀"),
      playerShellButton("playPause", "播放或暂停", "▶"),
      playerShellButton("next", "下一首", "|▶"),
    );
    const time = document.createElement("span");
    time.setAttribute("data-role", "time");
    left.append(time);
    const identity = document.createElement("button");
    identity.type = "button";
    identity.setAttribute("data-zone", "identity");
    identity.setAttribute("data-action", "togglePlayer");
    identity.setAttribute("aria-expanded", "false");
    identity.setAttribute("aria-label", "展开完整播放器");
    const artwork = document.createElement("img");
    artwork.setAttribute("data-role", "artwork");
    artwork.alt = "";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.setAttribute("data-role", "title");
    const artist = document.createElement("span");
    artist.setAttribute("data-role", "artist");
    copy.append(title, artist);
    const expansionIndicator = document.createElement("span");
    expansionIndicator.setAttribute("data-role", "expansion-indicator");
    expansionIndicator.setAttribute("aria-hidden", "true");
    expansionIndicator.textContent = "⌃";
    identity.append(artwork, copy, expansionIndicator);
    const right = document.createElement("div");
    right.setAttribute("data-zone", "actions");
    right.append(
      playerShellButton("like", "喜欢", "♡"),
      playerShellButton("captions", "字幕", "CC"),
      playerShellButton("repeat", "循环", "↻"),
      playerShellButton("shuffle", "随机播放", "⇄"),
    );
    shell.append(progress, identity, left, right);
    const runNativeAction = (action) => {
      const nativeBar = visibleNativePlayerBar();
      const target = action === "previous" || action === "playPause" || action === "next"
        ? transportButton(nativeBar ?? document, action)
        : action === "like"
          ? likeButtons(nativeBar ?? document).like
          : action === "captions"
            ? nativeCaptionButton(nativeBar ?? document)
            : action === "togglePlayer"
              ? nativePlayerPageButton(nativeBar ?? document)
              : playbackModeButton(nativeBar ?? document, action);
      if (!enabledControl(target) || typeof target.click !== "function") return;
      target.click();
      queueSend();
      window.setTimeout?.(syncAppleShellPlayerBar, 0);
      if (action === "togglePlayer") {
        window.setTimeout?.(syncAppleShellPlayerBar, 250);
        window.setTimeout?.(syncAppleShellPlayerBar, 700);
      }
    };
    shell.addEventListener("click", (event) => {
      const button = event.target?.closest?.("button[data-action]");
      if (button) {
        runNativeAction(button.getAttribute("data-action"));
        return;
      }
      if (event.target?.closest?.("input, a, [role='slider']")) return;
      runNativeAction("togglePlayer");
    });
    progress.addEventListener("pointerdown", () => progress.setAttribute("data-seeking", "true"));
    progress.addEventListener("input", () => {
      const current = Number(progress.value);
      const maximum = Number(progress.max);
      const timeNode = shell.querySelector?.("[data-role='time']");
      if (timeNode) timeNode.textContent = `${playerClockText(current)} / ${playerClockText(maximum)}`;
      progress.style.setProperty("--lyricstage-progress", `${maximum > 0 ? (current / maximum) * 100 : 0}%`);
    });
    const commitSeek = () => {
      progress.removeAttribute("data-seeking");
      const nativeBar = visibleNativePlayerBar();
      const media = selectPlaybackMedia(nativeBar);
      if (!(media instanceof HTMLMediaElement)) return;
      const requestedTimeMs = Number(progress.value);
      const target = mediaSeekTarget(media, playerBarClock(nativeBar), requestedTimeMs);
      if (!target) return;
      media.currentTime = target.mediaTimeSeconds;
      playbackClockAnchor = { media, mediaTimeMs: target.mediaTimeSeconds * 1000, barTimeMs: target.logicalTimeMs };
      queueSend();
    };
    progress.addEventListener("change", commitSeek);
    (document.querySelector?.("ytmusic-app") ?? document.body)?.append?.(shell);
    appleShellPlayerBar = shell;
    return shell;
  };

  const snapshotStateSignature = (snapshot) => JSON.stringify([
    snapshot.track.provider,
    snapshot.track.trackID,
    snapshot.track.title,
    snapshot.track.artist,
    snapshot.track.album ?? "",
    snapshot.track.artworkURL ?? "",
    snapshot.track.pageURL,
    snapshot.playback.durationMs,
    snapshot.playback.playbackRate,
    snapshot.playback.state,
    snapshot.playback.volume,
    snapshot.playback.muted,
    snapshot.playback.shuffle,
    snapshot.playback.repeat,
    snapshot.controls.seek,
    snapshot.controls.playPause,
    snapshot.controls.previous,
    snapshot.controls.next,
    snapshot.controls.like,
    snapshot.controls.queue,
    snapshot.controls.volume,
    snapshot.controls.shuffle,
    snapshot.controls.repeat,
    snapshot.engagement?.likeStatus ?? "neutral",
    ...(snapshot.queue?.items ?? []).flatMap((item) => [
      item.trackID,
      item.title,
      item.artist,
      item.artworkURL ?? "",
      item.selected,
    ]),
  ]);

  const snapshotFieldSignature = (snapshot, stateSignature) => JSON.stringify([
    stateSignature,
    Math.round(snapshot.playback.currentTimeMs),
  ]);

  const updateSponsorBlockCompatibility = () => {
    const playerBar = document.querySelector("ytmusic-player-bar");
    if (!playerBar) return;

    const controls = playerBar.querySelector?.(
      "#right-controls-buttons, .right-controls-buttons",
    );
    if (controls && (!sponsorBlockControlHost?.isConnected || sponsorBlockControlHost.parentElement !== controls)) {
      sponsorBlockControlHost?.remove();
      const compat = document.createElement("div");
      compat.className = "ytp-right-controls";
      compat.setAttribute("data-lyricstage-sponsorblock-controls", "true");
      compat.style.display = "contents";
      controls.append?.(compat);
      sponsorBlockControlHost = compat;
    }

    if (!sponsorBlockTitleCompat?.isConnected) {
      const compat = document.createElement("div");
      compat.className = "ypcs-video-info";
      compat.setAttribute("data-lyricstage-sponsorblock-title", "true");
      compat.setAttribute("aria-hidden", "true");
      compat.style.display = "none";
      const text = document.createElement("span");
      text.className = "watch-title-text-container";
      compat.append(text);
      playerBar.append?.(compat);
      sponsorBlockTitleCompat = compat;
    }
    const title = firstText(playerBar, [".title", "yt-formatted-string.title"]);
    const titleText = sponsorBlockTitleCompat?.querySelector?.(".watch-title-text-container");
    if (titleText && titleText.textContent !== title) titleText.textContent = title;
  };

  const isStronglyTabSelected = (tab) => {
    if (!tab) return false;
    return (
      tab.getAttribute("aria-selected") === "true" ||
      (typeof tab.classList?.contains === "function" && tab.classList.contains("iron-selected"))
    );
  };

  const getSelectedTab = (tabList, preferredTab = lastInteractedTab) => {
    if (!tabList) return null;
    const tabs = Array.from(tabList.querySelectorAll?.('[role="tab"], tp-yt-paper-tab') ?? []);
    const strong = tabs.filter(isStronglyTabSelected);
    if (strong.length === 1) return strong[0];
    if (strong.length > 1) return preferredTab && strong.includes(preferredTab) ? preferredTab : null;
    const weak = tabs.filter((tab) => tab.hasAttribute?.("selected"));
    if (weak.length === 1) return weak[0];
    return preferredTab && weak.includes(preferredTab) ? preferredTab : null;
  };

  const observedTabs = new WeakSet();
  const observeTabInteractions = (tabList) => {
    const tabs = Array.from(tabList?.querySelectorAll?.('[role="tab"], tp-yt-paper-tab') ?? []);
    for (const tab of tabs) {
      if (observedTabs.has(tab)) continue;
      observedTabs.add(tab);
      tab.addEventListener?.(
        "click",
        () => {
          lastInteractedTab = tab;
          resetStageMountRecovery();
          const confirmedLyricsTab = getConfirmedLyricsTab(tabList);
          if (confirmedLyricsTab && tab !== confirmedLyricsTab && inPageStageHost?.isConnected) {
            releaseStageMount();
          }
        },
        { capture: true },
      );
    }
  };

  const lyricsTabLabel = () => {
    const language = clean(document.documentElement?.lang || navigator.language).toLowerCase();
    if (language.startsWith("ja")) return "歌詞";
    if (language.startsWith("zh")) return "歌词";
    return "Lyrics";
  };

  const looksLikeLyricsTab = (tab) => {
    const label = clean(
      tab?.getAttribute?.("aria-label")
      || tab?.querySelector?.("yt-formatted-string")?.textContent
      || tab?.textContent,
    ).toLowerCase();
    return label === "lyrics" || label === "lyric" || label === "歌词" || label === "歌詞";
  };

  const looksLikeCommentsTab = (tab) => {
    const label = clean(
      tab?.getAttribute?.("aria-label")
      || tab?.querySelector?.("yt-formatted-string")?.textContent
      || tab?.textContent,
    ).toLowerCase();
    return label === "comments" || label === "comment" || label === "评论"
      || label === "評論" || label === "コメント";
  };

  const normalizedTabLabel = (tab) => clean(
    tab?.getAttribute?.("aria-label")
    || tab?.querySelector?.("yt-formatted-string")?.textContent
    || tab?.textContent,
  ).toLowerCase();

  const looksLikeQueueTab = (tab) => {
    const label = normalizedTabLabel(tab);
    return label.includes("next") || label.includes("queue") || label.includes("次の")
      || label.includes("播放队列") || label.includes("播放佇列");
  };

  const looksLikeRelatedTab = (tab) => {
    const label = normalizedTabLabel(tab);
    return label.includes("related") || label.includes("推荐") || label.includes("推薦")
      || label.includes("関連");
  };

  const isTabDisabled = (tab) => Boolean(
    tab?.disabled === true
    || tab?.getAttribute?.("aria-disabled") === "true"
    || tab?.hasAttribute?.("disabled")
  );

  const ensureAppleShellGuide = () => {
    if (document.documentElement?.getAttribute?.("data-lyricstage-shell") !== "apple") {
      document.documentElement?.removeAttribute?.(APPLE_SHELL_GUIDE_ATTR);
      return;
    }
    const navigation = document.querySelector?.("ytmusic-nav-bar");
    const drawer = document.querySelector?.("tp-yt-app-drawer#guide");
    if (!navigation || !drawer) return;
    const guideButton = navigation.querySelector?.("#guide-button");

    const syncGuideState = () => {
      const collapsed = navigation.hasAttribute?.("guide-collapsed") && !drawer.hasAttribute?.("opened");
      document.documentElement?.setAttribute?.(
        APPLE_SHELL_GUIDE_ATTR,
        collapsed ? "collapsed" : "expanded",
      );
    };

    if (
      observedAppleShellNavigation !== navigation
      || observedAppleShellDrawer !== drawer
    ) {
      appleShellGuideObserver?.disconnect?.();
      appleShellGuideObserver = new MutationObserver(syncGuideState);
      appleShellGuideObserver.observe(navigation, {
        attributes: true,
        attributeFilter: ["guide-collapsed"],
      });
      appleShellGuideObserver.observe(drawer, {
        attributes: true,
        attributeFilter: ["opened"],
      });
      observedAppleShellNavigation = navigation;
      observedAppleShellDrawer = drawer;
    }
    syncGuideState();

    if (guideButton && !observedAppleShellGuideButtons.has(guideButton)) {
      observedAppleShellGuideButtons.add(guideButton);
      guideButton.addEventListener?.("click", () => {
        window.setTimeout?.(() => {
          syncGuideState();
          const collapsed = document.documentElement?.getAttribute?.(APPLE_SHELL_GUIDE_ATTR) === "collapsed";
          try {
            void chrome.storage?.local?.set?.({ [APPLE_SHELL_GUIDE_STORAGE_KEY]: collapsed });
          } catch {
            // Native guide behavior still works when extension storage is unavailable.
          }
        }, 360);
      });
    }

    if (!appleShellGuidePreferenceRequested) {
      appleShellGuidePreferenceRequested = true;
      try {
        const storedPreference = chrome.storage?.local?.get?.(APPLE_SHELL_GUIDE_STORAGE_KEY);
        void storedPreference?.then?.((stored) => {
          const preferred = stored?.[APPLE_SHELL_GUIDE_STORAGE_KEY];
          if (typeof preferred !== "boolean" || !guideButton?.isConnected) return;
          const collapsed = navigation.hasAttribute?.("guide-collapsed") && !drawer.hasAttribute?.("opened");
          if (collapsed !== preferred) guideButton.click?.();
        });
      } catch {
        // Keep the native guide state when storage is unavailable.
      }
    }
  };

  const deactivateOwnedLyricsSurface = (sidePanel) => {
    sidePanel?.removeAttribute?.(OWNED_LYRICS_ACTIVE_ATTR);
    if (ownedLyricsTab?.isConnected) {
      ownedLyricsTab.setAttribute("aria-selected", "false");
      ownedLyricsTab.removeAttribute("selected");
    }
    if (ownedLyricsRenderer?.isConnected) {
      ownedLyricsRenderer.hidden = true;
      ownedLyricsRenderer.style.display = "none";
    }
  };

  const syncOwnedTabBarSelection = (sidePanel) => {
    if (!ownedLyricsTabBar?.isConnected) return;
    const lyricsActive = sidePanel?.getAttribute?.(OWNED_LYRICS_ACTIVE_ATTR) === "true";
    for (const button of Array.from(ownedLyricsTabBar.querySelectorAll?.('[role="tab"]') ?? [])) {
      const target = ownedTabProxyTargets.get(button);
      const selected = button === ownedLyricsTab
        ? lyricsActive
        : !lyricsActive && isStronglyTabSelected(target);
      button.setAttribute?.("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    }
  };

  const removeOwnedLyricsSurface = (sidePanel, nativeLyricsTab) => {
    const wasActive = sidePanel?.getAttribute?.(OWNED_LYRICS_ACTIVE_ATTR) === "true";
    deactivateOwnedLyricsSurface(sidePanel);
    ownedLyricsTabBar?.remove?.();
    ownedLyricsRenderer?.remove?.();
    sidePanel?.removeAttribute?.(APPLE_SHELL_TAB_BAR_ATTR);
    ownedLyricsTabBar = null;
    ownedLyricsTab = null;
    ownedLyricsRenderer = null;
    nativeLyricsTab?.removeAttribute?.("data-lyricstage-native-lyrics-hidden");
    if (wasActive && nativeLyricsTab && !isTabDisabled(nativeLyricsTab)) nativeLyricsTab.click?.();
  };

  const activateOwnedLyricsSurface = (sidePanel, tabList) => {
    if (!ownedLyricsTab?.isConnected || !ownedLyricsRenderer?.isConnected) return;
    for (const tab of Array.from(tabList?.querySelectorAll?.('[role="tab"], tp-yt-paper-tab') ?? [])) {
      if (tab === ownedLyricsTab) continue;
      tab.setAttribute?.("aria-selected", "false");
      tab.removeAttribute?.("selected");
    }
    sidePanel?.setAttribute?.(OWNED_LYRICS_ACTIVE_ATTR, "true");
    sidePanel?.removeAttribute?.(APPLE_SHELL_POPOVER_ATTR);
    document.documentElement?.removeAttribute?.(APPLE_SHELL_POPOVER_ATTR);
    appleShellPopoverKind = "";
    ownedLyricsTab.setAttribute("aria-selected", "true");
    ownedLyricsTab.setAttribute("selected", "");
    ownedLyricsTab.setAttribute(CONFIRMED_TAB_ATTR, "true");
    ownedLyricsRenderer.hidden = false;
    ownedLyricsRenderer.style.display = "flex";
    lastInteractedTab = ownedLyricsTab;
    resetStageMountRecovery();
    syncOwnedTabBarSelection(sidePanel);
    queueMutationReconcile({ stage: true });
  };

  const syncAppleShellPlayerActions = () => {
    const activePanel = document.querySelector?.(
      "ytmusic-player-page#player-page #side-panel",
    )?.getAttribute?.(APPLE_SHELL_POPOVER_ATTR) || "";
    appleShellPopoverKind = activePanel;
    syncAppleShellMediaProxy();
    for (const button of Array.from(
      appleShellPlayerActions?.querySelectorAll?.("button[data-panel]") ?? [],
    )) {
      const selected = button.getAttribute?.("data-panel") === activePanel;
      button.setAttribute?.("aria-expanded", selected ? "true" : "false");
      button.toggleAttribute?.("data-active", selected);
    }
  };

  const restoreAppleShellMediaToggle = () => {
    if (!appleShellMediaToggle) return;
    appleShellMediaToggle = null;
  };

  const syncAppleShellMediaProxy = () => {
    const nativeButtons = Array.from(
      appleShellMediaToggle?.querySelectorAll?.("button") ?? [],
    ).slice(0, 2);
    const proxyButtons = Array.from(
      appleShellPlayerActions?.querySelectorAll?.(`[${APPLE_SHELL_MEDIA_PROXY_ATTR}] button`) ?? [],
    );
    const player = document.querySelector?.("ytmusic-player-page#player-page #player");
    const inferredVideo = player?.hasAttribute?.("video-mode") === true;
    const nativeVideo = nativeButtons[1]?.getAttribute?.("aria-pressed") === "true";
    const nativeSong = nativeButtons[0]?.getAttribute?.("aria-pressed") === "true";
    const videoSelected = nativeVideo || (!nativeSong && inferredVideo);
    proxyButtons.forEach((button, index) => {
      const target = nativeButtons[index];
      const selected = index === 1 ? videoSelected : !videoSelected;
      button.setAttribute?.("aria-pressed", selected ? "true" : "false");
      button.toggleAttribute?.("data-selected", selected);
      button.disabled = !target || target.disabled === true || target.getAttribute?.("aria-disabled") === "true";
    });
    document.documentElement?.setAttribute?.(
      "data-lyricstage-media-mode",
      videoSelected ? "video" : "song",
    );
    const video = player?.querySelector?.("video") ?? document.querySelector?.("video");
    if (video?.videoWidth > 0 && video?.videoHeight > 0) {
      document.documentElement?.style?.setProperty?.(
        "--lyricstage-video-aspect",
        `${video.videoWidth} / ${video.videoHeight}`,
      );
    }
  };

  const invokeAppleShellMediaMode = (index) => {
    const target = appleShellMediaToggle?.querySelectorAll?.("button")?.[index];
    if (!target || target.disabled === true || target.getAttribute?.("aria-disabled") === "true") return;
    appleShellMediaToggle.removeAttribute?.("toggle-disabled");
    target.click?.();
    syncAppleShellMediaProxy();
    window.setTimeout?.(syncAppleShellMediaProxy, 250);
    window.setTimeout?.(syncAppleShellMediaProxy, 900);
  };

  const closeAppleShellPopover = (sidePanel, tabList) => {
    if (!sidePanel) return;
    if (ownedLyricsTab?.isConnected && ownedLyricsRenderer?.isConnected) {
      activateOwnedLyricsSurface(sidePanel, tabList);
    } else {
      sidePanel.removeAttribute?.(APPLE_SHELL_POPOVER_ATTR);
      document.documentElement?.removeAttribute?.(APPLE_SHELL_POPOVER_ATTR);
      appleShellPopoverKind = "";
      const nativeLyricsTab = Array.from(
        tabList?.querySelectorAll?.('[role="tab"], tp-yt-paper-tab') ?? [],
      ).find((tab) => looksLikeLyricsTab(tab) && !isTabDisabled(tab));
      nativeLyricsTab?.click?.();
    }
    syncAppleShellPlayerActions();
  };

  const ensureAppleShellPlayerActions = (sidePanel, tabList, tabs) => {
    const navigation = document.querySelector?.("ytmusic-nav-bar");
    const rightContent = navigation?.querySelector?.("#right-content");
    const playerPage = sidePanel?.closest?.("ytmusic-player-page#player-page");
    const playerOpen = Boolean(playerPage?.hasAttribute?.("player-page-open"));
    const mediaToggle = appleShellMediaToggle?.isConnected
      ? appleShellMediaToggle
      : playerPage?.querySelector?.("ytmusic-av-toggle");
    const mediaButtons = Array.from(mediaToggle?.querySelectorAll?.("button") ?? []).slice(0, 2);
    document.documentElement?.toggleAttribute?.(APPLE_SHELL_PLAYER_OPEN_ATTR, playerOpen);
    const queueTab = tabs.find((tab) => looksLikeQueueTab(tab));
    const relatedTab = tabs.find((tab) => looksLikeRelatedTab(tab));
    if (
      !playerOpen
      || !sidePanel
      || !rightContent
      || (!mediaToggle && !queueTab && !relatedTab)
    ) {
      restoreAppleShellMediaToggle();
      appleShellPlayerActions?.remove?.();
      appleShellPlayerActions = null;
      return;
    }

    const signature = `${mediaButtons.map((button) => clean(button.textContent)).join("|")}|${clean(queueTab?.textContent)}|${clean(relatedTab?.textContent)}`;
    if (
      appleShellPlayerActions?.isConnected
      && appleShellPlayerActions.getAttribute?.(APPLE_SHELL_TAB_SIGNATURE_ATTR) !== signature
    ) {
      restoreAppleShellMediaToggle();
      appleShellPlayerActions.remove?.();
      appleShellPlayerActions = null;
    }
    if (appleShellPlayerActions?.isConnected) {
      syncAppleShellPlayerActions();
      return;
    }

    const actions = document.createElement("div");
    actions.setAttribute(APPLE_SHELL_PLAYER_ACTIONS_ATTR, "true");
    actions.setAttribute(APPLE_SHELL_TAB_SIGNATURE_ATTR, signature);
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", "播放器面板");
    actions.addEventListener("pointerdown", () => {
      document.activeElement?.blur?.();
      document.querySelector?.("ytmusic-search-box input")?.blur?.();
    });

    if (mediaToggle && mediaButtons.length === 2) {
      appleShellMediaToggle = mediaToggle;
      if (!observedAppleShellMediaToggles.has(mediaToggle)) {
        observedAppleShellMediaToggles.add(mediaToggle);
        mediaToggle.addEventListener?.("click", () => {
          window.setTimeout?.(syncAppleShellMediaProxy, 0);
        });
      }
      const mediaProxy = document.createElement("div");
      mediaProxy.setAttribute(APPLE_SHELL_MEDIA_PROXY_ATTR, "true");
      mediaProxy.setAttribute("role", "group");
      mediaProxy.setAttribute("aria-label", "播放媒体模式");
      mediaButtons.forEach((nativeButton, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = clean(nativeButton.textContent) || (index === 0 ? "曲" : "動画");
        button.addEventListener("click", () => invokeAppleShellMediaMode(index));
        mediaProxy.append(button);
      });
      actions.append(mediaProxy);
    }

    for (const [kind, label, target] of [
      ["queue", "播放队列", queueTab],
      ["related", "相关推荐", relatedTab],
    ]) {
      if (!target) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-panel", kind);
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", "false");
      button.title = label;
      button.innerHTML = kind === "queue"
        ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h11M4 12h8M4 18h6"/><path d="m15 14 5 3-5 3z" fill="currentColor" stroke="none"/></svg><b>播放队列</b>'
        : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 1.65 4.35L18 9l-4.35 1.65L12 15l-1.65-4.35L6 9l4.35-1.65L12 3Z"/><path d="m18.5 14 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z"/></svg><b>相关推荐</b>';
      button.addEventListener("click", () => {
        if (sidePanel.getAttribute?.(APPLE_SHELL_POPOVER_ATTR) === kind) {
          closeAppleShellPopover(sidePanel, tabList);
          return;
        }
        appleShellPopoverKind = kind;
        sidePanel.setAttribute?.(APPLE_SHELL_POPOVER_ATTR, kind);
        document.documentElement?.setAttribute?.(APPLE_SHELL_POPOVER_ATTR, kind);
        deactivateOwnedLyricsSurface(sidePanel);
        lastInteractedTab = target;
        target.click?.();
        syncAppleShellPlayerActions();
        queueMutationReconcile({ stage: true });
      });
      actions.append(button);
    }
    rightContent.prepend?.(actions);
    appleShellPlayerActions = actions;
    syncAppleShellMediaProxy();
    syncAppleShellPlayerActions();
  };

  const closeCurrentAppleShellPopover = () => {
    const sidePanel = document.querySelector?.("ytmusic-player-page#player-page #side-panel");
    if (!sidePanel?.hasAttribute?.(APPLE_SHELL_POPOVER_ATTR)) return;
    const tabList = sidePanel?.querySelector?.(
      'tp-yt-paper-tabs [role="tablist"], tp-yt-paper-tabs #tabsContent, tp-yt-paper-tabs',
    );
    closeAppleShellPopover(sidePanel, tabList);
  };

  const handleAppleShellDismissPointer = (event) => {
    const sidePanel = document.querySelector?.("ytmusic-player-page#player-page #side-panel");
    if (!sidePanel?.hasAttribute?.(APPLE_SHELL_POPOVER_ATTR)) return;
    const target = event?.target;
    if (target instanceof Node && (
      appleShellPlayerActions?.contains?.(target)
      || sidePanel.contains?.(target)
    )) return;
    closeCurrentAppleShellPopover();
  };

  const handleAppleShellDismissKey = (event) => {
    if (
      event?.key !== "Escape"
      || !document.querySelector?.("ytmusic-player-page#player-page #side-panel")?.hasAttribute?.(APPLE_SHELL_POPOVER_ATTR)
    ) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    closeCurrentAppleShellPopover();
  };

  const ensureOwnedLyricsSurface = (sidePanel, tabList) => {
    if (!sidePanel || !tabList) return;
    const tabs = Array.from(tabList.querySelectorAll?.('[role="tab"], tp-yt-paper-tab') ?? []);
    for (const tab of tabs) {
      if (looksLikeCommentsTab(tab)) tab.setAttribute?.("data-lyricstage-hidden-tab", "comments");
    }
    const nativeTabSignature = tabs
      .filter((tab) => !looksLikeCommentsTab(tab))
      .map((tab) => clean(tab.textContent) || "tab")
      .join("|");
    if (
      ownedLyricsTabBar?.isConnected
      && ownedLyricsTabBar.getAttribute?.(APPLE_SHELL_TAB_SIGNATURE_ATTR) !== nativeTabSignature
    ) {
      ownedLyricsTabBar.remove?.();
      ownedLyricsTabBar = null;
      ownedLyricsTab = null;
    }
    ensureAppleShellPlayerActions(sidePanel, tabList, tabs);

    const nativeLyricsTab = tabs.find((tab) => !tab.hasAttribute?.(OWNED_LYRICS_TAB_ATTR) && looksLikeLyricsTab(tab));
    if (nativeLyricsTab && !isTabDisabled(nativeLyricsTab)) {
      removeOwnedLyricsSurface(sidePanel, nativeLyricsTab);
      return;
    }

    nativeLyricsTab?.setAttribute?.("data-lyricstage-native-lyrics-hidden", "true");
    if (!ownedLyricsTabBar?.isConnected) {
      const bar = document.createElement("nav");
      bar.setAttribute("role", "tablist");
      bar.setAttribute(APPLE_SHELL_TAB_BAR_ATTR, "true");
      bar.setAttribute(APPLE_SHELL_TAB_SIGNATURE_ATTR, nativeTabSignature);
      bar.setAttribute("aria-label", "播放器内容");

      const lyricsButton = document.createElement("button");
      lyricsButton.type = "button";
      lyricsButton.setAttribute("role", "tab");
      lyricsButton.setAttribute(OWNED_LYRICS_TAB_ATTR, "true");
      lyricsButton.setAttribute("aria-selected", "false");
      lyricsButton.textContent = nativeLyricsTab?.textContent?.trim?.() || lyricsTabLabel();
      lyricsButton.addEventListener("click", () => activateOwnedLyricsSurface(sidePanel, tabList));
      ownedLyricsTab = lyricsButton;

      const proxyButtons = [];
      let lyricsInserted = false;
      for (const nativeTab of tabs) {
        if (looksLikeCommentsTab(nativeTab)) continue;
        if (nativeTab === nativeLyricsTab || looksLikeLyricsTab(nativeTab)) {
          proxyButtons.push(lyricsButton);
          lyricsInserted = true;
          continue;
        }
        const proxy = document.createElement("button");
        proxy.type = "button";
        proxy.setAttribute("role", "tab");
        proxy.setAttribute(APPLE_SHELL_TAB_PROXY_ATTR, "native");
        proxy.setAttribute("aria-selected", "false");
        proxy.textContent = clean(nativeTab.textContent);
        ownedTabProxyTargets.set(proxy, nativeTab);
        proxy.addEventListener("click", () => {
          deactivateOwnedLyricsSurface(sidePanel);
          lastInteractedTab = nativeTab;
          nativeTab.click?.();
          syncOwnedTabBarSelection(sidePanel);
          queueMutationReconcile({ stage: true });
        });
        proxyButtons.push(proxy);
      }
      if (!lyricsInserted) proxyButtons.splice(Math.min(1, proxyButtons.length), 0, lyricsButton);
      proxyButtons.forEach((button, index) => {
        button.addEventListener("keydown", (event) => {
          const key = event?.key;
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
          event.preventDefault?.();
          const nextIndex = key === "Home"
            ? 0
            : key === "End"
              ? proxyButtons.length - 1
              : (index + (key === "ArrowRight" ? 1 : -1) + proxyButtons.length) % proxyButtons.length;
          const nextButton = proxyButtons[nextIndex];
          nextButton?.focus?.();
          nextButton?.click?.();
        });
      });
      bar.append(...proxyButtons);
      sidePanel.append?.(bar);
      sidePanel.setAttribute?.(APPLE_SHELL_TAB_BAR_ATTR, "true");
      ownedLyricsTabBar = bar;
    }

    if (!ownedLyricsRenderer?.isConnected) {
      const renderer = document.createElement("section");
      renderer.setAttribute("role", "tabpanel");
      renderer.setAttribute(OWNED_LYRICS_RENDERER_ATTR, "true");
      renderer.setAttribute("aria-label", lyricsTabLabel());
      renderer.hidden = true;
      renderer.style.display = "none";
      sidePanel.append?.(renderer);
      ownedLyricsRenderer = renderer;
    }

    if (
      !sidePanel.hasAttribute?.(APPLE_SHELL_POPOVER_ATTR)
      && (
        sidePanel.getAttribute?.(OWNED_LYRICS_ACTIVE_ATTR) !== "true"
        || ownedLyricsRenderer?.hidden
      )
    ) {
      activateOwnedLyricsSurface(sidePanel, tabList);
    }

    syncOwnedTabBarSelection(sidePanel);

    for (const tab of tabs) {
      if (tab === ownedLyricsTab || observedOwnedSurfaceTabs.has(tab)) continue;
      observedOwnedSurfaceTabs.add(tab);
      tab.addEventListener?.("click", () => {
        if (tab === ownedLyricsTab) return;
        deactivateOwnedLyricsSurface(sidePanel);
        releaseStageMount();
      }, { capture: true });
    }
  };

  const getActiveRenderer = (sidePanel) => {
    if (!sidePanel) return null;
    const ownedRenderer = sidePanel.querySelector?.(`[${OWNED_LYRICS_RENDERER_ATTR}="true"]`);
    if (
      ownedRenderer
      && sidePanel.getAttribute?.(OWNED_LYRICS_ACTIVE_ATTR) === "true"
      && !ownedRenderer.hidden
      && ownedRenderer.style?.display !== "none"
    ) return ownedRenderer;
    const renderers = Array.from(
      sidePanel.querySelectorAll?.("ytmusic-tab-renderer#tab-renderer, ytmusic-tab-renderer") ?? [],
    );
    for (const renderer of renderers) {
      if (!renderer.hidden && renderer.style?.display !== "none") {
        return renderer;
      }
    }
    return renderers[0] ?? null;
  };

  const isLyricsRenderer = (renderer) => {
    if (!renderer || !renderer.isConnected) return false;
    return renderer.getAttribute?.("page-type") === LYRICS_PAGE_TYPE
      || renderer.getAttribute?.(OWNED_LYRICS_RENDERER_ATTR) === "true";
  };

  const clearStageReadyProbe = () => {
    if (stageReadyTimeout !== null) {
      clearTimeout(stageReadyTimeout);
      stageReadyTimeout = null;
    }
    if (stageUIDispose) {
      try {
        stageUIDispose();
      } catch {
        // The host is removed below even if React cleanup fails.
      }
      stageUIDispose = null;
    }
  };

  const invalidateStageAttempt = () => {
    stageMountGeneration += 1;
    clearStageReadyProbe();
  };

  const resetStageMountRecovery = () => {
    stageMountFailureCount = 0;
    stageMountRetryAt = 0;
    stageMountFailure = "";
  };

  const restoreNativeRenderers = () => {
    savedNativeRenderers.forEach((saved, renderer) => {
      if (!renderer.isConnected) return;
      if (renderer.style?.visibility === "hidden") {
        renderer.style.visibility = saved.visibility;
      }
      if (saved.positionChanged && renderer.style?.position === "relative") {
        renderer.style.position = saved.position;
      }
    });
    savedNativeRenderers.clear();
  };

  const releaseStageMount = () => {
    if (stageMountState !== "idle" || inPageStageHost) invalidateStageAttempt();
    restoreNativeRenderers();
    if (inPageStageHost) {
      inPageStageHost.remove();
      inPageStageHost = null;
    }
    activeNativeRenderer = null;
    stageMountState = "idle";
    resetStageMountRecovery();
  };

  const coverNativeRenderer = (renderer) => {
    if (!renderer) return;
    if (!savedNativeRenderers.has(renderer)) {
      const computedPosition =
        typeof getComputedStyle === "function"
          ? getComputedStyle(renderer).position
          : renderer.style?.position || "static";
      const positionChanged = computedPosition === "static";
      savedNativeRenderers.set(renderer, {
        visibility: renderer.style?.visibility ?? "",
        position: renderer.style?.position ?? "",
        positionChanged,
      });
      if (positionChanged && renderer.style) renderer.style.position = "relative";
    }
    if (renderer.style) renderer.style.visibility = "hidden";
  };

  const runtimeAvailable = () => {
    try {
      return typeof chrome?.runtime?.id === "string";
    } catch {
      return false;
    }
  };

  const notifySourceDisconnect = () => {
    if (!sourceWasAvailable) return;
    sourceWasAvailable = false;
    sourceMissingSince = null;
    lastSentSnapshotSignature = "";
    lastSentSnapshotStateSignature = "";
    lastSnapshotSentAtUnixMs = Number.NEGATIVE_INFINITY;
    try {
      if (!runtimeAvailable()) return;
      chrome.runtime.sendMessage({ type: "youtube-music-source-disconnect" }, () => {
        try {
          void chrome.runtime.lastError;
        } catch {
          // The invalidated extension context already dropped this source.
        }
      });
    } catch {
      // The background lease remains the final cleanup boundary.
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    notifySourceDisconnect();
    queued = false;
    if (pendingSend !== null) clearTimeout(pendingSend);
    if (pendingMutationReconcile !== null) clearTimeout(pendingMutationReconcile);
    pendingSend = null;
    pendingMutationReconcile = null;
    reconcileRoots = false;
    reconcilePlayer = false;
    reconcileStage = false;
    if (heartbeat !== null) clearInterval(heartbeat);
    rootObserver?.disconnect();
    playerObserver?.disconnect();
    stageObserver?.disconnect();
    appleShellGuideObserver?.disconnect?.();
    appleShellGuideObserver = null;
    observedAppleShellNavigation = null;
    observedAppleShellDrawer = null;
    document.documentElement.removeAttribute(APPLE_SHELL_GUIDE_ATTR);
    document.documentElement.removeEventListener(CONTENT_SCRIPT_STOP_EVENT, stop);
    if (document.documentElement.getAttribute(CONTENT_SCRIPT_MARKER_ATTR) === CONTENT_SCRIPT_MARKER) {
      document.documentElement.removeAttribute(CONTENT_SCRIPT_MARKER_ATTR);
    }
    document.removeEventListener?.("click", rememberClickedVideo, true);
    document.removeEventListener?.("pointerdown", handleAppleShellDismissPointer, true);
    document.removeEventListener?.("click", handleAppleShellDismissPointer, true);
    document.removeEventListener?.("keydown", handleAppleShellDismissKey, true);
    window.removeEventListener?.("keydown", handleAppleShellDismissKey, true);
    sponsorBlockControlHost?.remove();
    sponsorBlockTitleCompat?.remove();
    sponsorBlockControlHost = null;
    sponsorBlockTitleCompat = null;
    if (observedMedia instanceof HTMLMediaElement) {
      mediaEvents.forEach((event) => observedMedia.removeEventListener(event, queueSend));
    }
    window.removeEventListener("yt-navigate-finish", handleNavigation);
    try {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    } catch {
      // Extension context invalidated
    }
    releaseStageMount();
    const stoppedSidePanel = document.querySelector("ytmusic-player-page#player-page #side-panel");
    removeOwnedLyricsSurface(stoppedSidePanel, null);
    restoreAppleShellMediaToggle();
    appleShellPlayerActions?.remove?.();
    appleShellPlayerActions = null;
    appleShellPlayerBar?.remove?.();
    appleShellPlayerBar = null;
    lastAppleShellTrackTuple = null;
    appleShellPopoverKind = "";
    document.documentElement.removeAttribute(APPLE_SHELL_POPOVER_ATTR);
    document.documentElement.removeAttribute(APPLE_SHELL_PLAYER_OPEN_ATTR);
    document.documentElement.removeAttribute("data-lyricstage-media-mode");
    document.documentElement.style?.removeProperty?.("--lyricstage-video-aspect");
    for (const tab of Array.from(document.querySelectorAll?.('[data-lyricstage-native-lyrics-hidden]') ?? [])) {
      tab.removeAttribute?.("data-lyricstage-native-lyrics-hidden");
    }
    for (const tab of Array.from(document.querySelectorAll?.('[data-lyricstage-hidden-tab="comments"]') ?? [])) {
      tab.removeAttribute?.("data-lyricstage-hidden-tab");
    }
    lastInteractedTab = null;
    stageMountState = "idle";
    stageMountFailure = "";
    observedMedia = null;
    observedPlayerRoot = null;
    observedStageRoot = null;
    playbackClockAnchor = null;
    acceptedTrackTuple = null;
    pendingTrackTuple = null;
    pendingPlayerVideoID = "";
    metadataEnrichmentUntilUnixMs = Number.NEGATIVE_INFINITY;
    trackTransitionEpoch = 0;
    retiredTrackIDs.clear();
    lastSentSnapshotSignature = "";
    lastSentSnapshotStateSignature = "";
    lastSnapshotSentAtUnixMs = Number.NEGATIVE_INFINITY;
  };

  const updateStageMount = () => {
    if (stopped || !runtimeAvailable()) return false;
    ensureAppleShellGuide();
    updateSponsorBlockCompatibility();
    const sidePanel = document.querySelector("ytmusic-player-page#player-page #side-panel");
    const tabList =
      sidePanel?.querySelector?.('tp-yt-paper-tabs [role="tablist"], tp-yt-paper-tabs #tabsContent, tp-yt-paper-tabs') ||
      document.querySelector("tp-yt-paper-tabs");
    ensureOwnedLyricsSurface(sidePanel, tabList);
    const activeRenderer = getActiveRenderer(sidePanel);
    observeTabInteractions(tabList);
    const selectedTab = getSelectedTab(tabList);

    const lyricsActive =
      activeRenderer &&
      activeRenderer.isConnected &&
      isLyricsRenderer(activeRenderer) &&
      !activeRenderer.hidden &&
      activeRenderer.style?.display !== "none";

    if (!lyricsActive) {
      releaseStageMount();
      return false;
    }

    // Learn and mark confirmed Lyrics tab
    if (selectedTab) {
      selectedTab.setAttribute(CONFIRMED_TAB_ATTR, "true");
      const allTabs = Array.from(tabList?.querySelectorAll?.(`[${CONFIRMED_TAB_ATTR}]`) ?? []);
      for (const tab of allTabs) {
        if (tab !== selectedTab) tab.removeAttribute(CONFIRMED_TAB_ATTR);
      }
    }

    // Clean up on renderer replacement
    if (activeNativeRenderer && activeNativeRenderer !== activeRenderer) {
      releaseStageMount();
    }
    activeNativeRenderer = activeRenderer;

    // Clean up any stale host in sidePanel
    if (sidePanel) {
      const staleHosts = Array.from(
        sidePanel.querySelectorAll?.(`#${STAGE_HOST_ID}, #${LEGACY_STAGE_HOST_ID}`) ?? [],
      );
      for (const stale of staleHosts) {
        if (stale !== inPageStageHost) {
          stale.remove();
        }
      }
    }

    if (!inPageStageHost?.isConnected || inPageStageHost.parentElement !== activeRenderer) {
      if (
        stageMountState === "failed" &&
        (
          stageMountFailureCount >= STAGE_MOUNT_MAX_FAILURES ||
          Date.now() < stageMountRetryAt
        )
      ) return false;
      if (inPageStageHost?.isConnected) {
        inPageStageHost.remove();
        inPageStageHost = null;
      }
      invalidateStageAttempt();
      stageMountState = "checking";
      const attemptGeneration = stageMountGeneration;

      const host = document.createElement("div");
      host.id = STAGE_HOST_ID;
      host.className = "style-scope ytmusic-tab-renderer";
      host.setAttribute("data-lyricstage-shell-theme", "light");
      host.style.display = "none";
      host.style.flexDirection = "column";
      host.style.width = "100%";
      host.style.height = "100%";
      host.style.minHeight = "0";
      host.style.flex = "1 1 auto";
      host.style.overflow = "hidden";
      host.style.background = "transparent";
      host.style.position = "absolute";
      host.style.inset = "0";
      host.style.zIndex = "1";
      host.style.visibility = "visible";

      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
        :host {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          min-height: 0;
          background: transparent;
          color: inherit;
        }
        *, *::before, *::after { box-sizing: border-box; }
        .column-mount {
          display: flex;
          flex: 1 1 auto;
          flex-direction: column;
          width: 100%;
          height: 100%;
          min-height: 0;
          background: transparent;
        }
      `;
      const mountNode = document.createElement("div");
      mountNode.className = "column-mount";
      shadow.append(style, mountNode);
      const eventSuffix = String(attemptGeneration);
      const readyEvent = `lyricstage-column-ready-${eventSuffix}`;
      const errorEvent = `lyricstage-column-error-${eventSuffix}`;
      const disposeEvent = `lyricstage-column-dispose-${eventSuffix}`;
      host.setAttribute("data-lyricstage-ready-event", readyEvent);
      host.setAttribute("data-lyricstage-error-event", errorEvent);
      host.setAttribute("data-lyricstage-dispose-event", disposeEvent);

      const attemptIsCurrent = () =>
        !stopped &&
        runtimeAvailable() &&
        attemptGeneration === stageMountGeneration &&
        activeNativeRenderer === activeRenderer &&
        activeRenderer.isConnected &&
        isLyricsRenderer(activeRenderer) &&
        inPageStageHost === host;

      const failAttempt = (reason) => {
        if (!attemptIsCurrent()) return;
        restoreNativeRenderers();
        stageMountState = "failed";
        stageMountFailure = reason;
        stageMountFailureCount += 1;
        document.documentElement.setAttribute(STAGE_FAILURE_ATTR, reason);
        document.documentElement.setAttribute(STAGE_FAILURE_COUNT_ATTR, String(stageMountFailureCount));
        const retryDelay = STAGE_MOUNT_RETRY_DELAYS_MS[stageMountFailureCount - 1];
        stageMountRetryAt = stageMountFailureCount < STAGE_MOUNT_MAX_FAILURES
          ? Date.now() + (retryDelay ?? STAGE_MOUNT_RETRY_DELAYS_MS.at(-1) ?? 750)
          : Number.POSITIVE_INFINITY;
        console.warn(`[LyricStage] Embedded Stage unavailable: ${reason}`);
        clearStageReadyProbe();
        if (inPageStageHost === host) inPageStageHost = null;
        host.remove();
      };

      const markReady = () => {
        if (!attemptIsCurrent()) return;
        if (stageReadyTimeout !== null) clearTimeout(stageReadyTimeout);
        stageReadyTimeout = null;
        coverNativeRenderer(activeRenderer);
        host.hidden = false;
        host.style.display = "flex";
        stageMountState = "ready";
        resetStageMountRecovery();
        document.documentElement.removeAttribute(STAGE_FAILURE_ATTR);
        document.documentElement.removeAttribute(STAGE_FAILURE_COUNT_ATTR);
      };

      const markError = () => {
        const reason = host.getAttribute("data-lyricstage-error-reason") || "render-error";
        failAttempt(`embedded-column-${reason}`);
      };

      host.addEventListener(readyEvent, markReady);
      host.addEventListener(errorEvent, markError);
      stageUIDispose = () => {
        host.removeEventListener(readyEvent, markReady);
        host.removeEventListener(errorEvent, markError);
        host.dispatchEvent(new Event(disposeEvent));
      };

      activeRenderer.append(host);
      inPageStageHost = host;

      if (
        document.documentElement.getAttribute("data-lyricstage-content-ui") !==
        "direct-shadow-v2"
      ) {
        failAttempt("embedded-column-runtime-missing");
      } else {
        stageMountState = "loading";
        stageReadyTimeout = window.setTimeout(() => {
          stageReadyTimeout = null;
          failAttempt("embedded-column-ready-timeout");
        }, 4000);
      }
    }

    if (stageMountState === "ready") {
      coverNativeRenderer(activeRenderer);
      inPageStageHost.hidden = false;
      inPageStageHost.style.display = "flex";
      return true;
    }
    return false;
  };

  const getConfirmedLyricsTab = (tabList) => {
    if (!tabList) return null;
    const direct = tabList.querySelector?.(`[${CONFIRMED_TAB_ATTR}="true"]`);
    if (direct) return direct;
    const owned = tabList.querySelector?.(`[${OWNED_LYRICS_TAB_ATTR}="true"]`);
    if (owned) return owned;
    const tabs = Array.from(
      tabList.querySelectorAll?.('[role="tab"], tp-yt-paper-tab') ?? tabList.children ?? [],
    );
    for (const tab of tabs) {
      if (tab.getAttribute?.(CONFIRMED_TAB_ATTR) === "true" || tab.hasAttribute?.(CONFIRMED_TAB_ATTR)) {
        return tab;
      }
    }
    return null;
  };

  const expectedTrackIDForCommand = (message) =>
    clean(message?.expectedTrackID) || clean(message?.trackID);

  const commandMatchesCurrentTrack = (message, playerBar, sendResponse) => {
    const expectedTrackID = expectedTrackIDForCommand(message);
    if (!expectedTrackID) {
      sendResponse({ ok: false, reason: "missing-track-identity" });
      return false;
    }
    const observation = readTrackObservation(playerBar);
    if (!observation || !acceptsTrackTuple(observation.tuple) || pendingTrackTuple) {
      queueSend();
      sendResponse({ ok: false, reason: "track-transition" });
      return false;
    }
    const actualTrackID = observation.tuple.trackID;
    if (actualTrackID === expectedTrackID) return true;
    queueSend();
    sendResponse({
      ok: false,
      reason: "track-changed",
      ...(actualTrackID ? { trackID: actualTrackID } : {}),
    });
    return false;
  };

  const onRuntimeMessage = (message, _sender, sendResponse) => {
    if (message?.type === "youtube-music-seek-to") {
      const requestedTimeMs = message.timeMs;
      const playerBar = document.querySelector("ytmusic-player-bar");
      const media = selectPlaybackMedia(playerBar);
      if (
        typeof requestedTimeMs !== "number" ||
        !Number.isFinite(requestedTimeMs) ||
        requestedTimeMs < 0 ||
        !(media instanceof HTMLMediaElement)
      ) {
        sendResponse({ ok: false, reason: "invalid-seek" });
        return;
      }
      if (!commandMatchesCurrentTrack(message, playerBar, sendResponse)) return;
      const target = mediaSeekTarget(media, playerBarClock(playerBar), requestedTimeMs);
      if (!target) {
        sendResponse({ ok: false, reason: "seek-timeline-unavailable" });
        return;
      }
      media.currentTime = target.mediaTimeSeconds;
      playbackClockAnchor = {
        media,
        mediaTimeMs: target.mediaTimeSeconds * 1000,
        barTimeMs: target.logicalTimeMs,
      };
      queueSend();
      sendResponse({ ok: true, timeMs: Math.round(target.logicalTimeMs) });
      return;
    }

    if (message?.type === "youtube-music-transport-command") {
      const action = message.action;
      const playerBar = document.querySelector("ytmusic-player-bar");
      const media = selectPlaybackMedia(playerBar);
      if (
        !(media instanceof HTMLMediaElement) ||
        !["play", "pause", "previous", "next"].includes(action)
      ) {
        sendResponse({ ok: false, reason: "invalid-transport" });
        return;
      }
      if (!commandMatchesCurrentTrack(message, playerBar, sendResponse)) return;
      const control = transportButton(
        playerBar ?? document,
        action === "play" || action === "pause" ? "playPause" : action,
      );
      if (!enabledControl(control) || typeof control.click !== "function") {
        sendResponse({ ok: false, reason: "transport-unavailable" });
        return;
      }
      if (
        (action === "play" && !media.paused) ||
        (action === "pause" && media.paused)
      ) {
        sendResponse({ ok: true, state: playbackState(media), unchanged: true });
        return;
      }
      control.click();
      queueSend();
      sendResponse({ ok: true, state: action });
      return;
    }

    if (message?.type === "youtube-music-like-command") {
      const playerBar = document.querySelector("ytmusic-player-bar");
      if (!commandMatchesCurrentTrack(message, playerBar, sendResponse)) return;
      const control = likeButtons(playerBar ?? document).like;
      if (!enabledControl(control) || typeof control.click !== "function") {
        sendResponse({ ok: false, reason: "like-unavailable" });
        return;
      }
      const requested = message.liked === true;
      const current = likeStatus(playerBar ?? document) === "liked";
      if (requested === current) {
        sendResponse({ ok: true, liked: current, unchanged: true });
        return;
      }
      control.click();
      queueSend();
      sendResponse({ ok: true, liked: requested });
      return;
    }

    if (message?.type === "youtube-music-volume-command") {
      const playerBar = document.querySelector("ytmusic-player-bar");
      const media = selectPlaybackMedia(playerBar);
      if (!(media instanceof HTMLMediaElement) || !commandMatchesCurrentTrack(message, playerBar, sendResponse)) return;
      if (typeof message.muted === "boolean") media.muted = message.muted;
      if (Number.isFinite(message.volume)) {
        media.volume = Math.max(0, Math.min(1, message.volume));
        if (media.volume > 0) media.muted = false;
      }
      queueSend();
      sendResponse({ ok: true, volume: media.volume, muted: media.muted });
      return;
    }

    if (message?.type === "youtube-music-playback-mode-command") {
      const playerBar = document.querySelector("ytmusic-player-bar");
      if (!commandMatchesCurrentTrack(message, playerBar, sendResponse)) return;
      const mode = message.mode;
      const control = playbackModeButton(playerBar ?? document, mode);
      if (!enabledControl(control) || typeof control.click !== "function") {
        sendResponse({ ok: false, reason: "playback-mode-unavailable" });
        return;
      }
      if (mode === "shuffle") {
        if (shuffleEnabled(playerBar ?? document) !== (message.enabled === true)) control.click();
      } else if (mode === "repeat" && ["off", "all", "one"].includes(message.repeat)) {
        for (let index = 0; index < 2 && repeatMode(playerBar ?? document) !== message.repeat; index += 1) control.click();
      } else {
        sendResponse({ ok: false, reason: "invalid-playback-mode" });
        return;
      }
      queueSend();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "youtube-music-queue-select") {
      const playerBar = document.querySelector("ytmusic-player-bar");
      if (!commandMatchesCurrentTrack(message, playerBar, sendResponse)) return;
      const requestedTrackID = clean(message.queueTrackID);
      const queueIndex = Number.isSafeInteger(message.queueIndex) ? message.queueIndex : -1;
      const item = queueItemElements()[queueIndex];
      const target = item?.querySelector?.('a[href*="watch?"][href*="v="]')
        ?? item?.querySelector?.("ytmusic-play-button-renderer, button")
        ?? item;
      const cachedItem = cachedQueue?.items?.[queueIndex];
      const cachedHref = cachedQueueHrefs[queueIndex];
      if (
        requestedTrackID
        && cachedItem?.trackID === requestedTrackID
        && cachedHref
        && (!target || typeof target.click !== "function")
      ) {
        location.href = new URL(cachedHref, location.origin).href;
        sendResponse({ ok: true, queueTrackID: requestedTrackID, queueIndex, navigated: true });
        return;
      }
      if (
        !requestedTrackID
        || queueItemSnapshot(item, queueIndex)?.trackID !== requestedTrackID
        || !target
        || typeof target.click !== "function"
      ) {
        sendResponse({ ok: false, reason: "queue-item-unavailable" });
        return;
      }
      target.click();
      queueSend();
      sendResponse({ ok: true, queueTrackID: requestedTrackID, queueIndex });
      return;
    }

    if (
      message?.type === "youtube-music-open-stage" ||
      message?.type === "youtube-music-activate-lyrics" ||
      message?.type === "youtube-music-show-stage"
    ) {
      resetStageMountRecovery();
      const sidePanel = document.querySelector("ytmusic-player-page#player-page #side-panel");
      const tabList =
        sidePanel?.querySelector?.('tp-yt-paper-tabs [role="tablist"], tp-yt-paper-tabs #tabsContent, tp-yt-paper-tabs') ||
        document.querySelector("tp-yt-paper-tabs");

      // Find learned/confirmed Lyrics tab
      const confirmedLyricsTab = getConfirmedLyricsTab(tabList);
      if (!confirmedLyricsTab) {
        // Do not guess tabs if not yet learned in this page session
        sendResponse({ ok: false, reason: "unlearned" });
        return;
      }

      const currentRenderer = getActiveRenderer(sidePanel);
      if (!isLyricsRenderer(currentRenderer)) {
        if (typeof confirmedLyricsTab.click === "function") {
          confirmedLyricsTab.click();
        } else {
          confirmedLyricsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }
      }

      const startTime = Date.now();
      const timeoutMs = 5200;
      const checkAndRespond = () => {
        if (stopped || !runtimeAvailable()) {
          sendResponse({ ok: false });
          return;
        }
        if (updateStageMount()) {
          sendResponse({ ok: true });
          return;
        }
        if (Date.now() - startTime >= timeoutMs) {
          sendResponse({ ok: false, reason: stageMountFailure || "stage-not-ready" });
          return;
        }
        setTimeout(checkAndRespond, 30);
      };

      checkAndRespond();
      return true; // Keep message channel open for async response
    }
  };

  const send = () => {
    queued = false;
    pendingSend = null;
    if (stopped || !runtimeAvailable()) {
      stop();
      return;
    }
    if (!isYouTubeMusicLocation()) {
      notifySourceDisconnect();
      stop();
      return;
    }
    syncAppleShellPlayerBar();
    const snapshot = buildSnapshot();
    if (!snapshot) {
      if (pendingTrackTuple) {
        sourceMissingSince = null;
        return;
      }
      if (!sourceWasAvailable) return;
      if (sourceMissingSince === null) sourceMissingSince = Date.now();
      if (Date.now() - sourceMissingSince < SOURCE_LEASE_MS) return;
      notifySourceDisconnect();
      return;
    }
    sourceWasAvailable = true;
    sourceMissingSince = null;
    const nowUnixMs = Date.now();
    const stateSignature = snapshotStateSignature(snapshot);
    const fieldSignature = snapshotFieldSignature(snapshot, stateSignature);
    const elapsedSinceLastSend = nowUnixMs - lastSnapshotSentAtUnixMs;
    if (
      fieldSignature === lastSentSnapshotSignature &&
      elapsedSinceLastSend < SNAPSHOT_KEEPALIVE_MS
    ) return;
    if (
      stateSignature === lastSentSnapshotStateSignature &&
      fieldSignature !== lastSentSnapshotSignature &&
      elapsedSinceLastSend < SNAPSHOT_PROGRESS_INTERVAL_MS
    ) {
      scheduleSend(SNAPSHOT_PROGRESS_INTERVAL_MS - elapsedSinceLastSend);
      return;
    }
    try {
      chrome.runtime.sendMessage(
        { type: "youtube-music-source-snapshot", snapshot },
        () => {
          try {
            void chrome.runtime.lastError;
          } catch {
            stop();
          }
        },
      );
      lastSentSnapshotSignature = fieldSignature;
      lastSentSnapshotStateSignature = stateSignature;
      lastSnapshotSentAtUnixMs = nowUnixMs;
    } catch {
      stop();
    }
  };

  const scheduleSend = (delayMs) => {
    if (stopped || queued) return;
    queued = true;
    pendingSend = setTimeout(send, Math.max(0, delayMs));
  };

  const queueSend = () => scheduleSend(40);

  const observeMedia = () => {
    const next = selectPlaybackMedia(document.querySelector("ytmusic-player-bar"));
    if (next === observedMedia) return;
    if (observedMedia instanceof HTMLMediaElement) {
      mediaEvents.forEach((event) => observedMedia.removeEventListener(event, queueSend));
    }
    observedMedia = next;
    playbackClockAnchor = null;
    if (observedMedia instanceof HTMLMediaElement) {
      mediaEvents.forEach((event) => observedMedia.addEventListener(event, queueSend, { passive: true }));
    }
    queueSend();
  };

  const observationRootSelector = [
    "ytmusic-player-bar",
    "ytmusic-player-page#player-page #side-panel",
    "#side-panel",
    "video",
    "audio",
  ].join(", ");

  const nodeTouchesObservationRoot = (node) => Boolean(
    node?.matches?.(observationRootSelector) || node?.querySelector?.(observationRootSelector)
  );

  const rootMutationsNeedReconcile = (records) => {
    if (observedPlayerRoot?.isConnected === false || observedStageRoot?.isConnected === false) {
      return true;
    }
    return records.some((record) =>
      [...(record.addedNodes ?? []), ...(record.removedNodes ?? [])]
        .some(nodeTouchesObservationRoot)
    );
  };

  const refreshObservationRoots = () => {
    const nextPlayerRoot = document.querySelector("ytmusic-player-bar");
    if (nextPlayerRoot !== observedPlayerRoot) {
      playerObserver?.disconnect();
      observedPlayerRoot = nextPlayerRoot;
      if (observedPlayerRoot) {
        playerObserver?.observe(observedPlayerRoot, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["href", "src", "disabled", "aria-disabled", "aria-pressed"],
        });
      }
    }

    const nextStageRoot = document.querySelector("ytmusic-player-page#player-page #side-panel");
    if (nextStageRoot !== observedStageRoot) {
      stageObserver?.disconnect();
      observedStageRoot = nextStageRoot;
      if (observedStageRoot) {
        stageObserver?.observe(observedStageRoot, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["selected", "aria-selected", "page-type", "href", "src"],
        });
      }
    }
  };

  const flushMutationReconcile = () => {
    pendingMutationReconcile = null;
    const shouldRefreshRoots = reconcileRoots;
    let shouldRefreshPlayer = reconcilePlayer;
    let shouldRefreshStage = reconcileStage;
    reconcileRoots = false;
    reconcilePlayer = false;
    reconcileStage = false;
    if (shouldRefreshRoots) {
      refreshObservationRoots();
      shouldRefreshPlayer = true;
      shouldRefreshStage = true;
    }
    if (shouldRefreshStage) {
      updateStageMount();
      queueSend();
    }
    if (shouldRefreshPlayer) {
      observeMedia();
      if (!shouldRefreshStage) updateSponsorBlockCompatibility();
      queueSend();
    }
  };

  const queueMutationReconcile = ({ roots = false, player = false, stage = false }) => {
    reconcileRoots ||= roots;
    reconcilePlayer ||= player;
    reconcileStage ||= stage;
    if (stopped || pendingMutationReconcile !== null) return;
    pendingMutationReconcile = setTimeout(flushMutationReconcile, MUTATION_RECONCILE_MS);
  };

  const handleNavigation = () => queueMutationReconcile({ roots: true });

  rootObserver = new MutationObserver((records) => {
    if (rootMutationsNeedReconcile(records)) queueMutationReconcile({ roots: true });
  });
  playerObserver = new MutationObserver(() => queueMutationReconcile({ player: true }));
  stageObserver = new MutationObserver(() => queueMutationReconcile({ stage: true }));
  rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  refreshObservationRoots();

  window.addEventListener("yt-navigate-finish", handleNavigation);
  document.documentElement.addEventListener(CONTENT_SCRIPT_STOP_EVENT, stop);
  document.addEventListener?.("click", rememberClickedVideo, true);
  document.addEventListener?.("pointerdown", handleAppleShellDismissPointer, true);
  document.addEventListener?.("click", handleAppleShellDismissPointer, true);
  document.addEventListener?.("keydown", handleAppleShellDismissKey, true);
  window.addEventListener?.("keydown", handleAppleShellDismissKey, true);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  updateStageMount();
  observeMedia();
  updateSponsorBlockCompatibility();
  heartbeat = setInterval(() => {
    refreshObservationRoots();
    updateStageMount();
    observeMedia();
    updateSponsorBlockCompatibility();
    syncAppleShellPlayerBar();
    send();
  }, SOURCE_HEARTBEAT_MS);
  window.addEventListener("pagehide", stop, { once: true });
})();
