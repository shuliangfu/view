/**
 * @fileoverview escapeForText / escapeForAttr / escapeForAttrHtml：XSS 相关转义一致性。
 */

import { describe, expect, it } from "@dreamer/test";
import {
  escapeForAttr,
  escapeForAttrHtml,
  escapeForText,
} from "../../src/escape.ts";

describe("escapeForText", () => {
  it("应转义 & < >", () => {
    expect(escapeForText(`a&b<c>d`)).toBe("a&amp;b&lt;c&gt;d");
  });

  it("空串应原样", () => {
    expect(escapeForText("")).toBe("");
  });
});

describe("escapeForAttr", () => {
  it('应转义 & " < >', () => {
    expect(escapeForAttr(`x"y&z<w>`)).toBe("x&quot;y&amp;z&lt;w&gt;");
  });
});

describe("escapeForAttrHtml", () => {
  it("应转义 & < > \" '（含单引号）", () => {
    expect(escapeForAttrHtml(`'"<>&`)).toBe("&#39;&quot;&lt;&gt;&amp;");
  });

  it("Unicode 应保留", () => {
    expect(escapeForText("中文😀")).toBe("中文😀");
  });
});
