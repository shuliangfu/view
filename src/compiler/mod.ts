/**
 * 与自建 JSX 编译器配套的**编译运行时**聚合入口：插入原语、`createRoot` / `hydrate`、SSR、Props 工具，以及编译产物常用的 signal / effect API。
 *
 * 更新由「插入点 + `createEffect`」驱动，无需虚拟 DOM patch。业务可从此路径按需导入以减小与主入口不同的分包边界。
 *
 * @module @dreamer/view/compiler
 * @packageDocumentation
 *
 * **Document：** `getActiveDocument`
 *
 * **插入：** `insert`、`insertReactive`、`insertIrList`、`insertStatic`、`scheduleFunctionRef`
 *
 * **类型：** `InsertParent`、`InsertValue`
 *
 * **根与水合：** `createRoot`、`render`、`hydrate`，类型 `HydrateContext`
 *
 * **Props：** `mergeProps`、`mergeRefs`、`defaultProps`、`splitProps`、`spreadIntrinsicProps`、`setIntrinsicDomAttribute`、`eventBindingFromOnProp`、`eventNameFromOnProp`、`domAttributeNameFromPropKey`、`dataAttributeStringValue`
 *
 * **SSR：** `renderToString`、`renderToStream`、`createSSRDocument`，类型 `SSROptions`、`SSRElement`、`SSRNode`、`SSRTextNode`、`SSRRawHtmlNode`
 *
 * **响应式（编译产物常用）：** `createSignal`、`getCurrentEffect`、`setCurrentEffect`、`unwrapSignalGetterValue`、`createEffect`、`createRenderEffect`、`createMemo`、`children`、`createDeferred`、`createReaction`、`catchError`、`on`、`onCleanup`、`onMount`、`untrack`、`untrackReads`、`getCurrentScope`、`setCurrentScope`、`runWithScope`、`getOwner`、`setOwner`、`runWithOwner`、`createScopeWithDisposers`、`createResource`、`lazy`、`mapArray`（异步/列表）
 *
 * **类型：** `EffectDispose`、`Root`、`SignalGetter`、`SignalSetter`、`CreateEffectOptions`、`CreateMemoOptions`、`EffectScope`、`Owner`、`CreateResourceOptions`、`ResourceResult`、`LazyComponentModule`
 */

import {
  insert,
  insertIrList,
  insertReactive,
  insertStatic,
} from "./insert.ts";
import { setInsertReactiveForVnodeMount } from "./vnode-insert-bridge.ts";

/**
 * VNode 子树内嵌套 insertReactive 须与当前包的 insertReactive 为同一实现（与 runtime 入口在加载时注册一致）。
 * 仅引 @dreamer/view/compiler 时若不注册，mountVNodeTree 内响应式子节点会抛「未绑定」。
 */
setInsertReactiveForVnodeMount(insertReactive);

export { getActiveDocument } from "./active-document.ts";
export { insert, insertIrList, insertReactive, insertStatic };
export type { InsertParent, InsertValue } from "./insert.ts";
export { coalesceIrList, expandIrArray } from "./ir-coerce.ts";
export type { IrCoercedItem, IrListOptions } from "./ir-coerce.ts";
export { canPatchIntrinsic, patchIntrinsicSubtree } from "./vnode-reconcile.ts";
export { getIrMetrics, resetIrMetrics } from "./ir-metrics.ts";
export { isMountFn, markMountFn } from "./mount-fn.ts";
export { getChildNodesList } from "./insert-reactive-siblings.ts";
export { scheduleFunctionRef } from "./ref-dom.ts";
export { createRoot, render } from "./root.ts";
export { hydrate } from "./hydrate.ts";
export type { HydrateContext } from "./hydrate.ts";
export { defaultProps, mergeProps, mergeRefs, splitProps } from "./props.ts";
export {
  dataAttributeStringValue,
  domAttributeNameFromPropKey,
  eventBindingFromOnProp,
  eventNameFromOnProp,
  setIntrinsicDomAttribute,
  spreadIntrinsicProps,
} from "./spread-intrinsic.ts";
export { renderToStream, renderToString } from "./ssr.ts";
export type { SSROptions } from "./ssr.ts";
export { createSSRDocument } from "./ssr-document.ts";
export type { SSRElement, SSRNode, SSRTextNode } from "./ssr-document.ts";
export { SSRRawHtmlNode } from "./ssr-document.ts";

export {
  createSignal,
  getCurrentEffect,
  isSignalGetter,
  isSignalRef,
  setCurrentEffect,
  untrackReads,
  unwrapSignalGetterValue,
} from "../signal.ts";
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
} from "../effect.ts";
export type {
  CreateDeferredOptions,
  CreateEffectOptions,
  CreateMemoOptions,
  EffectScope,
  OnOptions,
  Owner,
} from "../effect.ts";
export { createResource, lazy, mapArray } from "../resource.ts";
export type {
  CreateResourceOptions,
  LazyComponentModule,
  ResourceResult,
} from "../resource.ts";
export type {
  EffectDispose,
  Root,
  SignalGetter,
  SignalSetter,
} from "../types.ts";
