/**
 * @fileoverview 流式 SSR 单元测试：renderToStream
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { renderToStream } from "../../src/stream.ts";
import type { VNode } from "../../src/types.ts";

describe("renderToStream", () => {
  it("应返回生成器", () => {
    const gen = renderToStream(() => null as unknown as VNode);
    expect(typeof gen.next).toBe("function");
    expect(typeof gen[Symbol.iterator]).toBe("function");
  });

  it("简单 div 应 yield 出含标签的字符串", () => {
    const vnode: VNode = {
      type: "div",
      props: { className: "root", children: [] },
      key: null,
    };
    const gen = renderToStream(() => vnode);
    const chunks: string[] = [];
    for (const chunk of gen) {
      chunks.push(chunk);
    }
    const html = chunks.join("");
    expect(html).toContain("div");
    expect(html).toContain("root");
  });

  it("文本子节点应被转义输出", () => {
    const vnode: VNode = {
      type: "span",
      props: {
        children: [{ type: "#text", props: { nodeValue: "hello" }, key: null }],
      },
      key: null,
    };
    const gen = renderToStream(() => vnode);
    const html = [...gen].join("");
    expect(html).toContain("hello");
  });
});
