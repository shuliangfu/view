/**
 * @module reactivity/signal
 * @description 响应式内核 - 信号与追踪系统。
 *
 * **支持的功能：**
 * - ✅ createSignal() - 创建响应式信号
 * - ✅ Signal 的 getter/setter 双重调用方式
 * - ✅ 细粒度依赖追踪 (track/observer 机制)
 * - ✅ 批量更新 (batch) 支持
 * - ✅ 状态管理 (STATE_CLEAN/CHECK/DIRTY/DISPOSED)
 * - ✅ 订阅关系管理 (Subscription/Observer/Source)
 *
 * **核心机制：**
 * - 发布订阅模式
 * - 脏检查 (dirty checking)
 * - 拓扑排序更新
 * - 内存优化 (WeakMap + 链表结构)
 *
 * **范围说明：**
 * - 循环依赖检测与 devtools 集成成本高；细粒度缓存见 `memo.ts`。
 *
 * @usage
 * const [getCount, setCount] = createSignal(0) // getCount() 为 getter，参与依赖追踪；返回值亦可直接当函数调用
 * const double = createMemo(() => getCount() * 2)
 */

import { schedule } from "../scheduler/batch.ts";
import { core } from "./master.ts";

export const STATE_CLEAN = 0;
export const STATE_CHECK = 1;
export const STATE_DIRTY = 2;
export const STATE_DISPOSED = 3;

/** 响应式订阅关系 */
export interface Subscription {
  source: Source<any> | Observer;
  observer: Observer;
  prevSub: Subscription | null;
  nextSub: Subscription | null;
  prevSource: Subscription | null;
  nextSource: Subscription | null;
}

/** 观察者 (Effect, Memo) */
export interface Observer {
  state: number;
  sources: Subscription | null;
  sourcesTail: Subscription | null;
  run(): void;
}

/** 物理数据源 (Signal, Store) */
export interface Source<T> {
  value: T;
  observers: Subscription | null;
  observersTail: Subscription | null;
}

/** Setter 函数类型 */
export type Setter<T> = (v: T | ((prev: T) => T), ...args: any[]) => T;

/** 信号类型 */
export type Signal<T> = [() => T, Setter<T>] & {
  (): T;
  (v: T | ((prev: T) => T)): T;
  value: T;
  set: Setter<T>;
};

/** 物理单例内核状态 */
const _session = Math.random().toString(36).slice(2);

/**
 * 追踪响应式依赖。
 * 性能优化：引入快速退出逻辑，对于已存在的订阅关系直接返回。
 */
export function track(source: Source<any>) {
  const observer = core.current;
  if (!observer || observer.state === STATE_DISPOSED) return;

  // 1. 快速检查最后一个订阅项，大部分情况下是新订阅或重读
  let sub = observer.sourcesTail;
  if (sub && sub.source === source) return;

  // 2. 只有在确实需要时才遍历完整列表
  while (sub) {
    if (sub.source === source) return;
    sub = sub.prevSource;
  }

  // 3. 创建并建立双向链表关系
  const newSub: Subscription = {
    source,
    observer,
    prevSub: source.observersTail,
    nextSub: null,
    prevSource: observer.sourcesTail,
    nextSource: null,
  };

  if (source.observersTail) source.observersTail.nextSub = newSub;
  else source.observers = newSub;
  source.observersTail = newSub;

  if (observer.sourcesTail) observer.sourcesTail.nextSource = newSub;
  else observer.sources = newSub;
  observer.sourcesTail = newSub;
}

/**
 * 发送响应式通知。
 * 无订阅者时立即返回，避免热路径上无意义链表遍历。
 */
export function notify(source: Source<any>) {
  let sub = source.observers;
  if (!sub) return;
  while (sub) {
    const observer = sub.observer;
    if (observer.state === STATE_CLEAN) {
      observer.state = STATE_DIRTY;
      schedule(observer);
      if ("observers" in (observer as any)) {
        notifyCheck(observer as unknown as Source<any>);
      }
    } else if (observer.state === STATE_CHECK) {
      observer.state = STATE_DIRTY;
    }
    sub = sub.nextSub;
  }
}

/**
 * 通知下游节点进入 CHECK 状态。
 */
function notifyCheck(source: Source<any>) {
  let sub = source.observers;
  if (!sub) return;
  while (sub) {
    const observer = sub.observer;
    if (observer.state === STATE_CLEAN) {
      observer.state = STATE_CHECK;
      schedule(observer);
      if ("observers" in (observer as any)) {
        notifyCheck(observer as unknown as Source<any>);
      }
    }
    sub = sub.nextSub;
  }
}

export const getCurrentObserver = () => core.current;
export const setCurrentObserver = (o: Observer | null) => {
  const p = core.current;
  core.current = o;
  return p;
};

/**
 * 创建信号。
 */
export function createSignal<T>(val: T, name?: string): Signal<T> {
  // 1. 生成唯一 ID (优先使用用户提供的 name，否则自动生成)
  const id = name ? `sig:${name}` : `sig:${_session}:${core.uid++}`;

  // 2. 尝试从物理单例注册表中获取 (支持 HMR 状态保持)
  let source = core.registry.get(id);
  if (!source) {
    source = { value: val, observers: null, observersTail: null };
    core.registry.set(id, source);
  } else if (name) {
    // 如果是具名信号且已存在，同步一次初始值 (物理单例模式)
    source.value = val;
  }

  const getter = () => {
    track(source!);
    return source!.value;
  };
  (getter as any).__VIEW_SIGNAL = true;

  const setter: Setter<T> = (v: any) => {
    const next = typeof v === "function" ? (v as any)(source!.value) : v;
    if (!Object.is(next, source!.value)) {
      source!.value = next;
      notify(source!);
    }
    return source!.value;
  };
  (setter as any).__VIEW_SIGNAL = true;

  const signal = function (v?: any) {
    return arguments.length === 0 ? getter() : setter(v);
  } as any;

  signal[0] = getter;
  signal[1] = setter;

  Object.defineProperties(signal, {
    length: { value: 2, configurable: false, writable: false },
    value: { get: getter, set: setter, enumerable: true },
    set: { value: setter, configurable: false, writable: false },
    [Symbol.iterator]: {
      value: function* () {
        yield getter;
        yield setter;
      },
      configurable: false,
      writable: false,
    },
    __VIEW_SIGNAL: {
      value: true,
      configurable: false,
      writable: false,
    },
  });

  return signal as Signal<T>;
}

/**
 * 清理观察者的所有上游订阅。
 */
export function cleanupObserver(observer: Observer) {
  let sub = observer.sources;
  while (sub) {
    const source = sub.source as Source<any>;
    if (sub.prevSub) sub.prevSub.nextSub = sub.nextSub;
    else source.observers = sub.nextSub;
    if (sub.nextSub) sub.nextSub.prevSub = sub.prevSub;
    else source.observersTail = sub.prevSub;
    sub = sub.nextSource;
  }
  observer.sources = null;
  observer.sourcesTail = null;
}

/**
 * 在无依赖收集的状态下执行。
 */
export function untrack<T>(fn: () => T): T {
  const prev = setCurrentObserver(null);
  try {
    return fn();
  } finally {
    setCurrentObserver(prev);
  }
}
