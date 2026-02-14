/**
 * View 模板引擎 — 客户端 Hybrid 运行时（createRoot / render / hydrate）
 *
 * 含 hydrate，不含 renderToString、generateHydrationScript。
 * 用于「服务端用主包或 stream 出 HTML，客户端用本入口激活」的 Hybrid 场景，体积介于 core 与全量之间。
 */

import { createEffect, setCurrentScope } from "./effect.ts";
import {
  createElement,
  createNodeFromExpanded,
  type ExpandedRoot,
  expandVNode,
  patchRoot,
} from "./dom/element.ts";
import {
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./dom/unmount.ts";
import { hydrateElement } from "./dom/hydrate.ts";
import { isDOMEnvironment } from "./types.ts";
import type { Root, VNode } from "./types.ts";

/** hydrate 后移除 data-view-cloak，配合 CSS [data-view-cloak]{display:none} 减少 FOUC */
function removeCloak(container: Element): void {
  const list = Array.from(container.querySelectorAll("[data-view-cloak]"));
  if (container.hasAttribute("data-view-cloak")) list.unshift(container);
  for (const el of list) el.removeAttribute("data-view-cloak");
}

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

/**
 * 在已有服务端 HTML 的容器上激活（Hybrid）
 */
export function hydrate(fn: () => VNode, container: Element): Root {
  if (!isDOMEnvironment()) {
    return { unmount: () => {}, container: null };
  }
  let mounted: Node | Element | null = null;
  let disposed = false;
  let didHydrate = false;
  const disposers: Array<() => void> = [];
  const root: Root = {
    container,
    unmount() {
      disposed = true;
      disposers.forEach((d) => d());
      disposers.length = 0;
      if (mounted != null) {
        if (mounted === container) {
          runDirectiveUnmountOnChildren(container as Element);
          (container as Element).textContent = "";
        } else if ((container as Element).contains(mounted)) {
          runDirectiveUnmount(mounted);
          (container as Element).removeChild(mounted);
        }
      }
      mounted = null;
    },
  };
  const disposeRoot = createEffect(() => {
    if (disposed) return;
    setCurrentScope({ addDisposer: (d) => disposers.push(d) });
    try {
      const vnode = fn();
      const hasExisting = (container as Element).hasChildNodes();
      if (hasExisting && !didHydrate) {
        hydrateElement(container as Element, vnode);
        didHydrate = true;
        mounted = container as Element;
        removeCloak(container as Element);
      } else {
        if (mounted != null) {
          if (mounted === container) {
            runDirectiveUnmountOnChildren(container as Element);
            (container as Element).textContent = "";
          } else if ((container as Element).contains(mounted)) {
            runDirectiveUnmount(mounted);
            (container as Element).removeChild(mounted);
          }
        }
        mounted = createElement(vnode);
        (container as Element).appendChild(mounted);
      }
    } finally {
      setCurrentScope(null);
    }
  });
  disposers.push(disposeRoot);
  return root;
}
