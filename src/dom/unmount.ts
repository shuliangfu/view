/**
 * @module @dreamer/view/dom/unmount
 * @description
 * View 模板引擎 — 指令 unmount 登记与执行。在 replaceChildren / removeChild 前对节点及其子树执行已登记的指令 unmounted 回调（先子后父）。
 *
 * **本模块导出：**
 * - `registerDirectiveUnmount(node, cb)`：为元素或占位节点（如 Comment）登记 unmounted 回调
 * - `runDirectiveUnmountOnChildren(parent)`：对父节点的所有子节点依次执行 runDirectiveUnmount
 * - `runDirectiveUnmount(node)`：对节点及其子树递归执行已登记的指令 unmounted 回调
 */

import type { ElementWithViewData } from "../types.ts";

/** 非 Element 节点（如 Comment 占位）上登记的 unmount 回调，避免在 DOM 上挂自动生成的 span */
const _nodeUnmountMap = new WeakMap<Node, (() => void)[]>();

/**
 * 为元素或占位节点（如 Comment）登记 unmounted 回调。
 * 当该节点从 DOM 移除前，会按登记顺序执行这些回调。
 * 支持 Comment 占位，便于动态插入点不产生额外 span 等包裹节点。
 *
 * @param node - 要登记回调的 DOM 节点（Element 或 Comment 等）
 * @param cb - unmount 时执行的清理函数
 */
export function registerDirectiveUnmount(node: Node, cb: () => void): void {
  if (node.nodeType === 1) {
    const viewEl = node as ElementWithViewData;
    (viewEl.__viewDirectiveUnmount ??= []).push(cb);
    return;
  }
  const list = _nodeUnmountMap.get(node) ?? [];
  list.push(cb);
  _nodeUnmountMap.set(node, list);
}

/**
 * 对父节点的所有子节点依次执行 runDirectiveUnmount。
 * 在 replaceChildren / removeChild 前调用，确保子节点上的指令先于父节点执行 unmount。
 *
 * @param parent - 父节点
 */
export function runDirectiveUnmountOnChildren(parent: Node): void {
  for (const child of Array.from(parent.childNodes)) {
    runDirectiveUnmount(child);
  }
}

/**
 * 对节点及其子树递归执行已登记的指令 unmounted 回调。
 * 执行顺序为先子后父（先递归子节点，再执行当前节点上的回调）。
 *
 * @param node - 起始节点（通常为即将被移除的根）
 */
export function runDirectiveUnmount(node: Node): void {
  runDirectiveUnmountOnChildren(node);
  if (node.nodeType === 1) {
    const list = (node as ElementWithViewData).__viewDirectiveUnmount;
    if (list) {
      for (const cb of list) cb();
      list.length = 0;
    }
    return;
  }
  const list = _nodeUnmountMap.get(node);
  if (list) {
    for (const cb of list) cb();
    _nodeUnmountMap.delete(node);
  }
}
