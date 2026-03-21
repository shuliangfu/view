/**
 * **全编译产物**用的瘦入口：包含 `insert` / `createRoot` / SSR / Signal / Effect 等运行时原语，**不含** `jsx-runtime`、`directive`、`router`、`store` 等上层模块。
 *
 * 业务源码若仍含未编译 JSX，请使用主入口 `@dreamer/view` 或 `@dreamer/view/jsx-runtime`。
 *
 * @module @dreamer/view/compiled
 * @packageDocumentation
 *
 * **与主入口对齐的导出：** `createRef`、`createEffect`、`createMemo`、`onCleanup`、`untrack`、`getDocument`、`setGlobal`、`createRoot`、`render`、`mount`、`generateHydrationScript`、`insert`、`insertMount`、`insertReactive`、`insertStatic`、`getActiveDocument`、`renderToString`、`renderToStream`、`createSignal` 与相关类型等（见本文件 `export` 列表）
 */

export { createRef } from "./ref.ts";
export type { ElementRef } from "./ref.ts";
export { createEffect, createMemo, onCleanup, untrack } from "./effect.ts";
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
export { renderToStream, renderToString } from "./compiler/mod.ts";
export type { InsertParent, InsertValue, SSROptions } from "./compiler/mod.ts";
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
