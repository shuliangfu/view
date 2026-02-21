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
import { bindDeferredEventListeners } from "./dom/props.ts";
import {
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./dom/unmount.ts";
import { hydrateFromExpanded } from "./dom/hydrate.ts";
import {
  createCreateRoot,
  createHydrateRoot,
  createReactiveRootWith,
  createRender,
  NOOP_ROOT,
  resolveMountContainer,
} from "./runtime-shared.ts";
import { createSignal } from "./signal.ts";
import { isDOMEnvironment } from "./types.ts";
import type { MountOptions, Root, VNode } from "./types.ts";

/** 创建根并挂载（实现来自 runtime-shared，依赖从 effect + dom 注入） */
export const createRoot: (fn: () => VNode, container: Element) => Root =
  createCreateRoot({
    createEffect,
    createRunDisposersCollector,
    setCurrentScope,
    isDOMEnvironment,
    createRenderTriggerSignal: () => createSignal(0),
    expandVNode,
    createNodeFromExpanded,
    patchRoot,
    runDirectiveUnmount,
    bindDeferredEventListeners,
  });

/** 便捷方法：创建根并挂载，由 runtime-shared.createRender 统一实现 */
export const render: (fn: () => VNode, container: Element) => Root =
  createRender(createRoot);

/**
 * 统一挂载入口：支持选择器或 Element；有子节点则 hydrate 否则 render，减少分支与心智负担。
 * 容器为选择器且查不到时：options.noopIfNotFound 为 true 则返回空 Root，否则抛错。
 *
 * @param container 选择器（如 "#root"）或 DOM 元素
 * @param fn 根组件函数
 * @param options hydrate 强制 hydrate/render；noopIfNotFound 查不到时静默返回空 Root
 * @returns Root 句柄
 */
export function mount(
  container: string | Element,
  fn: () => VNode,
  options?: MountOptions,
): Root {
  const el = resolveMountContainer(
    container,
    options?.noopIfNotFound ?? false,
  );
  if (!el) return NOOP_ROOT;
  const useHydrate = options?.hydrate === true
    ? true
    : options?.hydrate === false
    ? false
    : el.hasChildNodes();
  return useHydrate ? hydrate(fn, el) : render(fn, el);
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
  return createReactiveRootWith(createRoot, container, getState, buildTree);
}

/**
 * 创建「以 hydrate 为首次挂载」的响应式单根：容器已有服务端 HTML 时首次为 hydrate，后续状态变化在同一根上 patch。
 * 用于 Hybrid 首屏只做一次激活、不卸根不重建，避免 hydrate 后再 createReactiveRoot 导致组件树执行两遍。
 *
 * @param container 挂载的 DOM 容器（首屏时通常已有子节点）
 * @param getState 获取当前状态（建议为 createSignal 的 getter）
 * @param buildTree 根据状态构建根 VNode
 * @returns Root 句柄
 */
export function createReactiveRootHydrate<T>(
  container: Element,
  getState: () => T,
  buildTree: (state: T) => VNode,
): Root {
  return createReactiveRootWith(hydrate, container, getState, buildTree);
}

/**
 * 在已有服务端 HTML 的容器上激活（Hybrid）
 * 若 container 已有子节点，则与 fn() 的 VNode 一一对应复用 DOM（完整 hydrate）；
 * 首次复用后，后续响应式更新与 createRoot 一致，走 patchRoot 细粒度 patch，不整树替换。
 * 无子节点时与 createRoot 行为一致。
 * 实现与调试逻辑由 runtime-shared.createHydrateRoot 统一提供。
 */
export const hydrate: (fn: () => VNode, container: Element) => Root =
  createHydrateRoot({
    createEffect,
    createRunDisposersCollector,
    setCurrentScope,
    isDOMEnvironment,
    createRenderTriggerSignal: () => createSignal(0),
    expandVNode,
    createNodeFromExpanded,
    patchRoot,
    runDirectiveUnmount,
    bindDeferredEventListeners,
    hydrateFromExpanded,
    runDirectiveUnmountOnChildren,
  });
