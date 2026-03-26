/**
 * @fileoverview VNode 子树走 insertReactiveForVnodeSubtree：主包加载后应与 insertReactive 行为一致。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { Fragment, jsx } from "@dreamer/view/jsx-runtime";
import type { VNode } from "@dreamer/view";
import { createRoot, createSignal, insert } from "@dreamer/view";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";

describe("vnode-insert-bridge（经主包注册）", () => {
  it("Fragment 子为无参 getter 返回 VNode 时应随 signal 更新", async () => {
    const label = createSignal("a");
    const vnode = jsx(Fragment, {
      children: () => jsx("span", { children: label.value }),
    });
    const container = document.createElement("div");
    createRoot((el) => {
      insert(el, (parent) => {
        mountVNodeTree(parent, vnode);
      });
    }, container);
    expect(container.textContent).toBe("a");
    label.value = "b";
    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toBe("b");
  });

  /**
   * 步骤 5：函数组件 `() => VNode` 经 `insertReactiveForVnodeSubtree` 挂载时，若本征结构可 patch，
   * 多轮更新后根元素引用应与首轮相同（与 ANALYSIS 组件根 reconcile 目标一致）。
   */
  it("函数组件返回 ()=>VNode 且叶为 signal 快照时多轮更新根 div 引用不变", async () => {
    let bumpLabel!: () => void;
    function LeafCmp() {
      const label = createSignal("a");
      bumpLabel = () => {
        label.value = "b";
      };
      return () =>
        jsx("div", {
          id: "vb5-root",
          children: jsx("span", { id: "vb5-l", children: label.value }),
        });
    }
    /** 运行时 mountVNodeTree 接受「返回零参 getter」的组件；jsx 类型仅声明 VNode，此处断言绕过。 */
    const vnode = jsx(
      LeafCmp as unknown as (props: Record<string, unknown>) => VNode,
      {},
    );
    const container = globalThis.document.createElement("div");
    createRoot((el) => {
      insert(el, (parent) => {
        mountVNodeTree(parent, vnode);
      });
    }, container);
    await Promise.resolve();
    await Promise.resolve();
    const root1 = container.querySelector("#vb5-root");
    expect(root1).not.toBeNull();
    expect(container.textContent).toBe("a");
    bumpLabel();
    await Promise.resolve();
    await Promise.resolve();
    const root2 = container.querySelector("#vb5-root");
    expect(root2).toBe(root1);
    expect(container.textContent).toBe("b");
  });
}, { sanitizeOps: false, sanitizeResources: false });
