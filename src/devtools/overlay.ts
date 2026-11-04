/**
 * @module @dreamer/view/devtools/overlay
 * @description DEV-only floating DevTools (Next.js Dev indicator / panel inspired).
 *
 * Multi-tab inspector: Overview · Tree · Signals · Warnings · Settings.
 * Opt-in via {@link mountDevtoolsOverlay}. Requires `VIEW_DEV`; otherwise
 * returns `null` and creates no DOM. Not on measured size / consumer entries.
 *
 * Reuses / extends `@dreamer/view/devtools` (indexed Owner tree, registry
 * sources, oversubscribe warnings with path deep-links, Owner→DOM inspect
 * highlight). Does **not** patch createSignal / createRoot / insert.
 *
 * When `@dreamer/server` DEV HMR publishes `globalThis.__DREAMER_HMR__`, the
 * overlay claims that UI (`claimUi`) so the standalone “HMR Connected” capsule
 * is hidden and status is shown under Overview → HMR.
 */

import type { Owner } from "../reactivity/owner.ts";
import {
  collectOwnerDomElements,
  detectOversubscribe,
  detectOwnerRemountChurn,
  disableOversubscribeWarnings,
  enableOversubscribeWarnings,
  flattenIndexedOwner,
  getOwnerByPath,
  getTrackedRoots,
  type IndexedOwnerNode,
  inspectOwnerIndexed,
  installOwnerDomTracking,
  isViewDev,
  type OversubscribeWarning,
  type OwnerTreeSummary,
  snapshotRegistrySources,
  summarizeOwnerTree,
} from "../devtools.ts";
import {
  getOverlayLocale,
  ot,
  syncOverlayLocaleFromPage,
} from "./overlay-l10n.ts";

/** Connection status mirrored from `@dreamer/server` HMR client bridge. */
export type DreamerHmrConnection =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

/** Snapshot shape of `globalThis.__DREAMER_HMR__` (server hmr-browser). */
export interface DreamerHmrSnapshot {
  connection: DreamerHmrConnection;
  updateCount: number;
  successCount: number;
  failureCount: number;
  lastUpdateTime: number | null;
  updating: boolean;
  lastProgressPath: string | null;
}

/** Public HMR bridge published by `@dreamer/server` DEV HMR client. */
export interface DreamerHmrBridge {
  readonly version: 1;
  getSnapshot(): DreamerHmrSnapshot;
  subscribe(listener: (snap: DreamerHmrSnapshot) => void): () => void;
  claimUi(claimerId?: string): () => void;
  isUiClaimed(): boolean;
}

const HMR_BRIDGE_KEY = "__DREAMER_HMR__";

/** Read the live HMR bridge if the DEV server client has published it. */
export function getDreamerHmrBridge(): DreamerHmrBridge | null {
  const raw = (globalThis as Record<string, unknown>)[HMR_BRIDGE_KEY];
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Partial<DreamerHmrBridge>;
  if (b.version !== 1) return null;
  if (typeof b.getSnapshot !== "function") return null;
  if (typeof b.subscribe !== "function") return null;
  if (typeof b.claimUi !== "function") return null;
  return b as DreamerHmrBridge;
}

function hmrLabel(c: DreamerHmrConnection): string {
  switch (c) {
    case "connected":
      return ot("hmrConnected");
    case "disconnected":
      return ot("hmrDisconnected");
    case "reconnecting":
      return ot("hmrReconnecting");
    case "error":
      return ot("hmrError");
  }
}

function hmrDotClass(c: DreamerHmrConnection): string {
  switch (c) {
    case "connected":
      return "hmr-dot ok";
    case "reconnecting":
      return "hmr-dot warn";
    case "error":
      return "hmr-dot err";
    default:
      return "hmr-dot off";
  }
}

export type DevtoolsOverlayCorner =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

export type DevtoolsOverlayTab =
  | "overview"
  | "tree"
  | "signals"
  | "warnings"
  | "settings";

export interface MountDevtoolsOverlayOptions {
  /** Initial corner. Default `bottom-left`. Overridden by stored position when present. */
  corner?: DevtoolsOverlayCorner;
  /** Primary Owner; otherwise aggregates {@link getTrackedRoots}. */
  owner?: Owner | null;
  /** Live refresh interval (ms). Default `1000`. `0` = manual only. */
  refreshMs?: number;
  /** Wire misuse watcher into Warnings. Default `true`. */
  watchMisuse?: boolean;
  /** Mount parent. Default `document.body`. */
  parent?: HTMLElement;
  /** z-index. Default `2147483000`. */
  zIndex?: number;
  /** localStorage key for position / prefs. Default `dreamer-view-devtools-overlay`. */
  storageKey?: string;
  /** Initial tab. Default `overview`. */
  tab?: DevtoolsOverlayTab;
}

export interface DevtoolsOverlayHandle {
  refresh(): void;
  open(): void;
  close(): void;
  toggle(): void;
  /** Switch active tab (also opens the panel). */
  setTab(tab: DevtoolsOverlayTab): void;
  /**
   * Select an Owner path in the Tree tab (`inspectOwnerIndexed` id).
   * Opens the panel, marks the row selected, and outlines that Owner's DOM.
   */
  selectNode(path: string | null): void;
  unmount(): void;
  readonly root: HTMLElement;
  readonly isOpen: boolean;
  readonly tab: DevtoolsOverlayTab;
}

const HOST_ATTR = "data-dreamer-view-devtools";
const DEFAULT_STORAGE = "dreamer-view-devtools-overlay";

let active: DevtoolsOverlayHandle | null = null;

interface StoredPrefs {
  corner?: DevtoolsOverlayCorner;
  open?: boolean;
  tab?: DevtoolsOverlayTab;
  refreshMs?: number;
  /** Free-drag offset from the snapped corner (px). */
  offsetX?: number;
  offsetY?: number;
}

