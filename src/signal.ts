/**
 * View 模板引擎 — Signal（信号）。细粒度响应式单元：通过 `.value` 读值并登记当前 effect 为依赖，赋值 `.value` 会通知依赖的 effect 执行。
 *
 * @module @dreamer/view/signal
 * @packageDocumentation
 *
 * **导出函数：** `createSignal`（同一返回值既可 `ref.value` 又可 `const [get,set] = ref` 解构）、`getCurrentEffect`、`setCurrentEffect`、`untrackReads`、`shouldTrackReadDependency`（读依赖是否登记）、`markSignalGetter`、`isSignalGetter`、`isSignalRef`、`unwrapSignalGetterValue`
 *
 * **导出常量：** `SIGNAL_GETTER_MARKER`、`SIGNAL_REF_MARKER`（一般通过 `isSignalGetter` / `isSignalRef` 判断即可）
 */

import { KEY_CURRENT_EFFECT } from "./constants.ts";
import { getGlobal, setGlobal } from "./globals.ts";
import { notifyEffectSubscriber } from "./scheduler.ts";
import type { SignalGetter, SignalSetter, SignalTuple } from "./types.ts";

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
 * 嵌套深度：大于 0 时 signal 读值**不**把当前 effect 登记为订阅者，
 * 但 `getCurrentEffect()` 仍可非 null（供 `onMount` 回调内 `onCleanup` 等与同类方案 同向语义）。
 */
let untrackReadDepth = 0;

/**
 * 在**保留**当前 effect 上下文的前提下执行 `fn`，其中对 signal 的读取**不会**建立依赖（读侧与 `setCurrentEffect(null)` 的 `untrack` 等价，但不影响 `onCleanup` 登记到当前 effect）。
 *
 * @param fn - 在抑制读追踪期间执行的函数
 * @returns `fn()` 的返回值
 * @internal 主要由 `effect.ts` 的 `onMount` 使用
 */
export function untrackReads<T>(fn: () => T): T {
  untrackReadDepth++;
  try {
    return fn();
  } finally {
    untrackReadDepth--;
  }
}

/**
 * 当前是否应对 signal / store 的读取登记 effect 依赖（`untrackReads` 嵌套内为 false）。
 *
 * @returns 未处于 `untrackReads` 内则为 true
 */
export function shouldTrackReadDependency(): boolean {
  return untrackReadDepth === 0;
}

/**
 * 由 {@link createSignal} 注册的「忽略 Object.is、仍调度订阅者」写入器，供 {@link createMemo} 的 `equals: false` 使用。
 * 不挂在 `SignalRef` 上，避免公开 API 膨胀。
 */
const signalForceNotifyWriters = new WeakMap<
  SignalRef<unknown>,
  (next: unknown) => void
>();

/**
 * 由 {@link createSignal} 注册的「按值写入、不把 `function` 当 updater」写入器，供 `createMemo` / `createDeferred` 缓存任意 `T`（含函数、`markMountFn`）。
 */
const signalRawValueWriters = new WeakMap<
  SignalRef<unknown>,
  (next: unknown) => void
>();

/**
 * 将 `next` 直接写入底层缓存（与 `ref.value = next` 不同：**不会**在 `typeof next === "function"` 时走 updater 语义）。
 * 仍遵守 `Object.is` 相等则跳过写入与通知。
 *
 * @param ref - `createSignal` 返回值
 * @param next - 要缓存的下一值（可为函数）
 * @internal
 */
export function writeSignalValueRaw<T>(ref: SignalRef<T>, next: T): void {
  const w = signalRawValueWriters.get(ref as SignalRef<unknown>);
  if (w != null) {
    w(next);
  }
}

/**
 * 写入 signal 并**始终** `schedule` 订阅者，即使新值与当前值 `Object.is` 为真。
 * 仅用于 `createMemo(..., { equals: false })` 等需对齐 同类方案 的窄场景；一般业务请用 `.value =`。
 *
 * @param ref - `createSignal` 返回值
 * @param next - 下一缓存值
 * @internal
 */
