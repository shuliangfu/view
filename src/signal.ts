/**
 * View 模板引擎 — Signal（信号）。细粒度响应式单元：通过 `.value` 读值并登记当前 effect 为依赖，赋值 `.value` 会通知依赖的 effect 执行。
 *
 * @module @dreamer/view/signal
 * @packageDocumentation
 *
 * **导出函数：** `createSignal`、`getCurrentEffect`、`setCurrentEffect`、`markSignalGetter`、`isSignalGetter`、`isSignalRef`、`unwrapSignalGetterValue`
 *
 * **导出常量：** `SIGNAL_GETTER_MARKER`、`SIGNAL_REF_MARKER`（一般通过 `isSignalGetter` / `isSignalRef` 判断即可）
 */

import { KEY_CURRENT_EFFECT } from "./constants.ts";
import { getGlobal, setGlobal } from "./globals.ts";
import { schedule } from "./scheduler.ts";

/** 当前正在执行的 effect（run 函数），用于依赖收集；run 上可挂 _subscriptionSets 供清理 */
type EffectRun = (() => void) & { _subscriptionSets?: Subscriber[] };

/**
 * 设置当前正在执行的 effect（供依赖收集使用）。
 * 在 effect 执行期间调用，使 signal 的读值能将当前 effect 登记为订阅者。
 *
 * @param effect - 当前要设为「正在执行」的 effect 函数，或 null 表示清除
 * @internal 由 effect 模块内部使用，一般业务代码无需调用
 */
export function setCurrentEffect(effect: (() => void) | null): void {
  setGlobal(KEY_CURRENT_EFFECT, effect as EffectRun | null);
}

/**
 * 获取当前正在执行的 effect（run 函数）。
 * 用于在 effect 内部或 signal 读值中判断当前是否处于某次 effect 执行上下文中。
 *
 * @returns 当前 effect 的 run 函数，若不在 effect 内则为 null
 * @internal 主要由 effect 与 dom 层使用，业务代码较少直接使用
 */
export function getCurrentEffect(): (() => void) | null {
  return getGlobal<EffectRun | null>(KEY_CURRENT_EFFECT) ?? null;
}

/** 单个 signal 的订阅者（effect 的重新执行函数）列表 */
type Subscriber = Set<() => void>;

/**
 * 响应式单值容器：读 `ref.value` 登记依赖，写 `ref.value = next` 或 `ref.value = prev => next` 更新并通知订阅。
 *
 * 由 `createSignal` 返回；模板中可写 `{count}`，编译器会生成 `unwrapSignalGetterValue(count)`，内部会读 `.value`。
 */
export type SignalRef<T> = {
  get value(): T;
  set value(next: T | ((prev: T) => T));
};

/**
 * Signal 引用对象的标记 Symbol。
 * 用于 `isSignalRef` 与 `unwrapSignalGetterValue` 识别 `.value` 形态的信号。
 */
export const SIGNAL_REF_MARKER = Symbol.for("view.signalRef");

/**
 * 判断给定值是否为 `createSignal` 返回的 `SignalRef` 对象。
 *
 * @param x - 任意值
 * @returns 若为带 `SIGNAL_REF_MARKER` 的对象则为 true
 */
export function isSignalRef(x: unknown): x is SignalRef<unknown> {
  return typeof x === "object" && x !== null &&
    (x as Record<symbol, boolean>)[SIGNAL_REF_MARKER] === true;
}

/**
 * 创建响应式信号（单对象 + `.value` 读写）
 *
 * @param initialValue 初始值
 * @returns `SignalRef<T>`：读 `ref.value` 登记依赖，写 `ref.value = x` 或 `ref.value = (prev) => next` 更新
 *
 * **注意：** 若将 `function` 赋给 `.value`，会当作 `(prev) => next` 更新函数，而非「状态值本身是函数」。
 * 若 `T` 含函数类型（如存 MountFn），须用 `ref.value = (prev) => fnValue` 写入，参见 `boundary.ts` 的 `setSuspenseResolvedState`。
 *
 * @example
 * const count = createSignal(0);
 * createEffect(() => console.log(count.value));
 * count.value = 1;
 * count.value = (n) => n + 1;
 */
export function createSignal<T>(initialValue: T): SignalRef<T> {
  let value = initialValue;
  const subscribers: Subscriber = new Set();

  const read = (): T => {
    const currentEffect = getCurrentEffect() as EffectRun | null;
    if (currentEffect) {
      subscribers.add(currentEffect);
      if (currentEffect._subscriptionSets) {
        currentEffect._subscriptionSets.push(subscribers);
      }
    }
    return value;
  };

  const write = (next: T | ((prev: T) => T)): void => {
    const nextValue = typeof next === "function"
      ? (next as (prev: T) => T)(value)
      : next;
    if (Object.is(value, nextValue)) {
      return;
    }
    value = nextValue;
    subscribers.forEach((run) => schedule(run));
  };

  const box: SignalRef<T> = {
    get value(): T {
      return read();
    },
    set value(next: T | ((prev: T) => T)) {
      write(next);
    },
  };
  (box as unknown as Record<symbol, boolean>)[SIGNAL_REF_MARKER] = true;
  return box;
}

/**
 * Signal getter 的标记 Symbol。
 * 用于在 DOM 层区分「需响应式绑定的 getter」与普通函数（如事件处理函数）。
 *
 * @internal 通常通过 `isSignalGetter()` 判断，无需直接使用此常量
 */
export const SIGNAL_GETTER_MARKER = Symbol.for("view.signalGetter");

/**
 * 为 getter 函数打上 signal 标记，使 `isSignalGetter()` 能识别其为 signal getter（如 `createMemo` 返回值）。
 *
 * @param getter - 无参读值函数
 * @returns 同一 getter（带标记）
 * @internal 由 `createMemo` 等内部使用
 */
export function markSignalGetter<T>(getter: () => T): () => T {
  (getter as unknown as Record<symbol, boolean>)[SIGNAL_GETTER_MARKER] = true;
  return getter;
}

/**
 * 判断给定值是否为 View 的 signal getter（如 `createMemo` 返回的无参函数）。
 * 用于 DOM 层区分需响应式更新的 prop 与普通函数（如 onClick）。
 *
 * @param fn - 待检测的值
 * @returns 若 fn 为带 SIGNAL_GETTER_MARKER 的函数则为 true
 */
export function isSignalGetter(fn: unknown): fn is () => unknown {
  return typeof fn === "function" &&
    (fn as unknown as Record<symbol, boolean>)[SIGNAL_GETTER_MARKER] === true;
}

/**
 * 解包「可展示」的响应式值，供 `insertReactive` 文本插值等使用：
 * - 若为带 `SIGNAL_GETTER_MARKER` 的 getter（`createMemo` 等），则调用一次并返回结果；
 * - 若为 `createSignal` 返回的 `SignalRef`，则读 `.value`（会登记依赖）；
 * - 否则原样返回。
 *
 * 编译产物中 `{ count }` 会生成对本函数的调用，以便在 effect 内正确订阅。
 *
 * @param value - 内层 getter 的返回值或任意值
 * @returns 解包后的展示用值
 */
export function unwrapSignalGetterValue(value: unknown): unknown {
  if (typeof value === "function" && isSignalGetter(value)) {
    return (value as () => unknown)();
  }
  if (isSignalRef(value)) {
    return value.value;
  }
  return value;
}
