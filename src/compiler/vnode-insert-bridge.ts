/**
 * 打破 `runtime.ts` 与 `vnode-mount.ts` 的循环依赖：VNode 子树挂载时需在内部再次调用
 * `insertReactive`，实现仅在 `runtime` 模块求值末尾注册一次。
 *
 * @module @dreamer/view/runtime/vnode-insert-bridge
 */

import type { InsertParent, InsertReactiveResult } from "./insert.ts";
import type { EffectDispose, VNode } from "../types.ts";

/**
 * insertReactive 的 getter 可返回值：与 insert.ts 的 InsertReactiveResult 一致（含编译器产出的 (parent)=>void），
 * 另可返回 VNode 供 Suspense 等路径展开。
 */
export type ReactiveInsertNext = InsertReactiveResult | VNode;

/** 主包 `insertReactive` 的完整签名（含 VNode 分支） */
export type InsertReactiveFullFn = (
  parent: InsertParent,
  getter: () => ReactiveInsertNext,
) => EffectDispose;

let insertReactiveImpl: InsertReactiveFullFn | undefined;

/**
 * 由 `runtime.ts` 在定义 `insertReactive` 之后调用一次，供 VNode 子树内嵌套 insertReactive。
 *
 * @param fn - 主包 insertReactive 实现
 */
export function setInsertReactiveForVnodeMount(fn: InsertReactiveFullFn): void {
  insertReactiveImpl = fn;
}

/**
 * VNode 展开路径内调用：与主包 insertReactive 等价，须在 setInsertReactiveForVnodeMount 之后使用。
 *
 * @param parent - 父节点
 * @param getter - 响应式 getter
 * @returns effect dispose
 */
export function insertReactiveForVnodeSubtree(
  parent: InsertParent,
  getter: () => ReactiveInsertNext,
): EffectDispose {
  if (!insertReactiveImpl) {
    throw new Error(
      "[view] VNode 子树 insertReactive 未绑定：请通过 @dreamer/view 主入口加载 runtime。",
    );
  }
  return insertReactiveImpl(parent, getter);
}
