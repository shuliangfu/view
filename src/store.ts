/**
 * @module @dreamer/view/store
 * @description
 * 响应式 Store：将 state 对象变为嵌套 Proxy，任意层级读写与 createEffect 联动；支持 getters（派生只读）、actions（方法）、持久化（如 localStorage）。
 *
 * **本模块导出：**
 * - `createStore(key, config)`：创建 store，key 用于跨 bundle 共享同一实例
 * - 类型：`StorageLike`、`PersistOptions`、`StoreGetters`、`StoreActions`、`CreateStoreConfig`
 *
 * **与 signal 区别：** store 是「一整棵可读写对象树」+ getters/actions/persist；signal 是单值 [get, set]。
 *
 * @example
 * import { createStore } from "jsr:@dreamer/view/store";
 * const [get, set, actions] = createStore({
 *   state: { count: 0 },
 *   getters: { double() { return this.count * 2; } },
 *   actions: {
 *     increment(step = 1) { this.count = this.count + step; },
 *     reset() { this.count = 0; },
 *     addTwo() { this.increment(2); },
 *   },
 * });
 */

import { createMemo } from "./effect.ts";
import { createNestedProxy } from "./proxy.ts";
import { schedule } from "./scheduler.ts";
import { getCurrentEffect } from "./signal.ts";
import type { SignalTuple } from "./types.ts";
import { getGlobalStore, setGlobalStore } from "./view-global.ts";

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
 * getters：与 state 平级，每个 getter 为普通方法，通过 this 读 state（this 为响应式 state 代理），返回值由 createMemo 缓存并响应式更新
 */
export type StoreGetters<T extends Record<string, unknown>> = Record<
  string,
  (this: T) => unknown
>;

/**
 * 将 getters 接口映射为「方法 this 为 T」的类型，供 withGetters 入参使用；便于 IDE 对 this.xxx 做识别与跳转
 */
export type WithGettersContext<T extends Record<string, unknown>, G> = {
  [K in keyof G]: G[K] extends (...args: infer P) => infer R
    ? (this: T, ...args: P) => R
    : never;
};

/**
 * 包装 getters 定义，使 TypeScript 在 getter 内将 this 明确推断为 state 类型 T，便于 IDE 识别与代码跟踪（F12 / 悬停）。
 * 用法：createStore({ state, getters: withGetters<State, GettersType>()({ double() { return this.count * 2; }, ... }) })。
 */
export function withGetters<
  T extends Record<string, unknown>,
  G extends StoreGetters<T>,
>(): (getters: WithGettersContext<T, G>) => G {
  return (getters) => getters as unknown as G;
}

/** action 内 this 的基类型：state + setState（避免与 StoreActions 循环引用） */
export type StoreActionContextBase<T extends Record<string, unknown>> = T & {
  setState: (value: T | ((prev: T) => T)) => void;
};

/**
 * actions：与 state 平级，每个 action 为普通方法；this 上可读写 state、调用 setState、以及调用其它 action。
 * 约束使用 any[] 以便用户定义的带具体参数类型的 action（如 setTheme(next: Theme)）能通过类型检查。
 */
export type StoreActions<T extends Record<string, unknown>> = Record<
  string,
  // deno-lint-ignore no-explicit-any
  (this: StoreActionContextBase<T>, ...args: any[]) => any
>;

/** action 内 this 类型：state + setState + 其它 action 方法（可 this.otherAction()） */
export type StoreActionContext<
  T extends Record<string, unknown>,
  A extends StoreActions<T> = StoreActions<T>,
> = StoreActionContextBase<T> & A;

/**
 * 将 actions 接口映射为「方法 this 为 StoreActionContextBase<T> & A」的类型，供 withActions 入参使用
 */
export type WithActionsContext<T extends Record<string, unknown>, A> = {
  [K in keyof A]: A[K] extends (...args: infer P) => infer R
    ? (this: StoreActionContextBase<T> & A, ...args: P) => R
    : never;
};

