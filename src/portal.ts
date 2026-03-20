/**
 * Portal：将子树挂载到指定 DOM 容器（如 document.body），弹窗、抽屉、toast 不受父级 overflow/z-index 影响。
 *
 * @module @dreamer/view/portal
 * @packageDocumentation
 *
 * **导出函数：** createPortal（支持直接传 VNode/getter 或 fn(container)）
 *
 * @example
 * // 直接传内容（推荐）：只传 VNode 或返回 VNode 的 getter
 * const root = createPortal(() => <Modal onClose={() => root.unmount()} />);
 * // 指定容器：createPortal(() => <Modal />, document.getElementById("modal-root")!);
 * // 或手写挂载：createPortal((el) => { insert(el, () => count()); });
 */

import { createRoot, insert } from "./runtime.ts";
import type { Root, VNode } from "./types.ts";
import type { InsertValue } from "./compiler/insert.ts";

/**
 * 将内容挂到指定容器（默认 document.body），脱离父级 DOM 层级与样式影响。
 * 支持两种用法：
 * 1. 直接传内容：children 为 VNode 或 () => VNode，内部用 createRoot + insert 挂载（推荐）
 * 2. 传挂载函数：fn 为 (container) => void，内部用 insert 等自行写入
 * 使用包装元素挂载，unmount 时只移除该包装，避免清空整个 body 导致主应用被删。
 *
 * @param childrenOrFn - VNode、返回 VNode 的 getter、或 (container) => void 挂载函数
 * @param container - 挂载目标，可选，默认 document.body
 * @returns Root 句柄，调用 unmount() 可卸载并回收 effect
 */
export function createPortal(
  childrenOrFn: VNode | (() => VNode | null) | ((container: Element) => void),
  container?: Element,
): Root {
  const target = container ??
    (typeof globalThis !== "undefined" &&
      (globalThis as { document?: { body?: Element } }).document?.body);
  if (!target) {
    throw new Error(
      "createPortal: container is required when document.body is not available (e.g. non-DOM environment).",
    );
  }
  const doc = target.ownerDocument ??
    (globalThis as { document?: Document }).document;
  if (!doc) {
    throw new Error("createPortal: container has no ownerDocument.");
  }
  const wrapper = doc.createElement("div");
  target.appendChild(wrapper);

  const isFn = typeof childrenOrFn === "function";
  const isMountFn = isFn && (childrenOrFn as (c: Element) => void).length > 0;

  const root = isMountFn
    ? createRoot(childrenOrFn as (container: Element) => void, wrapper)
    : createRoot(
      (el) => {
        insert(
          el,
          (isFn
            ? (childrenOrFn as () => VNode | null)
            : () => childrenOrFn as VNode) as InsertValue,
        );
      },
      wrapper,
    );

  return {
    unmount() {
      root.unmount();
      if (wrapper.parentNode) wrapper.remove();
    },
    get container() {
      return root.container;
    },
  };
}
