/**
 * @fileoverview 集成：编译器 compileSource 产出与 SSR 入口可同时用于同一代码库路径（防回归：import 映射一致）。
 */
import { describe, expect, it } from "@dreamer/test";
import { compileSource } from "@dreamer/view/compiler";
import { renderToString } from "../../src/runtime/server.ts";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("integration：compiler + SSR 同仓路径", () => {
  it("compileSource 应产出含 template/insert 的代码；renderToString 与 jsx 应输出一致结构", () => {
    const compiled = compileSource(
      `export function Box() { return <div id="box">hi</div>; }`,
      "Box.tsx",
    );
    expect(compiled).toContain("template");
    expect(compiled).toContain("insert");

    const html = renderToString(() =>
      jsx("div", { id: "box", children: "hi" })
    );
    expect(html).toContain('id="box"');
    expect(html).toContain("hi");
  });
});