const CSS = /* css */ `
:host {
  all: initial;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  color-scheme: dark;
}
*, *::before, *::after { box-sizing: border-box; }

.wrap {
  position: fixed;
  z-index: var(--dv-z, 2147483000);
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
  --pad: 16px;
}
.wrap.corner-bl { bottom: var(--pad); left: var(--pad); align-items: flex-start; }
.wrap.corner-br { bottom: var(--pad); right: var(--pad); align-items: flex-end; }
.wrap.corner-tl { top: var(--pad); left: var(--pad); align-items: flex-start; }
.wrap.corner-tr { top: var(--pad); right: var(--pad); align-items: flex-end; }
.wrap.corner-bl, .wrap.corner-br { flex-direction: column; }
.wrap.corner-tl, .wrap.corner-tr { flex-direction: column-reverse; }

.panel {
  pointer-events: auto;
  width: min(520px, calc(100vw - 32px));
  height: min(640px, calc(100vh - 88px));
  display: none;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: linear-gradient(165deg, rgba(24,24,28,0.94), rgba(10,10,14,0.96));
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.4),
    0 24px 64px rgba(0,0,0,0.55),
    0 2px 8px rgba(0,0,0,0.35);
  color: #ececf1;
  opacity: 0;
  transform: translateY(8px) scale(0.985);
  transition: opacity 140ms ease, transform 160ms cubic-bezier(0.2,0.8,0.2,1);
}
.wrap.corner-tl .panel, .wrap.corner-tr .panel {
  transform: translateY(-8px) scale(0.985);
}
.panel.open {
  display: flex;
  opacity: 1;
  transform: translateY(0) scale(1);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
  padding: 12px 12px 10px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  cursor: grab;
  user-select: none;
}
.head:active { cursor: grabbing; }
.head-mark, .logo {
  width: 30px; height: 30px; border-radius: 9px;
  display: grid; place-items: center;
  background: linear-gradient(145deg, #60a5fa, #2563eb);
  color: #fff; font-weight: 750; font-size: 13px;
  letter-spacing: -0.03em;
  box-shadow: 0 4px 14px rgba(37,99,235,0.4);
  flex-shrink: 0;
}
.logo::before { content: "V"; }
.head-text { flex: 1; min-width: 0; }
.head-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
}
.head-title { margin: 0; font-size: 13.5px; font-weight: 650; letter-spacing: -0.015em; }
.head-sub { margin: 2px 0 0; font-size: 11px; color: rgba(236,236,241,0.5); }
.icon-btn {
  appearance: none; border: 0; background: transparent;
  color: rgba(236,236,241,0.6); width: 30px; height: 30px;
  border-radius: 8px; display: grid; place-items: center; cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.icon-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.icon-btn:focus-visible { outline: 2px solid rgba(59,130,246,0.75); outline-offset: 1px; }

.tabs {
  display: flex; gap: 2px; padding: 8px 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  overflow-x: auto; scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  appearance: none; border: 0; background: transparent;
  color: rgba(236,236,241,0.5); font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.01em; padding: 7px 10px 9px; border-radius: 8px 8px 0 0;
  cursor: pointer; white-space: nowrap; position: relative;
  transition: color 120ms ease, background 120ms ease;
}
.tab:hover { color: rgba(236,236,241,0.85); background: rgba(255,255,255,0.04); }
.tab.active {
  color: #fff; background: rgba(255,255,255,0.06);
}
.tab.active::after {
  content: ""; position: absolute; left: 8px; right: 8px; bottom: 0;
  height: 2px; border-radius: 2px 2px 0 0;
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
}
.tab .count {
  display: inline-block; margin-left: 5px; min-width: 16px; padding: 0 5px;
  border-radius: 999px; font-size: 10px; font-weight: 700;
  background: rgba(255,255,255,0.08); color: rgba(236,236,241,0.7);
  font-variant-numeric: tabular-nums;
}
.tab .count.warn { background: rgba(245,158,11,0.22); color: #fbbf24; }

.body {
  flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column;
}
.pane {
  display: none; flex: 1; min-height: 0; overflow: auto;
  padding: 12px; flex-direction: column; gap: 10px;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent;
}
.pane.active { display: flex; }

.section {
  border-radius: 11px; border: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.03); padding: 10px;
}
.section-h {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; gap: 8px;
}
.section-title {
  margin: 0; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: rgba(236,236,241,0.48);
}
.badge {
  font-size: 10px; font-weight: 650; padding: 2px 7px; border-radius: 999px;
  background: rgba(255,255,255,0.08); color: rgba(236,236,241,0.7);
}
.badge.warn { background: rgba(245,158,11,0.18); color: #fbbf24; }
.badge.ok { background: rgba(34,197,94,0.16); color: #4ade80; }

.stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
}
.stat {
  text-align: center; padding: 10px 4px; border-radius: 9px;
  background: rgba(0,0,0,0.25);
}
.stat-n {
  display: block; font-size: 17px; font-weight: 720;
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em; color: #f4f4f5;
}
.stat-l {
  display: block; margin-top: 3px; font-size: 10px;
  color: rgba(236,236,241,0.48); letter-spacing: 0.02em;
}

.toolbar {
  display: flex; gap: 8px; align-items: center;
}
.search {
  flex: 1; appearance: none; border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.28); color: #ececf1; border-radius: 9px;
  padding: 7px 10px; font-size: 12px; outline: none;
}
.search:focus { border-color: rgba(96,165,250,0.55); box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
.search::placeholder { color: rgba(236,236,241,0.35); }

.tree-layout {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-height: 0; flex: 1;
}
@media (max-width: 420px) {
  .tree-layout { grid-template-columns: 1fr; }
}
.tree-pane, .detail-pane {
  border-radius: 11px; border: 1px solid rgba(255,255,255,0.07);
  background: rgba(0,0,0,0.22); min-height: 180px; overflow: auto;
  padding: 6px;
}
.detail-pane { padding: 10px; }
.tree-row {
  display: flex; align-items: center; gap: 4px; width: 100%;
  appearance: none; border: 0; background: transparent; color: inherit;
  text-align: left; font-size: 12px; padding: 4px 6px; border-radius: 7px;
  cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.tree-row:hover { background: rgba(255,255,255,0.06); }
.tree-row.selected {
  background: rgba(59,130,246,0.28); color: #dbeafe;
  box-shadow: inset 3px 0 0 #60a5fa;
}
.tree-twist {
  width: 16px; height: 16px; display: grid; place-items: center;
  color: rgba(236,236,241,0.45); font-size: 9px; flex-shrink: 0;
}
.tree-twist.empty { visibility: hidden; }
.kind {
  font-size: 9.5px; font-weight: 750; text-transform: uppercase;
  letter-spacing: 0.04em; padding: 1px 5px; border-radius: 4px;
  margin-right: 6px; flex-shrink: 0;
}
.kind.root { background: rgba(168,85,247,0.2); color: #d8b4fe; }
.kind.effect { background: rgba(59,130,246,0.2); color: #93c5fd; }
.kind.memo { background: rgba(34,197,94,0.18); color: #86efac; }
.kind.owner { background: rgba(255,255,255,0.08); color: rgba(236,236,241,0.65); }
.meta { margin-left: auto; font-size: 10px; color: rgba(236,236,241,0.4); font-variant-numeric: tabular-nums; }

.kv { display: grid; grid-template-columns: 96px 1fr; gap: 6px 8px; font-size: 12px; }
.kv dt { margin: 0; color: rgba(236,236,241,0.45); font-size: 11px; }
.kv dd { margin: 0; font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11.5px; word-break: break-all; }
.detail-empty { margin: 24px 8px; text-align: center; color: rgba(236,236,241,0.4); font-size: 12px; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  padding: 7px 9px; border-radius: 8px; background: rgba(0,0,0,0.2); font-size: 12px;
  border: 1px solid transparent; cursor: default;
}
.row.buttonish { cursor: pointer; appearance: none; border: 1px solid transparent; width: 100%; color: inherit; text-align: left; font: inherit; background: rgba(0,0,0,0.2); }
.row.buttonish:hover { border-color: rgba(96,165,250,0.35); background: rgba(59,130,246,0.1); }
.row-k {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px;
  color: rgba(236,236,241,0.88);
}
.row-v { flex-shrink: 0; font-variant-numeric: tabular-nums; color: rgba(236,236,241,0.5); font-size: 11px; }

.warn-item {
  display: block; width: 100%; text-align: left; appearance: none; cursor: pointer;
  padding: 9px 10px; border-radius: 9px;
  border: 1px solid rgba(245,158,11,0.28); background: rgba(245,158,11,0.08);
  font-size: 11.5px; line-height: 1.45; color: rgba(253,230,138,0.95);
  transition: border-color 120ms ease, background 120ms ease;
}
.warn-item:hover { border-color: rgba(251,191,36,0.55); background: rgba(245,158,11,0.14); }
.warn-kind {
  display: inline-block; font-size: 10px; font-weight: 750; text-transform: uppercase;
  letter-spacing: 0.04em; color: #fbbf24; margin-bottom: 3px;
}
.warn-path {
  display: block; margin-top: 5px; font-size: 10.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: rgba(147,197,253,0.9);
}
.empty { margin: 0; padding: 14px 8px; text-align: center; font-size: 12px; color: rgba(236,236,241,0.4); }
.empty-hint {
  margin: -6px 12px 14px; padding: 0 4px; text-align: center;
  font-size: 11px; line-height: 1.45; color: rgba(236,236,241,0.32);
}
.empty-block { padding: 8px 0 4px; }

.ghost {
  appearance: none; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04); color: rgba(236,236,241,0.85);
  font-size: 11.5px; font-weight: 550; padding: 5px 10px; border-radius: 8px; cursor: pointer;
}
.ghost:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.2); }
.kbd {
  font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  padding: 2px 5px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.25); color: rgba(236,236,241,0.55);
}

.settings-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 4px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12.5px;
}
.settings-row:last-child { border-bottom: 0; }
.settings-row label { color: rgba(236,236,241,0.75); }
.settings-row select, .settings-row input[type="number"] {
  appearance: none; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.28); color: #ececf1; border-radius: 8px;
  padding: 5px 8px; font-size: 12px; min-width: 120px;
}
.hint { font-size: 11px; color: rgba(236,236,241,0.42); line-height: 1.45; margin: 4px 0 0; }

.hmr-card {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px 11px; border-radius: 11px;
  background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.07);
}
.hmr-badge-pair {
  display: inline-flex; align-items: center; gap: 6px;
}
.hmr-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: #71717a; box-shadow: 0 0 0 3px rgba(113,113,122,0.2);
}
.hmr-dot.ok {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34,197,94,0.28), 0 0 8px rgba(34,197,94,0.45);
}
.hmr-dot.warn { background: #fbbf24; box-shadow: 0 0 0 3px rgba(251,191,36,0.22); }
.hmr-dot.err { background: #f87171; box-shadow: 0 0 0 3px rgba(248,113,113,0.22); }
.hmr-dot.off { background: #71717a; }
.hmr-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
}
.hmr-stat {
  text-align: center; padding: 7px 4px; border-radius: 8px; background: rgba(255,255,255,0.04);
}
.hmr-stat b { display: block; font-size: 13px; font-weight: 700; color: #ececf1; font-variant-numeric: tabular-nums; }
.hmr-stat span { display: block; margin-top: 2px; font-size: 10px; color: rgba(236,236,241,0.45); }
.hmr-missing { color: rgba(236,236,241,0.42); font-size: 11.5px; line-height: 1.45; }

.indicator {
  pointer-events: auto; width: 38px; height: 38px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14);
  background: linear-gradient(160deg, rgba(32,32,38,0.94), rgba(10,10,14,0.96));
  backdrop-filter: blur(14px) saturate(1.3);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  box-shadow: 0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.25);
  color: #fff; cursor: grab; display: grid; place-items: center; position: relative;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}
.indicator:hover {
  transform: translateY(-1px) scale(1.03);
  border-color: rgba(96,165,250,0.45);
}
.indicator:active { cursor: grabbing; }
.indicator:focus-visible { outline: 2px solid rgba(59,130,246,0.8); outline-offset: 2px; }
.indicator-mark {
  font-weight: 780; font-size: 13px; letter-spacing: -0.04em;
  background: linear-gradient(180deg, #93c5fd, #3b82f6);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.dot {
  position: absolute; top: 2px; right: 2px; width: 8px; height: 8px;
  border-radius: 999px; border: 1.5px solid rgba(10,10,14,0.95); background: #71717a;
}
.dot.ok { background: #4ade80; box-shadow: 0 0 0 2px rgba(74,222,128,0.25); }
.dot.warn { background: #fbbf24; box-shadow: 0 0 0 2px rgba(251,191,36,0.22); }
.dot.err { background: #f87171; box-shadow: 0 0 0 2px rgba(248,113,113,0.22); }
.dot.off { background: #71717a; }
.dot.hidden { display: none; }
`;