/**
 * 包装 actions 定义，使 TypeScript 在 action 内将 this 推断为含其它 action，可直接写 this.otherAction()。
 * 用法：先定义 actions 类型 A，再 createStore({ state, actions: withActions<State, A>()({ ... }) })。
 * @example
 * type ThemeActions = { setTheme(next: Theme): void; toggleTheme(): void };
 * createStore({ state: { theme: "light" }, actions: withActions<ThemeState, ThemeActions>()({
 *   setTheme(next) { this.theme = next; },
 *   toggleTheme() { this.setTheme(this.theme === "dark" ? "light" : "dark"); }
 * }) });
 */
export function withActions<
  T extends Record<string, unknown>,
  A extends StoreActions<T>,
>(): (actions: WithActionsContext<T, A>) => A {
  return (actions) => actions as unknown as A;
}

/** 仅 state 时返回的对象类型：可直接 store.xxx 读 state 属性 */
export type StoreAsObjectStateOnly<T extends Record<string, unknown>> = T & {
  setState: (value: T | ((prev: T) => T)) => void;
};

/** state + getters 时返回的对象类型：store.xxx 读 state、store.getterName 读派生值 */
export type StoreAsObjectWithGetters<
  T extends Record<string, unknown>,
  G extends StoreGetters<T>,
> = T & {
  setState: (value: T | ((prev: T) => T)) => void;
} & { [K in keyof G]: ReturnType<G[K]> };

/** state + actions 时返回的对象类型：可直接 store.theme 读状态、store.toggleTheme() 调方法 */
export type StoreAsObject<
  T extends Record<string, unknown>,
  A extends StoreActions<T>,
> = T & {
  setState: (value: T | ((prev: T) => T)) => void;
} & A;

/** state + getters + actions 时返回的对象类型 */
export type StoreAsObjectWithGettersAndActions<
  T extends Record<string, unknown>,
  G extends StoreGetters<T>,
  A extends StoreActions<T>,
> =
  & T
  & {
    setState: (value: T | ((prev: T) => T)) => void;
  }
  & { [K in keyof G]: ReturnType<G[K]> }
  & A;

/** createStore 的配置：state 必填，getters / actions / persist 与 state 平级 */
export interface CreateStoreConfig<
  T extends Record<string, unknown>,
  G extends StoreGetters<T> = StoreGetters<T>,
  A extends StoreActions<T> = StoreActions<T>,
> {
  /** 初始状态（会被浅拷贝，可嵌套） */
  state: T;
  /** 派生只读：每个 getter 通过 this 读 state（如 double() { return this.count * 2 }），在 effect 中使用会随 state 响应式更新 */
  getters?: G;
  /** 方法：通过 this 读 state、this.setState 写 state，可传额外参数（如 increment(step) { this.setState({ ...this, count: this.count + step }); }） */
  actions?: A;
  /** 持久化：初始化时从 storage 恢复，每次 set 后写入 */
  persist?: PersistOptions<T>;
  /** 默认 true（返回单对象，可直接读 state 属性）；传 false 时返回 [get, set, ...] 元组 */
  asObject?: boolean;
}

