/**
 * compileSource 路径下 `insertReactive(parent, () => [VNode, …])`（如 Table tbody 的 map/flatMap）
 * 须挂载多个兄弟节点；主包 runtime.insertReactive 与 compiler/insert 须一致支持纯 VNode[]。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, insertReactive } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

describe(
  "insertReactive：getter 返回 VNode[]（compileSource / tbody 多行）",
  () => {
    it("应在父节点下挂载多个元素", () => {
      const parent = globalThis.document.createElement("tbody");
      globalThis.document.body.appendChild(parent);

      const dispose = insertReactive(parent, () => [
        jsx("tr", {
          children: jsx("td", { children: "a" }),
        }),
        jsx("tr", {
          children: jsx("td", { children: "b" }),
        }),
      ]);

      const rows = parent.querySelectorAll("tr");
      expect(rows.length).toBe(2);
      expect(rows[0]?.textContent).toBe("a");
      expect(rows[1]?.textContent).toBe("b");

      dispose();
      globalThis.document.body.removeChild(parent);
    });

    /**
     * 深度优化：数组分支在结构仍 {@link canPatchIntrinsic} 时保留各兄弟 Element，不全量 detach+重挂。
     */
    it("结构兼容时第二轮更新应保留各 tr 引用", async () => {
      const parent = globalThis.document.createElement("tbody");
      globalThis.document.body.appendChild(parent);
      const s = createSignal(0);
      insertReactive(parent, () => [
        jsx("tr", {
          children: jsx("td", { children: `a${s.value}` }),
        }),
        jsx("tr", {
          children: jsx("td", { children: "b" }),
        }),
      ]);
      const rows0 = parent.querySelectorAll("tr");
      expect(rows0.length).toBe(2);
      const tr0 = rows0[0]!;
      const tr1 = rows0[1]!;
      s.value = 1;
      await Promise.resolve();
      const rows1 = parent.querySelectorAll("tr");
      expect(rows1.length).toBe(2);
      expect(rows1[0]).toBe(tr0);
      expect(rows1[1]).toBe(tr1);
      expect(tr0.textContent).toBe("a1");
      expect(tr1.textContent).toBe("b");
      globalThis.document.body.removeChild(parent);
    });

    /**
     * 带稳定 key 时顺序变化应按键重排 DOM 并 patch，而非 detach 后重挂；行节点引用保留。
     */
    it("key 重排后应保留 tr 引用并更新文本", async () => {
      const parent = globalThis.document.createElement("tbody");
      globalThis.document.body.appendChild(parent);
      const order = createSignal<"ab" | "ba">("ab");
      insertReactive(parent, () =>
        order.value === "ab"
          ? [
            jsx("tr", {
              key: "a",
              children: jsx("td", { children: "row-a" }),
            }),
            jsx("tr", {
              key: "b",
              children: jsx("td", { children: "row-b" }),
            }),
          ]
          : [
            jsx("tr", {
              key: "b",
              children: jsx("td", { children: "row-b-2" }),
            }),
            jsx("tr", {
              key: "a",
              children: jsx("td", { children: "row-a-2" }),
            }),
          ]);
      const rows0 = parent.querySelectorAll("tr");
      expect(rows0.length).toBe(2);
      const trA = rows0[0]!;
      const trB = rows0[1]!;
      expect(trA.textContent).toBe("row-a");
      expect(trB.textContent).toBe("row-b");

      order.value = "ba";
      await Promise.resolve();
      const rows1 = parent.querySelectorAll("tr");
      expect(rows1.length).toBe(2);
      expect(rows1[0]).toBe(trB);
      expect(rows1[1]).toBe(trA);
      expect(rows1[0]!.textContent).toBe("row-b-2");
      expect(rows1[1]!.textContent).toBe("row-a-2");

      globalThis.document.body.removeChild(parent);
    });

    /**
     * keyed 列表删行：移除的 tr 走 orphan 摘除，保留行 DOM 引用不变。
     */
    it("key 协调删行后应保留剩余 tr 引用", async () => {
      const parent = globalThis.document.createElement("tbody");
      globalThis.document.body.appendChild(parent);
      const wide = createSignal(true);
      insertReactive(parent, () =>
        wide.value
          ? [
            jsx("tr", {
              key: "x",
              children: jsx("td", { children: "x" }),
            }),
            jsx("tr", {
              key: "y",
              children: jsx("td", { children: "y" }),
            }),
          ]
          : [
            jsx("tr", {
              key: "y",
              children: jsx("td", { children: "y-2" }),
            }),
          ]);
      const rows0 = parent.querySelectorAll("tr");
      expect(rows0.length).toBe(2);
      const trX = rows0[0]!;
      const trY = rows0[1]!;

      wide.value = false;
      await Promise.resolve();
      const rows1 = parent.querySelectorAll("tr");
      expect(rows1.length).toBe(1);
      expect(rows1[0]).toBe(trY);
      expect(rows1[0]!.textContent).toBe("y-2");
      expect(trX.parentNode).toBeNull();

      globalThis.document.body.removeChild(parent);
    });

    /**
     * keyed 列表增行：旧节点复用，新节点挂载后顺序正确（用 div 避免表格解析对 fragment 的干扰）。
     */
    it("key 协调增行应复用旧项并追加新项", async () => {
      const parent = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(parent);
      const wide = createSignal(false);
      insertReactive(parent, () =>
        wide.value
          ? [
            jsx("div", { key: "p", children: "p-2" }),
            jsx("div", { key: "q", children: "q-new" }),
          ]
          : [jsx("div", { key: "p", children: "p-1" })]);
      const elP = parent.querySelector("div")!;
      expect(elP.textContent).toBe("p-1");

      wide.value = true;
      await Promise.resolve();
      const rows = parent.querySelectorAll("div");
      expect(rows.length).toBe(2);
      expect(rows[0]).toBe(elP);
      expect(rows[0]!.textContent).toBe("p-2");
      expect(rows[1]!.textContent).toBe("q-new");

      globalThis.document.body.removeChild(parent);
    });
  },
  { sanitizeOps: false, sanitizeResources: false },
);

