/**
 * **全编译产物**用的瘦入口：包含 `insert` / `createRoot` / SSR / Signal / Effect 等运行时原语，**不含** `jsx-runtime`、`directive`、`router`、`store` 等上层模块。
 *
 * 业务源码若仍含未编译 JSX，请使用主入口 `@dreamer/view` 或 `@dreamer/view/jsx-runtime`。
 *
 * @module @dreamer/view/compiled
 * @packageDocumentation
 *
 * **与主入口对齐的导出：** `createRef`、`createEffect`、`createRenderEffect`、`createMemo`、`children`、`createDeferred`、`createReaction`、`catchError`、`on`、`onCleanup`、`onMount`、`untrack`、`getDocument`、`setGlobal`、`createRoot`、`render`、`mount`、`generateHydrationScript`、`insert`、`insertMount`、`insertReactive`、`insertStatic`、`getActiveDocument`、`renderToString`、`renderToStream`、`createSignal`、`mergeRefs`、`defaultProps`、`createResource`、`lazy`、`mapArray` 与相关类型等（见本文件 `export` 列表）
 */

export { createRef } from "./ref.ts";
export type { ElementRef } from "./ref.ts";
/** Signal / Effect / Resource / 控制流 / 常用类型：与 `@dreamer/view/csr` 核心子集同源（见 `client-exports.ts`） */
export * from "./client-exports.ts";
export { getDocument, setGlobal } from "./globals.ts";
export {
  createRoot,
  generateHydrationScript,
  mount,
  render,
} from "./runtime.ts";
export type { HydrationScriptOptions } from "./runtime.ts";
export {
  insert,
  insertMount,
  insertReactive,
  insertStatic,
} from "./runtime.ts";
export { getActiveDocument } from "./compiler/active-document.ts";
export {
  defaultProps,
  mergeRefs,
  renderToStream,
  renderToString,
} from "./compiler/mod.ts";
export type { InsertParent, InsertValue, SSROptions } from "./compiler/mod.ts";
