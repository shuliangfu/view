/**
 * @fileoverview SSR 时 document 占位（shim）行为：组件内直接访问 document 不抛错、输出 HTML 正常。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import type { VNode } from "@dreamer/view";
import { renderToString } from "@dreamer/view";
import { renderToStream } from "../../src/stream.ts";

describe("SSR document shim", () => {
  it("组件内访问 document.body.style.overflow 不抛错且输出 HTML", () => {
    const Comp = () => {
      const g = globalThis as unknown as { document?: Document };
      if (g.document?.body) g.document.body.style.overflow = "hidden";
      return {
        type: "div",
        props: { "data-ssr": "body-overflow" },
        children: [{
          type: "#text",
          props: { nodeValue: "ok" },
          children: [],
        }],
      } as VNode;
    };
    const html = renderToString(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("ok");
    expect(html).toContain("data-ssr");
  });

  it("组件内 document.getElementById 返回 null 不抛错", () => {
    const Comp = () => {
      const g = globalThis as unknown as { document?: Document };
      const el = g.document?.getElementById?.("root");
      return {
        type: "span",
        props: { "data-found": el == null ? "no" : "yes" },
        children: [{
          type: "#text",
          props: { nodeValue: "id-check" },
          children: [],
        }],
      } as VNode;
    };
    const html = renderToString(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("id-check");
    expect(html).toContain('data-found="no"');
  });

  it("组件内 document.querySelector 返回 null 不抛错", () => {
    const Comp = () => {
      const g = globalThis as unknown as { document?: Document };
      const el = g.document?.querySelector?.(".any");
      return {
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: el == null ? "null" : "found" },
          children: [],
        }],
      } as VNode;
    };
    const html = renderToString(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("null");
  });

  it("组件内 document.querySelectorAll 返回空数组不抛错", () => {
    const Comp = () => {
      const g = globalThis as unknown as { document?: Document };
      const list = g.document?.querySelectorAll?.(".x") ?? [];
      const len = Array.isArray(list) ? list.length : list.length;
      return {
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: `len=${len}` },
          children: [],
        }],
      } as VNode;
    };
    const html = renderToString(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("len=0");
  });

  it("组件内设置 document.body.style.overflow 后读取不抛错", () => {
    const Comp = () => {
      const g = globalThis as unknown as { document?: Document };
      if (g.document?.body) {
        g.document.body.style.overflow = "hidden";
        const v = g.document.body.style.overflow;
        return {
          type: "span",
          props: {},
          children: [{
            type: "#text",
            props: { nodeValue: `overflow=${v}` },
            children: [],
          }],
        } as VNode;
      }
      return { type: "span", props: {}, children: [] } as VNode;
    };
    const html = renderToString(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("overflow=hidden");
  });

  it("renderToString 执行完毕后 globalThis.document 被恢复", () => {
    const before = (globalThis as unknown as { document?: Document }).document;
    renderToString(() => ({
      type: "div",
      props: {},
      children: [{
        type: "#text",
        props: { nodeValue: "x" },
        children: [],
      }],
    }));
    const after = (globalThis as unknown as { document?: Document }).document;
    expect(after).toBe(before);
  });
});

describe("renderToStream document shim", () => {
  it("流式 SSR 时组件内访问 document.body.style.overflow 不抛错", () => {
    const Comp = () => {
      const g = globalThis as unknown as { document?: Document };
      if (g.document?.body) g.document.body.style.overflow = "hidden";
      return {
        type: "div",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: "stream-ok" },
          children: [],
        }],
      } as VNode;
    };
    const gen = renderToStream(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    const html = [...gen].join("");
    expect(html).toContain("stream-ok");
  });

  it("流式 SSR 执行完毕后 globalThis.document 被恢复", () => {
    const before = (globalThis as unknown as { document?: Document }).document;
    const gen = renderToStream(() => ({
      type: "div",
      props: {},
      children: [{ type: "#text", props: { nodeValue: "y" }, children: [] }],
    }));
    [...gen];
    const after = (globalThis as unknown as { document?: Document }).document;
    expect(after).toBe(before);
  });
});
