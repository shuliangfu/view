/**
 * @fileoverview 子路径入口 createSignal 等烟测：csr / hybrid / ssr 与主包可并存。
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal as csrSig } from "@dreamer/view/csr";
import { createSignal as hybridSig } from "@dreamer/view/hybrid";
import { createSignal as mainSig, jsxMerges, jsxs } from "@dreamer/view";
import { insert } from "@dreamer/view/compiler";
import { renderToString } from "@dreamer/view/ssr";

describe("入口 mod 烟测", () => {
  it("主包与 csr/hybrid 的 createSignal 均应可用", () => {
    const a = mainSig(1);
    const b = csrSig(2);
    const c = hybridSig(3);
    expect(a.value).toBe(1);
    expect(b.value).toBe(2);
    expect(c.value).toBe(3);
    a.value = 10;
    b.value = 20;
    c.value = 30;
    expect(a.value).toBe(10);
    expect(b.value).toBe(20);
    expect(c.value).toBe(30);
  });

  /**
   * 验证 `@dreamer/view/ssr` 子路径可解析（`deno.json` 与 `package.json` exports 均含 `./ssr`），
   * 且 `renderToString` 能将 `insert` 挂载的文本序列化为 HTML 字符串。
   */
  it("@dreamer/view/ssr 的 renderToString 应能输出静态片段", () => {
    const html = renderToString((el) => {
      insert(el, "ssr-smoke");
    });
    expect(html).toContain("ssr-smoke");
  });

  /**
   * 主入口与 `@dreamer/view/jsx-runtime` 同源导出 `jsxMerges` / `jsxs`，便于手写 JSX 时少记一条子路径。
   */
  it("主包应导出 jsxMerges 且单子项 children 仍为数组", () => {
    const child = {
      type: "#text" as const,
      props: { nodeValue: "mod" },
      children: [],
    };
    const vMerge = jsxMerges("span", { className: "x" }, { children: [child] });
    const vJsxs = jsxs("span", { className: "x", children: [child] });
    expect(vMerge).toEqual(vJsxs);
  });
});
