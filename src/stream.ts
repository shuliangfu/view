/**
 * @module @dreamer/view/stream
 * @description
 * 流式 SSR：将根组件渲染为逐块输出的字符串生成器，便于边渲染边写入 HTTP 响应，减少 TTFB。从本子路径导入可避免将流式逻辑打进主包。
 *
 * **本模块导出：**
 * - `renderToStream(fn, options?)`：根组件函数 + 可选 SSROptions（如 allowRawHtml），返回 Generator<string>
 *
 * **使用：** 可 `for (const chunk of renderToStream(fn))` 写入响应，或 `ReadableStream.from(renderToStream(fn))` 与 fetch/Response 配合。
 *
 * @example
 * import { renderToStream } from "jsr:@dreamer/view/stream";
 * const stream = renderToStream(() => <App />);
 * for (const chunk of stream) response.write(chunk);
 */

import { createElementToStream } from "./dom.ts";
import type { SSROptions } from "./dom.ts";
import type { VNode } from "./types.ts";

/**
 * 流式 SSR：将根组件渲染为逐块输出的字符串生成器，便于边渲染边写入响应
 *
 * @param fn 根组件函数
 * @param options allowRawHtml 为 false 时 dangerouslySetInnerHTML 输出转义文本（安全场景）；默认不转义
 * @returns 字符串生成器，可 for (const chunk of renderToStream(fn)) 或 ReadableStream.from(renderToStream(fn))
 */
export function renderToStream(
  fn: () => VNode,
  options?: SSROptions,
): Generator<string> {
  const vnode = fn();
  return createElementToStream(vnode, undefined, options);
}
