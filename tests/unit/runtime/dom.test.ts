/**
 * @fileoverview `getDocument`、`createRef` 与 ref 对象形态；`createRef` 仅从 `@dreamer/view` 导入，`jsx-runtime` 用命名空间 `JR` 测 `jsx` 与再导出一致性。
 */
/// <reference lib="dom" />
// 为内置 TS 拉入 DOM 类型；根目录打开工程时若 Deno LSP 未绑定 view/deno.json，可避免 document / HTMLDivElement 报红。
import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRef, getDocument, type VNode } from "@dreamer/view";
import * as JR from "../../../src/jsx-runtime.ts";

/**
 * 执行 {@link jsx} 返回的 {@link VNode} thunk，得到宿主元素（单测内无 Owner 亦可走原生分支）。
 */
function renderHost(vnode: VNode): globalThis.HTMLElement {
  const out = vnode();
  expect(out).toBeInstanceOf(globalThis.HTMLElement);
  return out as globalThis.HTMLElement;
}

describe("runtime/dom", () => {
  it("getDocument：在已注入 document 的测试环境下应返回 Document", () => {
    const d = getDocument();
    expect(d).not.toBeNull();
    expect(d?.nodeType).toBe(9);
  });

  describe("createRef", () => {
    it("无参调用时 initial 为 null（默认参数）", () => {
      const r = createRef();
      expect(r).toEqual({ current: null });
      expect(r.current).toBeNull();
    });

    it("显式传入 null 与省略泛型时行为一致", () => {
      const a = createRef(null);
      const b = createRef<unknown>(null);
      expect(a.current).toBeNull();
      expect(b.current).toBeNull();
    });

    it("返回对象含可枚举的 current，且可被多次改写", () => {
      const r = createRef<HTMLDivElement | null>(null);
      expect(r).toEqual({ current: null });
      expect(Object.keys(r)).toEqual(["current"]);
      const el = document.createElement("div");
      r.current = el;
      expect(r.current).toBe(el);
      r.current = null;
      expect(r.current).toBeNull();
      const el2 = document.createElement("div");
      r.current = el2;
      expect(r.current).toBe(el2);
    });

    it("可传入初始非 null 的 DOM 节点", () => {
      const el = document.createElement("span");
      const r = createRef(el);
      expect(r.current).toBe(el);
    });

    it("多个 createRef 实例互不影响", () => {
      const a = createRef<HTMLDivElement | null>(null);
      const b = createRef<HTMLDivElement | null>(null);
      const divA = document.createElement("div");
      const divB = document.createElement("div");
      a.current = divA;
      b.current = divB;
      expect(a.current).toBe(divA);
      expect(b.current).toBe(divB);
      a.current = null;
      expect(a.current).toBeNull();
      expect(b.current).toBe(divB);
    });

    it("泛型为具体元素类型时可持有对应标签（边界：子类型收窄）", () => {
      const r = createRef<HTMLInputElement | null>(null);
      const input = document.createElement("input");
      r.current = input;
      expect(r.current).toBe(input);
      expect(r.current?.tagName).toBe("INPUT");
    });

    it("非 DOM 的初始值：以联合类型表示的 holder（边界：API 仅约束 T | null）", () => {
      const r = createRef<{ x: number } | null>({ x: 1 });
      expect(r.current).toEqual({ x: 1 });
      r.current = null;
      expect(r.current).toBeNull();
    });

    it("每次 createRef 返回新对象引用（非单例）", () => {
      const r1 = createRef(null);
      const r2 = createRef(null);
      expect(r1).not.toBe(r2);
    });

    describe("与 jsx 运行时 ref 约定一致", () => {
      it("原生元素：ref 对象在 thunk 执行后写入 current", () => {
        const ref = createRef<HTMLDivElement | null>(null);
        const vnode = JR.jsx("div", {
          ref,
          id: "ref-host",
          class: "box",
        });
        const el = renderHost(vnode);
        expect(ref.current).toBe(el);
        expect(el.id).toBe("ref-host");
        expect(el.className).toBe("box");
      });

      it("input 元素：ref 指向真实 input", () => {
        const ref = createRef<HTMLInputElement | null>(null);
        const vnode = JR.jsx("input", {
          ref,
          type: "text",
        });
        const el = renderHost(vnode);
        expect(ref.current).toBe(el);
        expect(el.tagName).toBe("INPUT");
        expect((el as HTMLInputElement).type).toBe("text");
      });

      it("嵌套子树：仅目标节点接收 ref", () => {
        const outerRef = createRef<HTMLDivElement | null>(null);
        const innerRef = createRef<HTMLSpanElement | null>(null);
        const vnode = JR.jsx("div", {
          ref: outerRef,
          id: "outer",
          children: JR.jsx("span", {
            ref: innerRef,
            id: "inner",
            children: "t",
          }),
        });
        const outer = renderHost(vnode);
        expect(outerRef.current).toBe(outer);
        expect(innerRef.current).not.toBeNull();
        expect(innerRef.current?.id).toBe("inner");
        expect(outer.querySelector("#inner")).toBe(innerRef.current);
      });

      it("同一 vnode 构造中多个兄弟各绑定独立 ref", () => {
        const r1 = createRef<HTMLDivElement | null>(null);
        const r2 = createRef<HTMLDivElement | null>(null);
        const vnode = JR.jsx("div", {
          id: "root",
          children: [
            JR.jsx("div", { ref: r1, id: "a" }),
            JR.jsx("div", { ref: r2, id: "b" }),
          ],
        });
        renderHost(vnode);
        expect(r1.current?.id).toBe("a");
        expect(r2.current?.id).toBe("b");
        expect(r1.current).not.toBe(r2.current);
      });
    });

    /**
     * `jsx-runtime` 再导出 `createRef` 仅为入口便利，与主包指向同一实现；业务里只 `import { createRef } from "@dreamer/view"` 即可。
     */
    it("jsx-runtime 再导出的 createRef 与主包为同一函数引用", () => {
      expect(JR.createRef).toBe(createRef);
    });
  });
}, { sanitizeOps: false, sanitizeResources: false });
