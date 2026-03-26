/**
 * 运行时共享：resolveMountContainer、NOOP_ROOT、removeCloak。
 * 供 `runtime.ts`（主包）与 `runtime-csr.ts`（csr/hybrid 共用）的 mount 等复用。
 * @internal 仅由上述 runtime 模块使用，不对外导出
 */

import type { Root } from "./types.ts";

/** 容器未找到或非 DOM 时 mount 返回的空 Root，避免重复创建对象 */
export const NOOP_ROOT: Root = { unmount: () => {}, container: null };

/**
 * 将 mount 的 container 参数解析为 Element。
 * - 若为 Element 直接返回；
 * - 若为 string 则用 document.querySelector 查找，找不到时根据 noopIfNotFound 返回 null 或抛错。
 *
 * @param container 选择器（如 "#root"）或 DOM 元素
 * @param noopIfNotFound 为 true 时查不到元素返回 null；为 false 时抛 Error
 * @returns 解析后的元素，或 null（仅当 noopIfNotFound 且未找到时）
 */
export function resolveMountContainer(
  container: string | Element,
  noopIfNotFound: boolean,
): Element | null {
  if (
    typeof container === "object" && container != null &&
    "nodeType" in container
  ) {
    return container as Element;
  }
  const doc = typeof globalThis !== "undefined"
    ? (globalThis as { document?: Document }).document
    : undefined;
  if (!doc) {
    if (noopIfNotFound) return null;
    throw new Error("Mount: document not available (non-DOM environment).");
  }
  const el = doc.querySelector(String(container));
  if (!el) {
    if (noopIfNotFound) return null;
    throw new Error(
      `Mount: container not found for selector "${String(container)}".`,
    );
  }
  return el;
}

/**
 * 移除容器及其子树上的 data-view-cloak 属性，配合 CSS [data-view-cloak]{display:none} 减少 FOUC。
 * 业务侧如需在自定义挂载后移除 cloak 可调用此方法。
 */
export function removeCloak(container: Element): void {
  if (container.hasAttribute("data-view-cloak")) {
    container.removeAttribute("data-view-cloak");
  }
  const list = container.querySelectorAll("[data-view-cloak]");
  for (let i = 0; i < list.length; i++) {
    list[i].removeAttribute("data-view-cloak");
  }
}
