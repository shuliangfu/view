/**
 * View 模板引擎 — Signal（信号）
 *
 * 细粒度响应式单元：getter 读值并登记当前 effect 为依赖，setter 改值并通知所有依赖的 effect 执行。
 * 通知通过调度器异步执行，避免 effect 内「读→写」导致同步重入卡死主线程。
 *
 * currentEffect 的读写统一从 view-global 引入，保证 main 与 code-split chunk 共享同一 global，
 * 否则 chunk 内 getter 读不到 main 里 effect 设置的 currentEffect，导致 subscribers: 0。
 */

import { schedule } from "./scheduler.ts";
import {
  getGlobalCurrentEffect,
  setGlobalCurrentEffect,
} from "./view-global.ts";

/** 当前正在执行的 effect（run 函数），用于依赖收集；run 上可挂 _subscriptionSets 供清理 */
type EffectRun = (() => void) & { _subscriptionSets?: Subscriber[] };

/**
 * 设置当前正在执行的 effect（供依赖收集使用）。
 * 在 effect 执行期间调用，使 signal 的 getter 能将当前 effect 登记为订阅者。
 *
 * @param effect - 当前要设为「正在执行」的 effect 函数，或 null 表示清除
 * @internal 由 effect 模块内部使用，一般业务代码无需调用
 */
export function setCurrentEffect(effect: (() => void) | null): void {
  setGlobalCurrentEffect(effect as EffectRun | null);
}

/**
 * 获取当前正在执行的 effect（run 函数）。
 * 用于在 effect 内部或 signal getter 中判断当前是否处于某次 effect 执行上下文中。
 *
 * @returns 当前 effect 的 run 函数，若不在 effect 内则为 null
 * @internal 主要由 effect 与 dom 层使用，业务代码较少直接使用
 */
export function getCurrentEffect(): (() => void) | null {
  return getGlobalCurrentEffect();
}

/** 单个 signal 的订阅者（effect 的重新执行函数）列表 */
type Subscriber = Set<() => void>;

/**
 * 创建响应式信号
 *
 * @param initialValue 初始值
 * @returns [getter, setter] 元组：getter 读值并登记依赖，setter 写值并通知依赖
 *
 * @example
 * const [count, setCount] = createSignal(0);
 * createEffect(() => console.log(count())); // 每次 setCount 后都会打印
 * setCount(1);
 */
export function createSignal<T>(
  initialValue: T,
): [() => T, (value: T | ((prev: T) => T)) => void] {
  let value = initialValue;
  const subscribers: Subscriber = new Set();

  const getter = (): T => {
    const currentEffect = getGlobalCurrentEffect() as EffectRun | null;
    if (currentEffect) {
      subscribers.add(currentEffect);
      if (currentEffect._subscriptionSets) {
        currentEffect._subscriptionSets.push(subscribers);
      }
    }
    return value;
  };

  const setter = (next: T | ((prev: T) => T)): void => {
    const nextValue = typeof next === "function"
      ? (next as (prev: T) => T)(value)
      : next;
    if (Object.is(value, nextValue)) {
      return;
    }
    value = nextValue;
    subscribers.forEach((run) => schedule(run));
  };

  return [markSignalGetter(getter), setter];
}

/**
 * Signal getter 的标记 Symbol。
 * 用于在 DOM 层区分「需响应式绑定的 getter」与普通函数（如事件处理函数）。
 *
 * @internal 通常通过 isSignalGetter() 判断，无需直接使用此常量
 */
export const SIGNAL_GETTER_MARKER = Symbol.for("view.signalGetter");

/**
 * 为 getter 函数打上 signal 标记，使 isSignalGetter() 能识别其为 signal getter。
 *
 * @param getter - createSignal 返回的 getter 函数
 * @returns 同一 getter（带标记）
 * @internal 由 createSignal / createMemo 等内部使用
 */
export function markSignalGetter<T>(getter: () => T): () => T {
  (getter as unknown as Record<symbol, boolean>)[SIGNAL_GETTER_MARKER] = true;
  return getter;
}

/**
 * 判断给定值是否为 View 的 signal getter（由 createSignal 或 createMemo 返回的 getter）。
 * 用于 DOM 层区分需响应式更新的 prop 与普通函数（如 onClick）。
 *
 * @param fn - 待检测的值
 * @returns 若 fn 为带 SIGNAL_GETTER_MARKER 的函数则为 true，否则为 false
 */
export function isSignalGetter(fn: unknown): fn is () => unknown {
  return typeof fn === "function" &&
    (fn as unknown as Record<symbol, boolean>)[SIGNAL_GETTER_MARKER] === true;
}
