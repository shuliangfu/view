/**
 * @dreamer/view/store — 按需导入
 *
 * createStore：将对象变为嵌套响应式（Proxy），任意层级读写都会登记依赖/通知订阅。
 * 支持 actions（方法可互相调用、可读 state）、持久化（如 localStorage）。
 */

import { createMemo } from "./effect.ts";
import { schedule } from "./scheduler.ts";
import { getCurrentEffect } from "./signal.ts";
import type { SignalTuple } from "./types.ts";

const STORE_INTERNAL = Symbol.for("view.store.internal");

type SubscriberSet = Set<() => void>;

/**
 * 持久化存储类型：用户自配 storage 时实现此接口即可
 *
 * 需实现 getItem(key)、setItem(key, value)，可选 removeItem(key)。
 * 不传 persist.storage 时默认使用 globalThis.localStorage（若存在）；
 * 传入则完全使用用户提供的实例，可自定义存储位置（如 sessionStorage、内存、IndexedDB 壳等）。
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** 持久化配置：key 必填；storage 由用户配置，不传则回退到 localStorage（若存在） */
export interface PersistOptions<T extends Record<string, unknown>> {
  /** 存储键名（在 storage 中使用的 key，用户可据此自定义存储位置或前缀） */
  key: string;
  /**
   * 存储实现：实现 {@link StorageLike} 类型（getItem/setItem/可选 removeItem）即可自定义存储位置
   * 不传时使用 globalThis.localStorage（不存在则不持久化）；传入则仅使用该 storage
   */
  storage?: StorageLike | null;
  /** 序列化，默认 JSON.stringify */
  serialize?: (state: T) => string;
  /** 反序列化，默认 JSON.parse */
  deserialize?: (raw: string) => T;
}

/**
 * getters：与 state 平级，每个 getter 为 (get) => value，内部通过 get() 读 state，返回值由 createMemo 缓存并响应式更新
 */
export type StoreGetters<T extends Record<string, unknown>> = Record<
  string,
  (get: () => T) => unknown
>;

/**
 * actions：与 state 平级，每个 action 为 (get, set, ...args) => unknown，调用时由 createStore 注入 get/set
 */
export type StoreActions<T extends Record<string, unknown>> = Record<
  string,
  (
    get: () => T,
    set: (value: T | ((prev: T) => T)) => void,
    ...args: unknown[]
  ) => unknown
>;

/** createStore 的配置：state 必填，getters / actions / persist 与 state 平级 */
export interface CreateStoreConfig<
  T extends Record<string, unknown>,
  G extends StoreGetters<T> = StoreGetters<T>,
  A extends StoreActions<T> = StoreActions<T>,
> {
  /** 初始状态（会被浅拷贝，可嵌套） */
  state: T;
  /** 派生只读：每个 getter(get) => value，在 effect 中使用会随 state 响应式更新 */
  getters?: G;
  /** 方法：(get, set, ...args) => unknown，调用时自动注入 get/set */
  actions?: A;
  /** 持久化：初始化时从 storage 恢复，每次 set 后写入 */
  persist?: PersistOptions<T>;
}

/**
 * 为普通对象创建代理，get 登记 effect，set 通知订阅者（用于嵌套）
 * 使用 WeakMap 按 target 缓存 proxy，保证同对象同 proxy，并减少创建
 */
function createNestedProxy<T extends object>(
  target: T,
  subscribers: SubscriberSet,
  proxyCache: WeakMap<object, object>,
): T {
  const cached = proxyCache.get(target);
  if (cached) return cached as T;
  const proxy = new Proxy(target, {
    get(t, key: string) {
      const effect = getCurrentEffect();
      if (effect) subscribers.add(effect);
      const value = Reflect.get(t, key);
      if (value !== null && typeof value === "object") {
        return createNestedProxy(
          value as object,
          subscribers,
          proxyCache,
        ) as T[keyof T];
      }
      return value;
    },
    set(t, key: string, value: unknown) {
      const ok = Reflect.set(t, key, value);
      if (ok) subscribers.forEach((run) => schedule(run));
      return ok;
    },
  }) as T;
  proxyCache.set(target, proxy);
  return proxy;
}

/**
 * 创建根 store 代理：target 为 stateRef，读写都转发到 stateRef[STORE_INTERNAL]
 */
