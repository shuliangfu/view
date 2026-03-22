/**
 * @fileoverview formatVNodeForDebug：手写 VNode 调试输出
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import { Fragment, jsx } from "@dreamer/view/jsx-runtime";
import { formatVNodeForDebug } from "../../src/vnode-debug.ts";

describe("formatVNodeForDebug", () => {
  it("应输出 type、部分 props 与子节点缩进", () => {
    const s = createSignal(1);
    const v = jsx("div", {
      className: "a",
      id: "x",
      children: jsx("span", { children: "t" }),
    });
    const out = formatVNodeForDebug(v);
    expect(out).toContain('"div"');
    expect(out).toContain("className");
    expect(out).toContain('"span"');
    expect(out).toContain("t");
    const withSig = formatVNodeForDebug(
      jsx("input", { value: s, type: "text" }),
    );
    expect(withSig).toContain("SignalRef");
  });

  it("maxDepth 较小时子层应输出省略标记", () => {
    const v = jsx("div", {
      children: jsx("span", { children: "in" }),
    });
    const out = formatVNodeForDebug(v, { maxDepth: 0 });
    expect(out).toContain('"div"');
    expect(out).toContain("…");
  });

  it("maxChildren 较小时应提示剩余子节点数", () => {
    const v = jsx(Fragment, {
      children: [
        jsx("span", { children: "1" }),
        jsx("span", { children: "2" }),
        jsx("span", { children: "3" }),
      ],
    });
    const out = formatVNodeForDebug(v, { maxChildren: 1 });
    expect(out).toContain("+2 children");
  });
});
