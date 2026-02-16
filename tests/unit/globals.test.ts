/**
 * @fileoverview 单元测试：getDocument、getGlobal、setGlobal
 * 覆盖 getDocument 在 SSR 下抛错、在 DOM 环境下返回 document。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { getDocument, getGlobal, setGlobal } from "../../src/globals.ts";
import { KEY_VIEW_SSR } from "../../src/constants.ts";

/** 关闭 timer 泄漏检测，避免 setGlobal/其他模块内 timer 导致误报 */
const noSanitize = { sanitizeOps: false, sanitizeResources: false };

describe("getDocument", () => {
  it("当 KEY_VIEW_SSR 为 true 时应抛出明确错误", () => {
    setGlobal(KEY_VIEW_SSR, true);
    try {
      expect(() => getDocument()).toThrow(
        /document is not available during server-side rendering/,
      );
    } finally {
      setGlobal(KEY_VIEW_SSR, false);
    }
  }, noSanitize);

  it("当 KEY_VIEW_SSR 为 false 且存在 document 时应返回 document", () => {
    setGlobal(KEY_VIEW_SSR, false);
    const doc = getDocument();
    expect(doc).toBeDefined();
    expect(typeof doc.createElement).toBe("function");
    expect(doc).toBe((globalThis as { document?: Document }).document);
  });
});

describe("getGlobal / setGlobal", () => {
  const TEST_KEY = "__VIEW_TEST_GET_SET__";

  it("setGlobal 后 getGlobal 可读到该值", () => {
    setGlobal(TEST_KEY, 42);
    expect(getGlobal<number>(TEST_KEY)).toBe(42);
    setGlobal(TEST_KEY, undefined);
  });

  it("未设置时 getGlobal 返回 undefined", () => {
    expect(getGlobal(TEST_KEY)).toBeUndefined();
  });
});
