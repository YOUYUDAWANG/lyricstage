import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../../stage/src/App";
import { ColumnErrorBoundary } from "../../stage/src/column/ColumnErrorBoundary";
import columnStyles from "../../stage/src/column/column.css?inline";
import stageStyles from "../../stage/src/styles.css?inline";

interface EmbeddedColumnCallbacks {
  onReady(): void;
  onError(reason: string): void;
}

type MountEmbeddedColumn = (
  shadowRoot: ShadowRoot,
  mountNode: HTMLElement,
  callbacks: EmbeddedColumnCallbacks,
) => { root: Root; dispose: () => void };

const mountedRoots = new Map<HTMLElement, Root>();
const contentUIStopEvent = "lyricstage-content-ui-stop-v2";
const contentUIMarker = "direct-shadow-v2";
const stageHostSelector = "#lyricstage-enhanced-lyrics-v2";

document.documentElement.dispatchEvent(new Event(contentUIStopEvent));

const mountEmbeddedColumn: MountEmbeddedColumn = (shadowRoot, mountNode, callbacks) => {
  if (!shadowRoot.querySelector("style[data-lyricstage-column-styles]")) {
    const style = document.createElement("style");
    style.setAttribute("data-lyricstage-column-styles", "true");
    style.textContent = `${stageStyles}\n${columnStyles}`;
    shadowRoot.prepend(style);
  }

  const root = createRoot(mountNode);
  root.render(
    <StrictMode>
      <ColumnErrorBoundary onError={(error) => callbacks.onError(error.message || "render-error")}>
        <App embedded onEmbeddedReady={callbacks.onReady} />
      </ColumnErrorBoundary>
    </StrictMode>,
  );

  return { root, dispose: () => root.unmount() };
};

const mountHost = (host: HTMLElement) => {
  if (mountedRoots.has(host)) return;
  const shadowRoot = host.shadowRoot;
  const mountNode = shadowRoot?.querySelector<HTMLElement>(".column-mount");
  const readyEvent = host.getAttribute("data-lyricstage-ready-event");
  const errorEvent = host.getAttribute("data-lyricstage-error-event");
  const disposeEvent = host.getAttribute("data-lyricstage-dispose-event");
  if (!shadowRoot || !mountNode || !readyEvent || !errorEvent || !disposeEvent) return;

  const mounted = mountEmbeddedColumn(shadowRoot, mountNode, {
    onReady: () => host.dispatchEvent(new Event(readyEvent)),
    onError: (reason) => {
      host.setAttribute("data-lyricstage-error-reason", reason);
      host.dispatchEvent(new Event(errorEvent));
    },
  });
  mountedRoots.set(host, mounted.root);
  host.addEventListener(
    disposeEvent,
    () => {
      if (mountedRoots.get(host) !== mounted.root) return;
      mountedRoots.delete(host);
      mounted.dispose();
    },
    { once: true },
  );
};

const reconcileHosts = () => {
  for (const host of document.querySelectorAll<HTMLElement>(stageHostSelector)) {
    mountHost(host);
  }
  for (const [host, root] of mountedRoots) {
    if (host.isConnected) continue;
    mountedRoots.delete(host);
    root.unmount();
  }
};

const collectStageHosts = (node: Node, hosts: Set<HTMLElement>) => {
  if (!(node instanceof Element)) return;
  if (node instanceof HTMLElement && node.matches(stageHostSelector)) hosts.add(node);
  for (const host of node.querySelectorAll<HTMLElement>(stageHostSelector)) hosts.add(host);
};

const reconcileHostMutations = (records: MutationRecord[]) => {
  const touchedHosts = new Set<HTMLElement>();
  for (const record of records) {
    for (const node of record.addedNodes) collectStageHosts(node, touchedHosts);
    for (const node of record.removedNodes) collectStageHosts(node, touchedHosts);
  }

  for (const [host, root] of mountedRoots) {
    if (host.isConnected) continue;
    mountedRoots.delete(host);
    root.unmount();
  }
  for (const host of touchedHosts) {
    if (host.isConnected) mountHost(host);
  }
};

const hostObserver = new MutationObserver(reconcileHostMutations);
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  hostObserver.disconnect();
  document.documentElement.removeEventListener(contentUIStopEvent, stop);
  for (const root of mountedRoots.values()) root.unmount();
  mountedRoots.clear();
  if (document.documentElement.getAttribute("data-lyricstage-content-ui") === contentUIMarker) {
    document.documentElement.removeAttribute("data-lyricstage-content-ui");
  }
};

document.documentElement.addEventListener(contentUIStopEvent, stop);
document.documentElement.setAttribute("data-lyricstage-content-ui", contentUIMarker);
hostObserver.observe(document.documentElement, { childList: true, subtree: true });
reconcileHosts();
