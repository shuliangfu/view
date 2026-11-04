/**
 * @module @dreamer/view/devtools
 * @description DEV-only inspection helpers: Owner tree + subscription counts.
 *
 * **Not** re-exported from the convenience main barrel or `/reactivity`, so
 * production / size / consumer-bundle measured entries stay unchanged.
 * No browser extension and no UI shell — call these APIs from tests, a REPL,
 * or your own DEV console helpers.
 *
 * Hot path (`createSignal` / `createRoot`) is **not** patched. Instrumentation
 * that needs a Signal→Source map uses a temporary probe observer; root tracking
 * is opt-in via {@link trackRoot} / {@link createRootTracked}.
 *
 * Prefer enabling `globalThis.VIEW_DEV = true` in development (dev server already
 * injects it for HMR) so registry snapshots include anonymous Signals.
 *
 * @example
 * ```ts
 * import { createEffect, createSignal, getOwner } from "@dreamer/view/reactivity";
 * import {
 *   createRootTracked,
 *   getSignalObserverCount,
 *   getTrackedRoots,
 *   summarizeOwnerTree,
 * } from "@dreamer/view/devtools";
 *
 * createRootTracked((dispose) => {
 *   const count = createSignal(0);
 *   createEffect(() => count());
 *   console.log(getSignalObserverCount(count)); // 1
 *   console.log(summarizeOwnerTree(getOwner()));
 *   console.log(getTrackedRoots().length); // 1
 *   dispose();
 * });
 * ```
 */

import { core } from "./reactivity/master.ts";
import {
  createRoot,
  getOwner,
  type Owner,
} from "./reactivity/owner.ts";
import {
  cleanupObserver,
  setCurrentObserver,
  STATE_CLEAN,
  type Observer,
  type Signal,
  type Source,
  type Subscription,
} from "./reactivity/signal.ts";

/** `true` when `globalThis.VIEW_DEV` is set (dev server / tests). */
export function isViewDev(): boolean {
  return (globalThis as { VIEW_DEV?: boolean }).VIEW_DEV === true;
}

/**
 * Throw if a helper is used outside DEV when the caller opts into the guard.
 * @param label short context for the error message
 */
export function requireViewDev(label = "devtools"): void {
  if (!isViewDev()) {
    throw new Error(
      `@dreamer/view/devtools: ${label} requires globalThis.VIEW_DEV === true`,
    );
  }
}

function countChain(
  head: Subscription | null | undefined,
  nextKey: "nextSub" | "nextSource",
): number {
  let n = 0;
  let cur: Subscription | null = head ?? null;
  while (cur) {
    n++;
    cur = cur[nextKey];
  }
  return n;
}

/** Count downstream subscription edges on a Source (Signal core / Memo). */
export function countDownstream(
  source: Pick<Source<unknown>, "observers">,
): number {
  return countChain(source.observers, "nextSub");
}

/** Count upstream subscription edges on an Observer (Effect / Memo). */
export function countUpstream(
  observer: Pick<Observer, "sources">,
): number {
  return countChain(observer.sources, "nextSource");
}

export type OwnerKind = "root" | "effect" | "memo" | "owner";

export interface OwnerNodeSnapshot {
  kind: OwnerKind;
  children: number;
  disposables: number;
  /** Upstream edges when this node is an Observer (Effect / Memo). */
  upstream: number;
  /** Downstream edges when this node is also a Source (Memo). */
  downstream: number;
  depth: number;
  childNodes: OwnerNodeSnapshot[];
}

function classify(owner: Owner): OwnerKind {
  const o = owner as Owner & {
    run?: unknown;
    value?: unknown;
    observers?: unknown;
  };
  if (typeof o.run === "function" && "observers" in o && "value" in o) {
    return "memo";
  }
  if (typeof o.run === "function") return "effect";
  if (owner.owner == null) return "root";
  return "owner";
}

/**
 * Snapshot one Owner subtree (structure + per-node subscription edge counts).
 * Works without `VIEW_DEV` when you already hold an `Owner` reference.
 */
export function inspectOwner(
  owner: Owner | null,
  options?: { maxDepth?: number },
): OwnerNodeSnapshot | null {
  if (!owner) return null;
  const maxDepth = options?.maxDepth ?? 32;

  const walk = (node: Owner, depth: number): OwnerNodeSnapshot => {
    const asHybrid = node as Owner & Partial<Observer> & Partial<Source<unknown>>;
    const childList = node.children ?? [];
    const childNodes = depth >= maxDepth
      ? []
      : childList.map((c) => walk(c, depth + 1));
    return {
      kind: classify(node),
      children: childList.length,
      disposables: node.disposables?.length ?? 0,
      upstream: asHybrid.sources ? countUpstream(asHybrid as Observer) : 0,
      downstream: asHybrid.observers
        ? countDownstream(asHybrid as Source<unknown>)
        : 0,
      depth,
      childNodes,
    };
  };

  return walk(owner, 0);
}

