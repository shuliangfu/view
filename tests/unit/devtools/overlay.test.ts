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
  clearTrackedRoots,
  createRootTracked,
  inspectOwnerIndexed,
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

  it("footer has no VIEW_DEV status pill", () => {
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    expect(shadow.querySelector("[data-el='dev-pill']")).toBeNull();
    expect(shadow.querySelector(".foot")!.textContent).not.toMatch(/VIEW_DEV/);
    handle.unmount();
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
    expect(shadow.querySelector("[data-el='hmr-status']")!.textContent)
      .toContain(
        "Connected",
      );
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
    expect(shadow.querySelector("[data-el='hmr-status']")!.textContent)
      .toContain(
        "Reconnecting",
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
