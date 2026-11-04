/**
 * P2: DEV-only floating DevTools overlay (Next-inspired, multi-tab).
 * Production: mount is a no-op without VIEW_DEV; size baselines untouched.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import {
  getDevtoolsOverlay,
  mountDevtoolsOverlay,
  unmountDevtoolsOverlay,
} from "@dreamer/view/devtools/overlay";
import {
  clearTrackedRoots,
  createRootTracked,
  inspectOwnerIndexed,
} from "@dreamer/view/devtools";
import {
  createEffect,
  createSignal,
  getOwner,
} from "@dreamer/view/reactivity";
import { resetRegistry } from "../dom-setup.ts";

const g = globalThis as { VIEW_DEV?: boolean };

describe("devtools overlay (P2)", () => {
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
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
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("mount returns null when VIEW_DEV is off (no DOM)", () => {
    g.VIEW_DEV = false;
    const before = document.querySelectorAll("[data-dreamer-view-devtools]").length;
    const handle = mountDevtoolsOverlay();
    expect(handle).toBeNull();
    expect(getDevtoolsOverlay()).toBeNull();
    expect(document.querySelectorAll("[data-dreamer-view-devtools]").length).toBe(
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

  it("tabs: Overview / Tree / Signals / Warnings / Settings", () => {
    createRootTracked(() => {
      const a = createSignal(1);
      createEffect(() => a());
    });
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    const shadow = handle.root.shadowRoot!;
    for (const name of ["overview", "tree", "signals", "warnings", "settings"]) {
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
    const detail = shadow.querySelector("[data-el='tree-detail']")!.textContent!;
    expect(detail).toContain(childPath);
    expect(detail.toLowerCase()).toMatch(/upstream|downstream|depth/);
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