function emptySummary(): OwnerTreeSummary {
  return {
    nodes: 0,
    effects: 0,
    memos: 0,
    plainOwners: 0,
    upstreamEdges: 0,
    downstreamEdges: 0,
    maxDepth: 0,
    disposables: 0,
  };
}

function mergeSummaries(parts: OwnerTreeSummary[]): OwnerTreeSummary {
  const out = emptySummary();
  for (const s of parts) {
    out.nodes += s.nodes;
    out.effects += s.effects;
    out.memos += s.memos;
    out.plainOwners += s.plainOwners;
    out.upstreamEdges += s.upstreamEdges;
    out.downstreamEdges += s.downstreamEdges;
    out.maxDepth = Math.max(out.maxDepth, s.maxDepth);
    out.disposables += s.disposables;
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readStore(key: string): StoredPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as StoredPrefs;
  } catch {
    return {};
  }
}

function writeStore(key: string, prefs: StoredPrefs): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(prefs));
  } catch {
    /* private mode / SSR */
  }
}

function cornerClass(c: DevtoolsOverlayCorner): string {
  switch (c) {
    case "bottom-right":
      return "corner-br";
    case "top-left":
      return "corner-tl";
    case "top-right":
      return "corner-tr";
    default:
      return "corner-bl";
  }
}

function collectRoots(primary: Owner | null): { root: Owner; id: string }[] {
  const out: { root: Owner; id: string }[] = [];
  const seen = new Set<Owner>();
  if (primary) {
    out.push({ root: primary, id: "0" });
    seen.add(primary);
  }
  let i = primary ? 1 : 0;
  for (const r of getTrackedRoots()) {
    if (seen.has(r)) continue;
    out.push({ root: r, id: String(i++) });
    seen.add(r);
  }
  return out;
}

/**
 * Mount the Next-inspired DEV floating DevTools.
 * Returns `null` when `VIEW_DEV` is off or there is no `document`.
 */
