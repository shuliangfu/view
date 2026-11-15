/**
 * @module @dreamer/view/devtools/meta
 * @description Leak-safe DEV labels, value previews, and an update timeline.
 *
 * Owner / Source metadata lives in WeakMaps, so disposing a tree does not
 * keep Signals or Owners alive. The update timeline stores only primitives
 * (label, preview string, counts) in a capped ring buffer — never the Source
 * itself. Runtime hooks are installed only while DevTools is mounted and are
 * removed on unmount (`setDevNotifyHook(null)` plus deleting global hooks).
 */

import { getOwner, type Owner } from "../reactivity/owner.ts";
import { setDevNotifyHook, type Source } from "../reactivity/signal.ts";

const OWNER_HOOK_KEY = "__DREAMER_COMPONENT_OWNER__";
const SIGNAL_HOOK_KEY = "__DREAMER_SIGNAL_META__";

/** Max timeline rows retained. Older events are dropped. */
export const DEVTOOLS_TIMELINE_CAP = 100;

const ownerLabels = new WeakMap<Owner, string>();
const ownerSignalCounts = new WeakMap<Owner, number>();

export interface SourceDebugMeta {
  id: string;
  debugName?: string;
  ownerLabel?: string;
  index?: number;
  anonymous: boolean;
}

const sourceMeta = new WeakMap<object, SourceDebugMeta>();

export interface DevtoolsTimelineEvent {
  /** `performance.now()` when available, otherwise `Date.now()`. */
  t: number;
  label: string;
  id: string;
  observers: number;
  preview: string;
}

let timeline: DevtoolsTimelineEvent[] = [];
let timelineTotal = 0;
let hooksInstalled = false;

export function stampOwnerLabel(owner: Owner, label: string): void {
  const name = label.trim();
  if (!name) return;
  ownerLabels.set(owner, name);
}

/** Label stamped on this Owner only (component function name / displayName). */
export function getOwnOwnerLabel(owner: Owner | null): string | undefined {
  if (!owner) return undefined;
  return ownerLabels.get(owner);
}

/** Nearest stamped label walking toward the root (component that owns this node). */
export function getOwnerLabel(owner: Owner | null): string | undefined {
  let node = owner;
  while (node) {
    const name = ownerLabels.get(node);
    if (name) return name;
    node = node.owner;
  }
  return undefined;
}

export function recordSourceMeta(
  source: object,
  info: { id: string; debugName?: string; anonymous?: boolean },
): void {
  const owner = getOwner();
  const ownerLabel = getOwnerLabel(owner);
  let index: number | undefined;
  if (owner) {
    index = ownerSignalCounts.get(owner) ?? 0;
    ownerSignalCounts.set(owner, index + 1);
  }
  const debugName = info.debugName?.trim() || undefined;
  sourceMeta.set(source, {
    id: info.id,
    debugName,
    ownerLabel,
    index,
    anonymous: info.anonymous === true,
  });
}

export function getSourceMeta(source: object): SourceDebugMeta | undefined {
  return sourceMeta.get(source);
}

export function formatSourceLabel(
  meta: SourceDebugMeta | undefined,
  fallbackId?: string,
): string {
  if (!meta) {
    return shortenId(fallbackId ?? "");
  }
  if (meta.debugName && meta.ownerLabel) {
    return `${meta.ownerLabel}.${meta.debugName}`;
  }
  if (meta.debugName) return meta.debugName;
  if (!meta.anonymous && meta.id) {
    return stripSigPrefix(meta.id);
  }
  if (meta.ownerLabel && meta.index != null) {
    return `${meta.ownerLabel} #${meta.index}`;
  }
  if (meta.index != null) return `#${meta.index}`;
  return shortenId(meta.id || fallbackId || "");
}

function stripSigPrefix(id: string): string {
  return id.startsWith("sig:") ? id.slice(4) : id;
}

function shortenId(id: string): string {
  if (!id) return "(unnamed)";
  const stripped = stripSigPrefix(id);
  if (stripped.length <= 18) return stripped;
  return `${stripped.slice(0, 8)}…${stripped.slice(-4)}`;
}

/**
 * Cheap, side-effect-free preview. Never stores `value`. Avoids deep
 * JSON.stringify so a notify hook stays cheap and cannot pin large graphs.
 */
