/**
 * View 模板引擎 — Signal（信号）
 *
 * 细粒度响应式单元：getter 读值并登记当前 effect 为依赖，setter 改值并通知所有依赖的 effect 执行。
 * 通知通过调度器异步执行，避免 effect 内「读→写」导致同步重入卡死主线程。
 */

import { schedule } from "./scheduler.ts";

/** 当前正在执行的 effect（run 函数），用于依赖收集；run 上可挂 _subscriptionSets 供清理 */
type EffectRun = (() => void) & { _subscriptionSets?: Subscriber[] };
let currentEffect: EffectRun | null = null;

/**
 * 在 effect 执行期间调用，用于将当前 effect 设为「正在执行」以便 signal 的 getter 能登记依赖
 * @internal 由 effect.ts 的 createEffect 使用
 */
export function setCurrentEffect(effect: (() => void) | null): void {
  currentEffect = effect as EffectRun | null;
}

/**
 * 获取当前正在执行的 effect
 * @internal
 */
export function getCurrentEffect(): (() => void) | null {
  return currentEffect;
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
 * 判断一个函数是否为 view 的 signal getter（用于 dom 层区分「需响应式绑定的 prop」与普通函数如事件处理）
 * 通过 getter 上挂载的标记判断。
 */
export const SIGNAL_GETTER_MARKER = Symbol.for("view.signalGetter");

/** 给 getter 打标记，供 isSignalGetter 使用 */
export function markSignalGetter<T>(getter: () => T): () => T {
  (getter as unknown as { [SIGNAL_GETTER_MARKER]: true })[
    SIGNAL_GETTER_MARKER
  ] = true;
  return getter;
}

export function isSignalGetter(fn: unknown): fn is () => unknown {
  return typeof fn === "function" &&
    (fn as unknown as { [SIGNAL_GETTER_MARKER]?: boolean })[
        SIGNAL_GETTER_MARKER
      ] === true;
}
