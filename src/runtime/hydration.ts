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
 * 水合上下文接口。
 */
export interface HydrationContext {
  bindingMap: Map<string, Node>;
  active: boolean;
}

let hydrationContext: HydrationContext | null = null;

/**
 * 内部水合注册。
 * @param root 根节点。
 * @param bindings 编译生成的绑定映射。
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
 * 停止水合过程。
 */
export function stopHydration() {
  hydrationContext = null;
}

/**
 * 获取当前水合中的节点。
 * @param id 编译器生成的节点 ID。
 */
export function useHydratedNode(id: string): Node | undefined {
  if (!hydrationContext?.active) return undefined;
  return hydrationContext.bindingMap.get(id);
}

/**
 * 是否正在进行水合。
 */
export function isHydrating(): boolean {
  return hydrationContext?.active ?? false;
}