export function mountDevtoolsOverlay(
  options?: MountDevtoolsOverlayOptions,
): DevtoolsOverlayHandle | null {
  if (!isViewDev()) return null;
  if (typeof document === "undefined" || !document.body) return null;

  installOwnerDomTracking();

  if (active) active.unmount();

  const storageKey = options?.storageKey ?? DEFAULT_STORAGE;
  const stored = readStore(storageKey);
  let corner: DevtoolsOverlayCorner = stored.corner ?? options?.corner ??
    "bottom-left";
  let refreshMs = stored.refreshMs ?? options?.refreshMs ?? 1000;
  const watchMisuse = options?.watchMisuse !== false;
  const parent = options?.parent ?? document.body;
  const zIndex = options?.zIndex ?? 2_147_483_000;
  const primaryOwner: Owner | null = options?.owner ?? null;

  let tab: DevtoolsOverlayTab = stored.tab ?? options?.tab ?? "overview";
  let open = stored.open === true;
  let selectedPath: string | null = null;
  let signalQuery = "";
  const expanded = new Set<string>();
  const warnings: OversubscribeWarning[] = [];
  let forest: IndexedOwnerNode[] = [];
  let flatIndex = new Map<string, IndexedOwnerNode>();

  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "overlay");
  host.style.cssText =
    `position:fixed;inset:0;pointer-events:none;z-index:${zIndex}`;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = `wrap ${cornerClass(corner)}`;
  wrap.style.setProperty("--dv-z", String(zIndex));
  if (stored.offsetX || stored.offsetY) {
    wrap.style.transform = `translate(${stored.offsetX ?? 0}px, ${
      stored.offsetY ?? 0
    }px)`;
  }

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  syncOverlayLocaleFromPage();
  panel.setAttribute("aria-label", ot("title"));
  panel.setAttribute("data-locale", getOverlayLocale());
  panel.innerHTML = `
    <div class="head" data-el="drag-handle">
      <div class="head-brand">
        <span class="logo" aria-hidden="true"></span>
        <div>
          <p class="head-title" data-i18n="title">${ot("title")}</p>
          <p class="head-sub"><span data-i18n="subtitle">${
    ot("subtitle")
  }</span> <span class="kbd">⌘/Ctrl⇧D</span></p>
        </div>
      </div>
      <div class="head-actions">
        <button type="button" class="icon-btn" data-action="refresh" data-i18n-title="refresh" data-i18n-aria="refresh" title="${
    ot("refresh")
  }" aria-label="${ot("refresh")}">↻</button>
        <button type="button" class="icon-btn" data-action="close" data-i18n-aria="close" aria-label="${
    ot("close")
  }">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
    </div>
    <div class="tabs" role="tablist">
      <button type="button" class="tab" data-tab="overview" role="tab" data-i18n="tabOverview">${
    ot("tabOverview")
  }</button>
      <button type="button" class="tab" data-tab="tree" role="tab" data-i18n="tabTree">${
    ot("tabTree")
  }</button>
      <button type="button" class="tab" data-tab="signals" role="tab"><span data-i18n="tabSignals">${
    ot("tabSignals")
  }</span> <span class="count" data-el="sig-count">0</span></button>
      <button type="button" class="tab" data-tab="warnings" role="tab"><span data-i18n="tabWarnings">${
    ot("tabWarnings")
  }</span> <span class="count" data-el="warn-count">0</span></button>
      <button type="button" class="tab" data-tab="settings" role="tab" data-i18n="tabSettings">${
    ot("tabSettings")
  }</button>
    </div>
    <div class="body">
      <div class="pane" data-pane="overview">
        <div class="section">
          <div class="section-h">
            <h3 class="section-title" data-i18n="reactiveOverview">${
    ot("reactiveOverview")
  }</h3>
            <span class="badge" data-el="roots-badge">—</span>
          </div>
          <div class="stats">
            <div class="stat"><span class="stat-n" data-el="n-effects">0</span><span class="stat-l" data-i18n="effects">${
    ot("effects")
  }</span></div>
            <div class="stat"><span class="stat-n" data-el="n-memos">0</span><span class="stat-l" data-i18n="memos">${
    ot("memos")
  }</span></div>
            <div class="stat"><span class="stat-n" data-el="n-nodes">0</span><span class="stat-l" data-i18n="nodes">${
    ot("nodes")
  }</span></div>
            <div class="stat"><span class="stat-n" data-el="n-edges">0</span><span class="stat-l" data-i18n="edges">${
    ot("edges")
  }</span></div>
          </div>
          <div class="section-h" style="margin-top:10px">
            <span class="badge ok" data-el="health-badge">${
    ot("healthOkBadge")
  }</span>
          </div>
          <p class="hint" data-el="health-hint">${ot("healthOk")}</p>
        </div>
        <div class="section">
          <div class="section-h">
            <h3 class="section-title" data-i18n="hmrTitle">${
    ot("hmrTitle")
  }</h3>
            <span class="hmr-badge-pair" data-el="hmr-badge-pair">
              <span class="hmr-dot off" data-el="hmr-dot" aria-hidden="true"></span>
              <span class="badge" data-el="hmr-badge">—</span>
            </span>
          </div>
          <div class="hmr-card" data-el="hmr-card">
            <p class="hmr-missing" data-el="hmr-missing" data-i18n="hmrWaiting">${
    ot("hmrWaiting")
  }</p>
            <div class="hmr-live" data-el="hmr-live" hidden>
              <p class="hint" data-el="hmr-progress"></p>
              <div class="hmr-stats">
                <div class="hmr-stat"><b data-el="hmr-updates">0</b><span data-i18n="hmrUpdates">${
    ot("hmrUpdates")
  }</span></div>
                <div class="hmr-stat"><b data-el="hmr-ok">0</b><span data-i18n="hmrOk">${
    ot("hmrOk")
  }</span></div>
                <div class="hmr-stat"><b data-el="hmr-fail">0</b><span data-i18n="hmrFailed">${
    ot("hmrFailed")
  }</span></div>
              </div>
              <p class="hint" data-el="hmr-last">${ot("hmrLastNone")}</p>
            </div>
          </div>
        </div>
        <div class="section">
          <div class="section-h"><h3 class="section-title" data-i18n="topSources">${
    ot("topSources")
  }</h3></div>
          <ul class="list" data-el="overview-sources"></ul>
        </div>
      </div>
      <div class="pane" data-pane="tree">
        <div class="toolbar">
          <input class="search" data-el="tree-filter" data-i18n-placeholder="treeFilterPh" placeholder="${
    ot("treeFilterPh")
  }" />
        </div>
        <div class="tree-layout">
          <div class="tree-pane" data-el="tree-list" role="tree"></div>
          <div class="detail-pane" data-el="tree-detail">
            <p class="detail-empty" data-i18n="selectNode">${
    ot("selectNode")
  }</p>
          </div>
        </div>
      </div>
      <div class="pane" data-pane="signals">
        <div class="toolbar">
          <input class="search" data-el="sig-filter" data-i18n-placeholder="sigFilterPh" placeholder="${
    ot("sigFilterPh")
  }" />
        </div>
        <ul class="list" data-el="sig-list"></ul>
      </div>
      <div class="pane" data-pane="warnings">
        <div class="section-h" style="margin:0 0 8px">
          <h3 class="section-title" data-i18n="misuseScan">${
    ot("misuseScan")
  }</h3>
          <span class="badge ok" data-el="warn-badge">0</span>
        </div>
        <div data-el="warn-list"></div>
      </div>
      <div class="pane" data-pane="settings">
        <div class="settings-row">
          <label for="dv-corner" data-i18n="corner">${ot("corner")}</label>
          <select id="dv-corner" data-el="opt-corner">
            <option value="bottom-left" data-i18n="cornerBL">${
    ot("cornerBL")
  }</option>
            <option value="bottom-right" data-i18n="cornerBR">${
    ot("cornerBR")
  }</option>
            <option value="top-left" data-i18n="cornerTL">${
    ot("cornerTL")
  }</option>
            <option value="top-right" data-i18n="cornerTR">${
    ot("cornerTR")
  }</option>
          </select>
        </div>
        <div class="settings-row">
          <label for="dv-refresh" data-i18n="refreshMs">${
    ot("refreshMs")
  }</label>
          <input id="dv-refresh" data-el="opt-refresh" type="number" min="0" step="100" />
        </div>
        <div class="settings-row">
          <label data-i18n="shortcut">${ot("shortcut")}</label>
          <span><span class="kbd">⌘/Ctrl</span> + <span class="kbd">Shift</span> + <span class="kbd">D</span></span>
        </div>
        <div class="settings-row">
          <label data-i18n="hmrUi">${ot("hmrUi")}</label>
          <span data-el="hmr-claim-note">${ot("hmrClaimed")}</span>
        </div>
        <p class="hint" data-el="settings-hint">${
    ot("settingsHint", { storageKey })
  }</p>
        <div class="settings-row">
          <button type="button" class="ghost" data-action="reset-pos" data-i18n="resetPos">${
    ot("resetPos")
  }</button>
          <button type="button" class="ghost" data-action="clear-warns" data-i18n="clearWarns">${
    ot("clearWarns")
  }</button>
        </div>
      </div>
    </div>
  `;

  const indicator = document.createElement("button");
  indicator.type = "button";
  indicator.className = "indicator";
  indicator.setAttribute("aria-label", ot("openAria"));
  indicator.setAttribute("aria-expanded", "false");
  indicator.innerHTML = `
    <span class="indicator-mark" aria-hidden="true">V</span>
    <span class="dot hidden" data-el="status-dot" aria-hidden="true"></span>
  `;

  wrap.appendChild(panel);
  wrap.appendChild(indicator);
  shadow.appendChild(wrap);
  parent.appendChild(host);

  const el = (sel: string): HTMLElement | null =>
    shadow.querySelector(sel) as HTMLElement | null;

  /** Re-apply static chrome after page language changes (no language UI). */
  const applyChromeI18n = () => {
    panel.setAttribute("aria-label", ot("title"));
    panel.setAttribute("data-locale", getOverlayLocale());
    shadow.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = (node as HTMLElement).getAttribute("data-i18n");
      if (key) node.textContent = ot(key);
    });
    shadow.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const key = (node as HTMLElement).getAttribute("data-i18n-placeholder");
      if (key && node instanceof HTMLElement && node.tagName === "INPUT") {
        (node as unknown as { placeholder: string }).placeholder = ot(key);
      }
    });
    shadow.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      const key = (node as HTMLElement).getAttribute("data-i18n-aria");
      if (key) (node as HTMLElement).setAttribute("aria-label", ot(key));
    });
    shadow.querySelectorAll("[data-i18n-title]").forEach((node) => {
      const key = (node as HTMLElement).getAttribute("data-i18n-title");
      if (key) (node as HTMLElement).setAttribute("title", ot(key));
    });
    const hint = el("[data-el='settings-hint']");
    if (hint) hint.textContent = ot("settingsHint", { storageKey });
    indicator.setAttribute(
      "aria-label",
      open ? ot("closeAria") : ot("openAria"),
    );
  };

  let langObserver: MutationObserver | null = null;

  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let stopWatch: (() => void) | null = null;
  let dragMoved = false;
  let releaseHmrUi: (() => void) | null = null;
  let unsubHmr: (() => void) | null = null;
  let hmrPoll: ReturnType<typeof setInterval> | null = null;
  let lastHmrSnap: DreamerHmrSnapshot | null = null;

  const persist = () => {
    const tf = wrap.style.transform.match(
      /translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/,
    );
    writeStore(storageKey, {
      corner,
      open,
      tab,
      refreshMs,
      offsetX: tf ? Number(tf[1]) : 0,
      offsetY: tf ? Number(tf[2]) : 0,
    });
  };

  const applyCorner = () => {
    wrap.className = `wrap ${cornerClass(corner)}`;
    const opt = el("[data-el='opt-corner']") as HTMLSelectElement | null;
    if (opt) opt.value = corner;
  };

  const ownerForPath = (path: string): Owner | null => {
    const first = path.split("/")[0] ?? "";
    for (const { root, id } of collectRoots(primaryOwner)) {
      if (id === first) return getOwnerByPath(root, path);
    }
    return null;
  };

  const domCountFor = (path: string): number => {
    const owner = ownerForPath(path);
    return owner ? collectOwnerDomElements(owner).length : 0;
  };

  const clearInspectHighlight = () => {
    document.querySelector("[data-dreamer-view-inspect]")?.remove();
  };

  const paintInspectHighlight = (path: string, elements: Element[]) => {
    if (!elements.length) {
      clearInspectHighlight();
      return;
    }
    const z = Math.max(1, zIndex - 10);
    let layer = document.querySelector(
      "[data-dreamer-view-inspect]",
    ) as HTMLElement | null;
    if (!layer) {
      layer = document.createElement("div");
      document.body.appendChild(layer);
    }
    layer.setAttribute("data-dreamer-view-inspect", "");
    layer.setAttribute("data-inspect-path", path);
    layer.style.cssText =
      `position:fixed;inset:0;pointer-events:none;z-index:${z};`;
    layer.replaceChildren();
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]!;
      let rect: DOMRect;
      try {
        rect = el.getBoundingClientRect();
      } catch {
        continue;
      }
      const box = document.createElement("div");
      box.setAttribute("data-inspect-box", "");
      box.style.cssText =
        `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;` +
        "border:2px solid #3b82f6;background:rgba(59,130,246,0.18);border-radius:4px;box-sizing:border-box;";
      if (i === 0) {
        const label = document.createElement("span");
        label.setAttribute("data-inspect-label", "");
        label.textContent = path;
        label.style.cssText =
          "position:absolute;left:-2px;top:0;transform:translateY(-100%);" +
          "background:#3b82f6;color:#fff;font:600 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;" +
          "padding:1px 5px;border-radius:3px 3px 0 0;white-space:nowrap;pointer-events:none;";
        box.appendChild(label);
      }
      layer.appendChild(box);
    }
    if (!layer.childElementCount) clearInspectHighlight();
  };

  const syncHighlight = () => {
    if (!open || !selectedPath) {
      clearInspectHighlight();
      return;
    }
    const owner = ownerForPath(selectedPath);
    const els = owner ? collectOwnerDomElements(owner) : [];
    paintInspectHighlight(selectedPath, els);
  };

  let highlightRaf = 0;
  const onViewport = () => {
    if (!open || !selectedPath) return;
    const view = document.defaultView;
    if (view && typeof view.requestAnimationFrame === "function") {
      if (highlightRaf) return;
      highlightRaf = view.requestAnimationFrame(() => {
        highlightRaf = 0;
        syncHighlight();
      });
      return;
    }
    syncHighlight();
  };
  document.addEventListener("scroll", onViewport, true);
  document.defaultView?.addEventListener("resize", onViewport);

  const setOpen = (next: boolean) => {
    open = next;
    panel.classList.toggle("open", open);
    indicator.setAttribute("aria-expanded", open ? "true" : "false");
    indicator.setAttribute(
      "aria-label",
      open ? ot("closeAria") : ot("openAria"),
    );
    persist();
    syncHighlight();
  };

  const setTab = (next: DevtoolsOverlayTab) => {
    tab = next;
    shadow.querySelectorAll(".tab").forEach((n) => {
      n.classList.toggle("active", (n as HTMLElement).dataset.tab === tab);
    });
    shadow.querySelectorAll(".pane").forEach((n) => {
      n.classList.toggle("active", (n as HTMLElement).dataset.pane === tab);
    });
    persist();
  };

  const renderDetail = () => {
    const detail = el("[data-el='tree-detail']");
    if (!detail) return;
    if (!selectedPath) {
      detail.innerHTML = `<p class="detail-empty">${ot("selectNode")}</p>`;
      return;
    }
    const node = flatIndex.get(selectedPath);
    if (!node) {
      detail.innerHTML = `<p class="detail-empty">${
        ot("nodeStale", { path: selectedPath })
      }</p>`;
      return;
    }
    const domCount = domCountFor(node.id);
    detail.innerHTML = `
      <div class="section-h" style="margin-bottom:10px">
        <h3 class="section-title">${ot("nodeDetail")}</h3>
        <span class="kind ${node.kind}">${node.kind}</span>
      </div>
      <dl class="kv">
        <dt>${ot("path")}</dt><dd>${escapeHtml(node.id)}</dd>
        <dt>${ot("depth")}</dt><dd>${node.depth}</dd>
        <dt>${ot("children")}</dt><dd>${node.children}</dd>
        <dt>${ot("disposables")}</dt><dd>${node.disposables}</dd>
        <dt>${ot("upstream")}</dt><dd>${node.upstream}</dd>
        <dt>${ot("downstream")}</dt><dd>${node.downstream}</dd>
        <dt>${ot("dom")}</dt><dd>${domCount}</dd>
      </dl>
      <p class="hint">${ot("upstreamHint")}</p>
      ${domCount === 0 ? `<p class="hint">${ot("noDomForNode")}</p>` : ""}
    `;
  };

  const renderTree = () => {
    const list = el("[data-el='tree-list']");
    if (!list) return;
    const filter =
      (el("[data-el='tree-filter']") as HTMLInputElement | null)?.value
        .trim()
        .toLowerCase() ?? "";

    const rows: string[] = [];
    const walk = (node: IndexedOwnerNode) => {
      const label = `${node.kind} ${node.id}`;
      if (
        filter &&
        !label.toLowerCase().includes(filter) &&
        !node.id.toLowerCase().includes(filter)
      ) {
        // still walk children in case nested match
        for (const c of node.childNodes) walk(c);
        return;
      }
      const hasKids = node.childNodes.length > 0;
      const isOpen = expanded.has(node.id) || !!filter;
      const pad = 6 + node.depth * 12;
      rows.push(`
        <button type="button" class="tree-row${
        selectedPath === node.id ? " selected" : ""
      }"
          data-path="${
        escapeHtml(node.id)
      }" style="padding-left:${pad}px" role="treeitem"
          aria-selected="${selectedPath === node.id ? "true" : "false"}"
          ${hasKids ? `aria-expanded="${isOpen ? "true" : "false"}"` : ""}>
          <span class="tree-twist${hasKids ? "" : " empty"}" data-twist="${
        escapeHtml(node.id)
      }">${hasKids ? (isOpen ? "▼" : "▶") : "·"}</span>
          <span class="kind ${node.kind}">${node.kind}</span>
          <span>${escapeHtml(node.id)}</span>
          <span class="meta">↑${node.upstream} ↓${node.downstream}</span>
        </button>
      `);
      if (hasKids && isOpen) {
        for (const c of node.childNodes) walk(c);
      } else if (hasKids && filter) {
        for (const c of node.childNodes) walk(c);
      }
    };
    for (const root of forest) walk(root);
    if (rows.length) {
      list.innerHTML = rows.join("");
    } else if (forest.length === 0) {
      list.innerHTML = `<div class="empty-block"><p class="empty">${
        ot("noOwnerRoots")
      }</p><p class="empty-hint">${ot("noOwnerRootsHint")}</p></div>`;
    } else {
      list.innerHTML = `<p class="empty">${ot("noTreeMatch")}</p>`;
    }
    renderDetail();
  };

  const renderSignals = () => {
    const sources = snapshotRegistrySources()
      .slice()
      .sort((a, b) => b.observers - a.observers);
    const q = signalQuery.trim().toLowerCase();
    const filtered = q
      ? sources.filter((s) => s.id.toLowerCase().includes(q))
      : sources;
    const countEl = el("[data-el='sig-count']");
    if (countEl) countEl.textContent = String(sources.length);
    const list = el("[data-el='sig-list']");
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<p class="empty">${
        sources.length ? ot("noSourcesMatch") : ot("noSourcesYet")
      }</p>`;
      return;
    }
    list.innerHTML = filtered
      .map(
        (s) =>
          `<li class="row"><span class="row-k" title="${escapeHtml(s.id)}">${
            escapeHtml(s.id)
          }</span><span class="row-v">${
            ot("obs", { n: s.observers })
          }</span></li>`,
      )
      .join("");

    const overview = el("[data-el='overview-sources']");
    if (overview) {
      const top = sources.slice(0, 5);
      overview.innerHTML = top.length
        ? top
          .map(
            (s) =>
              `<li class="row"><span class="row-k">${
                escapeHtml(s.id)
              }</span><span class="row-v">${s.observers}</span></li>`,
          )
          .join("")
        : `<p class="empty">${ot("noSources")}</p>`;
    }
  };

  /**
   * Float status-dot: merge HMR connection + misuse warnings.
   * - connected + no warns → green (`ok`)
   * - any warns → yellow (`warn`) without clearing HMR state for next paint
   * - disconnected / error / no bridge → gray / hidden as before
   */
  const syncStatusDot = () => {
    const statusDot = el("[data-el='status-dot']");
    if (!statusDot) return;
    const snap = lastHmrSnap;
    const n = warnings.length;
    if (!snap) {
      statusDot.className = "dot hidden off";
      statusDot.title = ot("indicatorHmrOffline");
      statusDot.style.background = "";
      return;
    }
    let cls: "ok" | "warn" | "err" | "off";
    let title: string;
    if (n > 0) {
      cls = "warn";
      title = snap.connection === "connected"
        ? ot("indicatorHmrConnected")
        : ot("indicatorHmrWarn", { status: hmrLabel(snap.connection) });
    } else if (snap.connection === "connected") {
      cls = "ok";
      title = ot("indicatorHmrConnected");
    } else if (snap.connection === "reconnecting") {
      cls = "warn";
      title = ot("indicatorHmrWarn", { status: hmrLabel(snap.connection) });
    } else if (snap.connection === "error") {
      cls = "err";
      title = ot("indicatorHmrWarn", { status: hmrLabel(snap.connection) });
    } else {
      cls = "off";
      title = ot("indicatorHmrWarn", { status: hmrLabel(snap.connection) });
    }
    statusDot.className = `dot ${cls}`;
    statusDot.title = title;
    statusDot.style.background = "";
  };

  const renderWarnings = () => {
    const list = el("[data-el='warn-list']");
    const badge = el("[data-el='warn-badge']");
    const count = el("[data-el='warn-count']");
    const health = el("[data-el='health-badge']");
    const healthHint = el("[data-el='health-hint']");
    const n = warnings.length;
    if (badge) {
      badge.textContent = String(n);
      badge.className = n > 0 ? "badge warn" : "badge ok";
    }
    if (count) {
      count.textContent = String(n);
      count.className = n > 0 ? "count warn" : "count";
    }
    if (health) {
      health.textContent = n > 0
        ? (n === 1
          ? ot("healthWarnBadge", { n })
          : ot("healthWarnBadgePlural", { n }))
        : ot("healthOkBadge");
      health.className = n > 0 ? "badge warn" : "badge ok";
    }
    if (healthHint) {
      healthHint.textContent = n > 0 ? ot("healthWarnHint") : ot("healthOk");
    }
    // status-dot: do not paint bare gray here — merge with HMR via syncStatusDot
    syncStatusDot();
    if (!list) return;
    if (!n) {
      list.innerHTML = `<p class="empty">${ot("noIssues")}</p>`;
      return;
    }
    list.innerHTML = warnings
      .slice()
      .reverse()
      .slice(0, 40)
      .map((w, idx) => {
        const i = warnings.length - 1 - idx;
        return `
        <button type="button" class="warn-item" data-warn="${i}">
          <span class="warn-kind">${escapeHtml(w.kind)}</span>
          <span>${escapeHtml(w.message)}</span>
          ${
          w.path ? `<span class="warn-path">→ ${escapeHtml(w.path)}</span>` : ""
        }
        </button>`;
      })
      .join("");
  };

  const rebuildForest = () => {
    const roots = collectRoots(primaryOwner);
    forest = [];
    flatIndex = new Map();
    for (const { root, id } of roots) {
      const snap = inspectOwnerIndexed(root, { rootId: id, maxDepth: 48 });
      if (snap) {
        forest.push(snap);
        for (const n of flattenIndexedOwner(snap)) flatIndex.set(n.id, n);
        if (!expanded.has(id)) expanded.add(id);
      }
    }
  };

  const scanWarnings = () => {
    const roots = collectRoots(primaryOwner);
    const scanned: OversubscribeWarning[] = [];
    for (const { root, id } of roots) {
      scanned.push(...detectOversubscribe(root, { rootId: id }));
      const churn = detectOwnerRemountChurn(root, { rootId: id });
      if (churn) scanned.push(churn);
    }
    const seen = new Set(
      warnings.map((w) => `${w.kind}:${w.path ?? ""}:${w.message}`),
    );
    for (const w of scanned) {
      const key = `${w.kind}:${w.path ?? ""}:${w.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        warnings.push(w);
      }
    }
    if (warnings.length > 60) warnings.splice(0, warnings.length - 60);
  };

  const renderHmr = (snap: DreamerHmrSnapshot | null) => {
    lastHmrSnap = snap;
    const badge = el("[data-el='hmr-badge']");
    const missing = el("[data-el='hmr-missing']");
    const live = el("[data-el='hmr-live']");
    const claimNote = el("[data-el='hmr-claim-note']");
    if (!snap) {
      if (badge) {
        badge.textContent = ot("hmrOffline");
        badge.className = "badge";
      }
      const offlineDot = el("[data-el='hmr-dot']");
      if (offlineDot) offlineDot.className = "hmr-dot off";
      if (missing) missing.hidden = false;
      if (live) live.hidden = true;
      if (claimNote) {
        claimNote.textContent = ot("hmrNoBridge");
      }
      syncStatusDot();
      return;
    }
    if (missing) missing.hidden = true;
    if (live) live.hidden = false;
    if (badge) {
      badge.textContent = hmrLabel(snap.connection);
      badge.className = snap.connection === "connected"
        ? "badge ok"
        : snap.connection === "error"
        ? "badge warn"
        : "badge";
    }
    const dot = el("[data-el='hmr-dot']");
    if (dot) dot.className = hmrDotClass(snap.connection);
    const prog = el("[data-el='hmr-progress']");
    if (prog) {
      prog.textContent = snap.updating
        ? (snap.lastProgressPath
          ? ot("hmrUpdatingPath", { path: snap.lastProgressPath })
          : ot("hmrUpdating"))
        : "";
    }
    const setT = (sel: string, v: string) => {
      const n = el(sel);
      if (n) n.textContent = v;
    };
    setT("[data-el='hmr-updates']", String(snap.updateCount));
    setT("[data-el='hmr-ok']", String(snap.successCount));
    setT("[data-el='hmr-fail']", String(snap.failureCount));
    const last = el("[data-el='hmr-last']");
    if (last) {
      last.textContent = snap.lastUpdateTime
        ? ot("hmrLast", {
          time: new Date(snap.lastUpdateTime).toLocaleTimeString(),
        })
        : ot("hmrLastNone");
    }
    if (claimNote) {
      claimNote.textContent = ot("hmrClaimed");
    }
    syncStatusDot();
  };

  const attachHmrBridge = () => {
    const bridge = getDreamerHmrBridge();
    if (!bridge) {
      renderHmr(null);
      return false;
    }
    if (!releaseHmrUi) {
      releaseHmrUi = bridge.claimUi("view-devtools-overlay");
    }
    if (!unsubHmr) {
      unsubHmr = bridge.subscribe((snap) => renderHmr(snap));
    } else {
      renderHmr(bridge.getSnapshot());
    }
    return true;
  };

  const renderOverview = () => {
    const parts: OwnerTreeSummary[] = [];
    for (const { root } of collectRoots(primaryOwner)) {
      const s = summarizeOwnerTree(root);
      if (s) parts.push(s);
    }
    const summary = parts.length ? mergeSummaries(parts) : emptySummary();
    const rootCount = collectRoots(primaryOwner).length;
    const rootsBadge = el("[data-el='roots-badge']");
    if (rootsBadge) {
      rootsBadge.textContent = rootCount === 1
        ? ot("rootsBadge", { n: rootCount, depth: summary.maxDepth })
        : ot("rootsBadgePlural", { n: rootCount, depth: summary.maxDepth });
    }
    const setN = (key: string, v: number) => {
      const n = el(`[data-el='${key}']`);
      if (n) n.textContent = String(v);
    };
    setN("n-effects", summary.effects);
    setN("n-memos", summary.memos);
    setN("n-nodes", summary.nodes);
    setN("n-edges", summary.upstreamEdges);
    // Keep HMR card in sync on refresh ticks (bridge may appear late).
    if (!attachHmrBridge()) renderHmr(lastHmrSnap);
  };

  const refresh = () => {
    const before = panel.getAttribute("data-locale");
    syncOverlayLocaleFromPage();
    if (getOverlayLocale() !== before) applyChromeI18n();
    rebuildForest();
    scanWarnings();
    renderOverview();
    renderTree();
    renderSignals();
    renderWarnings();
    syncHighlight();
  };

  try {
    if (typeof MutationObserver !== "undefined" && document.documentElement) {
      langObserver = new MutationObserver(() => {
        const before = panel.getAttribute("data-locale");
        syncOverlayLocaleFromPage();
        if (getOverlayLocale() !== before) {
          applyChromeI18n();
          refresh();
        }
      });
      langObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"],
      });
    }
  } catch {
    langObserver = null;
  }

  const selectNode = (path: string | null, expandSelf = true) => {
    selectedPath = path;
    if (path) {
      if (expandSelf) {
        const parts = path.split("/");
        for (let i = 1; i <= parts.length; i++) {
          expanded.add(parts.slice(0, i).join("/"));
        }
      }
      setTab("tree");
      setOpen(true);
    }
    renderTree();
    syncHighlight();
  };

  const onWarn = (w: OversubscribeWarning) => {
    const key = `${w.kind}:${w.path ?? ""}:${w.message}`;
    if (
      warnings.some((x) => `${x.kind}:${x.path ?? ""}:${x.message}` === key)
    ) {
      return;
    }
    warnings.push(w);
    renderWarnings();
  };

  const restartTimer = () => {
    if (refreshTimer != null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (refreshMs > 0) refreshTimer = setInterval(refresh, refreshMs);
  };

  // Events
  indicator.addEventListener("click", () => {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    setOpen(!open);
    if (open) refresh();
  });

  panel.querySelectorAll("[data-action='close']").forEach((n) =>
    n.addEventListener("click", () => setOpen(false))
  );
  panel.querySelectorAll("[data-action='refresh']").forEach((n) =>
    n.addEventListener("click", () => refresh())
  );
  panel.querySelector("[data-action='clear-warns']")?.addEventListener(
    "click",
    () => {
      warnings.length = 0;
      renderWarnings();
    },
  );
  panel.querySelector("[data-action='reset-pos']")?.addEventListener(
    "click",
    () => {
      wrap.style.transform = "";
      persist();
    },
  );

  shadow.querySelectorAll(".tab").forEach((n) => {
    n.addEventListener("click", () => {
      const t = (n as HTMLElement).dataset.tab as DevtoolsOverlayTab;
      setTab(t);
    });
  });

  el("[data-el='tree-list']")?.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    const row = t.closest("[data-path]") as HTMLElement | null;
    if (!row?.dataset.path) return;
    const path = row.dataset.path;
    const twist = t.closest("[data-twist]") as HTMLElement | null;
    if (twist?.dataset.twist === path) {
      if (expanded.has(path)) expanded.delete(path);
      else expanded.add(path);
      // Keep the collapsed row collapsed; still select + highlight.
      selectNode(path, false);
      return;
    }
    selectNode(path);
  });

  el("[data-el='warn-list']")?.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest("[data-warn]") as
      | HTMLElement
      | null;
    if (!btn) return;
    const idx = Number(btn.dataset.warn);
    const w = warnings[idx];
    if (w?.path) selectNode(w.path);
    else {
      setTab("warnings");
      setOpen(true);
    }
  });

  const treeFilter = el("[data-el='tree-filter']") as HTMLInputElement | null;
  treeFilter?.addEventListener("input", () => renderTree());
  const sigFilter = el("[data-el='sig-filter']") as HTMLInputElement | null;
  sigFilter?.addEventListener("input", () => {
    signalQuery = sigFilter.value;
    renderSignals();
  });

  const cornerSel = el("[data-el='opt-corner']") as HTMLSelectElement | null;
  if (cornerSel) {
    cornerSel.value = corner;
    cornerSel.addEventListener("change", () => {
      corner = cornerSel.value as DevtoolsOverlayCorner;
      wrap.style.transform = "";
      applyCorner();
      persist();
    });
  }
  const refreshInput = el("[data-el='opt-refresh']") as HTMLInputElement | null;
  if (refreshInput) {
    refreshInput.value = String(refreshMs);
    refreshInput.addEventListener("change", () => {
      const v = Number(refreshInput.value);
      refreshMs = Number.isFinite(v) && v >= 0 ? v : 1000;
      restartTimer();
      persist();
    });
  }

  // Drag (header + indicator) with corner snap on release near edges
  const bindDrag = (handleEl: HTMLElement) => {
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      if (!dragging) return;
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
      wrap.style.transform = `translate(${ox + dx}px, ${oy + dy}px)`;
    };
    const onUp = (ev: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      handleEl.releasePointerCapture?.(ev.pointerId);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      // snap to nearest corner if close to viewport edge
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const midX = globalThis.innerWidth / 2;
      const midY = globalThis.innerHeight / 2;
      const near = 72;
      const nearL = rect.left < near;
      const nearR = globalThis.innerWidth - rect.right < near;
      const nearT = rect.top < near;
      const nearB = globalThis.innerHeight - rect.bottom < near;
      if (nearL || nearR || nearT || nearB) {
        const next: DevtoolsOverlayCorner = nearT
          ? (cx < midX ? "top-left" : "top-right")
          : nearB
          ? (cx < midX ? "bottom-left" : "bottom-right")
          : (cy < midY
            ? (cx < midX ? "top-left" : "top-right")
            : (cx < midX ? "bottom-left" : "bottom-right"));
        corner = next;
        wrap.style.transform = "";
        applyCorner();
      }
      persist();
    };
    handleEl.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const t = ev.target as Element | null;
      if (
        t?.closest?.(
          "button, a, input, select, textarea, label, [data-action]",
        )
      ) {
        return;
      }
      dragging = true;
      dragMoved = false;
      sx = ev.clientX;
      sy = ev.clientY;
      const m = wrap.style.transform.match(
        /translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/,
      );
      ox = m ? Number(m[1]) : 0;
      oy = m ? Number(m[2]) : 0;
      handleEl.setPointerCapture?.(ev.pointerId);
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  };
  const dragHandle = el("[data-el='drag-handle']");
  if (dragHandle) bindDrag(dragHandle);
  bindDrag(indicator);

  const onKey = (ev: KeyboardEvent) => {
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.shiftKey && (ev.key === "d" || ev.key === "D")) {
      ev.preventDefault();
      setOpen(!open);
      if (open) refresh();
      return;
    }
    if (ev.key === "Escape" && open) {
      ev.stopPropagation();
      setOpen(false);
    }
  };
  document.addEventListener("keydown", onKey, true);

  if (watchMisuse) {
    try {
      stopWatch = enableOversubscribeWarnings({
        owner: primaryOwner,
        includeTrackedRoots: true,
        intervalMs: Math.max(refreshMs || 1000, 500),
        onWarn,
      });
    } catch {
      /* ignore */
    }
  }

  // Claim HMR capsule ASAP; poll briefly if the server client is still booting.
  if (!attachHmrBridge()) {
    hmrPoll = setInterval(() => {
      if (attachHmrBridge() && hmrPoll != null) {
        clearInterval(hmrPoll);
        hmrPoll = null;
      }
    }, 200);
    // Stop polling after ~10s — leave "waiting" UI if no bridge.
    setTimeout(() => {
      if (hmrPoll != null) {
        clearInterval(hmrPoll);
        hmrPoll = null;
      }
    }, 10_000);
  }

  applyCorner();
  setTab(tab);
  if (open) setOpen(true);
  refresh();
  restartTimer();

  const handle: DevtoolsOverlayHandle = {
    get root() {
      return host;
    },
    get isOpen() {
      return open;
    },
    get tab() {
      return tab;
    },
    refresh,
    open() {
      setOpen(true);
      refresh();
    },
    close() {
      setOpen(false);
    },
    toggle() {
      setOpen(!open);
      if (open) refresh();
    },
    setTab(next) {
      setTab(next);
      setOpen(true);
      refresh();
    },
    selectNode,
    unmount() {
      if (refreshTimer != null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (hmrPoll != null) {
        clearInterval(hmrPoll);
        hmrPoll = null;
      }
      if (unsubHmr) {
        unsubHmr();
        unsubHmr = null;
      }
      if (releaseHmrUi) {
        releaseHmrUi();
        releaseHmrUi = null;
      }
      if (stopWatch) {
        stopWatch();
        stopWatch = null;
      }
      if (langObserver) {
        langObserver.disconnect();
        langObserver = null;
      }
      if (highlightRaf && document.defaultView) {
        document.defaultView.cancelAnimationFrame(highlightRaf);
        highlightRaf = 0;
      }
      document.removeEventListener("scroll", onViewport, true);
      document.defaultView?.removeEventListener("resize", onViewport);
      clearInspectHighlight();
      disableOversubscribeWarnings();
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      if (active === handle) active = null;
    },
  };

  active = handle;
  return handle;
}

/** Unmount the active overlay if any. */
export function unmountDevtoolsOverlay(): void {
  if (active) active.unmount();
}

/** Currently mounted overlay handle, or `null`. */
export function getDevtoolsOverlay(): DevtoolsOverlayHandle | null {
  return active;
}
