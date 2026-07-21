/**
 * @fileoverview escape 工具：特殊字符转义、无特殊字符快路径、URL 消毒。
 */
import { describe, expect, it } from "@dreamer/test";
import {
  escapeForAttr,
  escapeForAttrHtml,
  escapeForText,
  isDangerousUrl,
  sanitizeUrl,
} from "../../../src/utils/escape.ts";

describe("utils/escape", () => {
  it("escapeForText：无特殊字符应返回同一字符串引用", () => {
    const s = "hello world 123";
    expect(escapeForText(s)).toBe(s);
  });

  it("escapeForText：应转义 & < >", () => {
    expect(escapeForText(`a&b<c>d`)).toBe("a&amp;b&lt;c&gt;d");
  });

  it("escapeForAttr：无特殊字符应返回同一字符串引用", () => {
    const s = "plain-value";
    expect(escapeForAttr(s)).toBe(s);
  });

  it("escapeForAttr：应转义引号与尖括号", () => {
    expect(escapeForAttr(`x"y<z>`)).toBe("x&quot;y&lt;z&gt;");
  });

  it("escapeForAttrHtml：无特殊字符应返回同一字符串引用", () => {
    const s = "title ok";
    expect(escapeForAttrHtml(s)).toBe(s);
  });

  it("escapeForAttrHtml：应转义引号与撇号", () => {
    expect(escapeForAttrHtml(`a"b'c`)).toBe("a&quot;b&#39;c");
  });

  it("isDangerousUrl / sanitizeUrl：拦截危险 scheme", () => {
    expect(isDangerousUrl("javascript:alert(1)")).toBe(true);
    expect(isDangerousUrl("JavaScript:alert(1)")).toBe(true);
    expect(isDangerousUrl("vbscript:msgbox(1)")).toBe(true);
    expect(isDangerousUrl("data:text/html,<script>")).toBe(true);
    // 零宽字符 / 空白混淆
    expect(isDangerousUrl("java\u200bscript:alert(1)")).toBe(true);
    expect(isDangerousUrl("java script:alert(1)")).toBe(true);
    expect(isDangerousUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(true);
    expect(sanitizeUrl("javascript:alert(1)")).toBe(null);
    expect(sanitizeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(sanitizeUrl("/path")).toBe("/path");
    expect(sanitizeUrl(null)).toBe(null);
  });
});
