/**
 * View 模板引擎 — 客户端 Hybrid 运行时（createRoot / render / hydrate）
 *
 * 含 hydrate，不含 renderToString、generateHydrationScript。
 * 用于「服务端用主包或 stream 出 HTML，客户端用本入口激活」的 Hybrid 场景，体积介于 core 与全量之间。
 */

import {
  createEffect,
  createRunDisposersCollector,
  setCurrentScope,
} from "./effect.ts";
import {
  createNodeFromExpanded,
  expandVNode,
  patchRoot,
} from "./dom/element.ts";
import type { ExpandedRoot } from "./dom/element.ts";
import {
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./dom/unmount.ts";
import { hydrateElement } from "./dom/hydrate.ts";
import {
  createCreateRoot,
  createReactiveRootWith,
  createRender,
  removeCloak,
} from "./runtime-shared.ts";
import { createSignal } from "./signal.ts";
import { isDOMEnvironment } from "./types.ts";
import type { Root, VNode } from "./types.ts";

/** 创建根并挂载（实现来自 runtime-shared，依赖从 effect + dom 注入） */
export const createRoot = createCreateRoot({
  createEffect,
  createRunDisposersCollector,
  setCurrentScope,
  isDOMEnvironment,
  createRenderTriggerSignal: () => createSignal(0),
  expandVNode,
  createNodeFromExpanded,
  patchRoot,
  runDirectiveUnmount,
});

/** 便捷方法：创建根并挂载，由 runtime-shared.createRender 统一实现 */
export const render = createRender(createRoot);

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
  return createReactiveRootWith(createRoot, container, getState, buildTree);
}

/**
 * 在已有服务端 HTML 的容器上激活（Hybrid）
 * 若 container 已有子节点，则与 fn() 的 VNode 一一对应复用 DOM（完整 hydrate）；
 * 首次复用后，后续响应式更新与 createRoot 一致，走 patchRoot 细粒度 patch，不整树替换。
 * 无子节点时与 createRoot 行为一致。
 */
export function hydrate(fn: () => VNode, container: Element): Root {
  if (!isDOMEnvironment()) {
    return { unmount: () => {}, container: null };
  }
  let mounted: Node | Element | null = null;
  let lastExpanded: ExpandedRoot | null = null;
  let disposed = false;
  let didHydrate = false;
  const disposers: Array<() => void> = [];
  const { runDisposers, getScopeForRun } = createRunDisposersCollector();
  const root: Root = {
    container,
    unmount() {
      disposed = true;
      disposers.forEach((d) => d());
      disposers.length = 0;
      runDisposers.forEach((d) => d());
      runDisposers.length = 0;
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
      lastExpanded = null;
    },
  };
  const disposeRoot = createEffect(() => {
    if (disposed) return;
    setCurrentScope(getScopeForRun());
    try {
      const vnode = fn();
      const hasExisting = (container as Element).hasChildNodes();
      if (hasExisting && !didHydrate) {
        hydrateElement(container as Element, vnode);
        didHydrate = true;
        removeCloak(container as Element);
        const expanded = expandVNode(vnode);
        lastExpanded = expanded;
        mounted = Array.isArray(expanded)
          ? (container as Element)
          : (container as Element).firstChild;
      } else {
        const newExpanded = expandVNode(vnode);
        if (
          mounted != null && lastExpanded != null && container.contains(mounted)
        ) {
          patchRoot(
            container as Element,
            mounted,
            lastExpanded,
            newExpanded,
          );
          lastExpanded = newExpanded;
          mounted = Array.isArray(newExpanded)
            ? (container as Element)
            : (container as Element).firstChild;
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
          mounted = createNodeFromExpanded(newExpanded);
          (container as Element).appendChild(mounted);
          lastExpanded = newExpanded;
          didHydrate = true;
        }
      }
    } finally {
      setCurrentScope(null);
    }
  });
  disposers.push(disposeRoot);
  return root;
}
