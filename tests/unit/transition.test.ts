/**
 * @fileoverview Transition 单元测试：根据 show 控制显隐，enter/leave class 与 duration。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import type { VNode } from "@dreamer/view";
import { Transition } from "@dreamer/view/transition";

function textVNode(s: string): VNode {
  return { type: "#text", props: { nodeValue: s }, children: [] };
}

const noSanitize = { sanitizeOps: false, sanitizeResources: false };

describe("Transition", () => {
  it("应返回 getter 函数，调用后返回 VNode 或 null", () => {
    const getter = Transition({
      show: () => true,
      enter: "enter",
      leave: "leave",
      children: textVNode("content"),
    });
    expect(typeof getter).toBe("function");
    const v = getter();
    expect(v).not.toBeNull();
    expect((v as VNode).type).toBe("div");
  }, noSanitize);

  it("show 为 true 时返回的 VNode 带 enter class", () => {
    const getter = Transition({
      show: () => true,
      enter: "enter enter-active",
      leave: "leave",
      children: textVNode("x"),
    });
    const v = getter() as VNode;
    expect(v.props?.class).toBe("enter enter-active");
    expect(v.type).toBe("div");
  });

  it("show 为 false 时返回 null（phase 保持 left）", () => {
    const getter = Transition({
      show: () => false,
      enter: "enter",
      leave: "leave",
      children: textVNode("x"),
    });
    expect(getter()).toBeNull();
  });

  it("可指定 tag 包裹标签", () => {
    const getter = Transition({
      show: () => true,
      enter: "e",
      leave: "l",
      tag: "span",
      children: textVNode("y"),
    });
    const v = getter() as VNode;
    expect(v.type).toBe("span");
  });

  it("children 为数组时正常规范化", () => {
    const getter = Transition({
      show: () => true,
      enter: "e",
      leave: "l",
      children: [textVNode("a"), textVNode("b")],
    });
    const v = getter() as VNode;
    expect(Array.isArray(v.children)).toBe(true);
    expect((v.children as VNode[]).length).toBe(2);
  });

  it("show 从 true 改为 false 后进入 leaving 阶段（返回带 leave class 的 VNode）", async () => {
    const [visible, setVisible] = createSignal(true);
    const getter = Transition({
      show: () => visible(),
      enter: "enter",
      leave: "leave",
      duration: 10,
      children: textVNode("d"),
    });
    expect(getter()).not.toBeNull();
    setVisible(false);
    await Promise.resolve();
    await Promise.resolve();
    const leaving = getter() as VNode | null;
    expect(leaving).not.toBeNull();
    expect((leaving as VNode).props?.class).toBe("leave");
  }, noSanitize);
});