export function writeSignalForceNotify<T>(ref: SignalRef<T>, next: T): void {
  const w = signalForceNotifyWriters.get(ref as SignalRef<unknown>);
  if (w != null) {
    w(next);
  }
}

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
 * `createSignal` 的返回值：`SignalRef` 且实现 `[Symbol.iterator]`（运行时依次 yield getter、setter）。
 * 与 {@link SignalTuple} 做类型交叉，使 `const [get, set] = createSignal(0)` 能推断为有序元组，避免仅写 `IterableIterator<get|set>` 时两槽均变成可联合调用签名。
 */
export type CreateSignalReturn<T> = SignalRef<T> & SignalTuple<T>;

/**
 * 仅用于 {@link createSignal} 内为 ref 挂载 generator；对外类型用 {@link CreateSignalReturn}（`SignalRef & SignalTuple`），
 * 避免 `SignalTuple` 自带的数组 `Iterator` 签名与双 yield 实现互相冲突。
 */
type IterableSignalRef<T> = SignalRef<T> & {
  [Symbol.iterator](): IterableIterator<
    SignalGetter<T> | SignalSetter<T>
  >;
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
 * 分配底层 `SignalRef`（单例存储 + 订阅表），供 {@link createSignal} 两种返回形态共用。
 *
 * @param initialValue - 初始值
 * @returns 带 `SIGNAL_REF_MARKER` 与 force-notify 注册的容器
 */
function allocateSignalRef<T>(initialValue: T): SignalRef<T> {
  let value = initialValue;
  const subscribers: Subscriber = new Set();

  const read = (): T => {
    const currentEffect = getCurrentEffect() as EffectRun | null;
    if (currentEffect && shouldTrackReadDependency()) {
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
    /** 快照后再通知：同步 `createRenderEffect` 会在回调内重新 `subscribers.add`，禁止在 forEach 迭代同一 Set 时就地变更（会死循环或漏调）。 */
    const toNotify = [...subscribers];
    for (let i = 0; i < toNotify.length; i++) {
      notifyEffectSubscriber(toNotify[i]!);
    }
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
  signalForceNotifyWriters.set(box as SignalRef<unknown>, (next: unknown) => {
    value = next as T;
    const toNotify = [...subscribers];
    for (let i = 0; i < toNotify.length; i++) {
      notifyEffectSubscriber(toNotify[i]!);
    }
  });
  signalRawValueWriters.set(box as SignalRef<unknown>, (next: unknown) => {
    const nextValue = next as T;
    if (Object.is(value, nextValue)) {
      return;
    }
    value = nextValue;
    const toNotify = [...subscribers];
    for (let i = 0; i < toNotify.length; i++) {
      notifyEffectSubscriber(toNotify[i]!);
    }
  });
  return box;
}

/**
 * 创建 signal：返回**同一对象**既是 {@link SignalRef}（`.value`），又可被**数组解构**为 `[get, set]`（`get` 已 {@link markSignalGetter}）。
 *
 * **注意：** 若将 `function` 赋给 `ref.value` / 传给解构出的 `set`，均视为 `(prev) => next` updater，而非「状态值本身是函数」。
 * 若 `T` 含函数类型，须用 `set((prev) => fnValue)` 或 `ref.value = (prev) => fnValue`。
 *
 * @param initialValue - 初始值
 * @returns 带 `Symbol.iterator` 的 `SignalRef`，见 {@link CreateSignalReturn}
 *
 * @example
 * const n = createSignal(0);
 * n.value = 1;
 *
 * @example
 * const [count, setCount] = createSignal(0);
 * createEffect(() => console.log(count()));
 * setCount(2);
 */
export function createSignal<T>(initialValue: T): CreateSignalReturn<T> {
  const ref = allocateSignalRef(initialValue);
  const get = (): T => ref.value;
  markSignalGetter(get);
  const set = (next: T | ((prev: T) => T)): void => {
    const prevEff = getCurrentEffect();
    setCurrentEffect(null);
    try {
      if (typeof next === "function") {
        const cur = ref.value;
        ref.value = (next as (prev: T) => T)(cur);
      } else {
        ref.value = next;
      }
    } finally {
      setCurrentEffect(prevEff);
    }
  };

  /** 运行时依次 yield getter、setter，与数组解构语义一致 */
  (ref as IterableSignalRef<T>)[Symbol.iterator] = function* () {
    yield get;
    yield set;
  };

  return ref as CreateSignalReturn<T>;
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
