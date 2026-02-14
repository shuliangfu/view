/**
 * View 模板引擎 — 仅 CSR 运行时（createRoot / render）
 *
 * 不包含 renderToString、hydrate、generateHydrationScript，打主包时可从 @dreamer/view/csr 引入以减小体积。
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
import { runDirectiveUnmount } from "./dom/unmount.ts";
import {
  createCreateRoot,
  createReactiveRootWith,
  createRender,
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
