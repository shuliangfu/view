/**
 * 手写 **`jsx`/`jsxs`（`jsxImportSource`）+ VNode 挂载** 时的常用 API 聚合导出，
 * 缩小与编译器「按 AST 按需注入 import」的体验差：业务可单文件从本子路径引入
 * **`insertReactive`、`mergeProps`、`unwrapSignalGetterValue`** 等与 VNode 路径配套的符号。
 *
 * **注意：** 首行对 `./compiler/mod.ts` 的副作用 import 会注册 `mountVNodeTree` 所需的
 * `insertReactive` 桥接（与 `jsx-runtime.ts` 内对齐；仅引 `@dreamer/view/jsx-runtime` 时也会加载 compiler 并完成注册）。
 * 本子路径仍保留聚合导出，请勿删首行以免仅引 `mountVNodeTree` 时运行时报未绑定。
 *
 * @module @dreamer/view/jsx-handoff
 * @packageDocumentation
 *
 * **导出概要：** `Fragment`、`jsx`、`jsxs`、`jsxDEV`、`jsxMerge`、`jsxMerges`；`mergeProps`、`mergeRefs`、`defaultProps`、`splitProps`、
 * `spreadIntrinsicProps`、`setIntrinsicDomAttribute`；`insert*`、`insertVNode`、`createRoot`、`render`、`hydrate`；`createSignal`、
 * `unwrapSignalGetterValue` 及常用 effect API；`createResource`、`lazy`、`mapArray`、`For`、`Index`、`Show`、`Switch`、`Match`、`Dynamic`（列表/条件控制流）；`mountVNodeTree`；`formatVNodeForDebug`。
 */

import "./compiler/mod.ts";

export {
  disableViewRuntimeDevWarnings,
  enableViewRuntimeDevWarnings,
} from "./dev-runtime-warn.ts";

export { formatVNodeForDebug } from "./vnode-debug.ts";
export type { FormatVNodeForDebugOptions } from "./vnode-debug.ts";

export { For, Index } from "./for.ts";
export type { ForProps, ListEachInput } from "./for.ts";
export { Show } from "./show.ts";
export type { ShowProps, ShowWhenInput } from "./show.ts";
export { Match, Switch } from "./switch-match.ts";
export type { SwitchMatchCase, SwitchProps } from "./switch-match.ts";
export { Dynamic } from "./dynamic.ts";
export type { DynamicProps } from "./dynamic.ts";

export {
  Fragment,
  jsx,
  jsxDEV,
  jsxMerge,
  jsxMerges,
  jsxs,
} from "./jsx-runtime.ts";

import { mountVNodeTree } from "./compiler/vnode-mount.ts";

export {
  mountVNodeTree,
  patchMountedIntrinsicElementProps,
  prepareIntrinsicElementForPropResync,
} from "./compiler/vnode-mount.ts";
export type { MountVNodeTreeOptions } from "./compiler/vnode-mount.ts";

/**
 * 手写路径下将 **VNode 子树** 挂到父节点，语义等价于对单棵子树执行 compile 产物里的 `insert(parent, …)`。
 * （`insert` 本模块仍来自 compiler，静态分支为避免与 vnode-mount 循环依赖而不直接接受 VNode。）
 *
 * @param parent - 挂载父节点
 * @param vnode - `jsx`/`jsxs` 产物或任意 `mountVNodeTree` 可识别的值
 */
export function insertVNode(parent: Node, vnode: unknown): void {
  mountVNodeTree(parent, vnode);
}

export {
  catchError,
  children,
  createDeferred,
  createEffect,
  createMemo,
  createReaction,
  createRenderEffect,
  createResource,
  createRoot,
  createScopeWithDisposers,
  createSignal,
  defaultProps,
  getCurrentEffect,
  getCurrentScope,
  getOwner,
  hydrate,
  insert,
  insertReactive,
  insertStatic,
  isSignalGetter,
  isSignalRef,
  lazy,
  mapArray,
  mergeProps,
  mergeRefs,
  on,
  onCleanup,
  onMount,
  render,
  runWithOwner,
  runWithScope,
  setCurrentEffect,
  setCurrentScope,
  setIntrinsicDomAttribute,
  setOwner,
  splitProps,
  spreadIntrinsicProps,
  untrack,
  unwrapSignalGetterValue,
} from "./compiler/mod.ts";

export type { HydrateContext } from "./compiler/mod.ts";
export type { InsertParent, InsertValue } from "./compiler/mod.ts";
export type {
  CreateDeferredOptions,
  CreateMemoOptions,
  CreateResourceOptions,
  EffectScope,
  LazyComponentModule,
  OnOptions,
  Owner,
  ResourceResult,
} from "./compiler/mod.ts";
export type { Root } from "./compiler/mod.ts";
