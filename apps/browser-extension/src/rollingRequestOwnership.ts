import type { RollingGenerationLedgerV1 } from "./backgroundStorage";

export type RollingOwnerKey = `tab:${number}` | "extension";

interface RollingOwnerState {
  fingerprint: string;
  generation: number;
  controller: AbortController;
  scene?: {
    requestKey: string;
    epoch: number;
    controller: AbortController;
  };
}

export interface RollingActivation {
  accepted: boolean;
  generation: number;
  signal: AbortSignal;
}

export interface RollingSceneActivation {
  accepted: boolean;
  epoch: number;
  signal: AbortSignal;
  superseded: boolean;
}

const ledgerKey = (owner: RollingOwnerKey, fingerprint: string, generation: number): string =>
  `${owner}\u0000${generation}\u0000${fingerprint}`;

export class RollingRequestOwnership {
  readonly #owners = new Map<RollingOwnerKey, RollingOwnerState>();
  readonly #ledgers = new Map<string, RollingGenerationLedgerV1>();
  readonly #ownerOrders = new Map<RollingOwnerKey, number>();
  readonly #sceneOrders = new Map<RollingOwnerKey, number>();

  begin(owner: RollingOwnerKey, kind: "bible" | "scene"): { ownerOrder: number; sceneOrder?: number } {
    const ownerOrder = (this.#ownerOrders.get(owner) ?? 0) + 1;
    this.#ownerOrders.set(owner, ownerOrder);
    if (kind === "bible") return { ownerOrder };
    const sceneOrder = (this.#sceneOrders.get(owner) ?? 0) + 1;
    this.#sceneOrders.set(owner, sceneOrder);
    return { ownerOrder, sceneOrder };
  }

  activate(owner: RollingOwnerKey, fingerprint: string, requestOrder: number): RollingActivation {
    const current = this.#owners.get(owner);
    if (requestOrder !== this.#ownerOrders.get(owner) && current?.fingerprint !== fingerprint) {
      const controller = new AbortController();
      controller.abort();
      return { accepted: false, generation: 0, signal: controller.signal };
    }
    if (current?.fingerprint === fingerprint && !current.controller.signal.aborted) {
      return { accepted: true, generation: current.generation, signal: current.controller.signal };
    }
    current?.controller.abort();
    current?.scene?.controller.abort();
    const next: RollingOwnerState = {
      fingerprint,
      generation: (current?.generation ?? 0) + 1,
      controller: new AbortController(),
    };
    this.#owners.set(owner, next);
    return { accepted: true, generation: next.generation, signal: next.controller.signal };
  }

  isCurrent(owner: RollingOwnerKey, fingerprint: string, generation: number): boolean {
    const current = this.#owners.get(owner);
    return current?.fingerprint === fingerprint
      && current.generation === generation
      && !current.controller.signal.aborted;
  }

  activateScene(
    owner: RollingOwnerKey,
    fingerprint: string,
    generation: number,
    requestKey: string,
    requestOrder: number,
  ): RollingSceneActivation {
    const current = this.#owners.get(owner);
    if (!current || !this.isCurrent(owner, fingerprint, generation)
      || (requestOrder !== this.#sceneOrders.get(owner) && current.scene?.requestKey !== requestKey)) {
      const controller = new AbortController();
      controller.abort();
      return { accepted: false, epoch: 0, signal: controller.signal, superseded: false };
    }
    if (current.scene?.requestKey === requestKey && !current.scene.controller.signal.aborted) {
      return { accepted: true, epoch: current.scene.epoch, signal: current.scene.controller.signal, superseded: false };
    }
    const superseded = Boolean(current.scene && !current.scene.controller.signal.aborted);
    current.scene?.controller.abort();
    current.scene = {
      requestKey,
      epoch: (current.scene?.epoch ?? 0) + 1,
      controller: new AbortController(),
    };
    return { accepted: true, epoch: current.scene.epoch, signal: current.scene.controller.signal, superseded };
  }

  isSceneCurrent(
    owner: RollingOwnerKey,
    fingerprint: string,
    generation: number,
    epoch: number,
  ): boolean {
    const current = this.#owners.get(owner);
    return this.isCurrent(owner, fingerprint, generation)
      && current?.scene?.epoch === epoch
      && !current.scene.controller.signal.aborted;
  }

  ledger(owner: RollingOwnerKey, fingerprint: string, generation: number): RollingGenerationLedgerV1 {
    const key = ledgerKey(owner, fingerprint, generation);
    const existing = this.#ledgers.get(key);
    if (existing) return existing;
    const created: RollingGenerationLedgerV1 = {
      fingerprint,
      generation,
      bibleLogicalRequests: 0,
      sceneLogicalRequests: 0,
      providerAttempts: 0,
      providerMs: 0,
      consecutiveFailures: 0,
      generatedCoverage: [],
    };
    this.#ledgers.set(key, created);
    while (this.#ledgers.size > 48) {
      const oldest = this.#ledgers.keys().next().value as string | undefined;
      if (!oldest || oldest === key) break;
      this.#ledgers.delete(oldest);
    }
    return created;
  }

  release(owner: RollingOwnerKey): void {
    const current = this.#owners.get(owner);
    current?.controller.abort();
    current?.scene?.controller.abort();
    this.#ownerOrders.set(owner, (this.#ownerOrders.get(owner) ?? 0) + 1);
    this.#sceneOrders.set(owner, (this.#sceneOrders.get(owner) ?? 0) + 1);
    this.#owners.delete(owner);
    for (const key of this.#ledgers.keys()) {
      if (key.startsWith(`${owner}\u0000`)) this.#ledgers.delete(key);
    }
  }

  invalidateAll(): void {
    for (const state of this.#owners.values()) {
      state.controller.abort();
      state.scene?.controller.abort();
    }
    for (const owner of this.#ownerOrders.keys()) {
      this.#ownerOrders.set(owner, (this.#ownerOrders.get(owner) ?? 0) + 1);
      this.#sceneOrders.set(owner, (this.#sceneOrders.get(owner) ?? 0) + 1);
    }
    this.#owners.clear();
    this.#ledgers.clear();
  }
}