export interface OwnerTreeSummary {
  nodes: number;
  effects: number;
  memos: number;
  plainOwners: number;
  upstreamEdges: number;
  downstreamEdges: number;
  maxDepth: number;
  disposables: number;
}

/**
 * Flatten counts for leak / over-subscription triage on one Owner tree.
 * Works without `VIEW_DEV` when you already hold an `Owner` reference.
 */
export function summarizeOwnerTree(
  owner: Owner | null,
): OwnerTreeSummary | null {
  if (!owner) return null;
  const summary: OwnerTreeSummary = {
    nodes: 0,
    effects: 0,
    memos: 0,
    plainOwners: 0,
    upstreamEdges: 0,
    downstreamEdges: 0,
    maxDepth: 0,
    disposables: 0,
  };

  const walk = (node: Owner, depth: number) => {
    summary.nodes++;
    summary.maxDepth = Math.max(summary.maxDepth, depth);
    summary.disposables += node.disposables?.length ?? 0;
    const kind = classify(node);
    if (kind === "effect") summary.effects++;
    else if (kind === "memo") summary.memos++;
    else summary.plainOwners++;

    const asHybrid = node as Owner & Partial<Observer> & Partial<Source<unknown>>;
    if (asHybrid.sources) {
      summary.upstreamEdges += countUpstream(asHybrid as Observer);
    }
    if (asHybrid.observers) {
      summary.downstreamEdges += countDownstream(asHybrid as Source<unknown>);
    }
    const kids = node.children;
    if (kids) {
      for (let i = 0; i < kids.length; i++) walk(kids[i]!, depth + 1);
    }
  };

  walk(owner, 0);
  return summary;
}

const trackedRoots = new Set<Owner>();

/** Opt-in: remember an Owner root for {@link getTrackedRoots}. */
export function trackRoot(owner: Owner | null | undefined): void {
  if (owner) trackedRoots.add(owner);
}

/** Remove a root previously passed to {@link trackRoot}. */
export function untrackRoot(owner: Owner | null | undefined): void {
  if (owner) trackedRoots.delete(owner);
}

/** Roots registered via {@link trackRoot} / {@link createRootTracked}. */
export function getTrackedRoots(): Owner[] {
  return Array.from(trackedRoots);
}

/** Clear the opt-in root registry (tests). */
export function clearTrackedRoots(): void {
  trackedRoots.clear();
}

/**
 * `createRoot` wrapper that auto {@link trackRoot} / {@link untrackRoot} on dispose.
 * Does not change the underlying `createRoot` implementation.
 */
export function createRootTracked<T>(
  fn: (dispose: () => void) => T,
): T {
  return createRoot((dispose) => {
    const owner = getOwner();
    trackRoot(owner);
    return fn(() => {
      untrackRoot(owner);
      dispose();
    });
  });
}

/**
 * Downstream observer count for a Signal.
 *
 * Uses a temporary probe Observer (subscribe → count → cleanup) — **no**
 * `createSignal` instrumentation and **no** production size impact on other
 * entries. Prefer calling only under DEV.
 */
export function getSignalObserverCount(
  signal: Signal<unknown> | (() => unknown),
): number {
  const probe: Observer = {
    state: STATE_CLEAN,
    sources: null,
    sourcesTail: null,
    run() {},
  };
  const prev = setCurrentObserver(probe);
  try {
    (signal as () => unknown)();
  } finally {
    setCurrentObserver(prev);
  }
  const sub = probe.sources;
  if (!sub) {
    cleanupObserver(probe);
    return 0;
  }
  const source = sub.source as Source<unknown>;
  const total = countDownstream(source);
  cleanupObserver(probe);
  // `total` included the probe; after cleanup it is gone — report others only.
  return Math.max(0, total - 1);
}

export interface RegistrySourceSnapshot {
  id: string;
  observers: number;
}

/**
 * Named + (when `VIEW_DEV`) anonymous Sources currently in `core.registry`.
 * Empty list when the registry has no Source-shaped entries.
 */
export function snapshotRegistrySources(): RegistrySourceSnapshot[] {
  const out: RegistrySourceSnapshot[] = [];
  for (const [id, val] of core.registry) {
    if (
      val &&
      typeof val === "object" &&
      ("observers" in (val as object) || "observersTail" in (val as object))
    ) {
      out.push({
        id: String(id),
        observers: countDownstream(val as Source<unknown>),
      });
    }
  }
  return out;
}
