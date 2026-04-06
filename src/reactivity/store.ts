/**
 * @module reactivity/store
 * @description 深度响应式 Store - 支持对象和数组的细粒度响应式。
 *
 * **支持的功能：**
 * - ✅ createStore() - 创建深度代理与 setState
 * - ✅ 深度代理 (Proxy)、数组方法、produce / reconcile
 * - ✅ 可选 persist（localStorage）
 *
 * **约定：**派生展示与业务流程放在组件 effect 或独立 hooks / 模块函数中，由它们读写 store 字段。
 *
 * @usage
 * const store = createStore({ count: 0 }) // 代理：store.count / store.setState
 * const [get, set] = createStore({ count: 0 }) // 与 createSignal 一致：get() 返回同一代理，细粒度追踪字段
 * createStore("my-store", { count: 0 }, { key: "k" }) // 具名 + 可选 persist
 * createStore({ count: 0 }, { name: "x", persist: { key: "k" } }) // 经典 options
 */

import { createSignal, Source } from "./signal.ts";
import { getInternal } from "./master.ts";
import { batch } from "../scheduler/batch.ts";
import { isObject } from "../runtime/utils.ts";

/** Store 注册中心 */
const storeRegistry = getInternal(
  "store",
  () => new Map<string, Source<any>>(),
);

/** 核心状态访问 */
const core = getInternal("core", () => ({
  current: null as any,
  registry: new Map<string, any>(),
  uid: 0,
}));

/**
 * Store 上的 `setState`：支持对象合并、路径更新、函数式更新等重载形式。
 * @template T 根状态对象类型
 */
export type StoreSetter<T> = (a: any, b?: any, c?: any) => void;

/** 持久化配置项 */
export interface PersistOptions<T> {
  /** 存储键名 */
  key: string;
  /** 存储对象，默认 localStorage */
  storage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  /** 序列化函数，默认 JSON.stringify */
  serialize?: (state: T) => string;
  /** 反序列化函数，默认 JSON.parse */
  deserialize?: (str: string) => T;
}

/** createStore 第二参：单例名与持久化 */
export type CreateStoreOptions<T extends object> = {
  name?: string;
  persist?: PersistOptions<T>;
};

/**
 * 根数据形状（数组根时保留元素类型）。
 */
type StoreData<T extends object> = T extends readonly (infer E)[]
  ? E extends object ? E[] : T
  : T;

/**
 * 对象根解构时的读取函数：调用后返回与「整表赋值」相同的代理，字段访问仍走 Proxy 以参与细粒度追踪（与 createSignal 的 [get, set] 用法对齐）。
 */
export type StoreGetter<T extends object> = () => Store<T>;

/**
 * 非数组根：含 setState，且类型上与 `[getStore, setState]` 元组相交以支持元组解构。
 */
export type Store<T extends object> = StoreData<T> & {
  setState: StoreSetter<T>;
};

/**
 * 数组根：不与 `[store, setState]` 做类型交叉，否则 `list[0]` 会被推断成「元组第一项」而非数组元素。
 */
type ArrayStoreOut<T extends object> = T extends readonly (infer E)[]
  ? E[] & { setState: StoreSetter<T> }
  : never;

/**
 * createStore 返回值：对象根可解构为 `[get, set]`（get 为 () => store），数组根请用 `.setState`。
 * 仅用 `T extends unknown[]` 判断数组根，避免 `Record<…>` 等对象被误判为数组。
 */
export type CreateStoreResult<T extends object> = T extends unknown[]
  ? ArrayStoreOut<T>
  : Store<T> & [StoreGetter<T>, StoreSetter<T>];

/**
 * 创建具名 Store：同名复用底层源；可选 `persist` 读写 `localStorage`（或自定义 storage）。
 * @template T 根状态类型（对象或数组）
 * @param storeName 注册表中的唯一名称
 * @param initialState 初始状态
 * @param persist 可选持久化配置
 * @returns 代理根对象（及与 `createSignal` 一致的解构形态，见 {@link CreateStoreResult}）
 */
export function createStore<T extends object>(
  storeName: string,
  initialState: T,
  persist?: PersistOptions<T>,
): CreateStoreResult<T>;

