/**
 * View 模板引擎 — 指令 unmount 登记与执行
 *
 * 在 replaceChildren / removeChild 前对节点及其子树执行已登记的指令 unmounted 回调（先子后父）
 */

import type { ElementWithViewData } from "../types.ts";

/**
 * 为元素登记指令 unmounted 回调，节点从 DOM 移除前会执行（由 applyDirectives 调用）
 */
export function registerDirectiveUnmount(el: Element, cb: () => void): void {
  const viewEl = el as ElementWithViewData;
  const list = viewEl.__viewDirectiveUnmount;
  if (list) list.push(cb);
  else viewEl.__viewDirectiveUnmount = [cb];
}

/**
 * 对父节点的子节点依次执行 runDirectiveUnmount（先子后父由 runDirectiveUnmount 内部递归保证）
 * 在 replaceChildren / removeChild 前调用，统一抽取以减少重复
 */
export function runDirectiveUnmountOnChildren(parent: Node): void {
  for (const child of Array.from(parent.childNodes)) {
    runDirectiveUnmount(child);
  }
}

/**
 * 对节点及其子树递归执行已登记的指令 unmounted 回调（先子后父）
 * 在 replaceChildren / removeChild 前调用，确保节点移除前完成清理
 */
export function runDirectiveUnmount(node: Node): void {
  if (node.nodeType === 1) {
    const el = node as Element;
    runDirectiveUnmountOnChildren(el);
    const list = (el as ElementWithViewData).__viewDirectiveUnmount;
    if (list) {
      for (const cb of list) cb();
      list.length = 0;
    }
  } else if (node.nodeType === 11) {
    const frag = node as DocumentFragment;
    runDirectiveUnmountOnChildren(frag);
  }
}
