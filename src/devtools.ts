/**
 * @module @dreamer/view/devtools
 * @description DEV-only inspection helpers: Owner tree + subscription counts,
 * plus **explicit opt-in** oversubscribe / remount-churn warnings (§5.1).
 *
 * **Not** re-exported from the convenience main barrel or `/reactivity`, so
 * production / size / consumer-bundle measured entries stay unchanged.
 * No browser extension and no UI shell — call these APIs from tests, a REPL,
 * or your own DEV console helpers.
 *
 * Hot path (`createSignal` / `createRoot` / `insert`) is **not** patched.
 * Instrumentation that needs a Signal→Source map uses a temporary probe observer;
 * root tracking is opt-in via {@link trackRoot} / {@link createRootTracked};
 * misuse warnings via {@link detectOversubscribe} /
 * {@link enableOversubscribeWarnings} (require `VIEW_DEV` to emit).
 * DOM inspect ({@link installOwnerDomTracking}) is a separate `VIEW_DEV` hook
 * read by `jsx()` — absent unless devtools installs it, and it does not mutate
 * application nodes.
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

import {
  collectOwnerDomElements,
  installOwnerDomTracking,
  isOwnerDomTracking,
  recordOwnerElement,
  uninstallOwnerDomTracking,
} from "./devtools/owner-dom.ts";
import { core } from "./reactivity/master.ts";
import { createRoot, getOwner, type Owner } from "./reactivity/owner.ts";
import {
  cleanupObserver,
  type Observer,
  setCurrentObserver,
  type Signal,
  type Source,
  STATE_CLEAN,
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
    const asHybrid = node as
      & Owner
      & Partial<Observer>
      & Partial<Source<unknown>>;
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

export interface IndexedOwnerNode extends OwnerNodeSnapshot {
  /** Stable path id within the walk, e.g. `0` / `0/1/2`. */
  id: string;
  /** Child nodes with ids (same maxDepth rules as {@link inspectOwner}). */
  childNodes: IndexedOwnerNode[];
}

/**
 * Like {@link inspectOwner}, but every node carries a stable `id` path for
 * overlay selection / warning deep-links. Does not patch the reactive kernel.
 */
