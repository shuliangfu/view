import { describe, expect, it } from "@dreamer/test";
import { compileSource } from "@dreamer/view/compiler";

describe("compiler/hmr", () => {
  it("应当自动为导出的组件注入 createHMRProxy", () => {
    const code = `export const App = () => <div>Hello</div>;`;
    const out = compileSource(code, "test.tsx", { hmr: true });

    // 期望包含导入
    expect(out).toContain("createHMRProxy");
    // 期望组件被包装
    expect(out).toContain('createHMRProxy("test.tsx:App", () =>');
  });

  it("不应当包装非大写字母开头的导出", () => {
    const code = `export const utils = () => {};`;
    const out = compileSource(code, "test.tsx", { hmr: true });

    expect(out).not.toContain("createHMRProxy");
  });

  it("应当为 export default function 页面组件注入 createHMRProxy", () => {
    const code = `export default function Home() { return <div />; }`;
    const out = compileSource(code, "page.tsx", { hmr: true });

    expect(out).toContain("createHMRProxy");
    expect(out).toContain('createHMRProxy("page.tsx:Home", Home)');
    expect(out).toMatch(/function Home\s*\(/);
    expect(out).toMatch(/export default/);
  });

  it("应当为匿名 export default function 注入具名函数与 createHMRProxy", () => {
    const code = `export default function() { return <span />; }`;
    const out = compileSource(code, "anon.tsx", { hmr: true });

    expect(out).toContain("createHMRProxy");
    expect(out).toContain(
      'createHMRProxy("anon.tsx:default", __view_default__)',
    );
    expect(out).toMatch(/function __view_default__/);
  });
}, { sanitizeOps: false, sanitizeResources: false });
