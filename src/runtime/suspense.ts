/**
 * @module runtime/suspense
 * @description 异步悬挂 (Suspense) 机制。
 *
 * **支持的功能：**
 * - ✅ 使用 createContext + Provider 的标准架构
 * - ✅ 支持多个嵌套 Suspense (每个 Suspense 有独立上下文)
 * - ✅ 完善的 loading 状态注册和监听机制
 * - ✅ 支持 fallback 和 children 切换 (isSuspended 状态控制)
 * - ✅ 与 createResource 的良好集成 (registerForSuspense)
 * - ✅ 正确的清理机制 (onCleanup + loadingTrackers 管理)
 *
 * **范围说明与后续方向：**
 * - **同一边界内多资源**：`isSuspended` 为「任一已注册 `loadingFn` 为真」；历史上每资源单独 `createEffect` 会互相覆盖，已改为**单次聚合订阅**（`trackersTick` + 聚合 `createRoot`）。每资源仍用**独立 `createRoot` 仅承载 `onCleanup`**，避免把 cleanup 挂在 insert 子树 Owner 上：否则 fallback 卸载子树会误删 tracker，聚合误判无 loading 后又插回 children，形成**死循环**。
 * - **SSR / 流式**：完整「服务端 Suspense + 客户端续传」需与 `ssr-promises`、流式 HTML 协议协同，属框架级能力，本文件只保证 CSR 边界语义。
 * - **更高级场景**：请求去重、优先级、部分流式占位等可在上层或 `createResource` 策略中扩展，不必全部塞进 Suspense 组件。
 *
 * @usage
 * <Suspense fallback={<Loading/>}>
 *   <AsyncComponent/>
 * </Suspense>
 */

import { createSignal, untrack } from "../reactivity/signal.ts";
import { createEffect } from "../reactivity/effect.ts";
import {
  type Context,
  createContext,
  useContext,
} from "../reactivity/context.ts";
import { createRoot, onCleanup } from "../reactivity/owner.ts";
import type { JSXRenderable } from "../types.ts";
import { insert } from "./insert.ts";

/**
 * Suspense 边界对外暴露的上下文：注册 loading 与查询是否悬挂。
 * @property register 由 `createResource` 等注册 `() => loading`
 * @property isSuspended 是否应展示 fallback
 */
export interface SuspenseContextType {
  /** 注册一个 loading 信号 */
  register: (loading: () => boolean) => void;
  /** 当前是否处于 suspended 状态 */
  isSuspended: () => boolean;
}

/**
 * 当前正在插入的 Suspense 边界栈（自外向内）。
 * createResource 常在父组件 Owner 上创建，但需在子树插入时关联到最近的 Suspense；
 * useContext 从 ResourceDemo 的 Owner 向上找不到写在 Suspense Owner 上的上下文，
 * 因此在 insert 子树期间用栈让 registerForSuspense 能命中正确边界。
 */
const suspenseContextStack: SuspenseContextType[] = [];

/**
 * 压入当前 Suspense 上下文（`insert` 路径上供 `registerForSuspense` 解析最近边界）。
 * @param ctx 由 `Suspense` 组件构造的上下文对象
 * @returns `void`
 */
export function pushSuspenseContext(ctx: SuspenseContextType): void {
  suspenseContextStack.push(ctx);
}

/**
 * 弹出栈顶 Suspense 上下文（与 {@link pushSuspenseContext} 配对）。
 * @returns `void`
 */
export function popSuspenseContext(): void {
  suspenseContextStack.pop();
}

/**
 * 供 `createResource` / `registerForSuspense` 使用：返回插入栈顶的上下文。
 * @returns 最近的 `SuspenseContextType`，无则 `null`
 */
export function getCurrentSuspenseContext(): SuspenseContextType | null {
  const n = suspenseContextStack.length;
  return n > 0 ? suspenseContextStack[n - 1]! : null;
}

/**
 * Reactivity `Context`，默认值 `null`；由 `Suspense` 的 Provider 注入边界实例。
 */
export const SuspenseContext: Context<SuspenseContextType | null> =
  createContext<SuspenseContextType | null>(null);

/**
 * 在 Provider 子树内读取当前 Suspense 边界上下文（基于 `useContext`）。
 * @returns 上下文或 `null`
 */
export function useSuspense(): SuspenseContextType | null {
  return useContext(SuspenseContext);
}

/**
 * 异步边界：任一已注册资源的 `loading` 为真时渲染 `fallback`，否则渲染 `children`。
 * @param props.fallback 加载中 UI
 * @param props.children 主内容（可与 {@link SuspenseContext} 配合）
 * @returns `DocumentFragment`
 */
