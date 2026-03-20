/**
 * 流式 SSR：将编译后组件渲染为逐块输出的异步生成器，便于边渲染边写入 HTTP 响应。
 *
 * @module @dreamer/view/stream
 * @packageDocumentation
 *
 * **导出：** renderToStream（与主包、runtime 一致，均为编译路径 fn(container)）
 *
 * 可 `for await (const chunk of renderToStream(fn))` 写入响应，或与 ReadableStream 配合。
 *
 * @example
 * const stream = renderToStream((el) => { insert(el, "A"); insert(el, "B"); });
 * for await (const chunk of stream) response.write(chunk);
 */

export { renderToStream } from "./compiler/mod.ts";
export type { SSROptions } from "./compiler/mod.ts";
