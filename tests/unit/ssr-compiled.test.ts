/**
 * SSR 单元测试：renderToString、renderToStream。
 * 不依赖真实 DOM，服务端用伪 document 执行 fn(container) 后序列化。
 */

import { describe, expect, it } from "@dreamer/test";
import type { InsertValue } from "@dreamer/view/compiler";
import {
  createSSRDocument,
  insert,
  renderToStream,
  renderToString,
} from "@dreamer/view/compiler";
import { Fragment, jsx } from "@dreamer/view/jsx-runtime";

describe("createSSRDocument", () => {
  it("返回的 document 具备 createElement、createTextNode 且可生成可序列化节点", () => {
    const doc = createSSRDocument();
    expect(typeof doc.createElement).toBe("function");
    expect(typeof doc.createTextNode).toBe("function");
    const el = doc.createElement("span");
    const text = doc.createTextNode("hi");
    expect(el.tagName).toBe("span");
    expect(el.serialize()).toContain("<span");
    expect(text.nodeValue).toBe("hi");
    expect(text.serialize()).toBe("hi");
  });
});

describe("renderToString", () => {
  it("应返回根容器 innerHTML 字符串", () => {
    const html = renderToString((el) => {
      insert(el, "hello");
    });
    expect(typeof html).toBe("string");
    expect(html).toBe("hello");
  });

  it("insert 静态多段应串联", () => {
    const html = renderToString((el) => {
      insert(el, "A");
      insert(el, "B");
    });
    expect(html).toBe("AB");
  });

  it("getter 在 SSR 下只执行一次并输出当前值", () => {
    let count = 0;
    const html = renderToString((el) => {
      insert(el, () => {
        count++;
        return String(count);
      });
    });
    expect(html).toBe("1");
    expect(count).toBe(1);
  });

  it("应转义文本防 XSS", () => {
    const html = renderToString((el) => {
      insert(el, "<script>alert(1)</script>");
    });
    expect(html).toContain("&lt;");
    expect(html).not.toContain("<script>");
  });

  it("createElement + setAttribute + appendChild 应输出标签", () => {
    type SSRDoc = ReturnType<typeof createSSRDocument>;
    const html = renderToString((el) => {
      const doc = (globalThis as unknown as { document: SSRDoc }).document;
      const span = doc.createElement("span");
      span.setAttribute("class", "foo");
      span.appendChild(doc.createTextNode("bar"));
      el.appendChild(span);
    });
    expect(html).toContain("<span");
    expect(html).toContain('class="foo"');
    expect(html).toContain("bar");
    expect(html).toContain("</span>");
  });

  it("options.containerTag 可指定根容器标签（仅影响内部，返回仍为 innerHTML）", () => {
    const html = renderToString((el) => insert(el, "x"), {
      containerTag: "main",
    });
    expect(html).toBe("x");
  });

  it("options.dataViewSsr 为 false 时不加 data-view-ssr（不影响返回的 innerHTML）", () => {
    const html = renderToString((el) => insert(el, "y"), {
      dataViewSsr: false,
    });
    expect(html).toBe("y");
  });

  /**
   * @dreamer/render 的 View SSR 用 jsx 建 VNode + insert(container, () => vnode)；须与 compileSource 一样尊重 vIf，
   * 否则 Hybrid 首屏会把「应隐藏的」子树也写进 HTML，客户端再卸掉 → 闪屏。
   */
  it("VNode 本征标签 vIf={false} 时 renderToString 不应输出该子树", () => {
    const vnode = jsx("div", {
      vIf: false,
      class: "modal",
      children: jsx("span", { children: "secret" }),
    });
    const html = renderToString((el) => {
      insert(el, () => vnode as unknown as InsertValue);
    });
    expect(html).not.toContain("modal");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("<span");
  });

  it("VNode 本征标签 vIf 为真时仍应输出子树", () => {
    const vnode = jsx("div", {
      vIf: true,
      children: "ok",
    });
    const html = renderToString((el) => {
      insert(el, () => vnode as unknown as InsertValue);
    });
    expect(html).toContain("ok");
  });

  it("VNode vCloak 应输出 data-view-cloak", () => {
    const vnode = jsx("div", {
      vCloak: true,
      children: "c",
    });
    const html = renderToString((el) => {
      insert(el, () => vnode as unknown as InsertValue);
    });
    expect(html).toContain("data-view-cloak");
    expect(html).toContain("c");
  });

  it("Fragment 上 vIf / vElse 兄弟链应只渲染一支", () => {
    const vnode = jsx(Fragment, {
      children: [
        jsx("span", { vIf: false, children: "no" }),
        jsx("span", { vElse: true, children: "yes" }),
      ],
    });
    const html = renderToString((el) => {
      insert(el, () => vnode as unknown as InsertValue);
    });
    expect(html).not.toContain("no");
    expect(html).toContain("yes");
  });

  it("Fragment 上 vIf / vElseIf / vElse 链应命中首条真分支", () => {
    const vnode = jsx(Fragment, {
      children: [
        jsx("i", { vIf: false, children: "1" }),
        jsx("i", { vElseIf: true, children: "2" }),
        jsx("i", { vElse: true, children: "3" }),
      ],
    });
    const html = renderToString((el) => {
      insert(el, () => vnode as unknown as InsertValue);
    });
    expect(html).not.toContain(">1<");
    expect(html).toContain(">2<");
    expect(html).not.toContain(">3<");
  });
});

describe("renderToStream", () => {
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
});
