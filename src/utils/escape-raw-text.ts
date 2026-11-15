/**
 * SSR 原始文本元素的结束标签打断（不把 `<` `&` 编成实体）。
 *
 * @module utils/escape-raw-text
 */

/**
 * `<script>` 文本序列化：打断 `</script` 破出，不把 `<` `&` 编成实体（否则会改写 JS）。
 */
export function escapeForScriptText(s: string): string {
  return /<\/script/i.test(s)
    ? s.replace(/<\/script/gi, (m) => `${m[0]}\\/${m.slice(2)}`)
    : s;
}

/**
 * `<style>` 文本序列化：打断 `</style` 破出，保留 CSS 里的 `<` `&`。
 */
export function escapeForStyleText(s: string): string {
  return /<\/style/i.test(s)
    ? s.replace(/<\/style/gi, (m) => `${m[0]}\\/${m.slice(2)}`)
    : s;
}
