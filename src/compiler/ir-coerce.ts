/**
 * `insertReactive` 从 getter 返回值到「可挂载项」的统一规范。
 *
 * **compiler 产物、主包 runtime、手写 jsx-runtime** 共用本模块，避免：
 * - 混合 `VNode` + `markMountFn` 的数组只挂载其中一类；
 * - 嵌套数组（`flatMap` / 二维行）与原始值在数组中的行为不一致；
 * - 与 `vnode-mount` 内 `reactiveInsertNextFromGetterResult` 分叉。
 *
 * @module @dreamer/view/compiler/ir-coerce
 * @internal 由 insert / runtime / vnode-mount 引用，业务请用 `insertReactive` 与 jsx
 */

import { createTextVNode, isEmptyChild, isVNodeLike } from "../dom/shared.ts";
import {
  isSignalGetter,
  isSignalRef,
  type SignalRef,
  unwrapSignalGetterValue,
} from "../signal.ts";
import type { VNode } from "../types.ts";
import { isMountFn } from "./mount-fn.ts";

/** 单条可插入项：本征/文本 VNode，或编译态单参挂载函数 */
export type IrCoercedItem = VNode | ((parent: Node) => void);

/**
 * 从响应式 getter 读原始返回值并做与 runtime/compiler 一致的 signal 解包。
 * 外层若直接返回 `createMemo` 等标记 getter，会先调用一次再 `unwrapSignalGetterValue`。
 *
 * @param getter - `insertReactive` 注册的零参函数
 * @returns 解包后的展示/挂载值（仍可能为数组、VNode、MountFn 等）
 */
export function readReactiveInsertRawFromGetter(
  getter: () => unknown,
): unknown {
  const raw = getter();
  return unwrapSignalGetterValue(
    typeof raw === "function" && isSignalGetter(raw)
      ? (raw as () => unknown)()
      : raw,
  );
}

/**
 * 剥掉多层无参非 signal 的 `() => …` 包装（如 `() => () => MountFn`），与 vnode-mount 历史行为一致。
 *
 * @param inner - getter 内层或已解包后的值
 * @returns 剥壳后的值
 */
export function peelThunksForReactiveInsert(inner: unknown): unknown {
  let v: unknown = inner;
  const maxUnwrap = 12;
  for (let d = 0; d < maxUnwrap; d++) {
    if (typeof v !== "function") break;
    const f = v as (p?: unknown) => unknown;
    if (f.length !== 0 || isSignalGetter(v as () => unknown)) break;
    v = (v as () => unknown)();
  }
  return v;
}

/**
 * 将数组中的**一项**规范为 0..n 个 `IrCoercedItem`（递归数组、读 SignalRef、剥 signal getter）。
 *
 * @param x - 数组元素或嵌套数组
 * @returns 扁平后的可插入项（空项已跳过）
 */
function coerceInsertReactiveArrayItem(
  x: unknown,
): IrCoercedItem[] {
  if (isEmptyChild(x)) return [];
  if (isSignalRef(x)) {
    return coerceInsertReactiveArrayItem((x as SignalRef<unknown>).value);
  }
  if (typeof x === "function" && isSignalGetter(x)) {
    return coerceInsertReactiveArrayItem((x as () => unknown)());
  }
  if (typeof x === "function" && isMountFn(x)) {
    return [x as (parent: Node) => void];
  }
  if (isVNodeLike(x)) return [x as VNode];
  /** 非 MountFn、非 signal getter 的函数勿 `String(fn)`，降级为空（与 vnode-mount 约定一致） */
  if (typeof x === "function") {
    return [];
  }
  if (Array.isArray(x)) {
    const out: IrCoercedItem[] = [];
    for (const y of x) {
      out.push(...coerceInsertReactiveArrayItem(y));
    }
    return out;
  }
  return [createTextVNode(x)];
}

/**
 * 与 `mapArray` 内 `list() || []` / `list() ?? []` 同向：把可为 null/undefined 的**数组源**规范成空数组，
 * 便于 `insertReactive(parent, () => coalesceIrList(items()))`（再由运行时 `expandIrArray` 扁平化）。
 *
 * @param list - 响应式列表（signal/memo 可能暂为 null）
 * @returns 非 null 的数组引用；若入参为 null/undefined 则返回稳定空数组字面量
 */
export function coalesceIrList<T>(
  list: readonly T[] | null | undefined,
): readonly T[] {
  return list ?? [];
}

/**
 * {@link insertIrList} 可选参数（与 `<For>`` 的 `fallback` 同向：列表无可见项时的占位）。
 */
export type IrListOptions = {
  /**
   * 列表源经 {@link coalesceIrList} 与 {@link expandIrArray} 扁平后长度为 0 时调用；
   * 返回值语义与 `insertReactive` 的 getter 一致（`VNode`、`MountFn`、文本等）。
   */
  fallback?: () => unknown;
};

/**
 * 将 `insertReactive` getter 返回的数组规范为扁平的 VNode | MountFn 列表，供统一挂载循环消费。
 *
 * @param arr - 顶层数组（如 `{list.map(...)}`、手写 `[a, b]`）；**null/undefined 视为空列表**（与同类方案 列表源容错一致）
 * @returns 扁平列表，长度 0 表示无内容
 */
export function expandIrArray(
  arr: readonly unknown[] | null | undefined,
): IrCoercedItem[] {
  if (arr == null) {
    return [];
  }
  const out: IrCoercedItem[] = [];
  for (const x of arr) {
    out.push(...coerceInsertReactiveArrayItem(x));
  }
  return out;
}
