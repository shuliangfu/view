/**
 * @module @dreamer/view/devtools/overlay
 * @description DEV-only floating indicator + panel (Next.js Dev Overlay–inspired).
 *
 * Opt-in: call {@link mountDevtoolsOverlay} from a DEV entry (examples / docs /
 * scaffold). **Never** auto-mounted by the framework. Requires
 * `globalThis.VIEW_DEV === true`; otherwise returns `null` and creates no DOM.
 *
 * Not re-exported from the main barrel, `/reactivity`, or even
 * `@dreamer/view/devtools` — so size / consumer-bundle measured entries stay
 * unchanged when apps do not import this subpath.
 *
 * Reuses `@dreamer/view/devtools` APIs only (Owner summary, registry sources,
 * oversubscribe / remount warnings). Does **not** patch createSignal /
 * createRoot / insert.
 */

import type { Owner } from "../reactivity/owner.ts";
import {
  detectOversubscribe,
  disableOversubscribeWarnings,
  enableOversubscribeWarnings,
  getTrackedRoots,
  isViewDev,
  type OversubscribeWarning,
  snapshotRegistrySources,
  summarizeOwnerTree,
  type OwnerTreeSummary,
} from "../devtools.ts";

export type DevtoolsOverlayCorner = "bottom-left" | "bottom-right";

export interface MountDevtoolsOverlayOptions {
  /** Indicator corner. Default `bottom-left` (Next-like). */
  corner?: DevtoolsOverlayCorner;
  /** Primary Owner to summarize; otherwise aggregates {@link getTrackedRoots}. */
  owner?: Owner | null;
  /**
   * Live refresh interval (ms). Default `1000`.
   * Set `0` for manual refresh only.
   */
  refreshMs?: number;
  /**
   * Wire {@link enableOversubscribeWarnings} into the Warnings section.
   * Default `true`. Still requires `VIEW_DEV`.
   */
  watchMisuse?: boolean;
  /** Mount parent. Default `document.body`. */
  parent?: HTMLElement;
  /** z-index for the host. Default `2147483000`. */
  zIndex?: number;
}

export interface DevtoolsOverlayHandle {
  /** Re-scan Owners / sources / warnings. */
  refresh(): void;
  /** Expand the panel. */
  open(): void;
  /** Collapse the panel. */
  close(): void;
  /** Toggle open/closed. */
  toggle(): void;
  /** Remove indicator + panel and stop watchers. */
  unmount(): void;
  /** Host element attached to the document (open shadow root inside). */
  readonly root: HTMLElement;
  /** Whether the detail panel is expanded. */
  readonly isOpen: boolean;
}

const HOST_ATTR = "data-dreamer-view-devtools";
const STYLE_ID = "dreamer-view-devtools-overlay-css";

let active: DevtoolsOverlayHandle | null = null;

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
  align-items: flex-start;
  gap: 10px;
  pointer-events: none;
  bottom: 16px;
  left: 16px;
  right: auto;
}
.wrap.corner-br {
  left: auto;
  right: 16px;
  align-items: flex-end;
}

.panel {
  pointer-events: auto;
  width: min(380px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  display: none;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: linear-gradient(
      165deg,
      rgba(28, 28, 32, 0.92) 0%,
      rgba(14, 14, 18, 0.94) 100%
    );
  backdrop-filter: blur(18px) saturate(1.35);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.35),
    0 18px 48px rgba(0, 0, 0, 0.45),
    0 2px 8px rgba(0, 0, 0, 0.35);
  color: #e8e8ec;
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  transform-origin: bottom left;
  transition:
    opacity 140ms ease,
    transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.wrap.corner-br .panel { transform-origin: bottom right; }
.panel.open {
  display: flex;
  opacity: 1;
  transform: translateY(0) scale(1);
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.head-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #3b82f6, #1d4ed8);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: -0.02em;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
  flex-shrink: 0;
}
.head-text { flex: 1; min-width: 0; }
.head-title {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.head-sub {
  margin: 2px 0 0;
  font-size: 11px;
  color: rgba(232, 232, 236, 0.55);
  letter-spacing: 0.01em;
}
.icon-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: rgba(232, 232, 236, 0.65);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.icon-btn:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.7);
  outline-offset: 1px;
}

.body {
  flex: 1;
  overflow: auto;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.2) transparent;
}

