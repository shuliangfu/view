/**
 * @fileoverview 零参 getter 返回 compileSource 式 MountFn：`return () => ( <JSX/> )` 经编译后为 `() => (parent)=>void`。
 * vnode-mount 须把该 MountFn 交给 insertReactive 挂载，不得 String(函数) 插入文本。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createMemo } from "@dreamer/view";
import { Fragment, jsx } from "@dreamer/view/jsx-runtime";
import type { VNode } from "@dreamer/view/types";
import "../../src/compiler/mod.ts";
import { markMountFn } from "../../src/compiler/mount-fn.ts";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";

describe(
  "mountVNodeTree：getter 返回 MountFn（对齐 compileSource 的 return ()=>(JSX)）",
  () => {
    /**
     * 模拟 compileSource 对页面组件的变换结果：零参函数返回单参挂载函数。
     *
     * @param _props - VNode props（未使用）
     * @returns 无参 getter，求值得 `(parent)=>void`
     */
    function mockCompiledPage(_props: Record<string, unknown>) {
      const innerMount = markMountFn((parent: Node) => {
        const el = globalThis.document.createElement("div");
        el.id = "getter-returns-mountfn";
        el.textContent = "mounted";
        parent.appendChild(el);
      });
      return () => innerMount;
    }

    it("函数组件返回 () => MountFn 时应挂载真实 DOM，不得把函数源码当文本节点", async () => {
      const container = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(container);
      const vnode = jsx(
        mockCompiledPage as unknown as VNode["type"],
        {},
      );
      mountVNodeTree(container, vnode);
      await new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
      const el = container.querySelector("#getter-returns-mountfn");
      expect(el).not.toBeNull();
      expect(el?.textContent).toBe("mounted");
      const text = container.textContent ?? "";
      expect(text).not.toContain("function");
      expect(text).not.toContain("innerMount");
      globalThis.document.body.removeChild(container);
    });

    /**
     * 模拟「零参包两层」才到 MountFn：`reactiveInsertNextFromGetterResult` 不得对中间层 `String(fn)`。
     *
     * @param _props - 未使用
     */
    function mockDoubleWrappedPage(_props: Record<string, unknown>) {
      const innerMount = markMountFn((parent: Node) => {
        const el = globalThis.document.createElement("div");
        el.id = "double-wrap";
        el.textContent = "ok";
        parent.appendChild(el);
      });
      return () => () => innerMount;
    }

    it("函数组件返回 () => () => MountFn 时仍应挂载 DOM，不得输出函数源码文本", async () => {
      const container = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(container);
      const vnode = jsx(
        mockDoubleWrappedPage as unknown as VNode["type"],
        {},
      );
      mountVNodeTree(container, vnode);
      await new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
      expect(container.querySelector("#double-wrap")?.textContent).toBe("ok");
      const text = container.textContent ?? "";
      expect(text).not.toContain("function");
      expect(text).not.toContain("__viewMountParent");
      globalThis.document.body.removeChild(container);
    });

    /**
     * createMemo 返回无参 signal getter：不得被 String() 成整段函数源码。
     *
     * @param _props - 未使用
     */
    function mockMemoChildPage(_props: Record<string, unknown>) {
      const memoed = createMemo(() => "memo-text");
      return () => memoed;
    }

    it("函数组件返回 createMemo getter 时应展示 memo 值而非函数源码", async () => {
      const container = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(container);
      const vnode = jsx(
        mockMemoChildPage as unknown as VNode["type"],
        {},
      );
      mountVNodeTree(container, vnode);
      await new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
      expect(container.textContent).toContain("memo-text");
      expect(container.textContent ?? "").not.toMatch(/function\s*\(/);
      globalThis.document.body.removeChild(container);
    });

    /**
     * 与 Table `tbody` 等场景一致：插槽求值为 `VNode[]` 时须展开为多兄弟节点，不得 `String(array)` 成空或乱文本。
     */
    it("本征元素子节点为返回 VNode[] 的 getter 时应挂载多个子节点", async () => {
      const container = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(container);
      const vnode = jsx("div", {
        children: () => [
          jsx("span", { children: "one" }),
          jsx("span", { children: "two" }),
        ],
      });
      mountVNodeTree(container, vnode);
      await new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
      const spans = container.querySelectorAll("span");
      expect(spans.length).toBe(2);
      expect(spans[0]?.textContent).toBe("one");
      expect(spans[1]?.textContent).toBe("two");
      expect(container.textContent ?? "").not.toContain("[object Object]");
      globalThis.document.body.removeChild(container);
    });

    /**
     * VNode 子树内 `reactiveInsertNextFromGetterResult`：null/undefined 对齐 同类方案 空列表（无 DOM 子），
     * 不插空文本节点（顶层 `insertReactive` 的 `{null}` 仍走标量分支，见 runtime 单测）。
     */
    it("Fragment 子 getter 返回 null 或 undefined 时不应产生子节点", async () => {
      for (const empty of [null, undefined] as const) {
        const container = globalThis.document.createElement("div");
        globalThis.document.body.appendChild(container);
        const vnode = jsx(Fragment, {
          children: () => empty,
        });
        mountVNodeTree(container, vnode);
        await new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
        expect(container.childNodes.length).toBe(0);
        globalThis.document.body.removeChild(container);
      }
    });
  },
  { sanitizeOps: false, sanitizeResources: false },
);
