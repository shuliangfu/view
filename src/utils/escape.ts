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

/**
 * 消毒 `srcset`：按逗号拆候选，对每个 URL（首个非空白 token）跑 {@link sanitizeUrl}；
 * **任一**危险则整段返回 `null`（调用方应移除属性，不写入半残列表）。
 *
 * 为何不只对整串 `sanitizeUrl`：合法 srcset 形如 `/a.jpg 1x, javascript:… 2x`，
 * 整串不以危险 scheme 开头，会漏过嵌入的危险候选。描述符（`1x`／`100w`）原样保留。
 * 不解析带括号／引号的稀有写法——与现行 HTML 常见产出对齐；那种应走应用层清洗。
 */
export function sanitizeSrcset(value: unknown): string | null {
  if (value == null || value === false) return null;
  const s = String(value);
  const parts = s.split(",");
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\S+)(\s+.*)?$/);
    const url = m ? m[1]! : trimmed;
    const rest = m && m[2] ? m[2] : "";
    const sanitized = sanitizeUrl(url);
    if (sanitized == null) return null;
    out.push(sanitized + rest);
  }
  return out.length ? out.join(", ") : null;
}

/**
 * SSR／CSR props 共用：需 URL 消毒的 attribute 名（**小写**比较）。
 * 与 `setProperty`／`SsrElement.setAttribute` 同源，避免两条路径漏防。
 * `srcdoc` 不在此列——属危险 HTML 面，由 props 层整段拒绝，而非 URL 消毒。
 */
export const URL_ATTR_NAMES = new Set([
  "href",
  "src",
  "srcset",
  "xlink:href",
  "formaction",
  "action",
  "poster",
  "cite",
  "background",
]);