/**
 * 创建匿名或具名 Store：`options.name` / `options.persist` 控制单例与持久化。
 * @template T 根状态类型
 * @param initialState 初始状态
 * @param options 可选名称与持久化
 * @returns 代理根对象（见 {@link CreateStoreResult}）
 */
export function createStore<T extends object>(
  initialState: T,
  options?: CreateStoreOptions<T>,
): CreateStoreResult<T>;

export function createStore<T extends object>(
  a: string | T,
  b?: T | CreateStoreOptions<T>,
  c?: PersistOptions<T>,
): CreateStoreResult<T> {
  let initialState: T;
  let options: CreateStoreOptions<T> | undefined;

  if (typeof a === "string") {
    initialState = b as T;
    options = { name: a, persist: c };
  } else {
    initialState = a as T;
    options = b as CreateStoreOptions<T> | undefined;
  }

  const stack = new Error().stack || "";
  const baseId = options?.name ||
    `store:${stack.split("\n")[2]?.trim() || Math.random()}:${core.uid++}`;

  const persist = options?.persist;
  const storage = persist?.storage ??
    (typeof globalThis.localStorage !== "undefined"
      ? globalThis.localStorage
      : null);

  // 数组入参不能用 `{ ...arr }`，否则会变成带下标键的普通对象，破坏数组根与 For/forEach。
  let mergedInitialState: any = Array.isArray(initialState)
    ? [...initialState]
    : { ...initialState };
  if (persist && storage) {
    try {
      const saved = storage.getItem(persist.key);
      if (saved) {
        const deserialized = persist.deserialize
          ? persist.deserialize(saved)
          : JSON.parse(saved);
        if (Array.isArray(mergedInitialState) && Array.isArray(deserialized)) {
          mergedInitialState.splice(
            0,
            mergedInitialState.length,
            ...deserialized,
          );
        } else if (!Array.isArray(mergedInitialState)) {
          mergedInitialState = { ...mergedInitialState, ...deserialized };
        }
      }
    } catch (e) {
      console.warn(
        `[Store] Failed to hydrate persist state for "${persist.key}":`,
        e,
      );
    }
  }

  const storeId = `${baseId}:root`;
  let rootSource = storeRegistry.get(storeId);
  if (!rootSource) {
    rootSource = {
      value: mergedInitialState,
      observers: null,
      observersTail: null,
    };
    storeRegistry.set(storeId, rootSource);
  } else {
    Object.assign(rootSource.value, mergedInitialState);
  }
  const rootTarget = rootSource.value;

  const proxies = new WeakMap<object, any>();
  const signals = new WeakMap<object, Map<string | symbol, any>>();

  /** 保存持久化数据 */
  function triggerPersist() {
    if (persist && storage) {
      try {
        const serialized = persist.serialize
          ? persist.serialize(rootTarget)
          : JSON.stringify(rootTarget);
        storage.setItem(persist.key, serialized);
      } catch (e) {
        console.warn(
          `[Store] Failed to save persist state for "${persist.key}":`,
          e,
        );
      }
    }
  }

  function getSignal(obj: object, prop: string | symbol) {
    let map = signals.get(obj);
    if (!map) {
      map = new Map();
      signals.set(obj, map);
    }
    let s = map.get(prop);
    if (!s) {
      s = createSignal(obj[prop as keyof typeof obj]);
      map.set(prop, s);
    }
    return s;
  }

  function createProxy(obj: any): any {
    if (!isObject(obj)) return obj;
    if ((obj as any).__VIEW_SIGNAL) return obj;

    let p = proxies.get(obj);
    if (p) return p;

    /** 仅对象根：解构 `const [get, set] = createStore` 时第一项为 () => 根代理，与 createSignal 的 getter 用法一致 */
    let rootRead: (() => any) | undefined;

    p = new Proxy(obj, {
      get(target: any, prop: string | symbol) {
        if (prop === "__VIEW_SIGNAL") return true;
        if (prop === "setState") return setter;

        if (target === rootTarget) {
          if (!Array.isArray(rootTarget)) {
            if (prop === "0") {
              if (!rootRead) rootRead = () => p;
              return rootRead;
            }
            if (prop === "1") return setter;
            if (prop === Symbol.iterator) {
              return function* () {
                if (!rootRead) rootRead = () => p;
                yield rootRead;
                yield setter;
              };
            }
          }
        }

        const s = getSignal(target, prop);
        s[0]();

        const val = target[prop];
        return isObject(val) ? createProxy(val) : val;
      },
      set(target: any, prop: string | symbol, val: any) {
        if (target[prop] !== val) {
          target[prop] = val;
          const s = getSignal(target, prop);
          s[1](() => val);

          if (target === rootTarget) triggerPersist();
        }
        return true;
      },
      deleteProperty(target: any, prop: string | symbol) {
        if (prop in target) {
          delete target[prop];
          const s = getSignal(target, prop);
          s[1](undefined);

          if (target === rootTarget) triggerPersist();
        }
        return true;
      },
      has(target, prop) {
        return prop in target;
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(_target, prop) {
        return {
          enumerable: true,
          configurable: true,
          value: (p as any)[prop],
        };
      },
    });
    proxies.set(obj, p);
    return p;
  }

  const proxy = createProxy(rootTarget);

  const setter: StoreSetter<T> = function (a: any, b?: any, c?: any) {
    batch(() => {
      if (typeof a === "string") {
        if (arguments.length >= 3) {
          const parent = (proxy as any)[a];
          if (isObject(parent)) {
            if (typeof c === "function") {
              const res = c((parent as any)[b]);
              if (res !== undefined) (parent as any)[b] = res;
            } else {
              (parent as any)[b] = c;
            }
          }
        } else {
          if (typeof b === "function") {
            const res = b((proxy as any)[a]);
            if (res !== undefined) (proxy as any)[a] = res;
          } else {
            (proxy as any)[a] = b;
          }
        }
      } else if (typeof a === "function") {
        if (Array.isArray(rootTarget)) {
          const ret = a(proxy);
          if (Array.isArray(ret)) {
            (proxy as any).splice(0, (proxy as any).length, ...ret);
          }
        } else {
          a(proxy);
        }
      } else {
        // 热路径：避免 forEach 回调分配，大对象批量 setState 时更省
        const keys = Object.keys(a);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]!;
          (proxy as any)[key] = a[key];
        }
      }
      triggerPersist();
    });
  };

  return proxy as any;
}