export function Suspense(props: {
  fallback: JSXRenderable;
  children: JSXRenderable;
}): DocumentFragment {
  const [isSuspended, setIsSuspended] = createSignal(false);
  /** 已注册的 loading 读取函数（每个 createResource 一条） */
  const loadingTrackers = new Set<() => boolean>();
  /**
   * 注册集合变更时递增，驱动下方聚合 effect 重新收集对所有 `loadingFn()` 的订阅。
   * 若仅为每个资源单独 `createEffect` 并 `setIsSuspended(loadingFn())`，多资源并发时后执行的 effect 会把边界误标为未悬挂。
   */
  const [trackersTick, bumpTrackers] = createSignal(0);

  /** 承载聚合 effect 的 Root；Suspense 卸载时 dispose，避免泄漏 */
  let disposeLoadingAggregate: (() => void) | undefined;

  // 创建当前 Suspense 的上下文
  const context: SuspenseContextType = {
    register: (loadingFn: () => boolean) => {
      if (loadingTrackers.has(loadingFn)) return;

      loadingTrackers.add(loadingFn);

      // 立即检查当前状态（必须 untrack：否则在 insert 包裹的 thunk effect 里调用会订阅 loading，导致 effect 反复重跑并重复 createResource）
      if (untrack(() => loadingFn())) {
        setIsSuspended(true);
      }

      /**
       * 必须用独立 Root 登记 cleanup，不能把 `onCleanup` 直接挂在 `register` 调用时的当前 Owner：
       * 主 effect 切到 fallback 会卸载子树，若 cleanup 跟子树走，会在此刻删掉 tracker → 聚合 effect 认为无 loading
       * → `setIsSuspended(false)` → 又插入 children → 再 register → 再 fallback，**同步死循环**（测试会卡住）。
       * 子 Root 的生命周期与原先「每资源一个 createRoot + effect」一致，仅在资源侧 Owner 真正释放时移除 tracker。
       */
      createRoot((dispose) => {
        onCleanup(() => {
          loadingTrackers.delete(loadingFn);
          bumpTrackers((t) => t + 1);
          dispose();
        });
      });
      bumpTrackers((t) => t + 1);
    },

    isSuspended: () => isSuspended(),
  };

  /**
   * 单个 Root + 单个 Effect：对 `trackersTick` 与当前集合内每个 `loadingFn()` 一并追踪，
   * `isSuspended` = 是否存在任一仍在 loading。
   */
  createRoot((dispose) => {
    disposeLoadingAggregate = dispose;
    createEffect(() => {
      trackersTick();
      let anyLoading = false;
      for (const fn of loadingTrackers) {
        if (fn()) anyLoading = true;
      }
      setIsSuspended(anyLoading);
    });
  });

  // 同步压栈：使同一任务内稍后执行的 createResource（如在父组件函数体顶部）能关联到本边界
  pushSuspenseContext(context);
  onCleanup(() => {
    popSuspenseContext();
  });

  // 使用 Provider 提供上下文给子组件
  const contentWithContext = SuspenseContext.Provider({
    value: context,
    children: props.children,
  });

  /** 插槽容器：清除范围限定在 Suspense 内部，避免 marker 与标题、按钮等并列时误删 previousSibling */
  const slot = document.createElement("span");
  slot.setAttribute("data-view-suspense", "");
  slot.style.display = "contents";

  const marker = document.createTextNode("");
  slot.appendChild(marker);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(slot);

  /**
   * 主渲染 effect：fallback / children 切换。
   * 插入前卸掉 slot 内 marker 之前的节点：insert 对「函数/thunk」内容时同步返回值无法代表真实 DOM，
   * 若沿用上一分支的 current 引用会丢真实节点，切换时旧 fallback 不会被 replaceChild 掉，导致 loading 与错误页叠在一起。
   */
  createEffect(() => {
    const parent = marker.parentNode || slot;
    while (marker.previousSibling) {
      parent.removeChild(marker.previousSibling);
    }
    const shouldShowFallback = isSuspended();
    const content = shouldShowFallback ? props.fallback : contentWithContext;
    insert(parent, content, null, marker);
  });

  onCleanup(() => {
    disposeLoadingAggregate?.();
    disposeLoadingAggregate = undefined;
    if (slot.parentNode) {
      slot.parentNode.removeChild(slot);
    }
    loadingTrackers.clear();
  });

  return fragment;
}

/**
 * 用于 createResource 注册 loading 状态的便捷函数。
 * 优先使用当前 Suspense 栈（父组件顶层 createResource 时 Owner 上无 Context）；
 * 否则回退到 useSuspense（子组件在 Provider Owner 内创建资源时）。
 * @returns 是否已成功挂到某个 Suspense 边界上
 */
export function registerForSuspense(loadingFn: () => boolean): boolean {
  const stacked = getCurrentSuspenseContext();
  if (stacked) {
    stacked.register(loadingFn);
    return true;
  }
  const context = useSuspense();
  if (context) {
    context.register(loadingFn);
    return true;
  }
  return false;
}
