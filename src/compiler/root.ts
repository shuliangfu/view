/**
 * 运行时 — createRoot（仅跑一次根 + 插入点）
 *
 * 只执行一次 fn(container)，fn 内通过 insert(container, ...) 建立 DOM 与绑定点，
 * 更新完全由 insert 内的 effect 驱动。挂载完成后移除 data-view-cloak，配合 CSS 减少 FOUC。
 *
 * @module @dreamer/view/runtime/root
 */

import { createScopeWithDisposers, setCurrentScope } from "../effect.ts";
import { removeCloak } from "../runtime-shared.ts";
import type { Root } from "../types.ts";

/**
 * 创建根：fn(container) 只执行一次，内部用 insert 建立 DOM 与响应式绑定点。
 * 卸载时回收该根下所有通过 insert/createEffect 登记的 effect。
 *
 * @param fn - 接收挂载容器，内部应调用 insert(container, ...) 等建立 UI；仅执行一次
 * @param container - 挂载目标 DOM 元素
 * @returns Root 句柄，unmount 时清理所有 effect
 *
 * @example
 * createRoot((el) => {
 *   const div = document.createElement('div');
 *   el.appendChild(div);
 *   insert(div, () => count());
 * }, document.getElementById('root')!);
 */
export function createRoot(
  fn: (container: Element) => void,
  container: Element,
): Root {
  if (container == null) {
    throw new Error(
      "createRoot: container is null or undefined. Ensure the mount target exists (e.g. document.getElementById('root')).",
    );
  }
  const scope = createScopeWithDisposers();
  setCurrentScope(scope);
  try {
    fn(container);
    removeCloak(container);
  } catch (err) {
    console.error("[view] createRoot 执行 fn(container) 时抛错:", err);
    throw err;
  } finally {
    setCurrentScope(null);
  }
  return {
    unmount() {
      scope.runDisposers();
      if (container?.replaceChildren) {
        container.replaceChildren();
      }
    },
    container,
  };
}

/**
 * 便捷方法：挂载入口，等同于 createRoot(fn, container)。
 *
 * @param fn - 接收挂载容器，内部用 insert 等建立 UI；仅执行一次
 * @param container - 挂载目标 DOM 元素
 * @returns Root 句柄
 */
export function render(
  fn: (container: Element) => void,
  container: Element,
): Root {
  return createRoot(fn, container);
}