.section {
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03);
  padding: 10px 10px 8px;
}
.section-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(232, 232, 236, 0.55);
}
.badge {
  font-size: 10px;
  font-weight: 650;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(232, 232, 236, 0.75);
}
.badge.warn {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
}
.badge.ok {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.stat {
  text-align: center;
  padding: 8px 4px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
}
.stat-n {
  display: block;
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: #f4f4f5;
  line-height: 1.15;
}
.stat-l {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: rgba(232, 232, 236, 0.5);
  letter-spacing: 0.02em;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 140px;
  overflow: auto;
}
.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.18);
  font-size: 12px;
}
.row-k {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(232, 232, 236, 0.85);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}
.row-v {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: rgba(232, 232, 236, 0.55);
  font-size: 11px;
}
.warn-item {
  padding: 8px 9px;
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.28);
  background: rgba(245, 158, 11, 0.08);
  font-size: 11.5px;
  line-height: 1.45;
  color: rgba(253, 230, 138, 0.95);
}
.warn-kind {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fbbf24;
  margin-bottom: 3px;
}
.empty {
  margin: 0;
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: rgba(232, 232, 236, 0.45);
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.ghost {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(232, 232, 236, 0.85);
  font-size: 11.5px;
  font-weight: 550;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.ghost:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.2);
}
.pill {
  font-size: 10.5px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.14);
  color: #4ade80;
  letter-spacing: 0.02em;
}
.pill.off {
  background: rgba(248, 113, 113, 0.14);
  color: #f87171;
}

.indicator {
  pointer-events: auto;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(
    160deg,
    rgba(32, 32, 38, 0.92),
    rgba(12, 12, 16, 0.95)
  );
  backdrop-filter: blur(14px) saturate(1.3);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(0, 0, 0, 0.25);
  color: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  position: relative;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}
