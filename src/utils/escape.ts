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

/** 合法 HTML/XML 属性名：禁止空格、引号等注入。 */
const SAFE_ATTR_NAME = /^[A-Za-z_:][\w:.-]*$/;

/**
 * 是否可作为 attribute 名写入 DOM / 序列化进 HTML。
 */
export function isSafeAttrName(name: string): boolean {
  return SAFE_ATTR_NAME.test(name);
}

/**
 * 经 props 拒绝写入的危险 HTML 面（大小写不敏感）。
 * `srcdoc` 与 innerHTML 同级：iframe 内联文档可执行脚本。
 */
export function isDeniedHtmlContentProp(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "innerhtml" || lower === "outerhtml" || lower === "srcdoc";
}

/**
 * 真实 HTML 属性里恰好以 `on` 开头的名字；其余 `on*` 不得写成 attribute。
 */
const HTML_ON_PREFIX_ATTRS = new Set(["open", "once"]);

/**
 * JSX 事件 prop：`onX…`（第三字符大写），如 `onClick`。
 */
export function isJsxEventProp(name: string): boolean {
  return (
    name.length > 2 &&
    name.startsWith("on") &&
    name.charCodeAt(2) >= 65 &&
    name.charCodeAt(2) <= 90
  );
}

/**
 * 不得作为 HTML attribute 写入的 `on*` 名（含小写 `onclick`）。
 * `open` / `once` 是真实属性，排除在外；`onClick` 走事件绑定，也不应写成 attribute。
 */
export function isForbiddenOnAttrName(name: string): boolean {
  const lower = name.toLowerCase();
  if (!lower.startsWith("on")) return false;
  return !HTML_ON_PREFIX_ATTRS.has(lower);
}

/**
 * 转义注释数据，避免 `-->` / `--!>` 跳出注释。
 * 无 `--` 时零分配返回原串。
 */
export function escapeCommentData(s: string): string {
  if (!s.includes("--")) return s;
  return s.replaceAll("--", "- -");
}

/**
 * `data:` URL 中视为可执行或可嵌入活动内容的 MIME 子串。
 * 安全的 `data:image/png` 等不含这些标记。
 */
const DANGEROUS_DATA_MIME = /javascript|ecmascript|html|xml|svg|script/;

/**
 * 是否为危险 URL scheme（`javascript:` / `vbscript:` / 可执行 `data:` 等）。
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
  if (lower.startsWith("data:")) {
    const payload = lower.slice(5);
    const comma = payload.indexOf(",");
    const meta = comma === -1 ? payload : payload.slice(0, comma);
    const mime = meta.split(";", 1)[0]!;
    if (DANGEROUS_DATA_MIME.test(mime)) return true;
  }
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
export const URL_ATTR_NAMES: ReadonlySet<string> = new Set([
  "href",
  "src",
  "srcset",
  "xlink:href",
  "formaction",
  "action",
  "poster",
  "cite",
  "background",
  "ping",
  "data",
]);

/**
 * 危险的内联 style 属性名（历史 XSS：IE `behavior`、XBL `-moz-binding`）。
 * 比较前把 camelCase 收成小写 kebab；`__proto__` 等键一并拒绝。
 */
export function isDangerousStyleProperty(name: string): boolean {
  if (
    name === "__proto__" || name === "constructor" || name === "prototype"
  ) {
    return true;
  }
  let kebab = "";
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c >= 65 && c <= 90) kebab += "-" + String.fromCharCode(c + 32);
    else kebab += name[i]!;
  }
  const n = kebab.toLowerCase();
  return n === "behavior" || n === "binding" || n.endsWith("-binding");
}

/** 值是否含 expression / javascript: / vbscript: / @import，或 url() 里的危险地址。 */
function styleValueLooksDangerous(v: string): boolean {
  const lower = v.toLowerCase();
  if (
    lower.includes("expression(") ||
    lower.includes("javascript:") ||
    lower.includes("vbscript:") ||
    lower.includes("@import")
  ) {
    return true;
  }
  const re = /url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v)) !== null) {
    const inner = m[2]!.trim();
    if (inner && isDangerousUrl(inner)) return true;
  }
  return false;
}

/**
 * 内联 style 单值消毒。非字符串原样返回（如数字 `width: 10`）。
 */
export function sanitizeStyleValue(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return styleValueLooksDangerous(v) ? "" : v;
}

/**
 * 消毒整段 cssText：丢掉危险属性名与危险声明。
 */
export function sanitizeCssText(css: string): string {
  if (!css) return "";
  const parts: string[] = [];
  for (const part of css.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim();
    const val = part.slice(colon + 1).trim();
    if (!key || isDangerousStyleProperty(key)) continue;
    if (styleValueLooksDangerous(val)) continue;
    parts.push(`${key}:${val}`);
  }
  return parts.join(";");
}

export { escapeForScriptText, escapeForStyleText } from "./escape-raw-text.ts";
