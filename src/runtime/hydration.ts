/**
 * @module runtime/hydration
 * @description 客户端水合 (Hydration) 逻辑 - 将 SSR 静态 HTML 变为交互式应用。
 *
 * **支持的功能：**
 * - ✅ internalHydrate() - 内部水合逻辑
 * - ✅ walk() - DOM 树遍历
 * - ✅ 绑定映射 (bindingMap) 管理
 * - ✅ 服务端和客户端环境判断
 *
 * **核心机制：**
 * - 基于编译器生成的绑定信息
 * - DOM 节点和响应式数据的映射
 * - 渐进式水合 (progressive hydration)
 *
 * **范围说明：**
 * - 完整 SSR→客户端水合与错误恢复由 `browser`/`ssr-dom` 与编译绑定协同；本文件为绑定执行内核。
 *
 * @usage
 * internalHydrate(rootElement, bindings)
 */

import { walk } from "./template.ts";

/**
 * 水合阶段全局状态：绑定 id → 真实 DOM 节点。
 * @property bindingMap 编译器生成的节点 id 映射
 * @property active 是否处于水合流程中
 */
export interface HydrationContext {
  bindingMap: Map<string, Node>;
  active: boolean;
}

let hydrationContext: HydrationContext | null = null;

/**
 * 根据 `bindings` 在 `root` 子树上解析节点并写入全局水合上下文（供运行时绑定读回）。
 * @param root SSR 输出的根节点
 * @param bindings `[path, id][]`，path 为 `walk` 下标路径
 * @returns `void`
 */
export function internalHydrate(root: Node, bindings: [number[], string][]) {
  const map = new Map<string, Node>();
  for (const [path, id] of bindings) {
    const node = walk(root, path);
    if (node) map.set(id, node);
  }

  hydrationContext = {
    bindingMap: map,
    active: true,
  };
}

/**
 * 清除水合上下文，表示水合阶段结束或放弃。
 * @returns `void`
 */
export function stopHydration() {
  hydrationContext = null;
}

/**
 * 在水合激活时从绑定表取已解析的 DOM 节点。
 * @param id 编译器生成的绑定 id
 * @returns 对应节点，未水合或不存在时 `undefined`
 */
export function useHydratedNode(id: string): Node | undefined {
  if (!hydrationContext?.active) return undefined;
  return hydrationContext.bindingMap.get(id);
}

/**
 * 当前是否存在激活的水合上下文。
 * @returns 水合进行中为 `true`
 */
export function isHydrating(): boolean {
  return hydrationContext?.active ?? false;
}
