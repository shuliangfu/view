/**
 * @fileoverview Portal 单元测试：createPortal 将子树挂载到指定容器，unmount 卸载。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import type { VNode } from "@dreamer/view";
import { createPortal } from "@dreamer/view/portal";

function textVNode(s: string): VNode {
  return { type: "#text", props: { nodeValue: s }, children: [] };
}

const noSanitize = { sanitizeOps: false, sanitizeResources: false };

describe("createPortal", () => {
  it("应返回带 unmount 方法的 Root", () => {
    const vnode: VNode = {
      type: "div",
      props: {},
      children: [textVNode("portal-content")],
    };
    const root = createPortal(vnode);
    expect(root).toBeDefined();
    expect(typeof root.unmount).toBe("function");
    root.unmount();
  }, noSanitize);

  it("传入函数时挂载函数返回的 VNode 并响应式更新", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode: VNode = {
      type: "span",
      props: { className: "portal-span" },
      children: [textVNode("from-fn")],
    };
    const root = createPortal(() => vnode, container);
    expect(container.querySelector(".portal-span")).not.toBeNull();
    expect(container.textContent).toContain("from-fn");
    root.unmount();
    expect(container.querySelector(".portal-span")).toBeNull();
    container.remove();
  });

  it("不传 container 时挂载到 document.body", () => {
    const vnode: VNode = {
      type: "div",
      props: { "data-portal-test": "body" },
      children: [textVNode("body-portal")],
    };
    const root = createPortal(vnode);
    const el = document.body.querySelector("[data-portal-test=body]");
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain("body-portal");
    root.unmount();
    expect(document.body.querySelector("[data-portal-test=body]")).toBeNull();
  });

  it("unmount 后容器内对应内容被移除", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode: VNode = {
      type: "div",
      props: {},
      children: [textVNode("will-unmount")],
    };
    const root = createPortal(vnode, container);
    expect(container.textContent).toContain("will-unmount");
    root.unmount();
    expect(container.textContent).not.toContain("will-unmount");
    expect(container.children.length).toBe(0);
    container.remove();
  });
});
