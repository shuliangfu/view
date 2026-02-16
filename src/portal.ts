/**
 * @module @dreamer/view/portal
 * @description
 * Portal：将子树挂载到指定 DOM 容器（如 document.body），弹窗、抽屉、toast 不受父级 overflow/z-index 影响。
 *
 * **本模块导出：**
 * - `createPortal(children, container?)`：将 children 渲染到 container，未传时默认 document.body
 *
 * @example
 * import { createPortal } from "jsr:@dreamer/view/portal";
 * const root = createPortal(() => <Modal />);
 * // 或指定容器：createPortal(() => <Modal />, document.getElementById("modal-root")!);
 * // 关闭时 root.unmount();
 */

import { createRoot } from "./runtime.ts";
import type { Root, VNode } from "./types.ts";

/**
 * 将 children 挂载到指定容器（默认 document.body），脱离父级 DOM 层级与样式影响。
 * 适用于弹窗、抽屉、toast 等需要浮于页面顶层的 UI。
 *
 * @param children - 根 VNode 或返回 VNode 的函数（函数形式可响应式更新）
 * @param container - 挂载目标，可选，默认 document.body；非 DOM 环境需传入容器
 * @returns Root 句柄，调用 unmount() 可卸载并回收 effect
 */
export function createPortal(
  children: VNode | (() => VNode),
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
  const fn = typeof children === "function" ? children : () => children;
  return createRoot(fn, target);
}
