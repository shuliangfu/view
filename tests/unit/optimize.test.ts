/**
 * @fileoverview `optimize()` 压缩 template 字符串与 `createOptimizePlugin` 形态。
 */
import { describe, expect, it } from "@dreamer/test";
import { createOptimizePlugin, optimize } from "../../src/optimize.ts";

describe("optimize (源码压缩)", () => {
  it("应压缩 template 双引号内标签间空白", () => {
    const src =
      `const t = template("  <div>  \\n  <span>  </span>  </div>  ");`;
    const out = optimize(src);
    expect(out).toContain("template(");
    expect(out).not.toMatch(/>\s+\n\s+</);
    expect(out).toContain("</span></div>");
  });

  it("应同时处理单引号与反引号包裹的 template", () => {
    const a = optimize(`foo template('  <p>  x  </p>  ') bar`);
    const b = optimize("foo template(`  <a/>  `) bar");
    expect(a).toContain("<p> x </p>");
    expect(b).toContain("<a/>");
  });

  it("无 template 调用时应原样返回", () => {
    const s = "const x = 1;";
    expect(optimize(s)).toBe(s);
  });
});

describe("createOptimizePlugin", () => {
  it("应返回带 name 与 setup 的 esbuild 插件对象", () => {
    const plugin = createOptimizePlugin(/\.tsx$/);
    expect(plugin.name).toBe("view-optimize");
    expect(typeof plugin.setup).toBe("function");
  });
});
