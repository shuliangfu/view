/**
 * @module @dreamer/view/dom/element
 * @description
 * 当前仅保留 normalizeChildren（供类型与兼容用）；VNode→DOM 已全部走 compileSource 产物 + insert，不再导出 expandVNode/createElement 等。
 */

import { isSignalGetter } from "../signal.ts";
import type { VNode } from "../types.ts";
import { createTextVNode, isEmptyChild, isVNodeLike } from "./shared.ts";

/** 规范化后的子项：`VNode` 或 getter（历史/类型兼容；全编译路径下实际渲染由 `insert` 完成） */
export type ChildItem = VNode | (() => unknown);

/**
 * 规范化 `children`：支持单个 `VNode`、数组、signal getter、普通函数或原始值（转为文本 `VNode`）。
 * 主要用于类型与兼容场景；全编译应用的实际 DOM 由编译产物与 `insert` 驱动。
 *
 * @param children - `props.children` 或 `vnode.children`
 * @returns 规范化后的子项数组（`VNode` 或 getter）
 */
export function normalizeChildren(children: unknown): ChildItem[] {
  if (isEmptyChild(children)) return [];
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
  return [createTextVNode(children)];
}
