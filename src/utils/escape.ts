/**
 * HTML / URL 转义与消毒，供 meta、SSR、props 等复用。
 *
 * @module utils/escape
 */

/** 文本：`&` `<` `>` */
const TEXT_SPECIAL = /[&<>]/;

/** 双引号属性：`&` `"` `<` `>` */
const ATTR_SPECIAL = /[&"<>]/;

/** 属性/片段（含撇号）：`&` `<` `>` `"` `'` */
const ATTR_HTML_SPECIAL = /[&<>"']/;

/**
 * 文本内容转义（标签内，防 XSS）。无特殊字符时零分配返回原串。
 */
export function escapeForText(s: string): string {
  if (!TEXT_SPECIAL.test(s)) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) out += "&amp;";
    else if (c === 60) out += "&lt;";
    else if (c === 62) out += "&gt;";
    else out += s[i]!;
  }
  return out;
}

/**
 * 属性值转义（双引号属性）。无特殊字符时零分配返回原串。
 */
export function escapeForAttr(s: string): string {
  if (!ATTR_SPECIAL.test(s)) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) out += "&amp;";
    else if (c === 34) out += "&quot;";
    else if (c === 60) out += "&lt;";
    else if (c === 62) out += "&gt;";
    else out += s[i]!;
  }
  return out;
}

/**
 * 属性与片段通用转义（title、meta content 等）。
 */
export function escapeForAttrHtml(s: string): string {
  if (!ATTR_HTML_SPECIAL.test(s)) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) out += "&amp;";
    else if (c === 60) out += "&lt;";
    else if (c === 62) out += "&gt;";
    else if (c === 34) out += "&quot;";
    else if (c === 39) out += "&#39;";
    else out += s[i]!;
  }
  return out;
}

/**
 * 是否为危险 URL scheme（`javascript:` / `vbscript:` / `data:text/html` 等）。
 * 剥离控制字符、零宽字符与空白后再判定，减轻混淆绕过。
 */
export function isDangerousUrl(url: string): boolean {
  // 去掉控制字符、DEL、常见零宽/BOM，再 trim
  let s = "";
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) continue;
    // ZWSP / ZWNJ / ZWJ / BOM / word joiner 等
    if (
      c === 0x200b || c === 0x200c || c === 0x200d || c === 0xfeff ||
      c === 0x2060
    ) continue;
    s += url[i]!;
  }
  s = s.trim();
  if (!s) return false;
  // 去掉 scheme 内嵌空白（含 NBSP）：`java\tscript:` / `java script:`
  const compact = s.replace(
    /[\s\u00a0\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g,
    "",
  );
  const lower = compact.toLowerCase();
  if (lower.startsWith("javascript:")) return true;
  if (lower.startsWith("vbscript:")) return true;
  if (lower.startsWith("data:text/html")) return true;
  // data: + HTML 变体（charset 等）：`data:text/html;base64,...` / `data:text/html;`
  if (lower.startsWith("data:") && lower.includes("text/html")) return true;
  return false;
}

/**
 * 净化 URL：危险 scheme 返回 `null`（调用方应移除属性）；安全则返回字符串。
 */
export function sanitizeUrl(url: unknown): string | null {
  if (url == null || url === false) return null;
  const s = String(url);
  if (isDangerousUrl(s)) return null;
  return s;
}