/**
 * 返回一个在传入的 `state` 上执行 `fn` 的更新函数，便于与 `setState` 组合做可变风格草稿。
 * @template T 状态类型
 * @param fn 接收同一引用的 `state`，可原地修改
 * @returns `(state) => void`，供 `setState` 等调用
 */
export function produce<T>(fn: (state: T) => void): (state: T) => void {
  return (state: T) => fn(state);
}

/**
 * 用快照 `value` 对齐更新现有 `state`：对象删键、合并子对象；数组按索引对齐并截断。
 * @template T 状态类型
 * @param value 目标快照（不可变语义上的「下一状态」）
 * @returns `(state) => void`，在可变 `state` 上应用 diff
 */
export function reconcile<T>(value: T): (state: T) => void {
  return (state: any) => {
    if (!isObject(state) || !isObject(value)) return;

    if (Array.isArray(value)) {
      if (!Array.isArray(state)) return;

      const len = value.length;
      const prevLen = state.length;

      if (len < prevLen) {
        state.splice(len);
      }

      for (let i = 0; i < len; i++) {
        const v = value[i];
        if (i < prevLen) {
          const s = state[i];
          if (isObject(v) && isObject(s)) {
            reconcile(v)(s);
          } else if (s !== v) {
            state[i] = v;
          }
        } else {
          state.push(v);
        }
      }
      return;
    }

    const target = state as Record<string, any>;
    const source = value as Record<string, any>;

    const sourceKeys = Object.keys(source);
    const targetKeys = Object.keys(target);
    /**
     * 删除 target 上「新快照 source」中不存在的键。
     * 旧实现仅在 `targetKeys.length > sourceKeys.length` 时删键，会在两对象键数相同但集合不同时漏删（功能错误）。
     */
    for (let i = 0; i < targetKeys.length; i++) {
      const key = targetKeys[i]!;
      if (!Object.hasOwn(source, key)) {
        delete target[key];
      }
    }

    for (let i = 0; i < sourceKeys.length; i++) {
      const key = sourceKeys[i]!;
      const v = source[key];
      const s = target[key];

      if (isObject(v) && isObject(s)) {
        reconcile(v)(s);
      } else if (s !== v) {
        target[key] = v;
      }
    }
  };
}
