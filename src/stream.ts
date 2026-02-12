/**
 * View 模板引擎 — 流式 SSR（按需导入）
 *
 * 仅导出 renderToStream，使用方从 view/stream 导入可避免将流式逻辑打进主包。
 */

import { createElementToStream } from "./dom.ts";
import type { SSROptions } from "./dom.ts";
import type { VNode } from "./types.ts";

/**
 * 流式 SSR：将根组件渲染为逐块输出的字符串生成器，便于边渲染边写入响应
 *
 * @param fn 根组件函数
 * @param options allowRawHtml 为 false 时 v-html 输出转义文本（安全场景）；默认 v-html 在服务端不转义
 * @returns 字符串生成器，可 for (const chunk of renderToStream(fn)) 或 ReadableStream.from(renderToStream(fn))
 */
export function renderToStream(
  fn: () => VNode,
  options?: SSROptions,
): Generator<string> {
  const vnode = fn();
  return createElementToStream(vnode, undefined, options);
}
