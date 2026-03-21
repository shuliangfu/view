/**
 * @fileoverview getActiveDocument / setSSRShadowDocument：SSR 影子 document 与回退逻辑。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  getActiveDocument,
  setSSRShadowDocument,
} from "../../src/compiler/active-document.ts";

describe("active-document", () => {
  it("设置影子 document 后 getActiveDocument 应返回该对象", () => {
    const fake = {
      createElement: (tag: string) =>
        ({ tagName: tag.toUpperCase() }) as unknown as Element,
      createTextNode: (t: string) => ({ nodeValue: t }) as unknown as Text,
    };
    try {
      setSSRShadowDocument(fake);
      expect(getActiveDocument()).toBe(fake);
    } finally {
      setSSRShadowDocument(undefined);
    }
  });

  it("清除影子后应回退到 globalThis.document（dom-setup 已注入）", () => {
    setSSRShadowDocument(undefined);
    const d = getActiveDocument();
    const el = d.createElement("div") as Element;
    expect(el.nodeName.toLowerCase()).toBe("div");
  });
}, { sanitizeOps: false, sanitizeResources: false });