function createRootStoreProxy<T extends Record<string, unknown>>(
  stateRef: { [STORE_INTERNAL]: T },
  subscribers: SubscriberSet,
  proxyCache: WeakMap<object, object>,
): T {
  return new Proxy(stateRef as unknown as T, {
    get(t, key: string | symbol) {
      if (key === STORE_INTERNAL) {
        return (t as unknown as Record<symbol, T>)[STORE_INTERNAL];
      }
      const effect = getCurrentEffect();
      if (effect) subscribers.add(effect);
      const state = (t as unknown as Record<symbol, T>)[STORE_INTERNAL];
      const value = state[key as keyof T];
      if (value !== null && typeof value === "object") {
        return createNestedProxy(
          value as object,
          subscribers,
          proxyCache,
        ) as T[keyof T];
      }
      return value;
    },
    set(t, key: string | symbol, value: unknown) {
      const state = (t as unknown as Record<symbol, T>)[STORE_INTERNAL];
      if (key === STORE_INTERNAL) {
        (t as unknown as Record<symbol, T>)[STORE_INTERNAL] = value as T;
      } else {
        (state as Record<string, unknown>)[key as string] = value;
      }
      subscribers.forEach((run) => schedule(run));
      return true;
    },
  }) as T;
}

/** 默认持久化：使用 JSON 序列化；若 storage 不可用则跳过 */
function defaultSerialize<T>(state: T): string {
  return JSON.stringify(state);
}

function defaultDeserialize<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

/** 获取默认 storage（浏览器下为 localStorage） */
function getDefaultStorage(): StorageLike | null {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return (globalThis as unknown as { localStorage: StorageLike })
      .localStorage;
  }
  return null;
}

/**
 * 创建响应式 store（嵌套 Proxy，与 createEffect 协作）
 *
 * 配置为单对象：state 必填，getters / actions / persist 与 state 平级。
 * - getters：{ name(get) { return get().xxx; } }，内部用 createMemo 缓存
 * - actions：{ method1(get, set, ...args) { } }，调用时自动注入 get/set
 *
 * @example
 * const [get, set] = createStore({ state: { count: 0 } });
 *
 * @example
 * const [get, set, actions] = createStore({
 *   state: { count: 0 },
 *   actions: {
 *     increment(get, set) { set({ ...get(), count: get().count + 1 }); },
 *     reset(get, set) { set({ ...get(), count: 0 }); },
 *   },
 * });
 *
 * @example
 * const [get, set, getters] = createStore({
 *   state: { count: 0, name: "" },
 *   getters: {
 *     double(get) { return get().count * 2; },
 *     greeting(get) { return `Hi, ${get().name}`; },
 *   },
 * });
 *
 * @example
 * const [get, set] = createStore({ state: { name: "" }, persist: { key: "user" } });
 */
export function createStore<T extends Record<string, unknown>>(
  config: CreateStoreConfig<T> & { getters?: undefined; actions?: undefined },
): [getter: () => T, setter: (value: T | ((prev: T) => T)) => void];

export function createStore<
  T extends Record<string, unknown>,
  G extends StoreGetters<T>,
>(
  config: CreateStoreConfig<T, G> & {
    getters: G;
    actions?: undefined;
  },
): [
  getter: () => T,
  setter: (value: T | ((prev: T) => T)) => void,
  getters: { [K in keyof G]: () => ReturnType<G[K]> },
];

export function createStore<
  T extends Record<string, unknown>,
  A extends StoreActions<T>,
>(
  config: CreateStoreConfig<T, StoreGetters<T>, A> & {
    getters?: undefined;
    actions: A;
  },
): [
  getter: () => T,
  setter: (value: T | ((prev: T) => T)) => void,
  actions: { [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]> },
];

export function createStore<
  T extends Record<string, unknown>,
  G extends StoreGetters<T>,
  A extends StoreActions<T>,
>(
  config: CreateStoreConfig<T, G, A> & { getters: G; actions: A },
): [
  getter: () => T,
  setter: (value: T | ((prev: T) => T)) => void,
  getters: { [K in keyof G]: () => ReturnType<G[K]> },
  actions: { [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]> },
];

export function createStore<
  T extends Record<string, unknown>,
  G extends StoreGetters<T> = StoreGetters<T>,
  A extends StoreActions<T> = StoreActions<T>,
