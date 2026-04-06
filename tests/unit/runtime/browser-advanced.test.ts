/**
 * @fileoverview `mount` 清空容器、去除 data-view-cloak、dispose 时再次清空 DOM。
 */
import { waitUntilComplete } from "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, mount } from "@dreamer/view";

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
}, { sanitizeOps: false, sanitizeResources: false });
