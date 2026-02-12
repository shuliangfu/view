/**
 * View 模板引擎 — Effect（副作用）
 *
 * 执行用户函数时登记所读到的 signal 为依赖；当这些 signal 变更时自动重新执行 effect。
 * 重新执行前会先清理上次登记的依赖，再重新收集。
 * 支持 EffectScope：根可注册所有子 effect 的 disposer，unmount 时统一清理。
 */
import type { EffectDispose } from "./types.ts";
/** 当前 effect 作用域（由 createRoot 设置），用于 unmount 时回收该树下所有 effect */
export type EffectScope = {
    addDisposer(dispose: () => void): void;
};
export declare function getCurrentScope(): EffectScope | null;
export declare function setCurrentScope(scope: EffectScope | null): void;
/**
 * 创建响应式副作用
 *
 * 立即执行一次 fn；执行过程中读到的 signal 会将该 effect 登记为依赖。
 * 之后任意依赖的 signal 变更时，会调度该 effect 重新执行（微任务批处理）。
 *
 * @param fn 副作用函数，可返回清理函数（在下次执行前或 dispose 时调用）
 * @returns dispose 函数，调用后取消该 effect 的订阅并不再执行
 */
/**
 * 在当前 effect 内登记清理函数，effect 下次运行前或 dispose 时统一执行
 * 仅在 createEffect(fn) 的 fn 执行过程中调用有效
 */
export declare function onCleanup(cb: () => void): void;
export declare function createEffect(fn: () => void | (() => void)): EffectDispose;
/**
 * 创建只读派生值（memo），依赖变化时才重算并缓存
 * 返回 getter，在 effect 或模板中读取时会登记依赖
 */
export declare function createMemo<T>(fn: () => T): () => T;
//# sourceMappingURL=effect.d.ts.map