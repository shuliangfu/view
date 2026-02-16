/**
 * 流式 SSR：将根组件渲染为逐块输出的字符串生成器，便于边渲染边写入 HTTP 响应，减少 TTFB。
 *
 * @module @dreamer/view/stream
 * @packageDocumentation
 *
 * **导出函数：** renderToStream
 *
 * 可 `for (const chunk of renderToStream(fn))` 写入响应，或 `ReadableStream.from(renderToStream(fn))` 与 fetch/Response 配合。
 *
 * @example
 * const stream = renderToStream(() => <App />);
 * for (const chunk of stream) response.write(chunk);
 */

import { KEY_VIEW_SSR } from "./constants.ts";
import { createElementToStream } from "./dom.ts";
import type { SSROptions } from "./dom.ts";
import type { VNode } from "./types.ts";
import { setGlobal } from "./globals.ts";

const SSR_DOCUMENT_MESSAGE =
  "document is not available during server-side rendering. Do not use document or window in components rendered with renderToString() or renderToStream(). Use conditional checks (e.g. if (typeof document !== 'undefined')) or move the logic to client-only code (e.g. createEffect, onMount).";

function createSSRDocumentGuard(): Document {
  return new Proxy({} as Document, {
    get() {
      throw new Error(SSR_DOCUMENT_MESSAGE);
    },
  });
}

/**
 * 流式 SSR：将根组件渲染为逐块输出的字符串生成器，便于边渲染边写入响应。
 * 执行期间设置 KEY_VIEW_SSR，便于 getDocument() 等在误用 document 时抛出明确错误。
 *
 * @param fn - 根组件函数，返回 VNode
 * @param options - 可选；allowRawHtml 为 false 时 dangerouslySetInnerHTML 输出转义文本（安全），默认不转义
 * @returns 字符串生成器 Generator<string>，可 for (const chunk of renderToStream(fn)) 或 ReadableStream.from(renderToStream(fn))
 */
export function renderToStream(
  fn: () => VNode,
  options?: SSROptions,
): Generator<string> {
  const vnode = fn();
  const inner = createElementToStream(vnode, undefined, options);
  return (function* () {
    setGlobal(KEY_VIEW_SSR, true);
    const g = globalThis as { document?: Document };
    const origDoc = g.document;
    g.document = createSSRDocumentGuard();
    try {
      yield* inner;
    } finally {
      g.document = origDoc;
      setGlobal(KEY_VIEW_SSR, false);
    }
  })();
}
