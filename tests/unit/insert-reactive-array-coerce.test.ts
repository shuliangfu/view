/**
 * `expandIrArray` 与 insertReactive 数组分支：compiler / runtime 共用规范，
 * 覆盖 VNode+MountFn 混排、嵌套数组、原始值、SignalRef。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, insertIrList, insertReactive } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";
import {
  coalesceIrList,
  expandIrArray,
  insertReactive as insertReactiveCompiler,
  markMountFn,
} from "@dreamer/view/compiler";

describe("insertReactive 数组规范化（主包 runtime）", () => {
  /**
   * 与同类方案 mapArray 的 `list() ?? []` 同向：expand 对 null/undefined 不抛错且得空列表。
   */
  it("expandIrArray(null/undefined) 与 coalesce 得空扁平列表", () => {
    expect(expandIrArray(null)).toEqual([]);
    expect(expandIrArray(undefined)).toEqual([]);
    expect(
      expandIrArray(coalesceIrList(null)),
    ).toEqual(
      [],
    );
    expect(
      expandIrArray(
        coalesceIrList([jsx("span", { children: "z" })]),
      ).length,
    ).toBe(1);
  });

  it("VNode 与 markMountFn 混排应全部挂载", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    try {
      insertReactive(parent, () => [
        jsx("span", { children: "a" }),
        markMountFn((p: Node) => {
          const s = globalThis.document.createElement("span");
          s.className = "mf";
          s.textContent = "b";
          p.appendChild(s);
        }),
        jsx("span", { children: "c" }),
      ]);
      expect(parent.textContent).toBe("abc");
    } finally {
      globalThis.document.body.removeChild(parent);
    }
  });

  it("嵌套数组与原始数字应落成文本节点", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    try {
      insertReactive(parent, () => [[jsx("span", { children: "x" })], 2, "y"]);
      expect(parent.textContent).toBe("x2y");
    } finally {
      globalThis.document.body.removeChild(parent);
    }
  });

  /**
   * 与 `<For>`` / `mapArray` 同向：列表源为 null 时等价 `[]`，后续有数据再挂载。
   */
  it("insertIrList：accessor 先 null 再数组应订阅更新", async () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const src = createSignal<unknown[] | null>(null);
    try {
      insertIrList(parent, () => src.value);
      await Promise.resolve();
      expect(parent.childNodes.length).toBe(0);
      src.value = [jsx("span", { children: "row" })];
      await Promise.resolve();
      expect(parent.textContent).toBe("row");
    } finally {
      globalThis.document.body.removeChild(parent);
    }
  });

  /**
   * 与同类方案 `<For fallback={…}>` 同向：扁平后无项时展示 fallback，有数据后切回列表。
   */
  it("insertIrList+fallback：空列表显示占位，有数据后渲染行", async () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const src = createSignal<unknown[] | null>(null);
    try {
      insertIrList(parent, () => src.value, {
        fallback: () => jsx("em", { children: "empty" }),
      });
      await Promise.resolve();
      expect(parent.textContent).toBe("empty");
      src.value = [jsx("span", { children: "cell" })];
      await Promise.resolve();
      expect(parent.textContent).toBe("cell");
      src.value = null;
      await Promise.resolve();
      expect(parent.textContent).toBe("empty");
    } finally {
      globalThis.document.body.removeChild(parent);
    }
  });

  it("数组内 SignalRef 应在 effect 内订阅", async () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const s = createSignal(1);
    try {
      insertReactive(parent, () => [jsx("span", { children: s })]);
      expect(parent.textContent).toBe("1");
      s.value = 2;
      await Promise.resolve();
      expect(parent.textContent).toBe("2");
    } finally {
      globalThis.document.body.removeChild(parent);
    }
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("insertReactive 数组规范化（@dreamer/view/compiler）", () => {
  it("混排与 compiler 路径一致", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    try {
      insertReactiveCompiler(parent, () => [
        jsx("i", { children: "i" }),
        markMountFn((p: Node) => {
          const b = globalThis.document.createElement("b");
          b.textContent = "B";
          p.appendChild(b);
        }),
      ]);
      expect(parent.innerHTML).toContain("i");
      expect(parent.innerHTML).toContain("<b>B</b>");
    } finally {
      globalThis.document.body.removeChild(parent);
    }
  });
}, { sanitizeOps: false, sanitizeResources: false });
