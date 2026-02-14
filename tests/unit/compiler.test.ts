/**
 * @fileoverview 编译优化单元测试：optimize 常量折叠与静态提升
 */

import { describe, expect, it } from "@dreamer/test";
import { createOptimizePlugin, optimize } from "../../src/compiler.ts";

describe("optimize", () => {
  it("常量折叠：数字字面量加减乘除应被折叠", () => {
    const code = "const x = 1 + 2;";
    const out = optimize(code, "test.ts");
    expect(out).toContain("3");
    expect(out).not.toContain("1 + 2");
  });

  it("常量折叠：比较运算应被折叠为 true/false", () => {
    const code = "const a = 1 < 2;";
    const out = optimize(code, "test.ts");
    expect(out).toMatch(/true/);
  });

  it("常量折叠：字符串拼接应被折叠", () => {
    const code = 'const s = "a" + "b";';
    const out = optimize(code, "test.ts");
    expect(out).toContain("ab");
  });

  it("传入空字符串或无效代码应返回可打印结果不抛错", () => {
    const out = optimize("", "empty.ts");
    expect(typeof out).toBe("string");
  });
});

describe("createOptimizePlugin", () => {
  it("应返回 name 与 setup 函数", () => {
    const plugin = createOptimizePlugin();
    expect(plugin.name).toBe("view-optimize");
    expect(typeof plugin.setup).toBe("function");
  });

  it("可传入自定义 filter 与 readFile", () => {
    const plugin = createOptimizePlugin(
      /\.tsx$/,
      async () => "const x = 1 + 2;",
    );
    expect(plugin.setup).toBeDefined();
  });
});
