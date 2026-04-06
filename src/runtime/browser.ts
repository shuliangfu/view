/**
 * @module runtime/browser
 * @description 浏览器端挂载与水合入口，提供应用启动的核心 API。
 *
 * **支持的功能：**
 * - ✅ mount() - 将组件挂载到 DOM 容器
 * - ✅ hydrate() - 服务端渲染内容的水合 (客户端激活)
 * - ✅ 自动清理 loading 骨架屏 (data-view-cloak 处理)
 * - ✅ 正确的错误边界和清理机制
 *
 * **核心职责：**
 * - 应用启动入口
 * - SSR 内容激活
 * - DOM 容器初始化和清理
 * - 开发环境的 HMR 支持
 *
 * **范围说明：**
 * - 浏览器挂载/水合为主；SSR 完整链路见 `runtime/server` 等；路由见 `integrations/router.tsx`。
 *
 * @usage
 * mount(() => <App/>, document.getElementById("root"))
 */

import { createRoot } from "../reactivity/owner.ts";
import { insert } from "./insert.ts";
import { internalHydrate, stopHydration } from "./hydration.ts";

/**
 * 在 `container` 内执行 `fn()` 并 `insert` 结果；卸载时 `dispose` 并清空子节点。
 * @param fn 返回可插入视图（VNode/节点等）的函数
 * @param container 挂载目标 DOM 节点
 * @returns 卸载函数：释放 Owner 并移除子节点
 */
export function mount(fn: () => any, container: Node): () => void {
  return createRoot((dispose) => {
    // 1. 物理清空容器 (移除 Loading 骨架屏)
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // 2. 强行移除 cloak 隐藏属性
    if (container instanceof HTMLElement) {
      container.removeAttribute("data-view-cloak");
      container.style.display = ""; // 确保可见
    }

    // 3. 执行挂载
    const content = fn();
    insert(container, content);

    /**
     * 先回收 Owner/Effect，再物理清空容器。
     * 仅 `cleanNode` 时 insert 产生的节点未必会从 DOM 摘除，CSR 下 unmount 后仍会看到旧文案；
     * 与入口「先清空再插入」对称，且与 `hydrate`（卸载后保留 SSR 节点）区分。
     */
    return () => {
      dispose();
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  });
}

/**
 * 在已有 SSR 标记的 `container` 上启用水合并插入 `fn()`；`bindings` 为编译器生成的动态位点映射。
 * @param fn 客户端根组件
 * @param container 服务端已输出 HTML 的节点
 * @param bindings 可选 `[path, exprId][]` 绑定表
 * @returns `createRoot` 的 `dispose`，用于卸载（不默认清空容器，与 `mount` 对称语义见实现）
 */
export function hydrate(
  fn: () => any,
  container: Node,
  bindings: [number[], string][] = [],
): () => void {
  return createRoot((dispose) => {
    // 停止之前的水合状态
    stopHydration();

    // 执行水合，传入 bindingMap
    internalHydrate(container, bindings);

    const content = fn();
    insert(container, content);

    return dispose;
  });
}