/**
 * 手写 jsx / 函数组件 `() => VNode` 时整块走 insertReactive+尾锚点；后兄弟 `{() => <p/>}` 整节点替换会使尾锚点脱离文档，
 * 须用「首追踪节点的前兄弟」恢复位置（与 compiler 路径下外层 MountFn 不重跑的行为差）。
 */
describe(
  "insertReactive：尾锚点失效时恢复兄弟序（jsx runtime / Table 文档）",
  () => {
    it("后一兄弟块先替换整节点，再更新前一响应块，顺序仍为 marker → table → para", async () => {
      const parent = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(parent);
      const marker = globalThis.document.createElement("span");
      marker.id = "marker";
      parent.appendChild(marker);

      const tableSig = createSignal(0);
      const paraSig = createSignal(0);

      const disposeTable = insertReactive(parent, () =>
        jsx("div", {
          id: "table",
          children: `t${tableSig.value}`,
        }));
      const disposePara = insertReactive(parent, () =>
        jsx("p", {
          id: "para",
          children: `p${paraSig.value}`,
        }));

      paraSig.value = 1;
      await new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
      tableSig.value = 1;
      await new Promise<void>((r) => globalThis.queueMicrotask(() => r()));

      const children = Array.from(parent.children);
      const markerIdx = children.findIndex((n) =>
        (n as HTMLElement).id === "marker"
      );
      const tableIdx = children.findIndex((n) =>
        (n as HTMLElement).id === "table"
      );
      const paraIdx = children.findIndex((n) =>
        (n as HTMLElement).id === "para"
      );
      expect(markerIdx).toBe(0);
      expect(tableIdx).toBe(1);
      expect(paraIdx).toBe(2);

      disposeTable();
      disposePara();
      globalThis.document.body.removeChild(parent);
    });
  },
  { sanitizeOps: false, sanitizeResources: false },
);
