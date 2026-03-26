/**
 * **服务端渲染（SSR）**子路径：字符串渲染、流式输出、伪 `document` 与影子 document 设置。
 * 纯 CSR 应用可只使用主入口 `@dreamer/view`，不必依赖本模块。
 *
 * @module @dreamer/view/ssr
 * @packageDocumentation
 *
 * **函数：** `getActiveDocument`、`setSSRShadowDocument`（无法替换全局 `document` 时挂影子 document）、`renderToString`、`renderToStream`、`createSSRDocument`
 *
 * **类型：** `SSROptions`、`SSRElement`、`SSRNode`、`SSRTextNode`、`SSRRawHtmlNode`
 *
 * @example
 * ```ts
 * import { renderToString, createSSRDocument } from "jsr:@dreamer/view/ssr";
 * ```
 */

export { getActiveDocument } from "./compiler/active-document.ts";
export { setSSRShadowDocument } from "./compiler/active-document.ts";
export { renderToStream, renderToString } from "./compiler/mod.ts";
export type { SSROptions } from "./compiler/mod.ts";
export { createSSRDocument } from "./compiler/ssr-document.ts";
export type {
  SSRElement,
  SSRNode,
  SSRTextNode,
} from "./compiler/ssr-document.ts";
export { SSRRawHtmlNode } from "./compiler/ssr-document.ts";
