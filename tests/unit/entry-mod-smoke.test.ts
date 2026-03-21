/**
 * @fileoverview 子路径入口 createSignal 等烟测：csr / hybrid / ssr 与主包可并存。
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal as csrSig } from "@dreamer/view/csr";
import { createSignal as hybridSig } from "@dreamer/view/hybrid";
import { createSignal as mainSig } from "@dreamer/view";
import { insert } from "@dreamer/view/compiler";
import { renderToString } from "@dreamer/view/ssr";

describe("入口 mod 烟测", () => {
  it("主包与 csr/hybrid 的 createSignal 均应可用", () => {
    const [a, setA] = mainSig(1);
    const [b, setB] = csrSig(2);
    const [c, setC] = hybridSig(3);
    expect(a()).toBe(1);
    expect(b()).toBe(2);
    expect(c()).toBe(3);
    setA(10);
    setB(20);
    setC(30);
    expect(a()).toBe(10);
    expect(b()).toBe(20);
    expect(c()).toBe(30);
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
});
