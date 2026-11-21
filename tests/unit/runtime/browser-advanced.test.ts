/**
 * @fileoverview `mount` 清空容器、去除 data-view-cloak、dispose 时再次清空 DOM。
 */
import { waitUntilComplete } from "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal, mount } from "@dreamer/view";
import {
  createRootTracked,
  getTrackedRoots,
  summarizeOwnerTree,
} from "@dreamer/view/devtools";

describe("runtime/browser (mount 细节)", () => {
  it("mount 前应清空容器子节点（含骨架屏占位）", async () => {
    const container = document.createElement("div");
    const old = document.createElement("p");
    old.textContent = "loading";
    container.appendChild(old);

    const [text] = createSignal("app");
    const dispose = mount(() => {
      const d = document.createElement("span");
      d.textContent = text();
      return d;
    }, container);

    await waitUntilComplete();
    expect(container.querySelector("p")).toBeNull();
    expect(container.textContent).toBe("app");
    dispose();
  });

  it("mount 应移除 data-view-cloak 并清空 display 内联样式", async () => {
    const container = document.createElement("div");
    container.setAttribute("data-view-cloak", "");
    container.style.display = "none";

    mount(() => document.createTextNode("x"), container);
    await waitUntilComplete();

    expect(container.hasAttribute("data-view-cloak")).toBe(false);
    expect(container.style.display).toBe("");
  });

  it("dispose 后应再次清空容器子节点", async () => {
    const container = document.createElement("div");
    const dispose = mount(() => document.createTextNode("y"), container);
    await waitUntilComplete();
    expect(container.textContent).toBe("y");
    dispose();
    expect(container.childNodes.length).toBe(0);
  });

  it("同一容器再次 mount 应 dispose 上一棵树", async () => {
    const container = document.createElement("div");
    const tick = createSignal(0);
    let runs = 0;
    mount(() => {
      createEffect(() => {
        tick();
        runs++;
      });
      return document.createTextNode("first");
    }, container);
    await waitUntilComplete();
    expect(runs).toBe(1);
    expect(container.textContent).toBe("first");

    mount(() => document.createTextNode("second"), container);
    await waitUntilComplete();
    expect(container.textContent).toBe("second");

    tick(1);
    await waitUntilComplete();
    expect(runs).toBe(1);
  });

  it("VIEW_DEV 下 mount 应登记 Owner 根，供开发工具总览与树使用", async () => {
    const g = globalThis as {
      VIEW_DEV?: boolean;
      __VIEW_CREATE_ROOT_TRACKED__?: typeof createRootTracked;
    };
    const prevDev = g.VIEW_DEV;
    const prevFn = g.__VIEW_CREATE_ROOT_TRACKED__;
    g.VIEW_DEV = true;
    g.__VIEW_CREATE_ROOT_TRACKED__ = createRootTracked;
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      const [text] = createSignal("hi");
      const dispose = mount(() => {
        const d = document.createElement("span");
        createEffect(() => {
          d.textContent = text();
        });
        return d;
      }, container);
      await waitUntilComplete();
      const roots = getTrackedRoots();
      expect(roots.length).toBe(1);
      const summary = summarizeOwnerTree(roots[0]!);
      expect(summary).not.toBeNull();
      expect((summary?.nodes ?? 0) > 0).toBe(true);
      dispose();
      expect(getTrackedRoots().length).toBe(0);
    } finally {
      container.remove();
      g.VIEW_DEV = prevDev;
      g.__VIEW_CREATE_ROOT_TRACKED__ = prevFn;
    }
  });
}, { sanitizeOps: false, sanitizeResources: false });
