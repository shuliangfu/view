/**
 * @fileoverview `installMinimalSsrGlobals`：安装/卸载自研 SSR document 与 element 序列化。
 */
import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { installMinimalSsrGlobals } from "../../../src/runtime/ssr-dom.ts";

describe("runtime/ssr-dom (installMinimalSsrGlobals)", () => {
  it("安装后应可 createElement 并得到 outerHTML；teardown 应恢复原先 document", () => {
    const before = globalThis.document;
    const { document: ssrDoc, teardown } = installMinimalSsrGlobals();
    expect(ssrDoc).toBeDefined();
    const div = ssrDoc.createElement("div");
    div.setAttribute("id", "ssr-el");
    expect(div.outerHTML).toContain("ssr-el");
    teardown();
    expect(globalThis.document).toBe(before);
  });
});
