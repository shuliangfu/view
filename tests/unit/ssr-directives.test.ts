/**
 * @fileoverview SSR 指令真实测试：renderToString 在 vIf/vElse/vElseIf/vFor/vShow 下的实际 HTML 输出
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import { renderToString } from "@dreamer/view";

describe("SSR vIf / vElse / vElseIf", () => {
  it("vIf 为 true 时输出分支内容", () => {
    const html = renderToString(() => ({
      type: "span",
      props: { vIf: true },
      children: [{ type: "#text", props: { nodeValue: "show" }, children: [] }],
    }));
    expect(html).toContain("show");
  });

  it("vIf 为 false 时输出空", () => {
    const html = renderToString(() => ({
      type: "span",
      props: { vIf: false },
      children: [{ type: "#text", props: { nodeValue: "hide" }, children: [] }],
    }));
    expect(html).not.toContain("hide");
  });

  it("vIf + vElseIf + vElse 链：仅匹配分支输出", () => {
    // 第一项 vIf true -> 只应有 A
    const htmlA = renderToString(() => ({
      type: "div",
      props: {},
      children: [
        {
          type: "span",
          props: { vIf: true },
          children: [{
            type: "#text",
            props: { nodeValue: "A" },
            children: [],
          }],
        },
        {
          type: "span",
          props: { vElseIf: true },
          children: [{
            type: "#text",
            props: { nodeValue: "B" },
            children: [],
          }],
        },
        {
          type: "span",
          props: { vElse: true },
          children: [{
            type: "#text",
            props: { nodeValue: "C" },
            children: [],
          }],
        },
      ],
    }));
    expect(htmlA).toContain("A");
    expect(htmlA).not.toContain("B");
    expect(htmlA).not.toContain("C");
  });
});

describe("SSR vFor", () => {
  it("vFor 数组渲染出多份子节点", () => {
    const html = renderToString(() => ({
      type: "ul",
      props: {
        vFor: ["a", "b", "c"],
        children: (item: unknown, i: number) => ({
          type: "li",
          props: {},
          children: [{
            type: "#text",
            props: { nodeValue: `${i}:${item}` },
            children: [],
          }],
        }),
      },
      children: [],
    }));
    expect(html).toContain("0:a");
    expect(html).toContain("1:b");
    expect(html).toContain("2:c");
  });
});

describe("SSR vShow", () => {
  it("vShow 为 false 时输出 style=display:none", () => {
    const html = renderToString(() => ({
      type: "span",
      props: { vShow: false },
      children: [{ type: "#text", props: { nodeValue: "x" }, children: [] }],
    }));
    expect(html).toContain("display:none");
    expect(html).toContain("x");
  });
});
