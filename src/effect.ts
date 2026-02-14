/**
 * @module @dreamer/view/effect
 * @description
 * View 模板引擎 — Effect（副作用）。执行用户函数时登记所读到的 signal 为依赖；当这些 signal 变更时自动重新执行 effect。重新执行前会先清理上次登记的依赖，再重新收集。支持 EffectScope：根可注册所有子 effect 的 disposer，unmount 时统一清理。
 *
 * **本模块导出：**
 * - `createEffect(fn)`：创建副作用，返回 dispose 函数
 * - `createMemo(fn)`：创建派生值（只读 signal）
 * - `untrack(fn)`：不登记依赖地执行 fn，用于「只读不订阅」场景
 * - `onCleanup(fn)`：在 effect/memo 内登记清理函数
 * - `setCurrentScope(scope)`：设置当前 EffectScope（runtime 用）
 * - 类型：`EffectScope`
 */

import { unschedule } from "./scheduler.ts";
import {
  createSignal,
  getCurrentEffect,
  markSignalGetter,
  setCurrentEffect,
} from "./signal.ts";
import type { EffectDispose } from "./types.ts";

type EffectRunWithSubs = (() => void) & {
  _subscriptionSets?: Set<() => void>[];
  /** 本 effect 登记的清理函数，下次运行前或 dispose 时统一执行 */
  _cleanups?: (() => void)[];
};

/**
 * Effect 作用域：由 createRoot 在挂载时设置，用于在 unmount 时统一回收该根下所有 effect 的 disposer。
 */
export type EffectScope = { addDisposer(dispose: () => void): void };
let currentScope: EffectScope | null = null;

/**
 * 获取当前 effect 作用域（由 createRoot 设置）。
 *
 * @returns 当前 EffectScope，若不在根 effect 内则为 null
 * @internal 主要由 runtime 使用
 */
export function getCurrentScope(): EffectScope | null {
  return currentScope;
}

/**
 * 设置当前 effect 作用域（供 createRoot 在根 effect 内挂载 disposer 使用）。
 *
 * @param scope - 要设置的作用域，或 null 表示清除
 * @internal 主要由 runtime 使用
 */
export function setCurrentScope(scope: EffectScope | null): void {
  currentScope = scope;
}

/**
 * 不登记依赖地执行函数：在 fn 内读到的 signal 不会把当前 effect 登记为订阅者。
 * 用于「只读一次、不随其变化重跑」的场景，例如判断是否有 loading 再启动定时器。
 *
 * @param fn - 要执行的函数
 * @returns fn 的返回值
 *
 * @example
 * createEffect(() => {
 *   const hasLoading = untrack(() => props.match.loading);
 *   if (hasLoading) startTimer(); // effect 不会因 props 重跑
 * });
 */
export function untrack<T>(fn: () => T): T {
  const prev = getCurrentEffect();
  setCurrentEffect(null);
  try {
    return fn();
  } finally {
    setCurrentEffect(prev);
  }
}

/**
 * 在当前 effect 内登记清理函数。
 * 清理函数会在该 effect 下次重新执行前、或 effect 被 dispose 时统一执行。
 * 仅在 createEffect(fn) 的 fn 执行过程中调用有效。
 *
 * @param cb - 清理函数（如取消订阅、移除监听器等）
 *
 * @example
 * createEffect(() => {
 *   const id = setInterval(() => {}, 1000);
 *   onCleanup(() => clearInterval(id));
 * });
 */
export function onCleanup(cb: () => void): void {
  const run = getCurrentEffect() as EffectRunWithSubs | null;
  if (run?._cleanups) run._cleanups.push(cb);
}

function runCleanups(run: EffectRunWithSubs): void {
  const list = run._cleanups;
  if (list) {
    for (const cb of list) cb();
    list.length = 0;
  }
}

/**
 * 创建响应式副作用。
 * 立即执行一次 fn；执行过程中读到的 signal 会将该 effect 登记为依赖。
 * 之后任意依赖的 signal 变更时，会通过调度器异步重新执行该 effect（微任务批处理）。
 * fn 可返回一个清理函数，在 effect 下次运行前或 dispose 时被调用。
 *
 * @param fn - 副作用函数，可返回清理函数（可选）
 * @returns dispose 函数，调用后取消该 effect 的所有订阅并不再执行
 *
 * @example
 * const [count, setCount] = createSignal(0);
 * const stop = createEffect(() => {
 *   console.log(count());
 *   return () => console.log("cleanup");
 * });
 * stop(); // 停止 effect 并执行 cleanup
 */
export function createEffect(fn: () => void | (() => void)): EffectDispose {
  let disposed = false;

  const run = (): void => {
    if (disposed) return;
    // 若由调度器触发（非首次），先执行上次登记的 cleanups
    runCleanups(run as EffectRunWithSubs);
    // 从上次依赖的所有 signal 订阅列表中移除本 effect，再重新收集
    const subs = (run as EffectRunWithSubs)._subscriptionSets;
    if (subs) {
      for (const s of subs) s.delete(run);
      subs.length = 0;
    }
    (run as EffectRunWithSubs)._cleanups = [];
    const prev = getCurrentEffect();
    (run as EffectRunWithSubs)._subscriptionSets = [];
    setCurrentEffect(run);
    try {
      const nextDispose = fn();
      if (typeof nextDispose === "function") {
        (run as EffectRunWithSubs)._cleanups!.push(nextDispose);
      }
    } finally {
      setCurrentEffect(prev);
    }
  };

  (run as EffectRunWithSubs)._subscriptionSets = [];
  (run as EffectRunWithSubs)._cleanups = [];
  run();

  const disposer = (): void => {
    if (disposed) return;
    disposed = true;
    const runWithSubs = run as EffectRunWithSubs;
    const subs = runWithSubs._subscriptionSets;
    if (subs) {
      for (const s of subs) s.delete(run);
      subs.length = 0;
    }
    runCleanups(runWithSubs);
    unschedule(run);
  };
  if (currentScope) currentScope.addDisposer(disposer);
  return disposer;
}

/**
 * 创建只读派生值（memo）。
 * 依赖的 signal 变化时才重新计算并缓存结果；在 effect 或模板中读取返回的 getter 时会登记依赖。
 *
 * @param fn - 派生计算函数，应只依赖 signal 等响应式数据
 * @returns 无参 getter，返回当前缓存的计算结果
 *
 * @example
 * const [a, setA] = createSignal(1);
 * const double = createMemo(() => a() * 2);
 * createEffect(() => console.log(double())); // 2 → setA(2) 后输出 4
 */
export function createMemo<T>(fn: () => T): () => T {
  const [get, set] = createSignal<T>(undefined as unknown as T);
  createEffect(() => set(fn()));
  return markSignalGetter(get) as () => T;
}