/**
 * 创建根 store 代理：target 为 stateRef，读写都转发到 stateRef[STORE_INTERNAL]。
 * 实现 ownKeys / getOwnPropertyDescriptor，使 { ...getter() } 能展开出 state 的键（action 里 setter({ ...getter(), [key]: value }) 不会丢字段）。
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
    ownKeys(t) {
      const state = (t as unknown as Record<symbol, T>)[STORE_INTERNAL];
      return Reflect.ownKeys(state);
    },
    getOwnPropertyDescriptor(t, key: string | symbol) {
      if (key === STORE_INTERNAL) {
        return Reflect.getOwnPropertyDescriptor(
          t as unknown as Record<symbol, T>,
          STORE_INTERNAL,
        );
      }
      const state = (t as unknown as Record<symbol, T>)[STORE_INTERNAL];
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        return {
          enumerable: true,
          configurable: true,
          writable: true,
          value: (state as Record<string, unknown>)[key as string],
        };
      }
      return undefined;
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
 * 创建响应式 store（嵌套 Proxy，与 createEffect 协作）。
 *
 * 配置为单对象：state 必填，getters / actions / persist 与 state 平级。
 * - getters：每个 getter 通过 this 读 state（如 double() { return this.count * 2 }），内部用 createMemo 缓存
 * - actions：每个 action 内 this 可读写 state（如 this.count = 0）、调用 this.setState、以及调用其它 action（如 this.increment()）
 * - persist：可选持久化，初始化从 storage 恢复，set 后写入
 *
 * @param config - 必填 state；可选 getters、actions、persist
 * @returns [getter, setter] 或带 getters/actions 的元组（由 config 决定）
 *
 * @example
 * const [get, set] = createStore({ state: { count: 0 } });
 *
 * @example
 * const [get, set, getters, actions] = createStore({
 *   state: { count: 0, name: "" },
 *   getters: {
 *     double() { return this.count * 2; },
 *     greeting() { return `Hi, ${this.name}`; },
 *   },
 *   actions: {
 *     increment(step = 1) { this.count = this.count + step; },
 *     reset() { this.count = 0; },
 *     addTwo() { this.increment(2); },
 *   },
 * });
 *
 * @example
 * const store = createStore("theme", { state: { theme: "light" }, actions: { ... } });
 * const [get, set, getters, actions] = createStore("demo", { state: { count: 0 }, asObject: false });
 */
/** 仅 state、无 getters/actions 时返回对象形态，可直接 store.xxx */
export function createStore<T extends Record<string, unknown>>(
  key: string,
  config: CreateStoreConfig<T> & {
    getters?: undefined;
    actions?: undefined;
    asObject?: true;
  },
): StoreAsObjectStateOnly<T>;

/** 仅 actions、无 getters 时返回对象形态，便于 themeStore.theme / themeStore.setTheme 等识别 */
export function createStore<
  T extends Record<string, unknown>,
  A extends StoreActions<T>,
>(
  key: string,
  config: CreateStoreConfig<T, StoreGetters<T>, A> & {
    getters?: undefined;
    actions: A;
    asObject?: true;
  },
): StoreAsObject<T, A>;

/** 仅 state、asObject: false 时返回 [get, set] 元组 */
export function createStore<T extends Record<string, unknown>>(
  key: string,
  config: CreateStoreConfig<T> & {
    getters?: undefined;
    actions?: undefined;
    asObject: false;
  },
): [getter: () => T, setter: (value: T | ((prev: T) => T)) => void];

/** 有 getters、asObject: false、无 actions 时返回 [get, set, getters] */
export function createStore<
  T extends Record<string, unknown>,
  G extends StoreGetters<T>,
>(
  key: string,
  config: CreateStoreConfig<T, G> & {
    getters: G;
    actions?: undefined;
    asObject: false;
  },
): [
  getter: () => T,
  setter: (value: T | ((prev: T) => T)) => void,
  getters: { [K in keyof G]: () => ReturnType<G[K]> },
];

/** 有 actions、asObject: false、无 getters 时返回 [get, set, actions] */
export function createStore<
  T extends Record<string, unknown>,
  A extends StoreActions<T>,
>(
  key: string,
  config: CreateStoreConfig<T, StoreGetters<T>, A> & {
    getters?: undefined;
    actions: A;
    asObject: false;
  },
): [
  getter: () => T,
  setter: (value: T | ((prev: T) => T)) => void,
  actions: { [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]> },
];

/** 有 getters + actions、asObject: false 时返回 [get, set, getters, actions] */
export function createStore<
  T extends Record<string, unknown>,
  G extends StoreGetters<T>,
  A extends StoreActions<T>,
