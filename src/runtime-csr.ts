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
  });

/** 便捷方法：创建根并挂载，由 runtime-shared.createRender 统一实现 */
export const render: (fn: () => VNode, container: Element) => Root =
  createRender(createRoot);

/**
 * 统一挂载入口：支持选择器或 Element；仅 CSR 时始终 render（无 hydrate）。
 * 容器为选择器且查不到时：options.noopIfNotFound 为 true 则返回空 Root，否则抛错。
 *
 * @param container 选择器（如 "#root"）或 DOM 元素
 * @param fn 根组件函数
 * @param options noopIfNotFound 查不到时是否静默返回空 Root；hydrate 在 CSR 中忽略
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
  return render(fn, el);
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
