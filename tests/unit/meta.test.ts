/**
 * @fileoverview meta 单元测试：getMetaHeadFragment（SEO head 片段）
 */

import { describe, expect, it } from "@dreamer/test";
import { getMetaHeadFragment } from "../../src/meta.ts";

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
});