export function inspectOwnerIndexed(
  owner: Owner | null,
  options?: { maxDepth?: number; rootId?: string },
): IndexedOwnerNode | null {
  if (!owner) return null;
  const maxDepth = options?.maxDepth ?? 32;
  const rootId = options?.rootId ?? "0";

  const walk = (node: Owner, depth: number, id: string): IndexedOwnerNode => {
    const asHybrid = node as
      & Owner
      & Partial<Observer>
      & Partial<Source<unknown>>;
    const childList = node.children ?? [];
    const childNodes = depth >= maxDepth
      ? []
      : childList.map((c, i) => walk(c, depth + 1, `${id}/${i}`));
    return {
      id,
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

  return walk(owner, 0, rootId);
}

/**
 * Resolve an Owner by {@link IndexedOwnerNode.id} path under `root`.
 * Returns `null` when the path is stale / out of range.
 */
export function getOwnerByPath(
  root: Owner | null,
  path: string,
): Owner | null {
  if (!root || !path) return null;
  const parts = path.split("/").filter((p) => p.length > 0);
  // First segment is the forest root id (numeric); skip it when walking children.
  if (parts.length === 0) return null;
  let node: Owner = root;
  for (let i = 1; i < parts.length; i++) {
    const idx = Number(parts[i]);
    if (!Number.isInteger(idx) || idx < 0) return null;
    const kids = node.children;
    if (!kids || idx >= kids.length) return null;
    node = kids[idx]!;
  }
  return node;
}

/**
 * Flatten indexed tree into a list (pre-order) for search / selection.
 */
export function flattenIndexedOwner(
  node: IndexedOwnerNode | null,
): IndexedOwnerNode[] {
  if (!node) return [];
  const out: IndexedOwnerNode[] = [node];
  for (const c of node.childNodes) out.push(...flattenIndexedOwner(c));
  return out;
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

    const asHybrid = node as
      & Owner
      & Partial<Observer>
      & Partial<Source<unknown>>;
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
 * When `VIEW_DEV` is on, also {@link installOwnerDomTracking} **before** `fn`
 * so the first JSX render is included in inspect highlight.
 */
export function createRootTracked<T>(
  fn: (dispose: () => void) => T,
): T {
  if (isViewDev()) installOwnerDomTracking();
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

// ---------------------------------------------------------------------------
// P2-dev-warn-oversubscribe (§5.1): DEV / explicit opt-in misuse warnings
// ---------------------------------------------------------------------------

/** Misuse patterns from analysis §5.1 (wide top-level subscription / remount churn). */
export type OversubscribeWarnKind = "wide-subscription" | "remount-churn";

export interface OversubscribeWarning {
  kind: OversubscribeWarnKind;
  message: string;
  /** Upstream edges when kind is wide-subscription. */
  upstream?: number;
  /** Remount count in the window when kind is remount-churn. */
  remounts?: number;
  depth?: number;
  ownerKind?: OwnerKind;
  /** Logical remount key when kind is remount-churn. */
  key?: string;
  /**
   * Indexed Owner path (`inspectOwnerIndexed` id) when the warning was found
   * while walking a tree — used by the overlay to select the node.
   */
  path?: string;
}

export interface OversubscribeWarnOptions {
  /** Max upstream edges on one Effect before flagging. Default 8. */
  maxUpstream?: number;
  /** Remounts within {@link remountWindowMs} that trigger remount-churn. Default 3. */
  maxRemounts?: number;
  /** Sliding window for remount counting (ms). Default 2000. */
  remountWindowMs?: number;
  /**
   * When `true`, also `console.warn` / call {@link onWarn}.
   * Emitting requires `VIEW_DEV` (inspection without emit does not).
   * Default: `false` for one-shot detect*; `true` for {@link enableOversubscribeWarnings}.
   */
  emit?: boolean;
  /** Optional custom sink (still gated by emit + VIEW_DEV). */
  onWarn?: (warning: OversubscribeWarning) => void;
}

const DEFAULT_MAX_UPSTREAM = 8;
const DEFAULT_MAX_REMOUNTS = 3;
const DEFAULT_REMOUNT_WINDOW_MS = 2000;

/**
 * Subtree this small is a placeholder (route `loading` shell), not an
 * established UI. Examples dogfood measures **5** under the root insert
 * effect (`_loading` + that effect) before the page resolves (~266).
 */
const PLACEHOLDER_SUBTREE_MAX = 8;
/**
 * Other side must be at least this many times larger. Equal-size rebuilds
 * (focus-loss shell re-runs, including tiny ones) stay warnings.
 */
const PLACEHOLDER_GROWTH = 4;

/**
 * First paint of an async route: a handful of loading owners replaced by
 * the real page. Not remount churn — nothing interactive was torn down.
 */
function isPlaceholderExpansion(prevNodes: number, nextNodes: number): boolean {
  return prevNodes <= PLACEHOLDER_SUBTREE_MAX &&
    nextNodes > prevNodes &&
    nextNodes >= prevNodes * PLACEHOLDER_GROWTH;
}

const remountLog = new Map<string, number[]>();
const warnedWide = new WeakSet<object>();
const warnedRemountKeys = new Set<string>();
let watchTimer: ReturnType<typeof setInterval> | null = null;
let watchStop: (() => void) | null = null;

function resolveOpts(options?: OversubscribeWarnOptions) {
  return {
    maxUpstream: options?.maxUpstream ?? DEFAULT_MAX_UPSTREAM,
    maxRemounts: options?.maxRemounts ?? DEFAULT_MAX_REMOUNTS,
    remountWindowMs: options?.remountWindowMs ?? DEFAULT_REMOUNT_WINDOW_MS,
    emit: options?.emit === true,
    onWarn: options?.onWarn,
  };
}

function emitWarning(
  warning: OversubscribeWarning,
  opts: ReturnType<typeof resolveOpts>,
): void {
  if (!opts.emit) return;
  if (!isViewDev()) {
    throw new Error(
      "@dreamer/view/devtools: emitting oversubscribe warnings requires globalThis.VIEW_DEV === true",
    );
  }
  if (opts.onWarn) opts.onWarn(warning);
  else {
    console.warn(
      `[@dreamer/view/devtools] ${warning.kind}: ${warning.message}`,
    );
  }
}

/**
 * One-shot scan: Effects under `owner` with upstream edge count > threshold.
 * Holding an `Owner` is enough to inspect; emitting requires `VIEW_DEV` + `emit: true`.
 * Does **not** patch `createEffect` / `insert`.
 */
export function detectWideSubscriptions(
  owner: Owner | null,
  options?: OversubscribeWarnOptions & { rootId?: string },
): OversubscribeWarning[] {
  if (!owner) return [];
  const opts = resolveOpts(options);
  const out: OversubscribeWarning[] = [];
  const rootId = options?.rootId ?? "0";

  const walk = (node: Owner, depth: number, path: string) => {
    const kind = classify(node);
    if (kind === "effect") {
      const asObs = node as Owner & Partial<Observer>;
      const upstream = asObs.sources ? countUpstream(asObs as Observer) : 0;
      if (upstream > opts.maxUpstream) {
        const warning: OversubscribeWarning = {
          kind: "wide-subscription",
          message:
            `Effect at depth ${depth} has ${upstream} upstream subscriptions ` +
            `(threshold ${opts.maxUpstream}). Prefer narrower children / thunks ` +
            `so the component shell is not re-run (see §5.1 / P0-4 guide).`,
          upstream,
          depth,
          ownerKind: kind,
          path,
        };
        out.push(warning);
        if (opts.emit && !warnedWide.has(node as object)) {
          warnedWide.add(node as object);
          emitWarning(warning, opts);
        }
      }
    }
    const kids = node.children;
    if (kids) {
      for (let i = 0; i < kids.length; i++) {
        walk(kids[i]!, depth + 1, `${path}/${i}`);
      }
    }
  };

  walk(owner, 0, rootId);
  return out;
}

/**
 * Record a remount for a logical key (component id, route, test label).
 * Explicit opt-in — call from your remount path or tests. No hot-path hooks.
 */
export function noteRemount(key: string, now: number = Date.now()): void {
  const list = remountLog.get(key) ?? [];
  list.push(now);
  remountLog.set(key, list);
}

/** Clear remount timestamps (tests). */
export function clearRemountNotes(): void {
  remountLog.clear();
  warnedRemountKeys.clear();
}

/**
 * Check remount churn for one key against the sliding window.
 * Emitting requires `VIEW_DEV` + `emit: true`.
 */
export function detectRemountChurn(
  key: string,
  options?: OversubscribeWarnOptions,
  now: number = Date.now(),
): OversubscribeWarning | null {
  const opts = resolveOpts(options);
  const list = remountLog.get(key);
  if (!list || list.length === 0) return null;
  const cutoff = now - opts.remountWindowMs;
  const recent = list.filter((t) => t >= cutoff);
  remountLog.set(key, recent);
  if (recent.length < opts.maxRemounts) return null;
  const warning: OversubscribeWarning = {
    kind: "remount-churn",
    message:
      `Key "${key}" remounted ${recent.length} times within ${opts.remountWindowMs}ms ` +
      `(threshold ${opts.maxRemounts}). Suspected whole-tree unmount/remount — ` +
      `narrow subscriptions so the shell stays mounted (analysis §5.1).`,
    remounts: recent.length,
    key,
  };
  if (opts.emit && !warnedRemountKeys.has(key)) {
    warnedRemountKeys.add(key);
    emitWarning(warning, opts);
  }
  return warning;
}

export interface DetectOversubscribeOptions extends OversubscribeWarnOptions {
  /** Also check these remount keys. */
  remountKeys?: string[];
  /** Root id prefix for {@link IndexedOwnerNode} paths. Default `"0"`. */
  rootId?: string;
}

/**
 * Combined one-shot: wide Effects under `owner` + remount keys.
 */
export function detectOversubscribe(
  owner: Owner | null,
  options?: DetectOversubscribeOptions,
): OversubscribeWarning[] {
  const out = detectWideSubscriptions(owner, options);
  const keys = options?.remountKeys ?? [];
  for (const key of keys) {
    const hit = detectRemountChurn(key, options);
    if (hit) out.push(hit);
  }
  return out;
}

/** Per-node child-identity fingerprint for remount-churn polling. */
interface OwnerNodeSnap {
  childIds: object[];
  subtreeNodes: number;
}

/** WeakMap of Owner → previous child fingerprint (per node, not only root). */
const ownerNodeSnaps = new WeakMap<Owner, OwnerNodeSnap>();

function subtreeNodeCount(owner: Owner): number {
  let n = 1;
  const kids = owner.children;
  if (kids) {
    for (let i = 0; i < kids.length; i++) n += subtreeNodeCount(kids[i]!);
  }
  return n;
}

/**
 * Walk `owner` subtree; if any node with a prior non-empty child set has
 * **zero** surviving child identities, flag remount-churn.
 * A **single** full replacement of an established subtree is enough
 * (unlike {@link noteRemount} keys).
 * A one-time **placeholder expansion** (small loading shell → much larger
 * page, e.g. examples dogfood 5→266 at path `0/0`) is first paint, not churn.
 * Does not patch `insert` / `cleanNode` / Effect.run.
 */
export function detectOwnerRemountChurn(
  owner: Owner | null,
  options?: OversubscribeWarnOptions & { rootId?: string },
): OversubscribeWarning | null {
  if (!owner) return null;
  const opts = resolveOpts(options);
  let found: OversubscribeWarning | null = null;
  const rootId = options?.rootId ?? "0";

  const walk = (node: Owner, depth: number, path: string) => {
    const kids = (node.children ?? []) as object[];
    const next: OwnerNodeSnap = {
      childIds: kids,
      subtreeNodes: subtreeNodeCount(node),
    };
    const prev = ownerNodeSnaps.get(node);
    ownerNodeSnaps.set(node, next);

    if (
      !found &&
      prev &&
      prev.childIds.length > 0 &&
      next.childIds.length > 0 &&
      prev.subtreeNodes >= 2 &&
      !isPlaceholderExpansion(prev.subtreeNodes, next.subtreeNodes)
    ) {
      const prevSet = new Set(prev.childIds);
      let overlap = 0;
      for (const c of next.childIds) {
        if (prevSet.has(c)) overlap++;
      }
      if (overlap === 0) {
        const key = `owner:${classify(node)}@d${depth}`;
        noteRemount(key);
        found = {
          kind: "remount-churn",
          message:
            `Owner (${
              classify(node)
            }) at depth ${depth} replaced all children ` +
            `(prev subtree=${prev.subtreeNodes}, next=${next.subtreeNodes}). ` +
            `Suspected whole-tree unmount/remount from a too-wide Effect — ` +
            `narrow subscriptions (analysis §5.1 / P0-4).`,
          remounts: 1,
          depth,
          ownerKind: classify(node),
          key,
          path,
        };
        if (opts.emit && !warnedRemountKeys.has(key)) {
          warnedRemountKeys.add(key);
          emitWarning(found, opts);
        }
      }
    }

    const list = node.children;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        walk(list[i]!, depth + 1, `${path}/${i}`);
      }
    }
  };

  walk(owner, 0, rootId);
  return found;
}

export interface EnableOversubscribeWarningsOptions
  extends OversubscribeWarnOptions {
  /** Primary Owner to poll (e.g. `getOwner()` inside a tracked root). */
  owner?: Owner | null;
  /** Poll interval ms. Default 500. */
  intervalMs?: number;
  /** Also scan {@link getTrackedRoots}. Default true. */
  includeTrackedRoots?: boolean;
  /** Remount keys to check each tick. */
  remountKeys?: string[];
}

/**
 * Explicit opt-in live watcher. **Requires** `VIEW_DEV`.
 * Polls Owners / remount keys; never hooks `createSignal` / `createRoot` / `insert`.
 * Returns a stop function. Calling again replaces the previous watcher.
 */
export function enableOversubscribeWarnings(
  options?: EnableOversubscribeWarningsOptions,
): () => void {
  requireViewDev("enableOversubscribeWarnings");
  disableOversubscribeWarnings();

  const opts = resolveOpts({ ...options, emit: options?.emit !== false });
  const intervalMs = options?.intervalMs ?? 500;
  const includeTracked = options?.includeTrackedRoots !== false;
  const remountKeys = options?.remountKeys ?? [];
  const primary = options?.owner ?? null;

  const tick = () => {
    const roots: Owner[] = [];
    if (primary) roots.push(primary);
    if (includeTracked) {
      for (const r of getTrackedRoots()) {
        if (r !== primary) roots.push(r);
      }
    }
    for (const root of roots) {
      detectWideSubscriptions(root, {
        ...opts,
        emit: true,
        onWarn: opts.onWarn,
      });
      detectOwnerRemountChurn(root, {
        ...opts,
        emit: true,
        onWarn: opts.onWarn,
      });
    }
    for (const key of remountKeys) {
      detectRemountChurn(key, { ...opts, emit: true, onWarn: opts.onWarn });
    }
  };

  tick();
  watchTimer = setInterval(tick, intervalMs);
  watchStop = () => {
    if (watchTimer != null) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    watchStop = null;
  };
  return watchStop;
}

/** Stop the watcher started by {@link enableOversubscribeWarnings}. */
export function disableOversubscribeWarnings(): void {
  if (watchStop) watchStop();
}

export {
  collectOwnerDomElements,
  installOwnerDomTracking,
  isOwnerDomTracking,
  recordOwnerElement,
  uninstallOwnerDomTracking,
};

/** Test helper: reset warn-once sets (does not clear remount timestamps). */
export function clearOversubscribeWarnState(): void {
  warnedRemountKeys.clear();
  // WeakSet cannot be cleared; tests should dispose Owners between cases.
  disableOversubscribeWarnings();
}
