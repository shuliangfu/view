/**
 * @fileoverview escape 工具：特殊字符转义、无特殊字符快路径、URL 消毒。
 */
import { describe, expect, it } from "@dreamer/test";
import {
  escapeCommentData,
  escapeForAttr,
  escapeForAttrHtml,
  escapeForText,
  isDangerousStyleProperty,
  isDangerousUrl,
  isDeniedHtmlContentProp,
  isForbiddenOnAttrName,
  isJsxEventProp,
  isSafeAttrName,
  sanitizeCssText,
  sanitizeSrcset,
  sanitizeStyleValue,
  sanitizeUrl,
  URL_ATTR_NAMES,
} from "../../../src/utils/escape.ts";
import {
  escapeForScriptText,
  escapeForStyleText,
} from "../../../src/utils/escape-raw-text.ts";

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

  it("sanitizeSrcset：危险候选整段拒绝；安全保留", () => {
    expect(sanitizeSrcset("/a.jpg 1x, /b.jpg 2x")).toContain("/a.jpg");
    expect(sanitizeSrcset("javascript:alert(1)")).toBe(null);
    expect(sanitizeSrcset("/ok.jpg 1x, javascript:alert(1) 2x")).toBe(null);
  });

  it("isDangerousUrl：拦截可执行 data: MIME，保留安全图片", () => {
    expect(isDangerousUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBe(
      true,
    );
    expect(isDangerousUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(true);
    expect(isDangerousUrl("data:text/javascript,alert(1)")).toBe(true);
    expect(isDangerousUrl("data:application/javascript,alert(1)")).toBe(true);
    expect(isDangerousUrl("data:application/ecmascript,alert(1)")).toBe(true);
    expect(isDangerousUrl("data:application/xhtml+xml,<html>")).toBe(true);
    expect(isDangerousUrl("data:text/xml,<x>")).toBe(true);
    expect(isDangerousUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isDangerousUrl("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isDangerousUrl("data:image/gif;base64,AAAA")).toBe(false);
    expect(isDangerousUrl("data:image/webp;base64,AAAA")).toBe(false);
    expect(sanitizeUrl("data:image/svg+xml,<svg></svg>")).toBe(null);
    expect(sanitizeUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("isSafeAttrName / 事件名规则", () => {
    expect(isSafeAttrName("title")).toBe(true);
    expect(isSafeAttrName("data-role")).toBe(true);
    expect(isSafeAttrName("xlink:href")).toBe(true);
    expect(isSafeAttrName('foo" onclick="alert(1)')).toBe(false);
    expect(isSafeAttrName("foo bar")).toBe(false);
    expect(isSafeAttrName("<script>")).toBe(false);
    expect(isDeniedHtmlContentProp("innerHTML")).toBe(true);
    expect(isDeniedHtmlContentProp("INNERHTML")).toBe(true);
    expect(isDeniedHtmlContentProp("srcDoc")).toBe(true);
    expect(isDeniedHtmlContentProp("title")).toBe(false);
    expect(isJsxEventProp("onClick")).toBe(true);
    expect(isJsxEventProp("onclick")).toBe(false);
    expect(isJsxEventProp("open")).toBe(false);
    expect(isForbiddenOnAttrName("onclick")).toBe(true);
    expect(isForbiddenOnAttrName("onClick")).toBe(true);
    expect(isForbiddenOnAttrName("open")).toBe(false);
    expect(isForbiddenOnAttrName("once")).toBe(false);
    expect(isForbiddenOnAttrName("title")).toBe(false);
  });

  it("escapeCommentData：打断注释结束符", () => {
    const plain = "mark";
    expect(escapeCommentData(plain)).toBe(plain);
    expect(escapeCommentData("foo-->bar")).toBe("foo- ->bar");
    expect(escapeCommentData("a--!>b")).toBe("a- -!>b");
  });

  it("URL_ATTR_NAMES 应包含 ping 与 object data", () => {
    expect(URL_ATTR_NAMES.has("ping")).toBe(true);
    expect(URL_ATTR_NAMES.has("data")).toBe(true);
    expect(URL_ATTR_NAMES.has("href")).toBe(true);
  });

  it("isDangerousStyleProperty：应拦截 behavior / binding 与原型键", () => {
    expect(isDangerousStyleProperty("behavior")).toBe(true);
    expect(isDangerousStyleProperty("binding")).toBe(true);
    expect(isDangerousStyleProperty("MozBinding")).toBe(true);
    expect(isDangerousStyleProperty("-moz-binding")).toBe(true);
    expect(isDangerousStyleProperty("webkitBinding")).toBe(true);
    expect(isDangerousStyleProperty("__proto__")).toBe(true);
    expect(isDangerousStyleProperty("constructor")).toBe(true);
    expect(isDangerousStyleProperty("color")).toBe(false);
    expect(isDangerousStyleProperty("backgroundImage")).toBe(false);
  });

  it("sanitizeStyleValue：应清空 expression / javascript: / 危险 url()，保留安全 data:image", () => {
    expect(sanitizeStyleValue("expression(alert(1))")).toBe("");
    expect(sanitizeStyleValue("javascript:alert(1)")).toBe("");
    expect(sanitizeStyleValue("vbscript:msgbox(1)")).toBe("");
    expect(sanitizeStyleValue("@import url(https://x)")).toBe("");
    expect(sanitizeStyleValue("url(javascript:alert(1))")).toBe("");
    expect(sanitizeStyleValue('url("data:text/html,hi")')).toBe("");
    expect(sanitizeStyleValue("url(data:image/svg+xml,<svg>)")).toBe("");
    expect(sanitizeStyleValue("url(data:image/png;base64,aaa)")).toBe(
      "url(data:image/png;base64,aaa)",
    );
    expect(sanitizeStyleValue("red")).toBe("red");
    expect(sanitizeStyleValue(10)).toBe(10);
  });

  it("sanitizeCssText：应丢掉危险属性名与危险声明，保留安全项", () => {
    const out = sanitizeCssText(
      "color: red; behavior: url(#default#VML); background: url(javascript:alert(1)); width: 10px",
    );
    expect(out).toContain("color:red");
    expect(out).toContain("width:10px");
    expect(out.toLowerCase()).not.toContain("behavior");
    expect(out).not.toContain("javascript:");
  });

  it("escapeForScriptText / escapeForStyleText：只打断结束标签，不把 < & 编成实体", () => {
    expect(escapeForScriptText("if (a < b && c) x();")).toBe(
      "if (a < b && c) x();",
    );
    expect(escapeForScriptText("foo</script><script>alert(1)")).toBe(
      "foo<\\/script><script>alert(1)",
    );
    expect(escapeForScriptText("foo</SCRIPT>bar")).toBe("foo<\\/SCRIPT>bar");
    expect(escapeForStyleText("a > b { color: #f00; }")).toBe(
      "a > b { color: #f00; }",
    );
    expect(escapeForStyleText("x</style><script>")).toBe(
      "x<\\/style><script>",
    );
  });
});
