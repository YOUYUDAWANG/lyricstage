(() => {
  const errorAttribute = "data-lyricstage-content-ui-error";
  try {
    const moduleURL = chrome.runtime.getURL("assets/content-ui.js");
    void import(moduleURL).catch(() => {
      document.documentElement.setAttribute(errorAttribute, "module-load-failed");
    });
  } catch {
    document.documentElement.setAttribute(errorAttribute, "extension-context-invalidated");
  }
})();