export function previewValue(value: unknown, limit = 96): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (typeof value === "string") {
    if (value.length <= limit) return JSON.stringify(value);
    return `${JSON.stringify(value.slice(0, Math.max(0, limit - 1)))}…`;
  }
  if (t === "number" || t === "boolean" || t === "bigint") return String(value);
  if (t === "symbol") return value.toString();
  if (t === "function") {
    const name = (value as { name?: string }).name;
    return name ? `ƒ ${name}` : "ƒ";
  }
  if (t === "object") {
    const obj = value as Record<string, unknown> & {
      nodeType?: number;
      nodeName?: string;
      id?: string;
    };
    if (typeof obj.nodeType === "number") {
      const tag = String(obj.nodeName || "node").toLowerCase();
      const id = typeof obj.id === "string" && obj.id ? `#${obj.id}` : "";
      return `<${tag}${id}>`;
    }
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value instanceof Date) {
      return Number.isNaN(+value) ? "Invalid Date" : value.toISOString();
    }
    const ctor = (value as { constructor?: { name?: string } }).constructor
      ?.name;
    let keys: string[] = [];
    try {
      keys = Object.keys(obj);
    } catch {
      return ctor && ctor !== "Object" ? ctor : "Object";
    }
    if (keys.length <= 3) {
      try {
        const s = JSON.stringify(value);
        if (typeof s === "string" && s.length <= limit) return s;
      } catch {
        /* circular or getter throw */
      }
    }
    const shown = keys.slice(0, 4).join(", ");
    const more = keys.length > 4 ? ", …" : "";
    const head = ctor && ctor !== "Object" ? ctor : "Object";
    const body = keys.length ? `{${shown}${more}}` : "{}";
    const out = `${head} ${body}`;
    return out.length <= limit ? out : `${out.slice(0, limit)}…`;
  }
  return t;
}

function countObservers(source: Source<unknown>): number {
  let n = 0;
  let sub = source.observers;
  while (sub) {
    n++;
    sub = sub.nextSub;
  }
  return n;
}

function nowStamp(): number {
  try {
    if (typeof performance !== "undefined" && performance.now) {
      return performance.now();
    }
  } catch {
    /* ignore */
  }
  return Date.now();
}

function pushTimeline(event: DevtoolsTimelineEvent): void {
  timelineTotal++;
  timeline.push(event);
  const extra = timeline.length - DEVTOOLS_TIMELINE_CAP;
  if (extra > 0) timeline.splice(0, extra);
}

export function snapshotTimeline(): {
  events: DevtoolsTimelineEvent[];
  total: number;
} {
  return { events: timeline.slice(), total: timelineTotal };
}

export function clearTimeline(): void {
  timeline = [];
  timelineTotal = 0;
}

function onNotify(source: Source<unknown>): void {
  try {
    const meta = sourceMeta.get(source);
    const id = meta?.id ?? "";
    pushTimeline({
      t: nowStamp(),
      label: formatSourceLabel(meta, id),
      id,
      observers: countObservers(source),
      preview: previewValue(source.value),
    });
  } catch {
    /* DevTools must never break writes */
  }
}

function ownerHook(owner: Owner, label: string): void {
  stampOwnerLabel(owner, label);
}

function signalHook(
  source: object,
  info: { id: string; debugName?: string; anonymous?: boolean },
): void {
  try {
    recordSourceMeta(source, info);
  } catch {
    /* DEV bookkeeping must not break signal creation */
  }
}

/**
 * Install global / notify hooks used by the overlay. Safe to call more than
 * once. No-op when `VIEW_DEV` is off. Does not retain Sources or Owners.
 */
export function installDevtoolsRuntimeHooks(): void {
  if ((globalThis as { VIEW_DEV?: boolean }).VIEW_DEV !== true) return;
  if (hooksInstalled) return;
  hooksInstalled = true;
  const g = globalThis as Record<string, unknown>;
  g[OWNER_HOOK_KEY] = ownerHook;
  g[SIGNAL_HOOK_KEY] = signalHook;
  setDevNotifyHook(onNotify);
}

/** Drop hooks and the timeline buffer so nothing keeps recording after unmount. */
export function uninstallDevtoolsRuntimeHooks(): void {
  if (!hooksInstalled) return;
  hooksInstalled = false;
  const g = globalThis as Record<string, unknown>;
  if (g[OWNER_HOOK_KEY] === ownerHook) delete g[OWNER_HOOK_KEY];
  if (g[SIGNAL_HOOK_KEY] === signalHook) delete g[SIGNAL_HOOK_KEY];
  setDevNotifyHook(null);
  clearTimeline();
}

export function isDevtoolsRuntimeHooksInstalled(): boolean {
  return hooksInstalled;
}
