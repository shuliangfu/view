/**
 * 手写 **`jsx`/`jsxs`（`jsxImportSource`）+ VNode 挂载** 时的常用 API 聚合导出，
 * 缩小与编译器「按 AST 按需注入 import」的体验差：业务可单文件从本子路径引入
 * **`insertReactive`、`mergeProps`、`unwrapSignalGetterValue`** 等与 VNode 路径配套的符号。
 *
 * **注意：** 首行对 `./compiler/mod.ts` 的副作用 import 会注册 `mountVNodeTree` 所需的
 * `insertReactive` 桥接，请勿删以免仅引 `mountVNodeTree` 时运行时报未绑定。
 *
 * @module @dreamer/view/jsx-handoff
 * @packageDocumentation
 *
 * **导出概要：** `Fragment`、`jsx`、`jsxs`、`jsxMerge`；`mergeProps`、`splitProps`、
 * `spreadIntrinsicProps`、`setIntrinsicDomAttribute`；`insert*`、`insertVNode`、`createRoot`、`render`、`hydrate`；`createSignal`、
 * `unwrapSignalGetterValue` 及常用 effect API；`mountVNodeTree`；`formatVNodeForDebug`。
 */

import "./compiler/mod.ts";

export {
  disableViewRuntimeDevWarnings,
  enableViewRuntimeDevWarnings,
} from "./dev-runtime-warn.ts";

export { formatVNodeForDebug } from "./vnode-debug.ts";
export type { FormatVNodeForDebugOptions } from "./vnode-debug.ts";

export { Fragment, jsx, jsxMerge, jsxs } from "./jsx-runtime.ts";

import { mountVNodeTree } from "./compiler/vnode-mount.ts";

export { mountVNodeTree } from "./compiler/vnode-mount.ts";
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
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  getCurrentEffect,
  hydrate,
  insert,
  insertReactive,
  insertStatic,
  isSignalGetter,
  isSignalRef,
  mergeProps,
  onCleanup,
  render,
  setCurrentEffect,
  setIntrinsicDomAttribute,
  splitProps,
  spreadIntrinsicProps,
  untrack,
  unwrapSignalGetterValue,
} from "./compiler/mod.ts";

export type { HydrateContext } from "./compiler/mod.ts";
export type { InsertParent, InsertValue } from "./compiler/mod.ts";
export type { Root } from "./compiler/mod.ts";