.indicator:hover {
  transform: translateY(-1px) scale(1.03);
  border-color: rgba(96, 165, 250, 0.45);
  box-shadow:
    0 10px 32px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(59, 130, 246, 0.25);
}
.indicator:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.8);
  outline-offset: 2px;
}
.indicator-mark {
  font-weight: 750;
  font-size: 15px;
  letter-spacing: -0.04em;
  background: linear-gradient(180deg, #93c5fd, #3b82f6);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 1.5px solid rgba(12, 12, 16, 0.95);
  background: #22c55e;
}
.dot.warn { background: #f59e0b; }
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

function collectSummary(primary: Owner | null | undefined): OwnerTreeSummary {
  const parts: OwnerTreeSummary[] = [];
  const seen = new Set<Owner>();
  if (primary) {
    const s = summarizeOwnerTree(primary);
    if (s) {
      parts.push(s);
      seen.add(primary);
    }
  }
  for (const root of getTrackedRoots()) {
    if (seen.has(root)) continue;
    const s = summarizeOwnerTree(root);
    if (s) parts.push(s);
  }
  return parts.length ? mergeSummaries(parts) : emptySummary();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Mount the Next-inspired DEV floating indicator + panel.
 * Returns `null` when `VIEW_DEV` is off or there is no `document` (SSR / prod).
 * Calling again replaces any previous overlay.
 */
export function mountDevtoolsOverlay(
  options?: MountDevtoolsOverlayOptions,
): DevtoolsOverlayHandle | null {
  if (!isViewDev()) return null;
  if (typeof document === "undefined" || !document.body) return null;

  if (active) active.unmount();

  const corner = options?.corner ?? "bottom-left";
  const refreshMs = options?.refreshMs ?? 1000;
  const watchMisuse = options?.watchMisuse !== false;
  const parent = options?.parent ?? document.body;
  const zIndex = options?.zIndex ?? 2_147_483_000;
  const primaryOwner: Owner | null = options?.owner ?? null;

  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "overlay");
  host.style.cssText =
    `position:fixed;inset:0;pointer-events:none;z-index:${zIndex}`;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = `wrap${corner === "bottom-right" ? " corner-br" : ""}`;
  wrap.style.setProperty("--dv-z", String(zIndex));

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "View DevTools");
  panel.innerHTML = `
    <div class="head">
      <div class="head-mark" aria-hidden="true">V</div>
      <div class="head-text">
        <p class="head-title">View DevTools</p>
        <p class="head-sub">Development overlay</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="body">
      <section class="section" data-sec="overview">
        <div class="section-h">
          <h3 class="section-title">Overview</h3>
          <span class="badge" data-el="roots-badge">0 roots</span>
        </div>
        <div class="stats">
          <div class="stat"><span class="stat-n" data-el="n-effects">0</span><span class="stat-l">effects</span></div>
          <div class="stat"><span class="stat-n" data-el="n-memos">0</span><span class="stat-l">memos</span></div>
          <div class="stat"><span class="stat-n" data-el="n-nodes">0</span><span class="stat-l">nodes</span></div>
          <div class="stat"><span class="stat-n" data-el="n-edges">0</span><span class="stat-l">up edges</span></div>
        </div>
      </section>
      <section class="section" data-sec="warnings">
        <div class="section-h">
          <h3 class="section-title">Warnings</h3>
          <span class="badge ok" data-el="warn-badge">0</span>
        </div>
        <div data-el="warn-list"></div>
      </section>
      <section class="section" data-sec="sources">
        <div class="section-h">
          <h3 class="section-title">Sources</h3>
          <span class="badge" data-el="src-badge">top</span>
        </div>
        <ul class="list" data-el="src-list"></ul>
      </section>
    </div>
    <div class="foot">
      <button type="button" class="ghost" data-action="refresh">↻ Refresh</button>
      <span class="pill" data-el="dev-pill">VIEW_DEV · on</span>
    </div>
  `;

  const indicator = document.createElement("button");
  indicator.type = "button";
  indicator.className = "indicator";
  indicator.setAttribute("aria-label", "Open View DevTools");
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

  let open = false;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let stopWatch: (() => void) | null = null;
  const warnings: OversubscribeWarning[] = [];

  const setOpen = (next: boolean) => {
    open = next;
    panel.classList.toggle("open", open);
    indicator.setAttribute("aria-expanded", open ? "true" : "false");
    indicator.setAttribute(
      "aria-label",
      open ? "Close View DevTools" : "Open View DevTools",
    );
  };

  const renderWarnings = () => {
    const list = el("[data-el='warn-list']");
    const badge = el("[data-el='warn-badge']");
    const dot = el("[data-el='status-dot']");
    if (!list || !badge || !dot) return;
    const n = warnings.length;
    badge.textContent = String(n);
    badge.className = n > 0 ? "badge warn" : "badge ok";
    if (n > 0) {
      dot.className = "dot warn";
      list.innerHTML = warnings
        .slice(0, 8)
        .map(
          (w) =>
            `<div class="warn-item"><div class="warn-kind">${escapeHtml(w.kind)}</div>${escapeHtml(w.message)}</div>`,
        )
        .join("");
    } else {
      dot.className = "dot";
      list.innerHTML = `<p class="empty">No issues detected</p>`;
    }
  };

  const render = () => {
    const summary = collectSummary(primaryOwner);
    const tracked = getTrackedRoots();
    const rootCount = new Set(
      [primaryOwner, ...tracked].filter(Boolean) as Owner[],
    ).size;
    const rootsBadge = el("[data-el='roots-badge']");
    if (rootsBadge) {
      const label = rootCount === 1 ? "root" : "roots";
      rootsBadge.textContent =
        `${rootCount} ${label} · depth ${summary.maxDepth}`;
    }
    const setN = (key: string, v: number) => {
      const n = el(`[data-el='${key}']`);
      if (n) n.textContent = String(v);
    };
    setN("n-effects", summary.effects);
    setN("n-memos", summary.memos);
    setN("n-nodes", summary.nodes);
    setN("n-edges", summary.upstreamEdges);

    // One-shot detect into warnings (dedupe by message)
    const scanned = detectOversubscribe(primaryOwner, {
      remountKeys: [],
    });
    for (const root of getTrackedRoots()) {
      if (root === primaryOwner) continue;
      scanned.push(...detectOversubscribe(root));
    }
    const seen = new Set(warnings.map((w) => w.message));
    for (const w of scanned) {
      if (!seen.has(w.message)) {
        seen.add(w.message);
        warnings.push(w);
      }
    }
    // Cap stored warnings
    if (warnings.length > 24) warnings.splice(0, warnings.length - 24);
    renderWarnings();

    const sources = snapshotRegistrySources()
      .slice()
      .sort((a, b) => b.observers - a.observers)
      .slice(0, 8);
    const srcList = el("[data-el='src-list']");
    const srcBadge = el("[data-el='src-badge']");
    if (srcBadge) srcBadge.textContent = sources.length ? "by observers" : "—";
    if (srcList) {
      if (!sources.length) {
        srcList.innerHTML =
          `<li class="empty" style="list-style:none">No registry sources yet</li>`;
      } else {
        srcList.innerHTML = sources
          .map(
            (s) =>
              `<li class="row"><span class="row-k" title="${escapeHtml(s.id)}">${escapeHtml(s.id)}</span><span class="row-v">${s.observers} obs</span></li>`,
          )
          .join("");
      }
    }

    const pill = el("[data-el='dev-pill']");
    if (pill) {
      const on = isViewDev();
      pill.textContent = on ? "VIEW_DEV · on" : "VIEW_DEV · off";
      pill.className = on ? "pill" : "pill off";
    }
  };

  const onWarn = (w: OversubscribeWarning) => {
    if (warnings.some((x) => x.message === w.message)) return;
    warnings.push(w);
    renderWarnings();
  };

  const refresh = () => {
    render();
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && open) {
      ev.stopPropagation();
      setOpen(false);
    }
  };

  indicator.addEventListener("click", () => {
    setOpen(!open);
    if (open) refresh();
  });
  panel.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    setOpen(false);
  });
  panel.querySelector('[data-action="refresh"]')?.addEventListener(
    "click",
    () => refresh(),
  );
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
      // VIEW_DEV race — ignore
    }
  }

  refresh();
  if (refreshMs > 0) {
    refreshTimer = setInterval(refresh, refreshMs);
  }

  const handle: DevtoolsOverlayHandle = {
    get root() {
      return host;
    },
    get isOpen() {
      return open;
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
    unmount() {
      if (refreshTimer != null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (stopWatch) {
        stopWatch();
        stopWatch = null;
      }
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