>(
  key: string,
  config: CreateStoreConfig<T, G, A> & {
    getters: G;
    actions: A;
    asObject: false;
  },
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
  key: string,
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
  ]
  | StoreAsObjectStateOnly<T>
  | StoreAsObjectWithGetters<T, G>
  | StoreAsObject<T, A>
  | StoreAsObjectWithGettersAndActions<T, G, A> {
  const existing = getGlobalStore(key);
  if (existing !== undefined) {
    return existing as
      | [getter: () => T, setter: (value: T | ((prev: T) => T)) => void]
      | StoreAsObjectStateOnly<T>
      | StoreAsObjectWithGetters<T, G>
      | StoreAsObject<T, A>
      | StoreAsObjectWithGettersAndActions<T, G, A>;
  }
  const {
    state: initial,
    getters: gettersConfig,
    actions: actionsConfig,
    persist,
  } = config;
  const registerIf = (result: unknown): unknown => {
    setGlobalStore(key, result);
    return result;
  };
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
            // 与初始 state 合并；仅用 loaded 中非 undefined 的字段覆盖，避免缺字段或 undefined 导致 get().count 等为 undefined → double 等派生出现 NaN
            const merged = { ...initial } as T;
            for (const k of Object.keys(loaded) as (keyof T)[]) {
              if (
                (loaded as Record<string, unknown>)[k as string] !== undefined
              ) {
                merged[k] = loaded[k];
              }
            }
            stateRef[STORE_INTERNAL] = merged;
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
          (fn as (this: T) => unknown).call(getter())
        );
      }
    }
    const actionsObj: Record<string, (...args: unknown[]) => unknown> = {};
    const createActionContext = (): StoreActionContext<T, A> =>
      new Proxy({} as StoreActionContext<T, A>, {
        get(_, key: string | symbol) {
          if (key === "setState") return setter;
          if (
            typeof key === "string" &&
            Object.prototype.hasOwnProperty.call(actionsObj, key)
          ) {
            return actionsObj[key];
          }
          return (getter() as Record<string, unknown>)[key as string];
        },
        set(_, key: string | symbol, value: unknown) {
          if (
            key === "setState" ||
            (typeof key === "string" &&
              Object.prototype.hasOwnProperty.call(actionsObj, key))
          ) {
            return true;
          }
          const state = getter() as Record<string, unknown>;
          setter({ ...state, [key]: value } as T);
          return true;
        },
        ownKeys() {
          return Reflect.ownKeys(getter());
        },
      });
    for (const [k, fn] of Object.entries(actionsConfig!)) {
      if (typeof fn === "function") {
        actionsObj[k] = (...args: unknown[]) =>
          (fn as (this: StoreActionContext<T, A>, ...a: unknown[]) => unknown)
            .call(createActionContext(), ...args);
      }
    }
    if ((config as CreateStoreConfig<T, G, A>).asObject !== false) {
      return registerIf(
        new Proxy({} as StoreAsObjectWithGettersAndActions<T, G, A>, {
          get(_t, key: string | symbol) {
            if (key === "setState") return setter;
            if (
              typeof key === "string" &&
              Object.prototype.hasOwnProperty.call(actionsObj, key)
            ) {
              return actionsObj[key];
            }
            if (
              typeof key === "string" &&
              Object.prototype.hasOwnProperty.call(gettersObj, key)
            ) {
              return (gettersObj[key] as () => unknown)();
            }
            return (getter() as Record<string, unknown>)[key as string];
          },
          set(_t, key: string | symbol, value: unknown) {
            if (
              key === "setState" ||
              (typeof key === "string" &&
                (Object.prototype.hasOwnProperty.call(actionsObj, key) ||
                  Object.prototype.hasOwnProperty.call(gettersObj, key)))
            ) {
              return true;
            }
            const state = getter() as Record<string, unknown>;
            setter({ ...state, [key]: value } as T);
            return true;
          },
        }),
      ) as StoreAsObjectWithGettersAndActions<T, G, A>;
    }
    return registerIf([
      getter,
      setter,
      gettersObj as { [K in keyof G]: () => ReturnType<G[K]> },
      actionsObj as {
        [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]>;
      },
    ]) as [
      typeof getter,
      typeof setter,
      { [K in keyof G]: () => ReturnType<G[K]> },
      { [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]> },
    ];
  }

  if (hasGetters) {
    const gettersObj: Record<string, () => unknown> = {};
    for (const [k, fn] of Object.entries(gettersConfig!)) {
      if (typeof fn === "function") {
        gettersObj[k] = createMemo(() =>
          (fn as (this: T) => unknown).call(getter())
        );
      }
    }
    if ((config as CreateStoreConfig<T, G, A>).asObject !== false) {
      return registerIf(
        new Proxy({} as StoreAsObjectWithGetters<T, G>, {
          get(_t, key: string | symbol) {
            if (key === "setState") return setter;
            if (
              typeof key === "string" &&
              Object.prototype.hasOwnProperty.call(gettersObj, key)
            ) {
              return (gettersObj[key] as () => unknown)();
            }
            return (getter() as Record<string, unknown>)[key as string];
          },
          set(_t, key: string | symbol, value: unknown) {
            if (
              key === "setState" ||
              (typeof key === "string" &&
                Object.prototype.hasOwnProperty.call(gettersObj, key))
            ) {
              return true;
            }
            const state = getter() as Record<string, unknown>;
            setter({ ...state, [key]: value } as T);
            return true;
          },
        }),
      ) as StoreAsObjectWithGetters<T, G>;
    }
    return registerIf([
      getter,
      setter,
      gettersObj as { [K in keyof G]: () => ReturnType<G[K]> },
    ]) as [
      typeof getter,
      typeof setter,
      { [K in keyof G]: () => ReturnType<G[K]> },
    ];
  }

  if (hasActions) {
    const actionsObj: Record<string, (...args: unknown[]) => unknown> = {};
    const createActionContext = (): StoreActionContext<T, A> =>
      new Proxy({} as StoreActionContext<T, A>, {
        get(_, key: string | symbol) {
          if (key === "setState") return setter;
          if (
            typeof key === "string" &&
            Object.prototype.hasOwnProperty.call(actionsObj, key)
          ) {
            return actionsObj[key];
          }
          return (getter() as Record<string, unknown>)[key as string];
        },
        set(_, key: string | symbol, value: unknown) {
          if (
            key === "setState" ||
            (typeof key === "string" &&
              Object.prototype.hasOwnProperty.call(actionsObj, key))
          ) {
            return true;
          }
          const state = getter() as Record<string, unknown>;
          setter({ ...state, [key]: value } as T);
          return true;
        },
        ownKeys() {
          return Reflect.ownKeys(getter());
        },
      });
    for (const [k, fn] of Object.entries(actionsConfig!)) {
      if (typeof fn === "function") {
        actionsObj[k] = (...args: unknown[]) =>
          (fn as (this: StoreActionContext<T, A>, ...a: unknown[]) => unknown)
            .call(createActionContext(), ...args);
      }
    }
    if (
      (config as CreateStoreConfig<T, StoreGetters<T>, A>).asObject !== false
    ) {
      return registerIf(
        new Proxy({} as StoreAsObject<T, A>, {
          get(_t, key: string | symbol) {
            if (key === "setState") return setter;
            if (
              typeof key === "string" &&
              Object.prototype.hasOwnProperty.call(actionsObj, key)
            ) {
              return actionsObj[key];
            }
            return (getter() as Record<string, unknown>)[key as string];
          },
          set(_t, key: string | symbol, value: unknown) {
            if (
              key === "setState" ||
              (typeof key === "string" &&
                Object.prototype.hasOwnProperty.call(actionsObj, key))
            ) {
              return true;
            }
            const state = getter() as Record<string, unknown>;
            setter({ ...state, [key]: value } as T);
            return true;
          },
        }),
      ) as StoreAsObject<T, A>;
    }
    return registerIf([
      getter,
      setter,
      actionsObj as {
        [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]>;
      },
    ]) as [
      typeof getter,
      typeof setter,
      { [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]> },
    ];
  }

  if ((config as CreateStoreConfig<T, G, A>).asObject !== false) {
    return registerIf(
      new Proxy({} as StoreAsObjectStateOnly<T>, {
        get(_t, key: string | symbol) {
          if (key === "setState") return setter;
          return (getter() as Record<string, unknown>)[key as string];
        },
        set(_t, key: string | symbol, value: unknown) {
          if (key === "setState") return true;
          const state = getter() as Record<string, unknown>;
          setter({ ...state, [key]: value } as T);
          return true;
        },
      }),
    ) as StoreAsObjectStateOnly<T>;
  }
  return registerIf([getter, setter]) as SignalTuple<T>;
}
