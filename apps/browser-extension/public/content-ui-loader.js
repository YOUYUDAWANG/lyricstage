(() => {
  const errorAttribute = "data-lyricstage-content-ui-error";
  try {
    const moduleURL = chrome.runtime.getURL("assets/content-ui.js");
    // Chrome can retain an extension module record across full-document
    // navigations in the same tab. A document-scoped query forces the
    // side-effectful UI bootstrap to run for the new document instead of
    // reusing a module that belonged to the page being torn down.
    const documentModuleURL = `${moduleURL}?document=${encodeURIComponent(crypto.randomUUID())}`;
    void import(documentModuleURL).catch((error) => {
      document.documentElement.setAttribute(errorAttribute, "module-load-failed");
      console.error("[LyricStage] Embedded UI module failed to load.", error);
    });
  } catch {
    document.documentElement.setAttribute(errorAttribute, "extension-context-invalidated");
  }
})();
