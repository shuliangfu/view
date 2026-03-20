/**
 * @fileoverview 流式 SSR 单元测试：renderToStream（编译路径 fn(container)）
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { insert } from "@dreamer/view/compiler";
import { renderToStream } from "@dreamer/view/stream";

describe("renderToStream", () => {
  it("应返回异步生成器", async () => {
    const gen = renderToStream((el) => insert(el, "x"));
    expect(typeof gen.next).toBe("function");
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  });

  it("应按根级子节点顺序 yield HTML 片段", async () => {
    const chunks: string[] = [];
    for await (
      const chunk of renderToStream((el) => {
        insert(el, "A");
        insert(el, "B");
      })
    ) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("A");
    expect(chunks[1]).toBe("B");
  });

  it("单子节点时 yield 一次", async () => {
    const chunks: string[] = [];
    for await (const chunk of renderToStream((el) => insert(el, "only"))) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["only"]);
  });
}, { sanitizeOps: false, sanitizeResources: false });
