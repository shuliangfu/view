/**
 * @fileoverview meta 单元测试：getMetaHeadFragment、applyMetaToHead，含边界与参数覆盖
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { applyMetaToHead, getMetaHeadFragment } from "../../src/meta.ts";

describe("getMetaHeadFragment", () => {
  it("有 title 时应输出 <title> 标签", () => {
    const html = getMetaHeadFragment({ title: "首页" });
    expect(html).toContain("<title>");
    expect(html).toContain("首页");
    expect(html).toContain("</title>");
  });

  it("无 meta 或空对象时应返回空字符串或仅含空 title", () => {
    const html1 = getMetaHeadFragment(undefined);
    const html2 = getMetaHeadFragment({});
    expect(typeof html1).toBe("string");
    expect(typeof html2).toBe("string");
  });

  it("titleSuffix 应拼接到 title 后", () => {
    const html = getMetaHeadFragment(
      { title: "首页" },
      " | 我的站点",
    );
    expect(html).toContain("首页 | 我的站点");
  });

  it("无 meta.title 时使用 fallbackTitle", () => {
    const html = getMetaHeadFragment(
      {},
      "",
      "默认标题",
    );
    expect(html).toContain("默认标题");
  });

  it("应输出 name 类 meta（description、keywords 等）", () => {
    const html = getMetaHeadFragment({
      title: "页",
      description: "页面描述",
      keywords: "a, b",
    });
    expect(html).toContain('name="description"');
    expect(html).toContain("页面描述");
    expect(html).toContain('name="keywords"');
    expect(html).toContain("a, b");
  });

  it("应输出 meta.og 为 property 类 meta", () => {
    const html = getMetaHeadFragment({
      title: "页",
      og: { title: "OG 标题", image: "https://example.com/img.png" },
    });
    expect(html).toContain('property="og:title"');
    expect(html).toContain("OG 标题");
    expect(html).toContain('property="og:image"');
    expect(html).toContain("https://example.com/img.png");
  });

  it("og 的 key 已含 og: 前缀时不再重复添加", () => {
    const html = getMetaHeadFragment({
      title: "页",
      og: { "og:image:width": "1200" },
    });
    expect(html).toContain('property="og:image:width"');
    expect(html).toContain("1200");
  });

  it("应对 title 和 content 做 HTML 转义", () => {
    const html = getMetaHeadFragment({
      title: 'a"b<c>d&e',
    });
    expect(html).not.toContain('"');
    expect(html).toContain("&quot;");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).toContain("&amp;");
  });

  it("边界：meta 为 null 时 title 用 fallbackTitle", () => {
    const html = getMetaHeadFragment(
      null as unknown as Record<string, unknown>,
      "",
      "Fallback",
    );
    expect(html).toContain("Fallback");
  });

  it("边界：title 与 fallbackTitle 均为空时无 title 标签", () => {
    const html = getMetaHeadFragment({}, "", "");
    expect(html).not.toContain("<title>");
  });

  it("边界：name 类 value 为 null 或空字符串时不输出该 meta", () => {
    const html = getMetaHeadFragment({
      title: "T",
      description: "",
      keywords: null,
      author: "  ",
    });
    expect(html).not.toContain('name="description"');
    expect(html).not.toContain('name="keywords"');
    expect(html).not.toContain('name="author"');
  });

  it("边界：name 类 value 为非字符串时转 String 输出", () => {
    const html = getMetaHeadFragment({
      title: "T",
      num: 42 as unknown,
    });
    expect(html).toContain('name="num"');
    expect(html).toContain("42");
  });

  it("边界：og 为数组时跳过不遍历", () => {
    const html = getMetaHeadFragment({
      title: "T",
      og: ["a"] as unknown as Record<string, unknown>,
    });
    expect(html).not.toContain('property="og:');
  });

  it("边界：og 的 key 无 og: 前缀时自动加 og:", () => {
    const html = getMetaHeadFragment({
      title: "T",
      og: { image: "url" },
    });
    expect(html).toContain('property="og:image"');
  });
});

describe("applyMetaToHead", () => {
  it("有 document.head 时设置 title 与 meta", () => {
    applyMetaToHead(
      { title: "ApplyTitle", description: "ApplyDesc" },
      "",
      "",
    );
    expect(typeof document.title).toBe("string");
    if (document.title) {
      expect(document.title).toBe("ApplyTitle");
    }
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      expect(meta.getAttribute("content")).toBe("ApplyDesc");
    }
  });

  it("无 meta.title 时使用 fallbackTitle", () => {
    applyMetaToHead({}, "", "FallbackApply");
    expect(document.title).toBe("FallbackApply");
  });

  it("titleSuffix 拼接到 document.title", () => {
    applyMetaToHead({ title: "Page" }, " | Site", "");
    expect(document.title).toBe("Page | Site");
  });

  it("og 字段写入 property 类 meta", () => {
    applyMetaToHead({
      title: "T",
      og: { "og:image": "https://x.com/img.png" },
    });
    const el = document.querySelector('meta[property="og:image"]');
    if (el) expect(el.getAttribute("content")).toBe("https://x.com/img.png");
  });

  it("边界：applyMetaToHead 传入 undefined 时不抛错", () => {
    applyMetaToHead(undefined);
  });

  it("边界：name 类 value 为空或仅空格时不抛错", () => {
    applyMetaToHead({ title: "T", empty: "", spaces: "   " });
  });
});
