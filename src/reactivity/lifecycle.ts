/**
 * @module reactivity/lifecycle
 * @description 生命周期 Hooks - 组件生命周期管理。
 *
 * **支持的功能：**
 * - ✅ onMount() - 组件挂载后执行
 * - ✅ onCleanup() - 组件清理时执行 (在 owner.ts 中)
 * - ✅ onError() - 错误处理 (在 owner.ts 中)
 *
 * **核心机制：**
 * - 基于 Effect 系统实现
 * - untrack 避免不必要的依赖追踪
 * - 与 Owner 系统的集成
 *
 * **范围说明：**
 * - 更新阶段钩子可用 `createEffect` 表达；卸载前逻辑可用 `onCleanup`；本模块仅提供 `onMount` 级便捷封装。
 *
 * @usage
 * onMount(() => {
 *   console.log("Component mounted")
 *   return () => console.log("Cleanup")
 * })
 */

import { createEffect } from "./effect.ts";
import { untrack } from "./signal.ts";

/**
 * 在挂载后执行一次 `fn`（通过 effect + `untrack` 避免把外层依赖误绑到 `fn`）。
 * @param fn 挂载后执行的回调
 * @returns `void`
 */
export function onMount(fn: () => void): void {
  createEffect(() => {
    untrack(fn);
  });
}
