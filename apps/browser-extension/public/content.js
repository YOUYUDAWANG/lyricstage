(() => {
  const protocolVersion = "youtube-music-companion-v0";
  const LYRICS_PAGE_TYPE = "MUSIC_PAGE_TYPE_TRACK_LYRICS";
  const CONFIRMED_TAB_ATTR = "data-lyricstage-confirmed-lyrics-tab";
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

  const queueItemSnapshot = (item) => {
    const link = item?.querySelector?.('a[href*="watch?"][href*="v="]');
    const trackID = videoIDFromHref(link?.getAttribute?.("href") || link?.href);
    const title = clean(
      item?.querySelector?.(".song-title, #song-title, yt-formatted-string.song-title")?.textContent
      || item?.querySelector?.(".title-column yt-formatted-string, yt-formatted-string.title")?.textContent
      || link?.getAttribute?.("title")
      || link?.textContent,
    );
    if (!trackID || !title) return null;
    const artist = clean(
      item?.querySelector?.(".byline, #byline, .secondary-flex-columns yt-formatted-string")?.textContent,
    );
    const artworkURL = clean(item?.querySelector?.("img")?.currentSrc || item?.querySelector?.("img")?.src);
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
    const items = elements.map((item) => queueItemSnapshot(item)).filter(Boolean);
    if (items.length) {
      cachedQueueHrefs = elements.map((item) => clean(
        item?.querySelector?.('a[href*="watch?"][href*="v="]')?.getAttribute?.("href"),
      ));
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
      },
      controls: {
        seek: true,
        playPause: enabledControl(transportButton(playerBar ?? document, "playPause")),
        previous: enabledControl(transportButton(playerBar ?? document, "previous")),
        next: enabledControl(transportButton(playerBar ?? document, "next")),
        like: enabledControl(nativeLikeButtons.like),
        queue: Boolean(nativeQueue?.items.length),
      },
      engagement: { likeStatus: likeStatus(playerBar ?? document) },
      ...(nativeQueue ? { queue: nativeQueue } : {}),
    };
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
    snapshot.controls.seek,
    snapshot.controls.playPause,
    snapshot.controls.previous,
    snapshot.controls.next,
    snapshot.controls.like,
    snapshot.controls.queue,
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

  const getActiveRenderer = (sidePanel) => {
    if (!sidePanel) return null;
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
    return renderer.getAttribute?.("page-type") === LYRICS_PAGE_TYPE;
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
    document.documentElement.removeEventListener(CONTENT_SCRIPT_STOP_EVENT, stop);
    if (document.documentElement.getAttribute(CONTENT_SCRIPT_MARKER_ATTR) === CONTENT_SCRIPT_MARKER) {
      document.documentElement.removeAttribute(CONTENT_SCRIPT_MARKER_ATTR);
    }
    document.removeEventListener?.("click", rememberClickedVideo, true);
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
    updateSponsorBlockCompatibility();
    const sidePanel = document.querySelector("ytmusic-player-page#player-page #side-panel");
    const tabList =
      sidePanel?.querySelector?.('tp-yt-paper-tabs [role="tablist"], tp-yt-paper-tabs #tabsContent, tp-yt-paper-tabs') ||
      document.querySelector("tp-yt-paper-tabs");
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

    if (message?.type === "youtube-music-queue-select") {
      const playerBar = document.querySelector("ytmusic-player-bar");
      if (!commandMatchesCurrentTrack(message, playerBar, sendResponse)) return;
      const requestedTrackID = clean(message.queueTrackID);
      const queueIndex = Number.isSafeInteger(message.queueIndex) ? message.queueIndex : -1;
      const item = queueItemElements()[queueIndex];
      const target = item?.querySelector?.('a[href*="watch?"][href*="v="]') ?? item;
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
        || queueItemSnapshot(item)?.trackID !== requestedTrackID
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
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  updateStageMount();
  observeMedia();
  updateSponsorBlockCompatibility();
  heartbeat = setInterval(() => {
    refreshObservationRoots();
    updateStageMount();
    observeMedia();
    updateSponsorBlockCompatibility();
    send();
  }, SOURCE_HEARTBEAT_MS);
  window.addEventListener("pagehide", stop, { once: true });
})();
