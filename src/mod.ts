/**
 * 轻量响应式视图引擎主入口：Signal / Effect、细粒度 DOM 插入、客户端挂载与 Hydration 脚本生成。
 * 仅导出常用核心 API；SSR 字符串/流、路由、Store 等请从子路径按需导入以控制体积。
 *
 * @module @dreamer/view
 * @packageDocumentation
 *
 * **常量：** `KEY_VIEW_ROUTER`（根路由实例在 globalThis 上的键，供约定式布局等读取）
 *
 * **响应式：** `createSignal`（默认 `.value` 容器；第二参 `true` 时返回 `SignalTuple` / `[get, set]`）、`createRef`、`createEffect`、`createRenderEffect`（依赖更新同步或在 batch 末执行）、`createMemo`（可选第三参 `equals`）、`createDeferred`（派生值下一 rAF / `queueMicrotask` 提交）、`createReaction`、`catchError`（子 effect 抛错回调）、`on`（显式依赖列表）、`onCleanup`、`onMount`（首帧后微任务执行一次）、`untrack`、`untrackReads`（保留当前 effect、仅抑制读依赖，供高级场景）、`batch`、`getCurrentEffect`、`setCurrentEffect`、`getCurrentScope`、`setCurrentScope`、`runWithScope`、`createScopeWithDisposers`、`getOwner`、`setOwner`、`runWithOwner`、类型 `Owner`（后四者为与 `EffectScope` 同义的命名别名）、`isSignalGetter`、`isSignalRef`、`unwrapSignalGetterValue`（编译产物解包文本插值）
 *
 * **渲染与挂载：** `createRoot`、`render`、`mount`、`insert`、`insertMount`、`insertReactive`、`insertStatic`、`scheduleFunctionRef`（编译态函数 ref 调度）、`generateHydrationScript`（向 HTML 注入 `window` 数据与客户端脚本；完整 SSR API 见子路径 `@dreamer/view/ssr`）
 *
 * **编译态 Props：** `mergeProps`、`mergeRefs`、`defaultProps`、`splitProps`、`spreadIntrinsicProps`、`setIntrinsicDomAttribute`（与编译器产物配合）
 *
 * **异步与懒加载：** `createResource`、`lazy`、`mapArray`（亦见 `jsr:@dreamer/view/resource`）
 *
 * **列表与控制流（与 `vIf` 等指令并存）：** `For`、`Index`、`ForProps`、`Show`、`ShowProps`、`Switch`、`Match`、`SwitchProps`、`SwitchMatchCase`、`Dynamic`、`DynamicProps`、`insertIrList`、`IrListOptions`、`coalesceIrList`、`expandIrArray`、`IrCoercedItem`、`mapArray`（亦见 `jsr:@dreamer/view/for`、`jsr:@dreamer/view/show`、`jsr:@dreamer/view/switch-match`、`jsr:@dreamer/view/dynamic`）
 *
 * **调度（步骤 6）：** `batch`（同步块内推迟 `schedule`，最外层结束后一次 flush）、`flushScheduler`（同步排空主队列，测试/调试向，见 `scheduler.ts` 注释）、`setViewSchedulerFocusRestoreEnabled` / `getViewSchedulerFocusRestoreEnabled`（`flushQueue` 批末启发式恢复 `input`/`textarea`/`select` 焦点，默认关；**不能替代 reconcile**）、`KEY_VIEW_SCHEDULER_FOCUS_RESTORE_ENABLED`；组字期推迟 flush 为可选：`setGlobal(KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING, true)` 开启
 *
 * **环境：** `getDocument`（浏览器 `document` 或 SSR 影子 document；不可用时 `null`）、`setGlobal`（扩展全局键时使用）、`isDOMEnvironment`
 *
 * **类型：** `ElementRef`、`InsertParent`、`InsertValue`、`HydrationScriptOptions`、`EffectDispose`、`MountOptions`、`Root`、`SignalGetter`、`SignalSetter`、`SignalTuple`、`VNode`
 *
 * **常见子路径：** `@dreamer/view/ssr`、`@dreamer/view/store`、`@dreamer/view/reactive`、`@dreamer/view/router`、`@dreamer/view/compiler`、`@dreamer/view/jsx-runtime` 等（见包 `exports` 字段）。**手写 JSX**：亦可从本入口直接导入 `jsx` / `jsxs` / `jsxDEV` / `jsxMerge` / `jsxMerges` / `Fragment`（与 `@dreamer/view/jsx-runtime` 同源）。
 *
 * @example
 * ```ts
 * import { createSignal, createEffect, render, insert } from "jsr:@dreamer/view";
 * const count = createSignal(0);
 * render((el) => { insert(el, () => count.value); }, document.getElementById("root")!);
 * ```
 */