>(
  config: CreateStoreConfig<T, G, A>,
):
  | [getter: () => T, setter: (value: T | ((prev: T) => T)) => void]
  | [
    getter: () => T,
    setter: (value: T | ((prev: T) => T)) => void,
    getters: { [K in keyof G]: () => ReturnType<G[K]> },
  ]
  | [
    getter: () => T,
    setter: (value: T | ((prev: T) => T)) => void,
    actions: { [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]> },
  ]
  | [
    getter: () => T,
    setter: (value: T | ((prev: T) => T)) => void,
    getters: { [K in keyof G]: () => ReturnType<G[K]> },
    actions: { [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]> },
  ] {
  const {
    state: initial,
    getters: gettersConfig,
    actions: actionsConfig,
    persist,
  } = config;
  const subscribers: SubscriberSet = new Set();
  const proxyCache = new WeakMap<object, object>();

  const stateRef: { [STORE_INTERNAL]: T } = {
    [STORE_INTERNAL]: { ...initial } as T,
  };

  if (persist?.key) {
    const storage = persist.storage ?? getDefaultStorage();
    const deserialize = persist.deserialize ?? defaultDeserialize;
    if (storage) {
      try {
        const raw = storage.getItem(persist.key);
        if (raw != null && raw !== "") {
          const loaded = deserialize(raw) as T;
          if (loaded && typeof loaded === "object") {
            // 与初始 state 合并，避免旧数据缺字段导致 get().count 等为 undefined → double 等派生出现 NaN
            stateRef[STORE_INTERNAL] = { ...initial, ...loaded } as T;
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  const getter = (): T =>
    createRootStoreProxy(stateRef, subscribers, proxyCache);

  const setter = (value: T | ((prev: T) => T)): void => {
    const prev = stateRef[STORE_INTERNAL];
    const next = typeof value === "function"
      ? (value as (prev: T) => T)(prev)
      : value;
    stateRef[STORE_INTERNAL] = { ...next } as T;
    subscribers.forEach((run) => schedule(run));
    if (persist?.key) {
      const storage = persist.storage ?? getDefaultStorage();
      const serialize = persist.serialize ?? defaultSerialize;
      if (storage) {
        try {
          storage.setItem(persist.key, serialize(stateRef[STORE_INTERNAL]));
        } catch {
          // 忽略
        }
      }
    }
  };

  const hasGetters = !!gettersConfig && Object.keys(gettersConfig).length > 0;
  const hasActions = !!actionsConfig && Object.keys(actionsConfig).length > 0;

  if (hasGetters && hasActions) {
    const gettersObj: Record<string, () => unknown> = {};
    for (const [k, fn] of Object.entries(gettersConfig!)) {
      if (typeof fn === "function") {
        gettersObj[k] = createMemo(() =>
          (fn as (get: () => T) => unknown)(getter)
        );
      }
    }
    const actionsObj: Record<string, (...args: unknown[]) => unknown> = {};
    for (const [k, fn] of Object.entries(actionsConfig!)) {
      if (typeof fn === "function") {
        actionsObj[k] = (...args: unknown[]) =>
          (fn as (
            get: () => T,
            set: (v: T | ((p: T) => T)) => void,
            ...a: unknown[]
          ) => unknown)(getter, setter, ...args);
      }
    }
    return [
      getter,
      setter,
      gettersObj as { [K in keyof G]: () => ReturnType<G[K]> },
      actionsObj as {
        [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]>;
      },
    ];
  }

  if (hasGetters) {
    const gettersObj: Record<string, () => unknown> = {};
    for (const [k, fn] of Object.entries(gettersConfig!)) {
      if (typeof fn === "function") {
        gettersObj[k] = createMemo(() =>
          (fn as (get: () => T) => unknown)(getter)
        );
      }
    }
    return [
      getter,
      setter,
      gettersObj as { [K in keyof G]: () => ReturnType<G[K]> },
    ];
  }

  if (hasActions) {
    const actionsObj: Record<string, (...args: unknown[]) => unknown> = {};
    for (const [k, fn] of Object.entries(actionsConfig!)) {
      if (typeof fn === "function") {
        actionsObj[k] = (...args: unknown[]) =>
          (fn as (
            get: () => T,
            set: (v: T | ((p: T) => T)) => void,
            ...a: unknown[]
          ) => unknown)(getter, setter, ...args);
      }
    }
    return [
      getter,
      setter,
      actionsObj as {
        [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]>;
      },
    ];
  }

  return [getter, setter] as SignalTuple<T>;
}
