/**
 * HTML / 属性转义，供 meta 片段、SSR 等复用，集中维护安全规则。
 *
 * @module utils/escape
 */

/**
 * 文本内容转义（标签内文本，防 XSS）：`&` `<` `>`
 * 无特殊字符时零分配返回原串（meta / SSR 热路径常见）。
 */
export function escapeForText(s: string): string {
  if (
    s.indexOf("&") === -1 && s.indexOf("<") === -1 && s.indexOf(">") === -1
  ) {
    return s;
  }
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 属性值转义（双引号属性）：`&` `"` `<` `>`
 */
export function escapeForAttr(s: string): string {
  if (
    s.indexOf("&") === -1 && s.indexOf('"') === -1 &&
    s.indexOf("<") === -1 && s.indexOf(">") === -1
  ) {
    return s;
  }
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 属性与片段通用转义（title、meta content 等）：`&` `<` `>` `"` `'`
 */
export function escapeForAttrHtml(s: string): string {
  if (
    s.indexOf("&") === -1 && s.indexOf("<") === -1 &&
    s.indexOf(">") === -1 && s.indexOf('"') === -1 && s.indexOf("'") === -1
  ) {
    return s;
  }
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
