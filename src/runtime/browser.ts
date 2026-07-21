/**
 * @module runtime/browser
 * @description 浏览器端挂载与水合入口，提供应用启动的核心 API。
 *
 * **支持的功能：**
 * - ✅ mount() - 将组件挂载到 DOM 容器
 * - ✅ hydrate() - 服务端渲染内容的水合 (客户端激活)
 * - ✅ mismatch 策略：continue / assert / remount
 * - ✅ 自动清理 loading 骨架屏 (data-view-cloak 处理)
 *
 * @usage
 * mount(() => <App/>, document.getElementById("root"))
 * hydrate(() => <App/>, root, { bindings, mismatchMode: "remount" })
 */

import { createRoot } from "../reactivity/owner.ts";
import { insert } from "./insert.ts";
import {
  getHydrationMismatches,
  type HydrateOptions,
  internalHydrate,
  resolveMismatchMode,
  stopHydration,
} from "./hydration.ts";

/** 供类型引用；运行时符号由 `runtime/hydration` 经主入口 re-export */
export type { HydrateOptions, HydrationMismatchMode } from "./hydration.ts";

/**
 * 在 `container` 内执行 `fn()` 并 `insert` 结果；卸载时 `dispose` 并清空子节点。
 */
/** 清空容器子节点：Element 用 `textContent` 更快；其它 Node 回退逐子 remove */
function clearContainerChildren(container: Node): void {
  if (container.nodeType === 1 /* ELEMENT_NODE */) {
    (container as Element).textContent = "";
    return;
  }
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

/** 移除 cloak 并保证可见（mount / remount 共用） */
function uncloakContainer(container: Node): void {
  if (container instanceof HTMLElement) {
    container.removeAttribute("data-view-cloak");
    container.style.display = "";
  }
}

export function mount(fn: () => any, container: Node): () => void {
  return createRoot((dispose) => {
    clearContainerChildren(container);
    uncloakContainer(container);

    const content = fn();
    insert(container, content);

    /**
     * 先回收 Owner/Effect，再物理清空容器。
     * 与 `hydrate`（卸载后默认保留 SSR 节点）区分。
     */
    return () => {
      dispose();
      clearContainerChildren(container);
    };
  });
}

/**
 * 解析 `hydrate` 第三参：历史数组绑定表，或 {@link HydrateOptions} 对象（加法）。
 */
function resolveHydrateBindings(
  bindingsOrOptions: [number[], string][] | HydrateOptions = [],
): { bindings: [number[], string][]; options: HydrateOptions } {
  if (Array.isArray(bindingsOrOptions)) {
    return { bindings: bindingsOrOptions, options: {} };
  }
  if (bindingsOrOptions != null && typeof bindingsOrOptions === "object") {
    const options = bindingsOrOptions as HydrateOptions;
    return {
      bindings: options.bindings ?? [],
      options,
    };
  }
  return { bindings: [], options: {} };
}

/**
 * 在已有 SSR 标记的 `container` 上启用水合并插入 `fn()`。
 *
 * @param bindingsOrOptions 可选绑定表数组，或 {@link HydrateOptions}
 *   - `mismatchMode: "assert"`：绑定失败抛错
 *   - `mismatchMode: "remount"`：清空容器后按 CSR 重挂（放弃 SSR 节点复用）
 * @returns dispose；remount 时卸载会清空容器（与 mount 一致）
 */
export function hydrate(
  fn: () => any,
  container: Node,
  bindingsOrOptions: [number[], string][] | HydrateOptions = [],
): () => void {
  return createRoot((dispose) => {
    stopHydration();

    const { bindings, options } = resolveHydrateBindings(bindingsOrOptions);
    const mode = resolveMismatchMode(options);

    try {
      internalHydrate(container, bindings, options);
    } catch (err) {
      // assert 模式：结束水合上下文后抛出
      stopHydration();
      throw err;
    }

    const mismatches = getHydrationMismatches();
    if (mode === "remount" && mismatches.length > 0) {
      // 放弃绑定表与 SSR DOM，退回 CSR 挂载语义
      stopHydration();
      if (options.warnMismatch !== false) {
        console.warn(
          `[@dreamer/view] hydration remount: ${mismatches.length} mismatch(es), falling back to CSR mount`,
        );
      }
      clearContainerChildren(container);
      uncloakContainer(container);
      const content = fn();
      insert(container, content);
      return () => {
        dispose();
        clearContainerChildren(container);
      };
    }

    uncloakContainer(container);
    const content = fn();
    insert(container, content);

    // 默认：保留容器内 SSR 节点；仅 dispose Owner
    return dispose;
  });
}
