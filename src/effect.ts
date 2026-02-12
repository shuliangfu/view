/**
 * View 模板引擎 — Effect（副作用）
 *
 * 执行用户函数时登记所读到的 signal 为依赖；当这些 signal 变更时自动重新执行 effect。
 * 重新执行前会先清理上次登记的依赖，再重新收集。
 * 支持 EffectScope：根可注册所有子 effect 的 disposer，unmount 时统一清理。
 */

import { schedule, unschedule } from "./scheduler.ts";
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

/** 当前 effect 作用域（由 createRoot 设置），用于 unmount 时回收该树下所有 effect */
export type EffectScope = { addDisposer(dispose: () => void): void };
let currentScope: EffectScope | null = null;

export function getCurrentScope(): EffectScope | null {
  return currentScope;
}

export function setCurrentScope(scope: EffectScope | null): void {
  currentScope = scope;
}

/** 调度 effect 的「下次执行」到微任务，避免同步重入（与 signal/store 共用 scheduler） */
function scheduleEffect(run: () => void): void {
  schedule(run);
}

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

  const schedule = (): void => {
    if (disposed) return;
    runCleanups(run as EffectRunWithSubs);
    scheduleEffect(run);
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
    unschedule(schedule);
  };
  if (currentScope) currentScope.addDisposer(disposer);
  return disposer;
}

/**
 * 创建只读派生值（memo），依赖变化时才重算并缓存
 * 返回 getter，在 effect 或模板中读取时会登记依赖
 */
export function createMemo<T>(fn: () => T): () => T {
  const [get, set] = createSignal<T>(undefined as unknown as T);
  createEffect(() => set(fn()));
  return markSignalGetter(get) as () => T;
}
