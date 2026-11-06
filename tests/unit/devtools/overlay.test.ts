/**
 * P2: DEV-only floating DevTools overlay (Next-inspired, multi-tab).
 * Production: mount is a no-op without VIEW_DEV; size baselines untouched.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import {
  type DreamerHmrBridge,
  type DreamerHmrSnapshot,
  getDevtoolsOverlay,
  getDreamerHmrBridge,
  mountDevtoolsOverlay,
  unmountDevtoolsOverlay,
} from "@dreamer/view/devtools/overlay";
import {
  clearComponentSetupNotes,
  clearTrackedRoots,
  createRootTracked,
  inspectOwnerIndexed,
  noteComponentSetup,
  uninstallOwnerDomTracking,
} from "@dreamer/view/devtools";
import { createEffect, createSignal, getOwner } from "@dreamer/view/reactivity";
import { resetRegistry } from "../dom-setup.ts";

const g = globalThis as { VIEW_DEV?: boolean };

describe("devtools overlay (P2)", () => {
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    document.documentElement.lang = "en-US";
    resetRegistry();
    clearTrackedRoots();
    unmountDevtoolsOverlay();
    try {
      globalThis.localStorage?.removeItem("dreamer-view-devtools-overlay");
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    unmountDevtoolsOverlay();
    clearTrackedRoots();
    clearComponentSetupNotes();
    uninstallOwnerDomTracking();
    document.querySelector("[data-dreamer-view-inspect]")?.remove();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("mount returns null when VIEW_DEV is off (no DOM)", () => {
    g.VIEW_DEV = false;
    const before =
      document.querySelectorAll("[data-dreamer-view-devtools]").length;
    const handle = mountDevtoolsOverlay();
    expect(handle).toBeNull();
    expect(getDevtoolsOverlay()).toBeNull();
    expect(document.querySelectorAll("[data-dreamer-view-devtools]").length)
      .toBe(
        before,
      );
  });

  it("mounts indicator in shadow root when VIEW_DEV is on", () => {
    createRootTracked(() => {
      const n = createSignal(0);
      createEffect(() => n());
    });
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false });
    expect(handle).not.toBeNull();
    expect(handle!.root.getAttribute("data-dreamer-view-devtools")).toBe(
      "overlay",
    );
    const shadow = handle!.root.shadowRoot;
    expect(shadow).not.toBeNull();
    expect(shadow!.querySelector(".indicator")).not.toBeNull();
    expect(handle!.isOpen).toBe(false);
  });

  it("panel has no footer bar (refresh lives in head)", () => {
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    expect(shadow.querySelector(".foot")).toBeNull();
    expect(shadow.querySelector("[data-el='dev-pill']")).toBeNull();
    expect(shadow.querySelector('[data-action="refresh"]')).not.toBeNull();
    handle.unmount();
  });

  it("float indicator is draggable (pointer) and header controls stay clickable", () => {
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    const shadow = handle.root.shadowRoot!;
    const wrap = shadow.querySelector(".wrap") as HTMLElement;
    const indicator = shadow.querySelector(".indicator") as HTMLElement;
    expect(indicator).not.toBeNull();
    expect(indicator.tagName).toBe("BUTTON");

    // happy-dom may lack PointerEvent; synthesize enough fields for bindDrag.
    const ptr = (
      type: string,
      init: {
        button?: number;
        clientX?: number;
        clientY?: number;
        pointerId?: number;
      },
    ) => {
      const ev = new Event(type, { bubbles: true }) as Event & {
        button: number;
        clientX: number;
        clientY: number;
        pointerId: number;
      };
      ev.button = init.button ?? 0;
      ev.clientX = init.clientX ?? 0;
      ev.clientY = init.clientY ?? 0;
      ev.pointerId = init.pointerId ?? 1;
      return ev;
    };

    // Regression: bindDrag must not treat the float <button> itself as a nested control.
    // Assert after move (before up): pointerup may snap-to-corner and clear transform near edges.
    indicator.dispatchEvent(ptr("pointerdown", { clientX: 20, clientY: 20 }));
    document.dispatchEvent(ptr("pointermove", { clientX: 60, clientY: 50 }));
    expect(wrap.style.transform).toMatch(/translate\(\s*40px\s*,\s*30px\s*\)/);
    document.dispatchEvent(ptr("pointerup", { clientX: 60, clientY: 50 }));

    // Header refresh/close still skip drag (nested button !== handleEl).
    handle.open();
    const close = shadow.querySelector(
      '[data-action="close"]',
    ) as HTMLButtonElement;
    close.dispatchEvent(
      ptr("pointerdown", { clientX: 10, clientY: 10, pointerId: 2 }),
    );
    // transform must not jump from a nested-control pointerdown
    const before = wrap.style.transform;
    document.dispatchEvent(
      ptr("pointermove", { clientX: 100, clientY: 100, pointerId: 2 }),
    );
    expect(wrap.style.transform).toBe(before);
    handle.close();
  });

  it("open hides float; panel shares wrap anchor; close restores float + offset", () => {
    const handle = mountDevtoolsOverlay({
      refreshMs: 0,
      watchMisuse: false,
      corner: "bottom-right",
    })!;
    const shadow = handle.root.shadowRoot!;
    const wrap = shadow.querySelector(".wrap") as HTMLElement;
    const indicator = shadow.querySelector(".indicator") as HTMLElement;
    const panel = shadow.querySelector(".panel") as HTMLElement;

    wrap.style.transform = "translate(-12px, -8px)";
    expect(indicator.classList.contains("hidden")).toBe(false);
    expect(panel.classList.contains("open")).toBe(false);

    handle.open();
    expect(handle.isOpen).toBe(true);
    expect(panel.classList.contains("open")).toBe(true);
    expect(indicator.classList.contains("hidden")).toBe(true);
    // Same wrap corner + drag offset = panel sits on the float's former anchor.
    expect(wrap.className).toMatch(/corner-br/);
    expect(wrap.style.transform).toBe("translate(-12px, -8px)");

    handle.close();
    expect(handle.isOpen).toBe(false);
    expect(panel.classList.contains("open")).toBe(false);
    expect(indicator.classList.contains("hidden")).toBe(false);
    expect(wrap.style.transform).toBe("translate(-12px, -8px)");
  });

  it("head-actions keeps refresh/close clickable and brand flexes", () => {
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    const head = shadow.querySelector(".head")!;
    const brand = shadow.querySelector(".head-brand")!;
    const actions = shadow.querySelector(".head-actions")!;
    const refresh = shadow.querySelector(
      '[data-action="refresh"]',
    ) as HTMLButtonElement;
    const close = shadow.querySelector(
      '[data-action="close"]',
    ) as HTMLButtonElement;
    expect(brand).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(refresh).not.toBeNull();
    expect(close).not.toBeNull();
    // brand before actions in DOM order
    expect(
      brand.compareDocumentPosition(actions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(actions.contains(refresh)).toBe(true);
    expect(actions.contains(close)).toBe(true);
    // CSS: brand flexes; head space-between; actions trailing
    const css = shadow.querySelector("style")!.textContent!;
    expect(css).toMatch(/\.head-brand\s*\{[^}]*flex:\s*1/);
    expect(css).toMatch(/\.head\s*\{[^}]*justify-content:\s*space-between/);
    expect(css).toMatch(/\.head-actions\s*\{[^}]*margin-left:\s*auto/);

    expect(handle.isOpen).toBe(true);
    close.click();
    expect(handle.isOpen).toBe(false);
    handle.open();
    expect(() => refresh.click()).not.toThrow();
    expect(handle.isOpen).toBe(true);
  });

  it("tabs: Overview / Tree / Signals / Warnings / Settings", () => {
    createRootTracked(() => {
      const a = createSignal(1);
      createEffect(() => a());
    });
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    for (
      const name of ["overview", "tree", "signals", "warnings", "settings"]
    ) {
      expect(shadow.querySelector(`[data-tab="${name}"]`)).not.toBeNull();
      expect(shadow.querySelector(`[data-pane="${name}"]`)).not.toBeNull();
    }
    handle.setTab("tree");
    expect(handle.tab).toBe("tree");
    expect(
      shadow.querySelector('[data-pane="tree"]')!.classList.contains("active"),
    ).toBe(true);
  });

  it("Tree selectNode highlights path and shows detail", () => {
    let rootOwner = null as ReturnType<typeof getOwner>;
    createRootTracked(() => {
      rootOwner = getOwner();
      const a = createSignal(1);
      const b = createSignal(2);
      createEffect(() => {
        a();
        b();
      });
    });
    const indexed = inspectOwnerIndexed(rootOwner, { rootId: "0" })!;
    expect(indexed.childNodes.length).toBeGreaterThanOrEqual(1);
    const childPath = indexed.childNodes[0]!.id;

    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.selectNode(childPath);
    expect(handle.tab).toBe("tree");
    expect(handle.isOpen).toBe(true);
    const shadow = handle.root.shadowRoot!;
    const selected = shadow.querySelector(".tree-row.selected");
    expect(selected).not.toBeNull();
    expect(selected!.getAttribute("data-path")).toBe(childPath);
    expect(selected!.getAttribute("aria-selected")).toBe("true");
    const detail = shadow.querySelector("[data-el='tree-detail']")!
      .textContent!;
    expect(detail).toContain(childPath);
    expect(detail.toLowerCase()).toMatch(/upstream|downstream|depth/);
    // Signal-only owners have no host elements — no page outline.
    expect(detail).toMatch(/No connected DOM/i);
    expect(document.querySelector("[data-dreamer-view-inspect]")).toBeNull();
  });

  it("Tree click toggle-clears selection on second click", () => {
    let rootOwner = null as ReturnType<typeof getOwner>;
    createRootTracked(() => {
      rootOwner = getOwner();
      const a = createSignal(1);
      createEffect(() => a());
    });
    const indexed = inspectOwnerIndexed(rootOwner, { rootId: "0" })!;
    const childPath = indexed.childNodes[0]!.id;
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.selectNode(childPath);
    const shadow = handle.root.shadowRoot!;
    expect(shadow.querySelector(".tree-row.selected")).not.toBeNull();
    const row = shadow.querySelector(
      `[data-path="${childPath}"]`,
    ) as HTMLElement;
    expect(row).not.toBeNull();
    row.click();
    expect(shadow.querySelector(".tree-row.selected")).toBeNull();
    const detail = shadow.querySelector("[data-el='tree-detail']")!
      .textContent!;
    expect(detail.length).toBeGreaterThan(0);
    handle.unmount();
  });

  it("Warnings pane has clear button and explicit empty state", () => {
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.setTab("warnings");
    const shadow = handle.root.shadowRoot!;
    const clearBtns = shadow.querySelectorAll("[data-action='clear-warns']");
    expect(clearBtns.length).toBeGreaterThanOrEqual(1);
    // Warnings tab itself includes a clear control (not only Settings)
    const warnPane = shadow.querySelector("[data-pane='warnings']")!;
    expect(warnPane.querySelector("[data-action='clear-warns']")).not
      .toBeNull();
    const empty = shadow.querySelector("[data-el='warn-empty']");
    expect(empty).not.toBeNull();
    expect(empty!.textContent!).toMatch(/No issues|未发现问题/i);
    expect(empty!.textContent!.length).toBeGreaterThan(20);
    handle.unmount();
  });

  it("route path change clears warnings and refreshes overview snapshot", async () => {
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    handle.setTab("warnings");
    const loc = globalThis.location ??
      (document.defaultView as Window).location;
    const hist = globalThis.history ?? (document.defaultView as Window).history;
    expect(loc).toBeTruthy();
    const orig = `${loc.pathname}${loc.search}${loc.hash}`;
    const next = orig.includes("?") ? `${orig}&__dv=1` : `${orig}?__dv=1`;
    hist.pushState({}, "", next);
    await Promise.resolve();
    await Promise.resolve();
    handle.setTab("warnings");
    expect(shadow.querySelector("[data-el='warn-empty']")).not.toBeNull();
    expect(shadow.querySelector("[data-el='n-effects']")).not.toBeNull();
    expect(shadow.querySelector("[data-el='n-effects']")!.textContent)
      .toBeTruthy();
    hist.replaceState({}, "", orig);
    await Promise.resolve();
    handle.unmount();
  });

  it("Warnings pane shows setup-rerun badge from auto notes", () => {
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    clearComponentSetupNotes();
    noteComponentSetup("DemoPage");
    noteComponentSetup("DemoPage");
    handle.refresh();
    handle.setTab("warnings");
    const shadow = handle.root.shadowRoot!;
    const badge = shadow.querySelector("[data-el='setup-rerun-badge']");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("1");
    expect(badge!.className).toContain("warn");
    const list = shadow.querySelector("[data-el='setup-rerun-list']")!
      .textContent!;
    expect(list).toContain("DemoPage");
    expect(list).toContain("×2");
    handle.unmount();
  });

  it("Signals filter narrows registry list", () => {
    createRootTracked(() => {
      createSignal(1, "alpha-probe");
      createSignal(2, "beta-probe");
    });
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.setTab("signals");
    const shadow = handle.root.shadowRoot!;
    const input = shadow.querySelector(
      "[data-el='sig-filter']",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    // positive: filter to alpha
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    let text = shadow.querySelector("[data-el='sig-list']")!.textContent!;
    expect(text).toContain("alpha-probe");
    expect(text.includes("beta-probe")).toBe(false);
    // negative
    input.value = "___no_match_zzz___";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    text = shadow.querySelector("[data-el='sig-list']")!.textContent!;
    expect(text.toLowerCase()).toMatch(/no sources match|no registry/);
  });

  it("open / Esc close / Ctrl+Shift+D toggle", () => {
    createRootTracked(() => {
      const a = createSignal(1);
      createEffect(() => a());
    });
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    expect(handle.isOpen).toBe(true);
    const shadow = handle.root.shadowRoot!;
    expect(
      Number(shadow.querySelector("[data-el='n-effects']")!.textContent),
    ).toBeGreaterThanOrEqual(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handle.isOpen).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "D",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(handle.isOpen).toBe(true);
    handle.close();
    expect(handle.isOpen).toBe(false);
  });

  it("unmount removes host and clears singleton", () => {
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.unmount();
    expect(getDevtoolsOverlay()).toBeNull();
    expect(document.querySelector("[data-dreamer-view-devtools]")).toBeNull();
  });

  it("Tree empty state explains createRootTracked / trackRoot (zh+en)", () => {
    clearTrackedRoots();
    document.documentElement.lang = "en";
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    handle.setTab("tree");
    const shadow = handle.root.shadowRoot!;
    const empty = shadow.querySelector("[data-el='tree-list']")!.textContent!;
    expect(empty).toMatch(/No Owner roots/i);
    expect(empty).toMatch(/createRootTracked/);
    handle.unmount();

    document.documentElement.lang = "zh-CN";
    const handleZh = mountDevtoolsOverlay({
      refreshMs: 0,
      watchMisuse: false,
    })!;
    handleZh.open();
    handleZh.setTab("tree");
    const zh = handleZh.root.shadowRoot!.querySelector(
      "[data-el='tree-list']",
    )!.textContent!;
    expect(zh).toMatch(/Owner/);
    expect(zh).toMatch(/createRootTracked/);
    handleZh.unmount();
  });

  it("Tree filter miss uses noTreeMatch when roots exist", () => {
    createRootTracked(() => {
      const a = createSignal(1);
      createEffect(() => a());
    });
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    handle.setTab("tree");
    const shadow = handle.root.shadowRoot!;
    const filter = shadow.querySelector(
      "[data-el='tree-filter']",
    ) as HTMLInputElement;
    filter.value = "zzz-no-such-kind";
    filter.dispatchEvent(new Event("input", { bubbles: true }));
    const list = shadow.querySelector("[data-el='tree-list']")!.textContent!;
    expect(list).toMatch(/No nodes match|没有匹配/);
    handle.unmount();
  });
});

describe("devtools overlay HMR bridge integration", () => {
  let prevDev: boolean | undefined;
  const gAny = globalThis as Record<string, unknown>;

  const installMockBridge = () => {
    let snap: DreamerHmrSnapshot = {
      connection: "connected",
      updateCount: 3,
      successCount: 2,
      failureCount: 1,
      lastUpdateTime: Date.now(),
      updating: false,
      lastProgressPath: null,
    };
    const listeners = new Set<(s: DreamerHmrSnapshot) => void>();
    const claimers = new Set<string>();
    const bridge: DreamerHmrBridge = {
      version: 1,
      getSnapshot: () => ({ ...snap }),
      subscribe: (listener) => {
        listeners.add(listener);
        listener({ ...snap });
        return () => {
          listeners.delete(listener);
        };
      },
      claimUi: (id = "test") => {
        claimers.add(id);
        return () => {
          claimers.delete(id);
        };
      },
      isUiClaimed: () => claimers.size > 0,
    };
    gAny.__DREAMER_HMR__ = bridge;
    return {
      bridge,
      claimers,
      push(partial: Partial<DreamerHmrSnapshot>) {
        snap = { ...snap, ...partial };
        for (const l of listeners) l({ ...snap });
      },
    };
  };

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
    clearTrackedRoots();
    unmountDevtoolsOverlay();
    delete gAny.__DREAMER_HMR__;
    try {
      globalThis.localStorage?.removeItem("dreamer-view-devtools-overlay");
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    unmountDevtoolsOverlay();
    clearTrackedRoots();
    clearComponentSetupNotes();
    uninstallOwnerDomTracking();
    delete gAny.__DREAMER_HMR__;
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("getDreamerHmrBridge returns null without bridge", () => {
    expect(getDreamerHmrBridge()).toBeNull();
  });

  it("claims HMR UI on mount and releases on unmount", () => {
    const mock = installMockBridge();
    expect(mock.bridge.isUiClaimed()).toBe(false);
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    expect(mock.bridge.isUiClaimed()).toBe(true);
    expect(mock.claimers.has("view-devtools-overlay")).toBe(true);
    handle.open();
    const shadow = handle.root.shadowRoot!;
    expect(shadow.querySelector("[data-el='hmr-badge']")!.textContent)
      .toContain(
        "Connected",
      );
    expect(shadow.querySelector("[data-el='hmr-dot']")!.className).toContain(
      "ok",
    );
    expect(shadow.querySelector("[data-el='hmr-status']")).toBeNull();
    expect(shadow.querySelector("[data-el='hmr-updates']")!.textContent).toBe(
      "3",
    );
    handle.unmount();
    expect(mock.bridge.isUiClaimed()).toBe(false);
  });

  it("live-updates HMR card via subscribe", () => {
    const mock = installMockBridge();
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    mock.push({
      connection: "reconnecting",
      updateCount: 9,
      successCount: 8,
      failureCount: 1,
    });
    expect(shadow.querySelector("[data-el='hmr-badge']")!.textContent)
      .toContain(
        "Reconnecting",
      );
    expect(shadow.querySelector("[data-el='hmr-dot']")!.className).toContain(
      "warn",
    );
    expect(shadow.querySelector("[data-el='hmr-updates']")!.textContent).toBe(
      "9",
    );
    handle.unmount();
  });

  it("status-dot stays green when HMR connected after warnings refresh", () => {
    installMockBridge();
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    const shadow = handle.root.shadowRoot!;
    const dot = shadow.querySelector("[data-el='status-dot']") as HTMLElement;
    expect(dot.className).toContain("ok");
    expect(dot.className).not.toContain("hidden");
    // refresh runs renderWarnings; must not wipe HMR green to bare gray `.dot`
    handle.refresh();
    expect(dot.className).toContain("ok");
    expect(dot.classList.contains("warn")).toBe(false);
    handle.unmount();
  });

  it("status-dot stays green when HMR connected even with misuse warnings", () => {
    // Root cause regression: warnings.length > 0 used to force status-dot
    // to `.warn` (amber) while Overview → HMR stayed green “Connected”.
    createRootTracked(() => {
      const sigs = Array.from({ length: 10 }, () => createSignal(0));
      createEffect(() => {
        for (const s of sigs) s();
      });
    });
    installMockBridge();
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.refresh();
    const shadow = handle.root.shadowRoot!;
    const warnCount = shadow.querySelector("[data-el='warn-count']")!;
    expect(Number(warnCount.textContent)).toBeGreaterThan(0);
    const floatWarn = shadow.querySelector(
      "[data-el='float-warn-badge']",
    ) as HTMLElement;
    expect(floatWarn.classList.contains("hidden")).toBe(false);
    expect(Number(floatWarn.textContent)).toBeGreaterThan(0);
    const dot = shadow.querySelector("[data-el='status-dot']") as HTMLElement;
    expect(dot.className).toContain("ok");
    expect(dot.classList.contains("warn")).toBe(false);
    expect(shadow.querySelector("[data-el='hmr-badge']")!.textContent)
      .toContain("Connected");
    expect(shadow.querySelector("[data-el='hmr-dot']")!.className).toContain(
      "ok",
    );
    handle.unmount();
  });

  it("status-dot follows HMR reconnecting (amber) independent of warn pill", () => {
    createRootTracked(() => {
      const sigs = Array.from({ length: 10 }, () => createSignal(0));
      createEffect(() => {
        for (const s of sigs) s();
      });
    });
    const mock = installMockBridge();
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.refresh();
    const shadow = handle.root.shadowRoot!;
    expect(
      Number(shadow.querySelector("[data-el='warn-count']")!.textContent),
    ).toBeGreaterThan(0);
    mock.push({ connection: "reconnecting" });
    const dot = shadow.querySelector("[data-el='status-dot']") as HTMLElement;
    // Amber here means HMR reconnecting — not misuse overriding connected green
    expect(dot.className).toContain("warn");
    expect(
      shadow.querySelector("[data-el='float-warn-badge']")!.classList.contains(
        "hidden",
      ),
    ).toBe(false);
    handle.unmount();
  });
});

describe("devtools inspectOwnerIndexed", () => {
  let prevDev: boolean | undefined;
  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
    clearTrackedRoots();
  });
  afterEach(() => {
    clearTrackedRoots();
    uninstallOwnerDomTracking();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("assigns stable path ids", () => {
    let owner = null as ReturnType<typeof getOwner>;
    createRootTracked(() => {
      owner = getOwner();
      createEffect(() => createSignal(0)());
    });
    const snap = inspectOwnerIndexed(owner, { rootId: "0" })!;
    expect(snap.id).toBe("0");
    expect(snap.childNodes[0]?.id.startsWith("0/")).toBe(true);
  });
});

describe("devtools overlay i18n (page lang, no switcher)", () => {
  let prevDev: boolean | undefined;
  let prevLang: string;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
    clearTrackedRoots();
    unmountDevtoolsOverlay();
    prevLang = document.documentElement.lang;
    try {
      globalThis.localStorage?.removeItem("dreamer-view-devtools-overlay");
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    unmountDevtoolsOverlay();
    clearTrackedRoots();
    clearComponentSetupNotes();
    uninstallOwnerDomTracking();
    document.documentElement.lang = prevLang;
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("follows documentElement.lang zh-CN → Chinese chrome (no locale UI)", () => {
    document.documentElement.lang = "zh-CN";
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    expect(shadow.querySelector(".head-title")!.textContent).toContain(
      "开发工具",
    );
    expect(shadow.querySelector('[data-tab="overview"]')!.textContent)
      .toContain(
        "总览",
      );
    const settings = shadow.querySelector('[data-pane="settings"]')!
      .textContent!;
    expect(settings).not.toMatch(/Language|语言选择|locale switch/i);
    expect(shadow.querySelector("#dv-locale, [data-el='opt-locale']"))
      .toBeNull();
  });

  it("follows documentElement.lang en → English chrome", () => {
    document.documentElement.lang = "en-US";
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    expect(shadow.querySelector(".head-title")!.textContent).toContain(
      "View DevTools",
    );
    expect(shadow.querySelector('[data-tab="overview"]')!.textContent)
      .toContain(
        "Overview",
      );
  });

  it("updating html[lang] re-applies chrome without remount", () => {
    document.documentElement.lang = "en";
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    expect(shadow.querySelector(".head-title")!.textContent).toContain(
      "View DevTools",
    );
    document.documentElement.lang = "zh-CN";
    handle.refresh();
    expect(shadow.querySelector(".head-title")!.textContent).toContain(
      "开发工具",
    );
    expect(shadow.querySelector('[data-tab="settings"]')!.textContent)
      .toContain(
        "设置",
      );
  });
});
