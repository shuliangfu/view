/**
 * @fileoverview createSelector 与 DOM：For + 委托 onClick + 响应式 className（对齐 Performance 示例路径）。
 *
 * 注意：`onClick` 委托在 `document` 上监听，事件必须能冒泡到 `document`。
 * 测试容器须挂到文档树（如 `document.body`）；仅挂在内存中的游离节点上点击不会触发委托。
 */
import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSelector, createSignal, For } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("reactivity/selector DOM 集成", () => {
  /**
   * 与 examples Performance 页网格一致：For 子项为原生 button，onClick 委托、className 为函数并读 isSelected。
   */
  it("For 内 button：点击应更新 selectedId 与 className", async () => {
    const [selectedId, setSelectedId] = createSignal<number | null>(null);
    const isSelected = createSelector(selectedId);
    const list = [0, 1, 2];

    const fragment = For({
      each: () => list,
      children: (id: number) =>
        jsx("button", {
          type: "button",
          onClick: () => setSelectedId(id),
          className: () => (isSelected(id) ? "sel" : "nosel"),
        }),
    });

    const parent = document.createElement("div");
    document.body.appendChild(parent);
    try {
      parent.appendChild(fragment);
      await Promise.resolve();
      await Promise.resolve();

      const buttons = parent.querySelectorAll("button");
      expect(buttons.length).toBe(3);

      (buttons[1] as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();

      expect(selectedId()).toBe(1);
      expect((buttons[1] as HTMLButtonElement).className).toContain("sel");
      expect((buttons[0] as HTMLButtonElement).className).toContain("nosel");
    } finally {
      parent.remove();
    }
  });

  /**
   * 与 Performance 示例一致：同时存在 aria-pressed 与 className 两个响应式函数 prop。
   */
  it("For 内 button：aria-pressed 与 className 并存时点击仍应选中", async () => {
    const [selectedId, setSelectedId] = createSignal<number | null>(null);
    const isSelected = createSelector(selectedId);
    const list = [0, 1];

    const fragment = For({
      each: () => list,
      children: (id: number) =>
        jsx("button", {
          type: "button",
          "aria-pressed": () => String(isSelected(id)),
          onClick: () => setSelectedId(id),
          className: () => (isSelected(id) ? "sel" : "nosel"),
        }),
    });

    const parent = document.createElement("div");
    document.body.appendChild(parent);
    try {
      parent.appendChild(fragment);
      await Promise.resolve();
      await Promise.resolve();

      const btn = parent.querySelectorAll("button")[1] as HTMLButtonElement;
      btn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(selectedId()).toBe(1);
      expect(btn.className).toContain("sel");
    } finally {
      parent.remove();
    }
  });
}, { sanitizeOps: false, sanitizeResources: false });
