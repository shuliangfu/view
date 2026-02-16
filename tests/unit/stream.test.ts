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

  /** 流式 SSR 下子节点为普通函数时，应渲染函数返回值而非函数源码（与 renderToString 一致） */
  it("子节点为普通函数时流式输出应渲染返回值而非函数源码", () => {
    const vnode: VNode = {
      type: "div",
      props: {
        children: () =>
          ({
            type: "span",
            props: {},
            children: [{
              type: "#text",
              props: { nodeValue: "stream-fn" },
              key: null,
            }],
          }) as VNode,
      },
      key: null,
    };
    const gen = renderToStream(() => vnode);
    const html = [...gen].join("");
    expect(html).toContain("stream-fn");
    expect(html).toContain("<span>");
    expect(html).not.toContain("() =>");
  });

  /** 流式 SSR 下带 key 子节点输出 data-view-keyed */
  it("带 key 子节点时流式输出含 data-view-keyed", () => {
    const vnode: VNode = {
      type: "div",
      props: {
        children: [{
          type: "span",
          props: {},
          key: "k1",
          children: [{ type: "#text", props: { nodeValue: "x" }, key: null }],
        }],
      },
      key: null,
    };
    const html = [...renderToStream(() => vnode)].join("");
    expect(html).toContain("data-view-keyed");
    expect(html).toContain('data-key="k1"');
    expect(html).toContain("x");
  });

  /** 流式 SSR 下 void 元素无闭合标签 */
  it("void 元素流式输出无闭合标签", () => {
    const html = [...renderToStream(() => ({
      type: "br",
      props: {},
      key: null,
    } as VNode))].join("");
    expect(html).toMatch(/<br[\s>]/);
    expect(html).not.toContain("</br>");
  });
}, { sanitizeOps: false, sanitizeResources: false });
