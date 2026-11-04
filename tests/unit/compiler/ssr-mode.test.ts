import { describe, expect, it } from "@dreamer/test";
import { compileSource } from "@dreamer/view/compiler";

describe("compiler/ssr-mode", () => {
  it("应当在 SSR 模式下直接生成字符串拼接", () => {
    const code =
      `export const App = () => <div class={color()}>{count()}</div>;`;
    const out = compileSource(code, "test.tsx", { generate: "ssr" });

    // 期望看到合并后的字符串和加法
    expect(out).toContain('<div class=\\"');
    expect(out).toContain("color()");
    expect(out).toContain('\\">');
    expect(out).toContain("count()");
    expect(out).toContain("</div>");

    expect(out).not.toContain("template(");
    expect(out).not.toContain("setAttribute(");
  });

  it("应当正确处理 SSR 下的嵌套组件", () => {
    const code = `export const App = () => <div><Comp name="Test" /></div>;`;
    const out = compileSource(code, "test.tsx", { generate: "ssr" });

    // 期望看到组件被正确识别为函数调用，而非普通标签字符串
    expect(out).toContain('"<div>"');
    expect(out).toContain("Comp({");
    expect(out).not.toContain('"<Comp"');
    expect(out).toContain('"</div>"');
  });

  it("SSR：静态子文本 + 拼接应折成单字符串（对齐 CSR template）", () => {
    const code =
      `export const App = () => <div>{"hello" + " world"}</div>;`;
    const ssr = compileSource(code, "test.tsx", { generate: "ssr" });
    const csr = compileSource(code, "test.tsx", {});
    expect(ssr).toContain('"<div>hello world</div>"');
    expect(ssr).not.toContain('"hello" + " world"');
    expect(csr).toContain('template("<div>hello world</div>")');
  });

  it("SSR：静态子文本 escape 与 CSR template 一致", () => {
    const code =
      `export const App = () => <div>{"a&b" + "<c>"}</div>;`;
    const ssr = compileSource(code, "test.tsx", { generate: "ssr" });
    const csr = compileSource(code, "test.tsx", {});
    expect(ssr).toContain("a&amp;b&lt;c&gt;");
    expect(csr).toContain("a&amp;b&lt;c&gt;");
    expect(ssr).not.toContain('"<c>"');
  });

  it("SSR：0 && / \"\" && 仍不提升；null && 省略为空壳", () => {
    const textAnd =
      `export const App = () => <div>{"a" && "b"}</div>;`;
    const zeroAnd =
      `export const App = () => <div>{0 && <span>A</span>}</div>;`;
    const emptyAnd =
      `export const App = () => <div>{"" && <span>A</span>}</div>;`;
    const nullAnd =
      `export const App = () => <div>{null && <span>A</span>}</div>;`;
    expect(compileSource(textAnd, "t.tsx", { generate: "ssr" })).toContain(
      "&&",
    );
    expect(compileSource(zeroAnd, "t.tsx", { generate: "ssr" })).toContain(
      "0 &&",
    );
    expect(compileSource(emptyAnd, "t.tsx", { generate: "ssr" })).toContain(
      "&&",
    );
    const nullOut = compileSource(nullAnd, "t.tsx", { generate: "ssr" });
    expect(nullOut).toContain('"<div></div>"');
    expect(nullOut).not.toContain("+ null");
  });

  it("SSR Fragment：静态子文本折叠", () => {
    const out = compileSource(
      `export const App = () => <>{"a" + "b"}</>;`,
      "t.tsx",
      { generate: "ssr" },
    );
    expect(out).toContain('"ab"');
    expect(out).not.toContain("createDocumentFragment");
  });
}, { sanitizeOps: false, sanitizeResources: false });
