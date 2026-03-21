/**
 * 轻量响应式视图引擎主入口：Signal / Effect、细粒度 DOM 插入、客户端挂载与 Hydration 脚本生成。
 * 仅导出常用核心 API；SSR 字符串/流、路由、Store 等请从子路径按需导入以控制体积。
 *
 * @module @dreamer/view
 * @packageDocumentation
 *
 * **常量：** `KEY_VIEW_ROUTER`（根路由实例在 globalThis 上的键，供约定式布局等读取）
 *
 * **响应式：** `createSignal`（返回 `.value` 容器）、`createRef`、`createEffect`、`createMemo`、`onCleanup`、`untrack`、`getCurrentEffect`、`setCurrentEffect`、`isSignalGetter`、`isSignalRef`、`unwrapSignalGetterValue`（编译产物解包文本插值）
 *
 * **渲染与挂载：** `createRoot`、`render`、`mount`、`insert`、`insertMount`、`insertReactive`、`insertStatic`、`scheduleFunctionRef`（编译态函数 ref 调度）、`generateHydrationScript`（向 HTML 注入 `window` 数据与客户端脚本；完整 SSR API 见子路径 `@dreamer/view/ssr`）
 *
 * **编译态 Props：** `mergeProps`、`splitProps`、`spreadIntrinsicProps`（与编译器产物配合）
 *
 * **环境：** `getDocument`（浏览器 `document` 或 SSR 影子 document；不可用时 `null`）、`setGlobal`（扩展全局键时使用）、`isDOMEnvironment`
 *
 * **类型：** `ElementRef`、`InsertParent`、`InsertValue`、`HydrationScriptOptions`、`EffectDispose`、`MountOptions`、`Root`、`SignalGetter`、`SignalSetter`、`SignalTuple`、`VNode`
 *
 * **常见子路径：** `@dreamer/view/ssr`、`@dreamer/view/store`、`@dreamer/view/reactive`、`@dreamer/view/router`、`@dreamer/view/compiler`、`@dreamer/view/jsx-runtime` 等（见包 `exports` 字段）
 *
 * @example
 * ```ts
 * import { createSignal, createEffect, render, insert } from "jsr:@dreamer/view";
 * const count = createSignal(0);
 * render((el) => { insert(el, () => count.value); }, document.getElementById("root")!);
 * ```
 */

export {
  mergeProps,
  scheduleFunctionRef,
  splitProps,
  spreadIntrinsicProps,
} from "./compiler/mod.ts";
export type { InsertParent, InsertValue } from "./compiler/mod.ts";
export { KEY_VIEW_ROUTER } from "./constants.ts";
export { createEffect, createMemo, onCleanup, untrack } from "./effect.ts";
export { getDocument, setGlobal } from "./globals.ts";
export { createRef } from "./ref.ts";
export type { ElementRef } from "./ref.ts";
export {
  createRoot,
  generateHydrationScript,
  insert,
  insertMount,
  insertReactive,
  insertStatic,
  mount,
  render,
} from "./runtime.ts";
export type { HydrationScriptOptions } from "./runtime.ts";
export {
  createSignal,
  getCurrentEffect,
  isSignalGetter,
  isSignalRef,
  setCurrentEffect,
  unwrapSignalGetterValue,
} from "./signal.ts";
export type { SignalRef } from "./signal.ts";
export { isDOMEnvironment } from "./types.ts";
export type {
  EffectDispose,
  MountOptions,
  Root,
  SignalGetter,
  SignalSetter,
  SignalTuple,
  VNode,
} from "./types.ts";
