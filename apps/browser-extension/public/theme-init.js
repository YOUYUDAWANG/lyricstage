(() => {
  const storageKey = "lyricstage-ytm-shell-v1";
  const attribute = "data-lyricstage-shell";
  const apply = (enabled) => {
    if (enabled === false) document.documentElement.removeAttribute(attribute);
    else document.documentElement.setAttribute(attribute, "apple");
  };

  // Apple Music styling is the default, but a stored opt-out always wins.
  apply(true);
  try {
    chrome.storage.local.get(storageKey).then((stored) => apply(stored?.[storageKey] !== false));
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !(storageKey in changes)) return;
      apply(changes[storageKey]?.newValue !== false);
    });
  } catch {
    // Fail open to the packaged default when the extension context is being replaced.
  }
})();
