/**
 * @fileoverview VNode 子树走 insertReactiveForVnodeSubtree：主包加载后应与 insertReactive 行为一致。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { Fragment, jsx } from "@dreamer/view/jsx-runtime";
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
}, { sanitizeOps: false, sanitizeResources: false });
