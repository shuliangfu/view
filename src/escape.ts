/**
 * 统一 HTML/属性转义，供 SSR、meta、hydration 等复用，保证行为一致并集中维护安全规则。
 *
 * @module @dreamer/view/escape
 * @internal 由 dom/stringify、meta、runtime 等使用，不单独导出到 package exports
 */

/**
 * 文本内容转义（用于标签内文本，防 XSS）
 * 转义 & < >
 */
export function escapeForText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 属性值转义（用于 HTML 属性，含双引号）
 * 转义 & " < >
 */
export function escapeForAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 属性与内容通用 HTML 转义（用于 meta、title 等，含单双引号）
 * 转义 & < > " '
 */
export function escapeForAttrHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
