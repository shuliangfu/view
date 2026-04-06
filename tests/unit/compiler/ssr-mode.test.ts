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
}, { sanitizeOps: false, sanitizeResources: false });
