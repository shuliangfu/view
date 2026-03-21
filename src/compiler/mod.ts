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
 * **插入：** `insert`、`insertReactive`、`insertStatic`、`scheduleFunctionRef`
 *
 * **类型：** `InsertParent`、`InsertValue`
 *
 * **根与水合：** `createRoot`、`render`、`hydrate`，类型 `HydrateContext`
 *
 * **Props：** `mergeProps`、`splitProps`、`spreadIntrinsicProps`
 *
 * **SSR：** `renderToString`、`renderToStream`、`createSSRDocument`，类型 `SSROptions`、`SSRElement`、`SSRNode`、`SSRTextNode`
 *
 * **响应式（编译产物常用）：** `createSignal`、`getCurrentEffect`、`setCurrentEffect`、`unwrapSignalGetterValue`、`createEffect`、`createMemo`、`onCleanup`、`untrack`
 *
 * **类型：** `EffectDispose`、`Root`、`SignalGetter`、`SignalSetter`、`CreateEffectOptions`、`EffectScope`
 */

import { insert, insertReactive, insertStatic } from "./insert.ts";
import { setInsertReactiveForVnodeMount } from "./vnode-insert-bridge.ts";

/**
 * VNode 子树内嵌套 insertReactive 须与当前包的 insertReactive 为同一实现（与 runtime 入口在加载时注册一致）。
 * 仅引 @dreamer/view/compiler 时若不注册，mountVNodeTree 内响应式子节点会抛「未绑定」。
 */
setInsertReactiveForVnodeMount(insertReactive);

export { getActiveDocument } from "./active-document.ts";
export { insert, insertReactive, insertStatic };
export type { InsertParent, InsertValue } from "./insert.ts";
export { scheduleFunctionRef } from "./ref-dom.ts";
export { createRoot, render } from "./root.ts";
export { hydrate } from "./hydrate.ts";
export type { HydrateContext } from "./hydrate.ts";
export { mergeProps, splitProps } from "./props.ts";
export { spreadIntrinsicProps } from "./spread-intrinsic.ts";
export { renderToStream, renderToString } from "./ssr.ts";
export type { SSROptions } from "./ssr.ts";
export { createSSRDocument } from "./ssr-document.ts";
export type { SSRElement, SSRNode, SSRTextNode } from "./ssr-document.ts";

export {
  createSignal,
  getCurrentEffect,
  setCurrentEffect,
  unwrapSignalGetterValue,
} from "../signal.ts";
export { createEffect, createMemo, onCleanup, untrack } from "../effect.ts";
export type { CreateEffectOptions, EffectScope } from "../effect.ts";
export type {
  EffectDispose,
  Root,
  SignalGetter,
  SignalSetter,
} from "../types.ts";
