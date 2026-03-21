/**
 * @fileoverview 单元测试：getDocument、getGlobal、setGlobal
 * 覆盖 getDocument 在 SSR 下返回 null（无影子）、有影子时返回影子、在 DOM 环境下返回 document。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { getDocument, getGlobal, setGlobal } from "../../src/globals.ts";
import { KEY_VIEW_SSR, KEY_VIEW_SSR_DOCUMENT } from "../../src/constants.ts";

/** 关闭 timer 泄漏检测，避免 setGlobal/其他模块内 timer 导致误报 */
const noSanitize = { sanitizeOps: false, sanitizeResources: false };

describe("getDocument", () => {
  it("当 KEY_VIEW_SSR 为 true 且未设置影子 document 时应返回 null", () => {
    setGlobal(KEY_VIEW_SSR, true);
    setGlobal(KEY_VIEW_SSR_DOCUMENT, undefined);
    try {
      expect(getDocument()).toBeNull();
    } finally {
      setGlobal(KEY_VIEW_SSR, false);
      setGlobal(KEY_VIEW_SSR_DOCUMENT, undefined);
    }
  }, noSanitize);

  it("当 KEY_VIEW_SSR 为 true 但已设置影子 document 时应返回该影子", () => {
    const real = (globalThis as { document?: Document }).document;
    if (!real) return;
    setGlobal(KEY_VIEW_SSR, true);
    setGlobal(KEY_VIEW_SSR_DOCUMENT, real);
    try {
      expect(getDocument()).toBe(real);
    } finally {
      setGlobal(KEY_VIEW_SSR, false);
      setGlobal(KEY_VIEW_SSR_DOCUMENT, undefined);
    }
  }, noSanitize);

  it("当 KEY_VIEW_SSR 为 false 且存在 document 时应返回 document", () => {
    setGlobal(KEY_VIEW_SSR, false);
    const doc = getDocument();
    expect(doc).not.toBeNull();
    expect(typeof doc!.createElement).toBe("function");
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
