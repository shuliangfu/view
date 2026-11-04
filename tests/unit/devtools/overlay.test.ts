/**
 * P2: DEV-only floating DevTools overlay (Next-inspired).
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
} from "@dreamer/view/devtools";
import { createEffect, createSignal } from "@dreamer/view/reactivity";
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
    const indicator = shadow!.querySelector(".indicator");
    expect(indicator).not.toBeNull();
    expect(handle!.isOpen).toBe(false);
  });

  it("open / Esc close / refresh update overview numbers", () => {
    createRootTracked(() => {
      const a = createSignal(1);
      const b = createSignal(2);
      createEffect(() => {
        a();
        b();
      });
    });
    const handle = mountDevtoolsOverlay({ refreshMs: 0, watchMisuse: false })!;
    handle.open();
    expect(handle.isOpen).toBe(true);
    const shadow = handle.root.shadowRoot!;
    const effects = shadow.querySelector("[data-el='n-effects']")!.textContent;
    expect(Number(effects)).toBeGreaterThanOrEqual(1);
    const panel = shadow.querySelector(".panel")!;
    expect(panel.classList.contains("open")).toBe(true);

    shadow.dispatchEvent?.(new Event("noop")); // keep happy-dom warm
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // Escape listener is on document with capture
    expect(handle.isOpen).toBe(false);

    handle.open();
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
