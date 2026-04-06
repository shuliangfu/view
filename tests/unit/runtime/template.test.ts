import { describe, expect, it } from "@dreamer/test";
import { template, walk } from "@dreamer/view";
import "../dom-setup.ts";

describe("runtime/template", () => {
  it("相同 HTML 字符串应复用解析结果（同一克隆函数引用）", () => {
    const html = '<span class="x"></span>';
    const a = template(html);
    const b = template(html);
    expect(a).toBe(b);
    const n1 = a() as HTMLElement;
    const n2 = b() as HTMLElement;
    expect(n1).not.toBe(n2);
    expect(n1.isEqualNode(n2)).toBe(true);
  });

  it("基础克隆：应当快速生成 DOM 片段", () => {
    const tmpl = template("<div><span>text</span></div>");
    const el = tmpl() as HTMLElement;

    expect(el.tagName).toBe("DIV");
    expect(el.firstChild?.nodeName).toBe("SPAN");
    expect(el.textContent).toBe("text");
  }, { sanitizeOps: false, sanitizeResources: false });

  it("寻址寻路：应当准确定位动态节点", () => {
    const tmpl = template("<div><p></p><span></span></div>");
    const root = tmpl() as Node;

    const p = walk(root, [0]);
    const span = walk(root, [1]);

    expect(p.nodeName).toBe("P");
    expect(span.nodeName).toBe("SPAN");
  });

  it("walk: 路径越界应抛出带 @dreamer/view 前缀的明确错误", () => {
    const tmpl = template("<div><span></span></div>");
    const root = tmpl() as Node;
    expect(() => walk(root, [99])).toThrow("@dreamer/view");
    expect(() => walk(root, [-1])).toThrow("@dreamer/view");
  });
}, { sanitizeOps: false, sanitizeResources: false });
