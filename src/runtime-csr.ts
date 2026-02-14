/**
 * View 模板引擎 — 仅 CSR 运行时（createRoot / render）
 *
 * 不包含 renderToString、hydrate、generateHydrationScript，打主包时可从 @dreamer/view/csr 引入以减小体积。
 */

import { createEffect, setCurrentScope } from "./effect.ts";
import {
  createNodeFromExpanded,
  type ExpandedRoot,
  expandVNode,
  patchRoot,
} from "./dom/element.ts";
import { runDirectiveUnmount } from "./dom/unmount.ts";
import { isDOMEnvironment } from "./types.ts";
import type { Root, VNode } from "./types.ts";

/**
 * 创建根实例并挂载到容器（浏览器）
 */
export function createRoot(fn: () => VNode, container: Element): Root {
  if (!isDOMEnvironment()) {
    return { unmount: () => {}, container: null };
  }
  let mounted: Node | null = null;
  let lastExpanded: ExpandedRoot | null = null;
  let disposed = false;
  const disposers: Array<() => void> = [];
  const root: Root = {
    container,
    unmount() {
      disposed = true;
      disposers.forEach((d) => d());
      disposers.length = 0;
      if (mounted && container.contains(mounted)) {
        runDirectiveUnmount(mounted);
        container.removeChild(mounted);
      }
      mounted = null;
      lastExpanded = null;
    },
  };
  const disposeRoot = createEffect(() => {
    if (disposed) return;
    setCurrentScope({ addDisposer: (d) => disposers.push(d) });
    try {
      const vnode = fn();
      const newExpanded = expandVNode(vnode);
      if (mounted == null || !container.contains(mounted)) {
        mounted = createNodeFromExpanded(newExpanded);
        container.appendChild(mounted);
        lastExpanded = newExpanded;
      } else {
        patchRoot(container, mounted, lastExpanded!, newExpanded);
        lastExpanded = newExpanded;
      }
    } finally {
      setCurrentScope(null);
    }
  });
  disposers.push(disposeRoot);
  return root;
}

/**
 * 便捷方法：创建根并挂载
 */
export function render(fn: () => VNode, container: Element): Root {
  return createRoot(fn, container);
}

/**
 * 创建响应式单根：由外部状态驱动，状态变化时在根内做细粒度 patch。
 *
 * @param container 挂载的 DOM 容器
 * @param getState 获取当前状态（建议为 createSignal 的 getter）
 * @param buildTree 根据状态构建根 VNode
 * @returns Root 句柄
 */
export function createReactiveRoot<T>(
  container: Element,
  getState: () => T,
  buildTree: (state: T) => VNode,
): Root {
  return createRoot(() => buildTree(getState()), container);
}