export {
  coalesceIrList,
  defaultProps,
  expandIrArray,
  getIrMetrics,
  isMountFn,
  markMountFn,
  mergeProps,
  mergeRefs,
  resetIrMetrics,
  scheduleFunctionRef,
  setIntrinsicDomAttribute,
  splitProps,
  spreadIntrinsicProps,
} from "./compiler/mod.ts";
export type { IrCoercedItem, IrListOptions } from "./compiler/mod.ts";
export type { InsertParent, InsertValue } from "./compiler/mod.ts";
export {
  KEY_VIEW_DEV,
  KEY_VIEW_IR_METRICS_ENABLED,
  KEY_VIEW_ROUTER,
  KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING,
  KEY_VIEW_SCHEDULER_FOCUS_RESTORE_ENABLED,
} from "./constants.ts";
export {
  disableViewRuntimeDevWarnings,
  enableViewRuntimeDevWarnings,
} from "./dev-runtime-warn.ts";
export {
  catchError,
  children,
  createDeferred,
  createEffect,
  createMemo,
  createReaction,
  createRenderEffect,
  createScopeWithDisposers,
  getCurrentScope,
  getOwner,
  on,
  onCleanup,
  onMount,
  runWithOwner,
  runWithScope,
  setCurrentScope,
  setOwner,
  untrack,
} from "./effect.ts";
export type {
  CreateDeferredOptions,
  CreateMemoOptions,
  EffectScope,
  OnOptions,
  Owner,
} from "./effect.ts";
export { createResource, lazy, mapArray } from "./resource.ts";
export type {
  CreateResourceOptions,
  LazyComponentModule,
  ResourceResult,
} from "./resource.ts";
export { For, Index } from "./for.ts";
export type { ForProps, ListEachInput } from "./for.ts";
export { Show } from "./show.ts";
export type { ShowProps, ShowWhenInput } from "./show.ts";
export { Match, Switch } from "./switch-match.ts";
export type { SwitchMatchCase, SwitchProps } from "./switch-match.ts";
export { Dynamic } from "./dynamic.ts";
export type { DynamicProps } from "./dynamic.ts";
export { getDocument, setGlobal } from "./globals.ts";
export {
  Fragment,
  jsx,
  jsxDEV,
  jsxMerge,
  jsxMerges,
  jsxs,
} from "./jsx-runtime.ts";
export { createRef } from "./ref.ts";
export type { ElementRef } from "./ref.ts";
export {
  createRoot,
  generateHydrationScript,
  insert,
  insertIrList,
  insertMount,
  insertReactive,
  insertStatic,
  mount,
  render,
} from "./runtime.ts";
export type { HydrationScriptOptions } from "./runtime.ts";
export {
  batch,
  flushScheduler,
  getViewSchedulerFocusRestoreEnabled,
  setViewSchedulerFocusRestoreEnabled,
} from "./scheduler.ts";
export {
  createSignal,
  getCurrentEffect,
  isSignalGetter,
  isSignalRef,
  setCurrentEffect,
  untrackReads,
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
