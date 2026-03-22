/**
 * @module @dreamer/view/dom/element
 * @description
 * 当前仅保留 normalizeChildren（供类型与兼容用）；VNode→DOM 已全部走 compileSource 产物 + insert，不再导出 expandVNode/createElement 等。
 */

import { isSignalGetter, isSignalRef, type SignalRef } from "../signal.ts";
import type { VNode } from "../types.ts";
import { createTextVNode, isEmptyChild, isVNodeLike } from "./shared.ts";

/** 规范化后的子项：`VNode` 或 getter（历史/类型兼容；全编译路径下实际渲染由 `insert` 完成） */
export type ChildItem = VNode | (() => unknown);

/**
 * 规范化 `children`：支持单个 `VNode`、数组、`SignalRef`（转为 `() => ref.value` 以便手写 jsx-runtime 下插值可订阅）、
 * signal getter、普通函数或原始值（转为文本 `VNode`）。
 * 主要用于类型与兼容场景；全编译应用的实际 DOM 由编译产物与 `insert` 驱动。
 *
 * @param children - `props.children` 或 `vnode.children`
 * @returns 规范化后的子项数组（`VNode` 或 getter）
 */
export function normalizeChildren(children: unknown): ChildItem[] {
  if (isEmptyChild(children)) return [];
  /**
   * 手写 `jsx` 路径下 `{count.value}` 会在调用 `jsx` 时求值成快照；传 `{count}`（SignalRef 对象）则在此转为 getter，
   * 挂载时由 `insertReactive` 订阅，与 compileSource 下 `{expr}` 行为对齐。
   */
  if (isSignalRef(children)) {
    const ref = children as SignalRef<unknown>;
    return [() => ref.value];
  }
  if (isSignalGetter(children)) {
    return [children as () => unknown];
  }
  if (typeof children === "function") {
    return [children as () => unknown];
  }
  if (Array.isArray(children)) {
    let hasEmpty = false;
    let hasNested = false;
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (isEmptyChild(c)) {
        hasEmpty = true;
        break;
      }
      if (Array.isArray(c)) {
        hasNested = true;
        break;
      }
    }
    if (!hasEmpty && !hasNested) {
      const out: ChildItem[] = [];
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (typeof c === "function" || isSignalGetter(c)) {
          out.push(c as () => unknown);
        } else if (isSignalRef(c)) {
          const r = c as SignalRef<unknown>;
          out.push(() => r.value);
        } else if (isVNodeLike(c)) {
          out.push(c as VNode);
        } else {
          out.push(createTextVNode(c));
        }
      }
      return out;
    }
    const out: ChildItem[] = [];
    for (const c of children) {
      const items = normalizeChildren(c);
      for (const item of items) out.push(item);
    }
    return out;
  }
  if (isVNodeLike(children)) return [children as VNode];
  if (isSignalRef(children)) {
    const ref = children as SignalRef<unknown>;
    return [() => ref.value];
  }
  return [createTextVNode(children)];
}
