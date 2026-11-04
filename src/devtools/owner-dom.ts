/**
 * @module @dreamer/view/devtools/owner-dom
 * @description DEV-only Owner → DOM map for the overlay inspect highlight.
 *
 * JSX records host elements through `globalThis.__DREAMER_OWNER_DOM__`
 * (installed by {@link installOwnerDomTracking}). The reactive kernel is not
 * patched. No `node:*` / `src/i18n.ts` imports — safe for the browser bundle.
 *
 * Elements are captured against the Owner that was current when `jsx()` ran
 * (the component), not the Effect that later executes the host thunk.
 */

import type { Owner } from "../reactivity/owner.ts";

const HOOK_KEY = "__DREAMER_OWNER_DOM__";

const ownerElements = new WeakMap<Owner, Set<Element>>();

function viewDev(): boolean {
  return (globalThis as { VIEW_DEV?: boolean }).VIEW_DEV === true;
}

function asOwner(owner: unknown): Owner | null {
  if (!owner || typeof owner !== "object") return null;
  return owner as Owner;
}

function asElement(el: unknown): Element | null {
  if (!el || typeof el !== "object") return null;
  const node = el as Element;
  if (node.nodeType !== 1) return null;
  return node;
}

/** Skip detached nodes and the overlay / highlight layer itself. */
function isHighlightable(el: Element): boolean {
  try {
    if (!el.isConnected) return false;
    if (typeof el.closest === "function") {
      if (el.closest("[data-dreamer-view-devtools]")) return false;
      if (el.closest("[data-dreamer-view-inspect]")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Record `el` for `owner`. No-op unless `VIEW_DEV` is on.
 * Never throws — a bad node must not break render.
 */
export function recordOwnerElement(owner: unknown, el: unknown): void {
  try {
    if (!viewDev()) return;
    const o = asOwner(owner);
    const node = asElement(el);
    if (!o || !node) return;
    let set = ownerElements.get(o);
    if (!set) {
      set = new Set();
      ownerElements.set(o, set);
    }
    set.add(node);
  } catch {
    /* inspect bookkeeping must not break render */
  }
}

function liveDirect(owner: Owner): Element[] {
  const set = ownerElements.get(owner);
  if (!set) return [];
  const out: Element[] = [];
  for (const el of set) {
    if (isHighlightable(el)) out.push(el);
    else set.delete(el);
  }
  return out;
}

/** Drop elements that sit inside another highlighted element. */
function outermost(elements: Element[]): Element[] {
  const uniq: Element[] = [];
  for (const el of elements) {
    if (!uniq.includes(el)) uniq.push(el);
  }
  const roots = uniq.filter((el) =>
    !uniq.some((other) => other !== el && other.contains(el))
  );
  const following = typeof Node !== "undefined"
    ? Node.DOCUMENT_POSITION_FOLLOWING
    : 4;
  const preceding = typeof Node !== "undefined"
    ? Node.DOCUMENT_POSITION_PRECEDING
    : 2;
  roots.sort((a, b) => {
    if (a === b || typeof a.compareDocumentPosition !== "function") return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & following) return -1;
    if (pos & preceding) return 1;
    return 0;
  });
  return roots;
}

export interface CollectOwnerDomOptions {
  /**
   * Only elements recorded on this Owner.
   * Default walks descendants and returns outermost boxes.
   */
  directOnly?: boolean;
}

/**
 * Connected DOM elements to outline for `owner`.
 * Default: this Owner plus descendants, collapsed to outermost nodes.
 */
export function collectOwnerDomElements(
  owner: Owner | null | undefined,
  options?: CollectOwnerDomOptions,
): Element[] {
  if (!owner) return [];
  const all: Element[] = [];
  const walk = (node: Owner) => {
    all.push(...liveDirect(node));
    if (options?.directOnly) return;
    const kids = node.children;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) walk(kids[i]!);
  };
  walk(owner);
  if (options?.directOnly) return all;
  return outermost(all);
}

/**
 * Install the JSX hook. No-op unless `VIEW_DEV` is on.
 * Safe to call more than once.
 */
export function installOwnerDomTracking(): void {
  if (!viewDev()) return;
  (globalThis as Record<string, unknown>)[HOOK_KEY] = recordOwnerElement;
}

/** Remove the JSX hook if it still points at this module. */
export function uninstallOwnerDomTracking(): void {
  const g = globalThis as Record<string, unknown>;
  if (g[HOOK_KEY] === recordOwnerElement) delete g[HOOK_KEY];
}

/** `true` when the JSX hook is the tracker from this module. */
export function isOwnerDomTracking(): boolean {
  return (globalThis as Record<string, unknown>)[HOOK_KEY] ===
    recordOwnerElement;
}
